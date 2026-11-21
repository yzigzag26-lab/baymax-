-- Add authentication fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS otp_code TEXT,
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_otp_request_at TIMESTAMP WITH TIME ZONE;

-- Add index for OTP lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_otp_code ON users(otp_code) WHERE otp_code IS NOT NULL;

-- Add comment to password_hash column
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.otp_code IS 'Temporary 6-digit OTP code for email verification';
COMMENT ON COLUMN users.otp_expires_at IS 'OTP expiration timestamp (5 minutes from generation)';
COMMENT ON COLUMN users.otp_attempts IS 'Number of failed OTP verification attempts';
COMMENT ON COLUMN users.otp_locked_until IS 'Timestamp until which OTP requests are locked (1 hour after 3 failed attempts)';
COMMENT ON COLUMN users.is_verified IS 'Whether user email has been verified';
COMMENT ON COLUMN users.last_otp_request_at IS 'Timestamp of last OTP request (for rate limiting)';
