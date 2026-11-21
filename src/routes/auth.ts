import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requestOTP,
  verifyOTP,
  setPassword,
  login,
  getUserByEmail,
  getUserById,
} from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';

const requestOTPSchema = z.object({
  email: z.string().email(),
});

const verifyOTPSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

const setPasswordSchema = z.object({
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Request OTP
  fastify.post('/auth/request-otp', {
    schema: {
      tags: ['Auth'],
      summary: 'Request OTP',
      description: 'Request a 6-digit OTP code for email verification',
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
        required: ['email'],
      },
    },
  }, async (request, reply) => {
    const { email } = requestOTPSchema.parse(request.body);

    const result = await requestOTP(email);

    if (!result.success) {
      return reply.status(400).send({
        error: 'OTP Request Failed',
        message: result.message,
      });
    }

    return {
      success: true,
      message: result.message,
      isNewUser: result.isNewUser,
    };
  });

  // Verify OTP
  fastify.post('/auth/verify-otp', {
    schema: {
      tags: ['Auth'],
      summary: 'Verify OTP',
      description: 'Verify the 6-digit OTP code and get JWT token',
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          otp: { type: 'string', minLength: 6, maxLength: 6 },
        },
        required: ['email', 'otp'],
      },
    },
  }, async (request, reply) => {
    const { email, otp } = verifyOTPSchema.parse(request.body);

    const result = await verifyOTP(email, otp);

    if (!result.success) {
      return reply.status(400).send({
        error: 'OTP Verification Failed',
        message: result.message,
      });
    }

    return {
      success: true,
      message: result.message,
      user: result.user,
      token: result.token,
    };
  });

  // Set password (for new users after OTP verification)
  fastify.post('/auth/set-password', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Auth'],
      summary: 'Set password',
      description: 'Set password for user account (after OTP verification)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          password: { type: 'string', minLength: 8 },
        },
        required: ['password'],
      },
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { password } = setPasswordSchema.parse(request.body);

    const result = await setPassword(user.id, password);

    if (!result.success) {
      return reply.status(400).send({
        error: 'Password Setup Failed',
        message: result.message,
      });
    }

    return {
      success: true,
      message: result.message,
    };
  });

  // Login with email and password
  fastify.post('/auth/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login',
      description: 'Login with email and password',
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
        required: ['email', 'password'],
      },
    },
  }, async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);

    const result = await login(email, password);

    if (!result.success) {
      return reply.status(401).send({
        error: 'Login Failed',
        message: result.message,
      });
    }

    return {
      success: true,
      message: result.message,
      user: result.user,
      token: result.token,
    };
  });

  // Get current user profile
  fastify.get('/auth/me', {
    preHandler: authMiddleware,
    schema: {
      tags: ['Auth'],
      summary: 'Get current user',
      description: 'Get current authenticated user profile',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const { user } = request;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const userProfile = await getUserById(user.id);

    if (!userProfile) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return {
      user: userProfile,
    };
  });

  // Check if email is registered
  fastify.post('/auth/check-email', {
    schema: {
      tags: ['Auth'],
      summary: 'Check email registration',
      description: 'Check if an email is already registered',
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
        required: ['email'],
      },
    },
  }, async (request, reply) => {
    const { email } = requestOTPSchema.parse(request.body);

    const user = await getUserByEmail(email);

    return {
      exists: !!user,
      isVerified: user?.is_verified || false,
      hasPassword: user?.has_password || false,
    };
  });

  // Resend OTP
  fastify.post('/auth/resend-otp', {
    schema: {
      tags: ['Auth'],
      summary: 'Resend OTP',
      description: 'Resend OTP code to email',
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
        required: ['email'],
      },
    },
  }, async (request, reply) => {
    const { email } = requestOTPSchema.parse(request.body);

    // This is the same as request OTP, but we can add specific logic if needed
    const result = await requestOTP(email);

    if (!result.success) {
      return reply.status(400).send({
        error: 'OTP Resend Failed',
        message: result.message,
      });
    }

    return {
      success: true,
      message: result.message,
    };
  });
}
