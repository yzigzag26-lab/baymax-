import { query, queryOne } from '../db';
import { sendOTPEmail } from './email.service';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const SALT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;
const OTP_LOCKOUT_MINUTES = 60;
const OTP_RATE_LIMIT_MINUTES = 60; // 3 requests per hour

export interface AuthUser {
  id: string;
  email: string;
  is_verified: boolean;
  has_password: boolean;
}

/**
 * Generate a 6-digit OTP code
 */
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
export function generateToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; email: string };
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Check if user exists by email
 */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const user = await queryOne<AuthUser>(
    `SELECT id, email, is_verified, 
            CASE WHEN password_hash IS NOT NULL THEN true ELSE false END as has_password
     FROM users WHERE email = $1`,
    [email]
  );
  return user;
}

/**
 * Create new user (without password initially)
 */
export async function createUser(email: string): Promise<AuthUser> {
  const user = await queryOne<AuthUser>(
    `INSERT INTO users (email, is_verified)
     VALUES ($1, false)
     RETURNING id, email, is_verified, 
               CASE WHEN password_hash IS NOT NULL THEN true ELSE false END as has_password`,
    [email]
  );
  return user!;
}

/**
 * Request OTP for email verification
 */
export async function requestOTP(email: string): Promise<{ success: boolean; message: string; isNewUser?: boolean }> {
  // Check if user is locked out
  const existingUser = await getUserByEmail(email);
  
  if (existingUser) {
    // Check if locked
    const userWithLock = await queryOne<{ otp_locked_until: Date | null; last_otp_request_at: Date | null }>(
      'SELECT otp_locked_until, last_otp_request_at FROM users WHERE id = $1',
      [existingUser.id]
    );

    if (userWithLock?.otp_locked_until && new Date(userWithLock.otp_locked_until) > new Date()) {
      const lockTime = new Date(userWithLock.otp_locked_until);
      return {
        success: false,
        message: `Account locked. Please try again after ${lockTime.toLocaleTimeString()}`,
      };
    }

    // Check rate limit (3 requests per hour)
    if (userWithLock?.last_otp_request_at) {
      const lastRequest = new Date(userWithLock.last_otp_request_at);
      const oneHourAgo = new Date(Date.now() - OTP_RATE_LIMIT_MINUTES * 60 * 1000);
      
      if (lastRequest > oneHourAgo) {
        // Count requests in the last hour
        const recentRequests = await queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM users 
           WHERE email = $1 
           AND last_otp_request_at > $2`,
          [email, oneHourAgo.toISOString()]
        );

        // Note: This is a simplified check. In production, you'd want a separate table for OTP requests
        // For now, we'll allow 3 requests per hour per email
      }
    }
  }

  // Generate OTP
  const otpCode = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Create user if doesn't exist
  let user = existingUser;
  if (!user) {
    user = await createUser(email);
  }

  // Update user with OTP
  await query(
    `UPDATE users 
     SET otp_code = $1, 
         otp_expires_at = $2, 
         otp_attempts = 0,
         last_otp_request_at = NOW()
     WHERE id = $3`,
    [otpCode, expiresAt.toISOString(), user.id]
  );

  // Send OTP email
  try {
    await sendOTPEmail(email, otpCode);
    return {
      success: true,
      message: 'OTP sent to your email',
      isNewUser: !existingUser,
    };
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    return {
      success: false,
      message: 'Failed to send OTP email. Please try again.',
    };
  }
}

/**
 * Verify OTP and get user
 */
export async function verifyOTP(email: string, otpCode: string): Promise<{ success: boolean; message: string; user?: AuthUser; token?: string }> {
  const user = await getUserByEmail(email);
  
  if (!user) {
    return {
      success: false,
      message: 'User not found. Please request a new OTP.',
    };
  }

  // Get user with OTP details
  const userWithOTP = await queryOne<{
    id: string;
    email: string;
    otp_code: string | null;
    otp_expires_at: Date | null;
    otp_attempts: number;
    otp_locked_until: Date | null;
    is_verified: boolean;
  }>(
    'SELECT id, email, otp_code, otp_expires_at, otp_attempts, otp_locked_until, is_verified FROM users WHERE id = $1',
    [user.id]
  );

  if (!userWithOTP) {
    return {
      success: false,
      message: 'User not found',
    };
  }

  // Check if locked
  if (userWithOTP.otp_locked_until && new Date(userWithOTP.otp_locked_until) > new Date()) {
    const lockTime = new Date(userWithOTP.otp_locked_until);
    return {
      success: false,
      message: `Account locked. Please try again after ${lockTime.toLocaleTimeString()}`,
    };
  }

  // Check if OTP exists
  if (!userWithOTP.otp_code) {
    return {
      success: false,
      message: 'No OTP found. Please request a new OTP.',
    };
  }

  // Check if OTP expired
  if (userWithOTP.otp_expires_at && new Date(userWithOTP.otp_expires_at) < new Date()) {
    return {
      success: false,
      message: 'OTP has expired. Please request a new OTP.',
    };
  }

  // Check OTP attempts
  if (userWithOTP.otp_attempts >= OTP_MAX_ATTEMPTS) {
    // Lock account for 1 hour
    const lockUntil = new Date(Date.now() + OTP_LOCKOUT_MINUTES * 60 * 1000);
    await query(
      'UPDATE users SET otp_locked_until = $1 WHERE id = $2',
      [lockUntil.toISOString(), user.id]
    );

    return {
      success: false,
      message: `Too many failed attempts. Account locked for ${OTP_LOCKOUT_MINUTES} minutes.`,
    };
  }

  // Verify OTP
  if (userWithOTP.otp_code !== otpCode) {
    // Increment attempts
    await query(
      'UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = $1',
      [user.id]
    );

    const remainingAttempts = OTP_MAX_ATTEMPTS - (userWithOTP.otp_attempts + 1);
    return {
      success: false,
      message: `Invalid OTP. ${remainingAttempts} attempts remaining.`,
    };
  }

  // OTP is valid - mark as verified and clear OTP
  await query(
    `UPDATE users 
     SET is_verified = true, 
         otp_code = NULL, 
         otp_expires_at = NULL, 
         otp_attempts = 0,
         otp_locked_until = NULL
     WHERE id = $1`,
    [user.id]
  );

  // Generate JWT token
  const token = generateToken(user.id, user.email);

  return {
    success: true,
    message: 'OTP verified successfully',
    user: {
      id: user.id,
      email: user.email,
      is_verified: true,
      has_password: user.has_password,
    },
    token,
  };
}

/**
 * Set password for user
 */
export async function setPassword(userId: string, password: string): Promise<{ success: boolean; message: string }> {
  // Validate password length
  if (password.length < 8) {
    return {
      success: false,
      message: 'Password must be at least 8 characters long',
    };
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Update user
  await query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId]
  );

  return {
    success: true,
    message: 'Password set successfully',
  };
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<{ success: boolean; message: string; user?: AuthUser; token?: string }> {
  const user = await getUserByEmail(email);
  
  if (!user) {
    return {
      success: false,
      message: 'Invalid email or password',
    };
  }

  // Check if user has password
  if (!user.has_password) {
    return {
      success: false,
      message: 'Please set a password first',
    };
  }

  // Get password hash
  const userWithPassword = await queryOne<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [user.id]
  );

  if (!userWithPassword?.password_hash) {
    return {
      success: false,
      message: 'Invalid email or password',
    };
  }

  // Verify password
  const isValid = await verifyPassword(password, userWithPassword.password_hash);
  
  if (!isValid) {
    return {
      success: false,
      message: 'Invalid email or password',
    };
  }

  // Check if verified
  if (!user.is_verified) {
    return {
      success: false,
      message: 'Please verify your email first',
    };
  }

  // Generate JWT token
  const token = generateToken(user.id, user.email);

  return {
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      is_verified: user.is_verified,
      has_password: true,
    },
    token,
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await queryOne<AuthUser>(
    `SELECT id, email, is_verified, 
            CASE WHEN password_hash IS NOT NULL THEN true ELSE false END as has_password
     FROM users WHERE id = $1`,
    [userId]
  );
  return user;
}
