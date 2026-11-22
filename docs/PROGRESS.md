# Baymax Backend - Progress Documentation

## Project Overview
Baymax is an AI-powered website creation, redesign, hosting, and management platform. This document tracks the backend development progress.

## Tech Stack
- **Framework**: Fastify 4.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL (Supabase-managed)
- **Auth**: Custom Email OTP + JWT (replaced Supabase Auth)
- **Storage**: Supabase Storage
- **API Documentation**: Swagger/OpenAPI
- **Agent Skills**: Supabase & Postgres Best Practices installed

## Current Status
🚧 **In Progress** - Core API Routes & Job Framework

## Milestones

### Milestone 1: Project Foundation ✅
**Status**: Completed
**Date**: 2025-11-21

**Completed Tasks**:
- [x] Initialize Fastify project with TypeScript
- [x] Configure project structure and dependencies
- [x] Set up environment configuration
- [x] Create database connection pool
- [x] Implement database migration system
- [x] Create initial database schema
- [x] Set up CORS, Helmet, JWT, rate limiting
- [x] Configure Swagger/OpenAPI documentation
- [x] Implement error handling middleware

**Files Created**:
- `package.json` - Project dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `.env.example` - Environment variables template
- `src/server.ts` - Main server entry point
- `src/config/index.ts` - Configuration management
- `src/db/index.ts` - Database connection
- `src/db/migrate.ts` - Migration runner
- `src/db/migrations/001_initial_schema.sql` - Initial schema
- `src/middleware/auth.ts` - Authentication middleware
- `src/middleware/error.ts` - Error handling
- `src/types/index.ts` - TypeScript type definitions

---

### Milestone 2: Core API Routes ✅
**Status**: Completed
**Date**: 2025-11-21

**Completed Tasks**:
- [x] Project routes (CRUD operations)
- [x] Template routes (listing, filtering, categories)
- [x] Blueprint routes (CRUD, approval workflow)
- [x] Website routes (creation, management)
- [x] Business profile routes (create/update/get)
- [x] Job routes (status, cancellation, statistics)
- [x] Version routes (history, rollback, diff)
- [x] Preview routes (create, list, status, latest)

**Files Created**:
- `src/routes/projects.ts` - Project management API
- `src/routes/templates.ts` - Template catalog API
- `src/routes/blueprints.ts` - Blueprint management API
- `src/routes/websites.ts` - Website management API
- `src/routes/jobs.ts` - Job management API
- `src/routes/versions.ts` - Version control API
- `src/routes/previews.ts` - Preview management API
- `src/services/job.service.ts` - Job service layer
- `src/jobs/processor.ts` - Job processor framework

---

### Milestone 3: Authentication & Authorization
**Status**: Partially Complete (Email OTP pending Gmail App Password)
**Target Date**: TBD

**Completed Tasks**:
- [x] Custom email OTP authentication system (code complete)
- [x] Password hashing with bcrypt (12 salt rounds)
- [x] Custom JWT token generation and verification
- [x] Email service with Gmail SMTP integration (code complete)
- [x] OTP generation, expiry (5 min), and attempt tracking
- [x] Account lockout after 3 failed attempts (1 hour)
- [x] Rate limiting for OTP requests (3 per hour)
- [x] Auth routes (request OTP, verify OTP, set password, login)
- [x] Updated auth middleware for custom JWT
- [x] Database schema updated with auth fields
- [x] Plan tier enforcement middleware
- [x] RBAC middleware for plan-based access control
- [x] Plan service with entitlements configuration
- [x] Usage tracking service
- [x] Usage routes for statistics and limits

**Pending Tasks**:
- [ ] **Gmail App Password** - User needs to create app password for baymaxai43@gmail.com to enable email OTP sending
- [ ] API key management (for service-to-service)
- [ ] Password reset flow
- [ ] Email verification resend logic

**Note**: Authentication system is code-complete but requires Gmail App Password configuration to send OTP emails. Plan tier enforcement and RBAC are now implemented.

**Files Created**:
- `src/services/auth.service.ts` - Authentication business logic
- `src/services/email.service.ts` - Email sending with Gmail SMTP
- `src/routes/auth.ts` - Authentication API routes
- `src/db/migrations/002_add_auth_fields.sql` - Database migration for auth fields
- Updated `src/middleware/auth.ts` - Custom JWT verification
- Updated `src/config/index.ts` - Email and JWT configuration

