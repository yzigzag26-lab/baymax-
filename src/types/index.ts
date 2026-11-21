export type PlanTier = 'free' | 'business' | 'pro';

export type ProjectStatus = 'active' | 'archived' | 'deleted';

export type WebsiteStatus = 'draft' | 'generating' | 'preview' | 'published' | 'archived';

export type BlueprintStatus = 'draft' | 'approved' | 'rejected' | 'generating';

export type JobStatus = 'queued' | 'running' | 'validating' | 'building' | 'qa' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

export type JobType = 'generation' | 'edit' | 'build' | 'deploy' | 'seo' | 'upgrade';

export interface User {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  plan_tier: PlanTier;
  created_at: Date;
  updated_at: Date;
}

export interface Website {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  status: WebsiteStatus;
  current_version_id?: string;
  template_id?: string;
  business_profile_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface BusinessProfile {
  id: string;
  website_id: string;
  business_name: string;
  description?: string;
  industry?: string;
  target_audience?: string;
  brand_colors?: string[];
  logo_url?: string;
  contact_info?: Record<string, unknown>;
  goals?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url: string;
  preview_url?: string;
  plan_tier: PlanTier;
  license_type: string;
  is_active: boolean;
  version: string;
  created_at: Date;
  updated_at: Date;
}

export interface Blueprint {
  id: string;
  website_id: string;
  version: number;
  status: BlueprintStatus;
  sitemap: BlueprintSitemap;
  pages: BlueprintPage[];
  design_tokens: DesignTokens;
  components: ComponentReference[];
  content_plan: ContentPlan;
  seo_fields: SEOFields;
  integrations?: Integration[];
  constraints?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface BlueprintSitemap {
  pages: SitemapPage[];
  navigation: NavigationItem[];
}

export interface SitemapPage {
  id: string;
  title: string;
  slug: string;
  path: string;
  parent_id?: string;
  order: number;
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  order: number;
  children?: NavigationItem[];
}

export interface BlueprintPage {
  id: string;
  title: string;
  slug: string;
  sections: PageSection[];
  seo_title?: string;
  seo_description?: string;
}

export interface PageSection {
  id: string;
  type: string;
  component_id: string;
  props: Record<string, unknown>;
  order: number;
}

export interface DesignTokens {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  typography: {
    font_family: string;
    font_sizes: Record<string, string>;
  };
  spacing: Record<string, string>;
  border_radius: string;
}

export interface ComponentReference {
  id: string;
  name: string;
  version: string;
  props_schema: Record<string, unknown>;
}

export interface ContentPlan {
  pages: Record<string, PageContent>;
}

export interface PageContent {
  title: string;
  description?: string;
  sections: Record<string, unknown>;
}

export interface SEOFields {
  title?: string;
  description?: string;
  keywords?: string[];
  og_image?: string;
  canonical_url?: string;
}

export interface Integration {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  website_id?: string;
  project_id?: string;
  user_id: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  started_at?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WebsiteVersion {
  id: string;
  website_id: string;
  version_number: number;
  blueprint_id?: string;
  source_artifact_id?: string;
  build_result_id?: string;
  parent_version_id?: string;
  origin: 'generation' | 'chat' | 'visual' | 'upgrade' | 'manual';
  change_summary?: string;
  created_by: string;
  created_at: Date;
}

export interface Preview {
  id: string;
  website_id: string;
  version_id: string;
  build_id?: string;
  environment: string;
  url: string;
  status: 'active' | 'expired' | 'failed';
  expires_at?: Date;
  created_at: Date;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  project_id?: string;
  website_id?: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface AuditEvent {
  id: string;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}
