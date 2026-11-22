-- Baymax Backend Database Schema
-- Run this entire script in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with authentication fields
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  password_hash TEXT,
  plan_tier TEXT DEFAULT 'free' CHECK (plan_tier IN ('free', 'business', 'pro')),
  otp_code TEXT,
  otp_expires_at TIMESTAMP WITH TIME ZONE,
  otp_attempts INTEGER DEFAULT 0,
  otp_locked_until TIMESTAMP WITH TIME ZONE,
  is_verified BOOLEAN DEFAULT false,
  last_otp_request_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Websites table
CREATE TABLE IF NOT EXISTS websites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'preview', 'published', 'archived')),
  current_version_id UUID,
  template_id UUID,
  business_profile_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business profiles table
CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  description TEXT,
  industry TEXT,
  target_audience TEXT,
  brand_colors JSONB,
  logo_url TEXT,
  contact_info JSONB,
  goals JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  preview_url TEXT,
  plan_tier TEXT NOT NULL CHECK (plan_tier IN ('free', 'business', 'pro')),
  license_type TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blueprints table
CREATE TABLE IF NOT EXISTS blueprints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'generating')),
  sitemap JSONB NOT NULL,
  pages JSONB NOT NULL,
  design_tokens JSONB NOT NULL,
  components JSONB NOT NULL,
  content_plan JSONB NOT NULL,
  seo_fields JSONB,
  integrations JSONB,
  constraints JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(website_id, version)
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('generation', 'edit', 'build', 'deploy', 'seo', 'upgrade')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'validating', 'building', 'qa', 'succeeded', 'failed', 'cancelled', 'expired')),
  website_id UUID REFERENCES websites(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Website versions table
CREATE TABLE IF NOT EXISTS website_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  blueprint_id UUID REFERENCES blueprints(id) ON DELETE SET NULL,
  source_artifact_id UUID,
  build_result_id UUID,
  parent_version_id UUID REFERENCES website_versions(id) ON DELETE SET NULL,
  origin TEXT NOT NULL CHECK (origin IN ('generation', 'chat', 'visual', 'upgrade', 'manual')),
  change_summary TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(website_id, version_number)
);

-- Previews table with retention policy
CREATE TABLE IF NOT EXISTS previews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES website_versions(id) ON DELETE CASCADE,
  build_id UUID,
  environment TEXT NOT NULL DEFAULT 'preview',
  url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'failed')),
  retention_policy TEXT DEFAULT 'standard' CHECK (retention_policy IN ('standard', 'extended', 'permanent')),
  plan_tier TEXT DEFAULT 'free' CHECK (plan_tier IN ('free', 'business', 'pro')),
  expires_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage events table
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  website_id UUID REFERENCES websites(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit events table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_otp_code ON users(otp_code) WHERE otp_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_websites_project_id ON websites(project_id);
CREATE INDEX IF NOT EXISTS idx_websites_user_id ON websites(user_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_website_id ON business_profiles(website_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_website_id ON blueprints(website_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_website_id ON jobs(website_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_website_versions_website_id ON website_versions(website_id);
CREATE INDEX IF NOT EXISTS idx_previews_website_id ON previews(website_id);
CREATE INDEX IF NOT EXISTS idx_previews_retention_policy ON previews(retention_policy);
CREATE INDEX IF NOT EXISTS idx_previews_plan_tier ON previews(plan_tier);
CREATE INDEX IF NOT EXISTS idx_previews_deleted_at ON previews(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_websites_updated_at BEFORE UPDATE ON websites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_profiles_updated_at BEFORE UPDATE ON business_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blueprints_updated_at BEFORE UPDATE ON blueprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN users.otp_code IS 'Temporary 6-digit OTP code for email verification';
COMMENT ON COLUMN users.otp_expires_at IS 'OTP expiration timestamp (5 minutes from generation)';
COMMENT ON COLUMN users.otp_attempts IS 'Number of failed OTP verification attempts';
COMMENT ON COLUMN users.otp_locked_until IS 'Timestamp until which OTP requests are locked (1 hour after 3 failed attempts)';
COMMENT ON COLUMN users.is_verified IS 'Whether user email has been verified';
COMMENT ON COLUMN users.last_otp_request_at IS 'Timestamp of last OTP request (for rate limiting)';
COMMENT ON COLUMN previews.retention_policy IS 'Preview retention policy: standard (24h), extended (7d), permanent';
COMMENT ON COLUMN previews.plan_tier IS 'User plan tier at time of preview creation';
COMMENT ON COLUMN previews.deleted_at IS 'Timestamp when preview was soft-deleted';
-- Artifacts table: stores generated source file maps and build outputs
CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'source' CHECK (type IN ('source', 'build', 'seo')),
  files JSONB NOT NULL,
  checksum TEXT,
  size_bytes INTEGER,
  metadata JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_website_id ON artifacts(website_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);

COMMENT ON TABLE artifacts IS 'Generated source file maps and build outputs for websites';
COMMENT ON COLUMN artifacts.files IS 'JSON object mapping relative file paths to file contents';
COMMENT ON COLUMN artifacts.checksum IS 'SHA-256 checksum of serialized files for integrity/dedup';