**Authentication Flow**:
1. User enters email → POST /api/v1/auth/request-otp
2. System checks if user exists, generates 6-digit OTP, sends via email
3. User enters OTP → POST /api/v1/auth/verify-otp
4. System verifies OTP, marks email as verified, returns JWT token
5. New users set password → POST /api/v1/auth/set-password (with JWT)
6. Returning users login → POST /api/v1/auth/login (email + password)

**Security Features**:
- OTP expires after 5 minutes
- 3 failed attempts → 1 hour lockout
- 3 OTP requests per hour per email
- Passwords hashed with bcrypt (12 salt rounds)
- JWT tokens with 7-day expiry
- Email verification required before full access

---

### Milestone 4: Job Framework ✅
**Status**: Completed (Framework)
**Date**: 2025-11-21

**Completed Tasks**:
- [x] Job queue implementation (custom polling-based)
- [x] Job processor framework
- [x] Job status tracking
- [x] Job cancellation
- [x] Job statistics
- [ ] Job retry logic (service methods created)
- [ ] Dead letter queue handling
- [ ] Actual job processors for each type (stubs created)

**Notes**:
- Job processor uses polling-based approach (5-second intervals)
- All job types have stub processors that need implementation
- Job service includes methods for retry and cleanup

---

### Milestone 5: AI Gateway ✅
**Status**: Completed
**Date**: 2025-11-22

**Completed Tasks**:
- [x] AI provider abstraction layer (Gemini, Groq, OpenRouter)
- [x] Plan-based model routing (economy/standard/premium)
- [x] Cost tracking and calculation
- [x] Rate limiting per plan (daily AI requests)
- [x] Prompt management for different tasks
- [x] Response caching framework
- [x] AI gateway service with centralized routing
- [x] AI routes for generation, editing, SEO
- [x] Usage tracking integration
- [x] Provider health checking

**Files Created**:
- `src/services/ai-provider.service.ts` - AI provider abstraction
- `src/services/ai-gateway.service.ts` - AI gateway with routing and cost tracking
- `src/routes/ai.ts` - AI API routes

**Features**:
- **Planner/Executor architecture** (all tiers): `POST /ai/plan` runs the `planning` task — a peak reasoning model produces a Blueprint matching the `blueprints` schema, persisted as a `draft` row; `POST /ai/generate` requires an **approved** blueprint and the executor model returns a structured `{ files: { path: content } }` map (Next.js App Router + TS + Tailwind)
- **Artifact persistence**: generated/edited file maps are stored in the `artifacts` table (SHA-256 checksum, size, metadata) and linked to `website_versions.source_artifact_id`; every generation/edit creates a new version and updates `websites.current_version_id`
- **Real edit/SEO inputs**: `/ai/edit` loads the latest version's artifact files (bounded serialization), applies changes, and persists a new `chat`-origin version; `/ai/seo` analyzes real stored source
- **Peak models per tier**: Business planning→`gemini-2.5-pro`, generation→`gpt-4o`; Pro planning→`o3`, generation/editing→`claude-sonnet-4.5`→`gpt-4o`
- **Resilient fallback chains**: every task is an ordered candidate list — Business/Pro have 2–4 candidates across all three providers, so requests degrade gracefully and effectively never hard-fail while any provider key is configured
- **Free tier**: `llama-3.1-8b-instant` primary with `gemini-2.5-flash-lite` fallback; 50 AI requests/day
- **Business & Pro**: unlimited AI requests (`-1`)
- **Cost tracking**: Per-token cost per provider/model (current pricing)
- **JSON mode**: `responseFormat: 'json'` → provider-native JSON mode + gateway-side JSON validation
- **Timeouts**: 120s AbortController on all provider calls
- **System prompts**: Correctly passed to all providers

**API Endpoints**:
- `POST /api/v1/ai/generate` - Generate website from blueprint
- `POST /api/v1/ai/edit` - Edit website with AI
- `POST /api/v1/ai/seo` - Optimize SEO with AI
- `GET /api/v1/ai/usage` - Get AI usage statistics
- `GET /api/v1/ai/providers` - Get available providers
- `GET /api/v1/ai/health` - Check provider health

**Next Steps**:
- Implement actual job processors for AI tasks
- Add response caching implementation
- Integrate with website generation workflow
- Add more sophisticated prompt engineering

---

