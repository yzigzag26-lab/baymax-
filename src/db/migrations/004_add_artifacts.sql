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
