-- DEV_TRIM.SQL — Trim all transactional tables to ≤10 rows each
--
-- Use this when you want a small, realistic dataset to test the application
-- end-to-end without starting completely from scratch.
--
-- What is trimmed (oldest rows deleted, 10 most-recent kept):
--   - listing_images        (child of property_listings)
--   - viewing_requests      (child of property_listings)
--   - property_listings     (10 most recent by created_at)
--   - notifications         (10 most recent by created_at)
--   - user_saved_areas      (10 most recent by created_at)
--   - raw_posts             (10 most recent by created_at)
--   - feed_runs             (10 most recent by created_at — CASCADE removes old raw_posts)
--
-- What is preserved entirely (config / auth / cache):
--   - auth.users
--   - profiles
--   - user_roles
--   - facebook_groups
--   - geocode_cache
--   - area_stats_latest
--   - area_price_weekly
--
-- Usage (Supabase SQL editor or psql):
--   \i scripts/dev_trim.sql
--
-- WARNING: Do NOT run in production.

-- ===========================================================================
-- ENVIRONMENT SAFETY GUARD (same as dev_reset.sql)
-- ===========================================================================

DO $$
DECLARE
    db_name   TEXT;
    cur_env   TEXT;
BEGIN
    SELECT current_database() INTO db_name;

    IF db_name ILIKE '%prod%' THEN
        RAISE EXCEPTION 'SAFETY ABORT: Database "%" looks like production.', db_name;
    END IF;

    BEGIN
        SELECT current_setting('app.environment', true) INTO cur_env;
        IF cur_env IS NOT NULL AND cur_env = 'production' THEN
            RAISE EXCEPTION 'SAFETY ABORT: app.environment = "production".';
        END IF;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;

    RAISE NOTICE 'Environment check PASSED (db=%). Trimming to 10 rows per table...', db_name;
END $$;

-- ===========================================================================
-- TRIM (in FK-safe order: children before parents)
-- ===========================================================================

BEGIN;

-- ── 1. listing_images ───────────────────────────────────────────────────────
-- Keep only images that belong to the 10 most-recent property_listings.
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.listing_images
    WHERE listing_id NOT IN (
        SELECT id FROM public.property_listings
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ listing_images   — deleted % rows', deleted;
END $$;

-- ── 2. viewing_requests ─────────────────────────────────────────────────────
-- Keep only bookings for the 10 most-recent listings.
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.viewing_requests
    WHERE listing_id NOT IN (
        SELECT id FROM public.property_listings
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ viewing_requests — deleted % rows', deleted;
END $$;

-- ── 3. property_listings ────────────────────────────────────────────────────
-- Keep 10 most recent.  raw_post_id FK is ON DELETE SET NULL — safe.
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.property_listings
    WHERE id NOT IN (
        SELECT id FROM public.property_listings
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ property_listings — deleted % rows', deleted;
END $$;

-- ── 4. notifications ────────────────────────────────────────────────────────
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.notifications
    WHERE id NOT IN (
        SELECT id FROM public.notifications
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ notifications    — deleted % rows', deleted;
END $$;

-- ── 5. user_saved_areas ─────────────────────────────────────────────────────
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.user_saved_areas
    WHERE id NOT IN (
        SELECT id FROM public.user_saved_areas
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ user_saved_areas — deleted % rows', deleted;
END $$;

-- ── 6. raw_posts ────────────────────────────────────────────────────────────
-- Delete old raw_posts first so the feed_runs CASCADE (step 7) doesn't
-- remove rows we want to keep.
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.raw_posts
    WHERE id NOT IN (
        SELECT id FROM public.raw_posts
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ raw_posts        — deleted % rows', deleted;
END $$;

-- ── 7. feed_runs ────────────────────────────────────────────────────────────
-- ON DELETE CASCADE: any remaining raw_posts belonging to deleted feed_runs
-- will also be removed (those were already beyond the top-10 anyway).
DO $$
DECLARE deleted INTEGER;
BEGIN
    DELETE FROM public.feed_runs
    WHERE id NOT IN (
        SELECT id FROM public.feed_runs
        ORDER BY created_at DESC
        LIMIT 10
    );
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RAISE NOTICE '✓ feed_runs        — deleted % rows', deleted;
END $$;

COMMIT;

-- ===========================================================================
-- VERIFICATION
-- ===========================================================================

DO $$
DECLARE
    li  INTEGER; vr  INTEGER; pl  INTEGER;
    no  INTEGER; sa  INTEGER; rp  INTEGER; fr INTEGER;
BEGIN
    SELECT COUNT(*) INTO li FROM public.listing_images;
    SELECT COUNT(*) INTO vr FROM public.viewing_requests;
    SELECT COUNT(*) INTO pl FROM public.property_listings;
    SELECT COUNT(*) INTO no FROM public.notifications;
    SELECT COUNT(*) INTO sa FROM public.user_saved_areas;
    SELECT COUNT(*) INTO rp FROM public.raw_posts;
    SELECT COUNT(*) INTO fr FROM public.feed_runs;

    RAISE NOTICE '';
    RAISE NOTICE '=== TRIM COMPLETE — remaining row counts ===';
    RAISE NOTICE '  listing_images:    %', li;
    RAISE NOTICE '  viewing_requests:  %', vr;
    RAISE NOTICE '  property_listings: %', pl;
    RAISE NOTICE '  notifications:     %', no;
    RAISE NOTICE '  user_saved_areas:  %', sa;
    RAISE NOTICE '  raw_posts:         %', rp;
    RAISE NOTICE '  feed_runs:         %', fr;
    RAISE NOTICE '(facebook_groups, geocode_cache, profiles, user_roles — untouched)';
END $$;