### Milestone 6: Website Generation
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Blueprint to code generation
- [ ] Component registry
- [ ] Template engine
- [ ] Asset management
- [ ] Build pipeline
- [ ] Preview generation

---

### Milestone 7: Editing System
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Chat-based editing
- [ ] Visual editing API
- [ ] Version control
- [ ] Rollback functionality
- [ ] Change tracking

---

### Milestone 8: SEO Module
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] SEO profile management
- [ ] Keyword analysis
- [ ] Meta tag generation
- [ ] Sitemap generation
- [ ] Structured data markup
- [ ] SEO reporting

---

### Milestone 9: Existing Website Upgrade (REA)
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] URL validation and security
- [ ] REA adapter implementation
- [ ] Site analysis
- [ ] Content extraction
- [ ] Migration workflow
- [ ] Upgrade reports

---

### Milestone 10: Billing & Payments
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Payment gateway integration (Stripe)
- [ ] Subscription management
- [ ] Prepaid balance system
- [ ] Ledger implementation
- [ ] Invoice generation
- [ ] Webhook handling
- [ ] Usage metering

---

### Milestone 11: Deployment & Hosting
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Vercel deployment integration
- [ ] Deployment status tracking
- [ ] Rollback functionality
- [ ] Custom domain support
- [ ] DNS management
- [ ] SSL certificate handling

---

### Milestone 12: Domain Management
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Domain search API
- [ ] Domain purchase flow
- [ ] DNS record management
- [ ] Domain verification
- [ ] Registrar integration (TBD)

---

### Milestone 13: Observability & Monitoring
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Structured logging
- [ ] Metrics collection
- [ ] Error tracking (Sentry)
- [ ] Performance monitoring
- [ ] Admin dashboard
- [ ] Alerting system

---

### Milestone 14: Testing & QA
**Status**: Pending
**Target Date**: TBD

**Tasks**:
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Load testing
- [ ] Security testing
- [ ] API documentation tests

---

## API Endpoints Summary

### Authentication
- `POST /api/v1/auth/request-otp` - Request OTP code
- `POST /api/v1/auth/verify-otp` - Verify OTP and get JWT token
- `POST /api/v1/auth/set-password` - Set password (requires JWT)
- `POST /api/v1/auth/login` - Login with email and password
- `GET /api/v1/auth/me` - Get current user profile
- `POST /api/v1/auth/check-email` - Check if email is registered
- `POST /api/v1/auth/resend-otp` - Resend OTP code

