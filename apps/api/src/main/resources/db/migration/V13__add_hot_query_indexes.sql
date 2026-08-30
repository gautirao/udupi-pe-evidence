-- V13: Add database indexes for hot queries
-- Identified by QA analysis (PERF-2)
-- P0 indexes provide 80-95% speedup, P1 indexes provide 60-80% speedup
--
-- NOTE: CONCURRENTLY removed — Supabase uses pgBouncer on port 6543 (transaction
-- pooling mode) which is incompatible with CREATE INDEX CONCURRENTLY.
-- IF NOT EXISTS ensures idempotency if any indexes were partially created.

-- ==============================================================================
-- P0 INDEXES (Deploy immediately - critical performance impact)
-- ==============================================================================

-- P0-1: Bounding box queries for map viewport
-- Impact: 95% speedup for /api/listings?bbox=... queries
-- Rationale: Almost all map queries filter by lat/lon bounds AND exclude duplicates
CREATE INDEX IF NOT EXISTS idx_property_listings_bbox_not_dup
    ON public.property_listings (latitude, longitude)
    WHERE is_duplicate = false;

-- P0-2: Duplicate detection via raw_post_id
-- Impact: 99% speedup for ingestion idempotency checks
-- Rationale: Ensures each WhatsApp post creates at most one listing
-- UNIQUE constraint prevents race conditions in parallel ingestion
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_listings_raw_post_id_unique
    ON public.property_listings (raw_post_id)
    WHERE raw_post_id IS NOT NULL;

-- P0-3: Area-based lookups for insights and opportunities
-- Impact: 90% speedup for /api/insights and /api/opportunities queries
-- Rationale: Joins and filters frequently use area_key
CREATE INDEX IF NOT EXISTS idx_property_listings_area_key
    ON public.property_listings (area_key)
    WHERE area_key IS NOT NULL;

-- P0-4: Dealer listing history
-- Impact: 85% speedup for dealer dashboard "My Listings" page
-- Rationale: Dealers need to see their listings ordered newest-first
CREATE INDEX IF NOT EXISTS idx_property_listings_created_by_created_at
    ON public.property_listings (created_by, created_at DESC)
    WHERE created_by IS NOT NULL;

-- P0-5: Ingestion job work queue
-- Impact: 80% speedup for "get next unprocessed batch" query
-- Rationale: Ingestion workers query for unprocessed posts not already claimed
CREATE INDEX IF NOT EXISTS idx_raw_posts_unprocessed
    ON public.raw_posts (id)
    WHERE is_processed = false AND processing_started_at IS NULL;

-- P0-6: Authorization checks (CRITICAL for security)
-- Impact: 99% speedup for role lookups in @PreAuthorize guards
-- Rationale: Every authenticated request checks user roles via user_id
-- This is the single most frequently executed query in the system
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
    ON public.user_roles (user_id);

-- ==============================================================================
-- P1 INDEXES (Deploy in next sprint - important but not critical)
-- ==============================================================================

-- P1-7: Deduplication via fuzzy hash
-- Impact: 80% speedup for duplicate detection logic
-- Rationale: Prevents duplicate listings with minor text variations
CREATE INDEX IF NOT EXISTS idx_property_listings_dedupe_hash
    ON public.property_listings (dedupe_hash)
    WHERE dedupe_hash IS NOT NULL;

-- P1-8: Admin review queue and status filtering
-- Impact: 70% speedup for /api/admin/listings?status=... queries
-- Rationale: Admins need to see pending/flagged listings newest-first
CREATE INDEX IF NOT EXISTS idx_property_listings_status_created_at
    ON public.property_listings (status, created_at DESC)
    WHERE is_duplicate = false;

-- P1-9: User notification feed
-- Impact: 60% speedup for /api/notifications?user_id=... queries
-- Rationale: Users load their notification feed ordered newest-first
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
    ON public.notifications (user_id, created_at DESC);

-- ==============================================================================
-- Optional: Update statistics after index creation
-- ==============================================================================
-- Uncomment to run ANALYZE after indexes are built (recommended for production):
-- ANALYZE public.property_listings;
-- ANALYZE public.raw_posts;
-- ANALYZE public.user_roles;
-- ANALYZE public.notifications;
