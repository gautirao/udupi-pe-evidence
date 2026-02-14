-- DEV_RESET.SQL — Safe cleanup script for dev/local environments
--
-- WARNING: This script DELETES ALL test data from core tables.
-- It is intended ONLY for local development and testing environments.
-- NEVER run this in production.
--
-- What gets deleted:
--   - listing_images (all dealer-uploaded images)
--   - notifications (all in-app notifications)
--   - property_listings (ALL listings: DRAFT, PENDING_REVIEW, LIVE, REJECTED, SCRAPED)
--   - user_saved_areas (all saved area preferences)
--   - raw_posts (all scraped Facebook posts)
--   - feed_runs (all ingestion job records)
--
-- What is preserved:
--   - auth.users (user accounts)
--   - profiles (user profile data)
--   - user_roles (role assignments)
--   - facebook_groups (scraping configuration)
--   - geocode_cache (location lookup cache)
--   - area_stats_latest (analytics materialized view)
--   - area_price_weekly (price trend data)
--
-- Usage: See docs/DEV_CLEANUP.md for step-by-step instructions

-- ===========================================================================
-- ENVIRONMENT SAFETY GUARD
-- ===========================================================================

DO $$
DECLARE
    db_name TEXT;
    current_env TEXT;
BEGIN
    -- Get current database name
    SELECT current_database() INTO db_name;

    -- Check 1: Database name must NOT contain 'prod'
    IF db_name ILIKE '%prod%' THEN
        RAISE EXCEPTION 'SAFETY ABORT: Database name "%" contains "prod". This script cannot run in production.', db_name;
    END IF;

    -- Check 2: Environment variable (if set via custom configuration)
    -- This check relies on your deployment setting a custom variable
    -- Skip if not configured (local dev won't have this)
    BEGIN
        SELECT current_setting('app.environment', true) INTO current_env;
        IF current_env IS NOT NULL AND current_env = 'production' THEN
            RAISE EXCEPTION 'SAFETY ABORT: app.environment is set to "production". This script cannot run in production.';
        END IF;
    EXCEPTION
        WHEN undefined_object THEN
            -- Setting doesn't exist, continue (OK for local dev)
            NULL;
    END;

    -- If we reach here, environment checks passed
    RAISE NOTICE 'Environment check PASSED. Database: %. Proceeding with cleanup...', db_name;
END $$;

-- ===========================================================================
-- DATA DELETION (in correct order to respect FK constraints)
-- ===========================================================================

-- Start transaction for safety (all-or-nothing)
BEGIN;

-- 1. Delete listing_images (references property_listings)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.listing_images;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % rows from listing_images', deleted_count;
END $$;

-- 2. Delete notifications (independent table, references auth.users)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.notifications;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % rows from notifications', deleted_count;
END $$;

-- 3. Delete user_saved_areas (independent table, references auth.users)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.user_saved_areas;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % rows from user_saved_areas', deleted_count;
END $$;

-- 4. Delete property_listings (parent table, references raw_posts)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.property_listings;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % rows from property_listings', deleted_count;
END $$;

-- 5. Delete raw_posts (references feed_runs)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.raw_posts;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % rows from raw_posts', deleted_count;
END $$;

-- 6. Delete feed_runs (parent table, references facebook_groups)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.feed_runs;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '✓ Deleted % rows from feed_runs', deleted_count;
END $$;

-- Commit the transaction
COMMIT;

-- ===========================================================================
-- VERIFICATION QUERIES
-- ===========================================================================

-- Show row counts after cleanup
DO $$
DECLARE
    listing_images_count INTEGER;
    notifications_count INTEGER;
    user_saved_areas_count INTEGER;
    property_listings_count INTEGER;
    raw_posts_count INTEGER;
    feed_runs_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO listing_images_count FROM public.listing_images;
    SELECT COUNT(*) INTO notifications_count FROM public.notifications;
    SELECT COUNT(*) INTO user_saved_areas_count FROM public.user_saved_areas;
    SELECT COUNT(*) INTO property_listings_count FROM public.property_listings;
    SELECT COUNT(*) INTO raw_posts_count FROM public.raw_posts;
    SELECT COUNT(*) INTO feed_runs_count FROM public.feed_runs;

    RAISE NOTICE '';
    RAISE NOTICE '=== CLEANUP COMPLETE ===';
    RAISE NOTICE 'Remaining row counts (should all be 0):';
    RAISE NOTICE '  listing_images: %', listing_images_count;
    RAISE NOTICE '  notifications: %', notifications_count;
    RAISE NOTICE '  user_saved_areas: %', user_saved_areas_count;
    RAISE NOTICE '  property_listings: %', property_listings_count;
    RAISE NOTICE '  raw_posts: %', raw_posts_count;
    RAISE NOTICE '  feed_runs: %', feed_runs_count;

    IF listing_images_count = 0 AND notifications_count = 0 AND
       user_saved_areas_count = 0 AND property_listings_count = 0 AND
       raw_posts_count = 0 AND feed_runs_count = 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '✓ All test data successfully deleted.';
    ELSE
        RAISE WARNING 'Some tables still contain data. Check for FK constraints or permissions.';
    END IF;
END $$;