### Projects
- `GET /api/v1/projects` - List all projects
- `GET /api/v1/projects/:id` - Get project by ID
- `POST /api/v1/projects` - Create new project
- `PATCH /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project

### Templates
- `GET /api/v1/templates` - List templates with filters
- `GET /api/v1/templates/:id` - Get template by ID
- `GET /api/v1/templates/categories` - Get template categories
- `POST /api/v1/projects/:projectId/template` - Apply template to project

### Blueprints
- `POST /api/v1/websites/:websiteId/blueprint` - Create blueprint
- `GET /api/v1/blueprints/:id` - Get blueprint by ID
- `GET /api/v1/websites/:websiteId/blueprints` - Get website blueprints
- `PATCH /api/v1/blueprints/:id` - Update blueprint
- `POST /api/v1/blueprints/:id/approve` - Approve blueprint
- `POST /api/v1/blueprints/:id/reject` - Reject blueprint

### Websites
- `POST /api/v1/websites` - Create website
- `GET /api/v1/websites` - Get all websites
- `GET /api/v1/projects/:projectId/websites` - Get project websites
- `GET /api/v1/websites/:id` - Get website by ID
- `PATCH /api/v1/websites/:id` - Update website
- `DELETE /api/v1/websites/:id` - Archive website
- `POST /api/v1/websites/:websiteId/business-profile` - Create/update business profile
- `GET /api/v1/websites/:websiteId/business-profile` - Get business profile

### Jobs
- `GET /api/v1/jobs` - Get all jobs with filters
- `GET /api/v1/jobs/:id` - Get job by ID
- `POST /api/v1/jobs` - Create job
- `POST /api/v1/jobs/:id/cancel` - Cancel job
- `PATCH /api/v1/jobs/:id/status` - Update job status
- `GET /api/v1/jobs/stats` - Get job statistics

### Versions
- `GET /api/v1/websites/:websiteId/versions` - Get website versions
- `GET /api/v1/versions/:id` - Get version by ID
- `POST /api/v1/websites/:websiteId/versions` - Create version
- `POST /api/v1/websites/:websiteId/versions/:versionId/rollback` - Rollback to version
- `GET /api/v1/websites/:websiteId/versions/:versionId/diff` - Get version diff

### Previews
- `POST /api/v1/websites/:websiteId/previews` - Create preview
- `GET /api/v1/websites/:websiteId/previews` - Get website previews
- `GET /api/v1/previews/:id` - Get preview by ID
- `PATCH /api/v1/previews/:id/status` - Update preview status
- `DELETE /api/v1/previews/:id` - Delete preview
- `GET /api/v1/websites/:websiteId/previews/latest` - Get latest preview

### Usage & Plans
- `GET /api/v1/usage/stats` - Get usage statistics
- `GET /api/v1/usage/events` - Get usage events
- `GET /api/v1/usage/plan` - Get plan information and entitlements

### AI Gateway
- `POST /api/v1/ai/plan` - Generate website Blueprint from business brief (planner role, persists draft blueprint)
- `POST /api/v1/ai/generate` - Generate website file map from approved blueprint (executor role)
- `POST /api/v1/ai/edit` - Edit website with AI
- `POST /api/v1/ai/seo` - Optimize SEO with AI
- `GET /api/v1/ai/usage` - Get AI usage statistics
- `GET /api/v1/ai/providers` - Get available providers
- `GET /api/v1/ai/health` - Check provider health

## Database Schema

### Core Tables
- `users` - User accounts (managed by Supabase Auth)
- `projects` - User projects
- `websites` - Website instances
- `business_profiles` - Business information
- `templates` - Template catalog
- `blueprints` - Website blueprints
- `jobs` - Async job tracking
- `website_versions` - Version history
- `previews` - Preview deployments
- `usage_events` - Usage tracking
- `audit_events` - Audit logging
- `artifacts` - Generated source file maps / build outputs (migration 004)

### Database Best Practices Applied
- ✅ Foreign key columns are indexed for performance
- ✅ Composite indexes on frequently queried columns
- ✅ Partial indexes for filtered queries
- ✅ Timestamps with timezone for all tables
- ✅ UUIDs for all primary keys
- ✅ Soft deletes for projects
- ⚠️ RLS policies to be implemented (if using Supabase Data API)

### Supabase Agent Skills
Installed skills for database optimization:
- **supabase**: Comprehensive Supabase guidance
- **supabase-postgres-best-practices**: Postgres performance rules
  - Query performance (indexes, query optimization)
  - Connection management
  - Security & RLS
  - Schema design
  - Concurrency & locking
  - Data access patterns
  - Monitoring & diagnostics
  - Advanced features

Reference: `.agents/skills/` directory for detailed guidelines

## Environment Variables
See `.env.example` for required configuration.

### Supabase Setup Required
1. Create a Supabase project at https://supabase.com
2. Get your project URL and API keys from Settings → API
3. Get your database connection string from Settings → Database
4. Update `.env` file with your credentials:
   - `DATABASE_URL` - PostgreSQL connection string
   - `SUPABASE_URL` - Project URL
   - `SUPABASE_ANON_KEY` - Anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key (keep secret!)
5. Run database migrations: `npm run db:migrate`

### Email Configuration Required
1. Create a Gmail App Password for baymaxai43@gmail.com
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Generate app password for "Mail"
2. Update `.env` file:
   - `EMAIL_APP_PASSWORD` - Your Gmail App Password
3. Test email connection after setup

**Status**: ⏸️ Pending - User will provide app password later

## Next Steps
1. ✅ Complete core API routes (websites, jobs, versions, previews)
2. ✅ Implement custom authentication (email OTP + JWT)
3. 🔄 Set up Supabase database connection
4. Implement plan tier enforcement and RBAC
5. Implement actual job processors for each job type
6. Begin AI gateway implementation
7. Create comprehensive test suite
8. Add billing and payment routes
9. Add deployment and domain routes
10. Add SEO routes
11. Add upgrade (REA) routes

## Notes
- All API endpoints require authentication except health check
- Plan tier enforcement is server-side only
- All sensitive actions are logged to audit_events
- Database uses UUIDs for all primary keys
- Soft deletes are used for projects

---

*Last Updated: 2025-11-22 (AI Gateway Implementation Complete)*
