-- Add retention policy to previews table
ALTER TABLE previews 
ADD COLUMN IF NOT EXISTS retention_policy TEXT DEFAULT 'standard' CHECK (retention_policy IN ('standard', 'extended', 'permanent')),
ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free' CHECK (plan_tier IN ('free', 'business', 'pro')),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Add index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_previews_retention_policy ON previews(retention_policy);
CREATE INDEX IF NOT EXISTS idx_previews_plan_tier ON previews(plan_tier);
CREATE INDEX IF NOT EXISTS idx_previews_deleted_at ON previews(deleted_at) WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON COLUMN previews.retention_policy IS 'Preview retention policy: standard (24h), extended (7d), permanent';
COMMENT ON COLUMN previews.plan_tier IS 'User plan tier at time of preview creation';
COMMENT ON COLUMN previews.deleted_at IS 'Timestamp when preview was soft-deleted';
