-- scripts/db/fixtures/navigation-hierarchy-fixture-rent-listings-seed.sql
--
-- Issue #2083 (AC6/AC8/AC9/AC10 — navigation counts and intent) — companion,
-- ADDITIVE-ONLY rent variant for navigation-hierarchy-fixture-listings-seed.sql.
-- LOCAL/TEST-ONLY fixture Postgres only. Never run against production or shared Supabase.
--
-- WHY THIS EXISTS: the hosted Bangalore fixture and every existing committed navigation
-- fixture (navigation-hierarchy-fixture-listings-seed.sql) is 100% listing_purpose='sale'
-- (the table default) — confirmed by reading that file's INSERT column list, which never
-- sets listing_purpose. There is therefore no committed, reproducible-from-a-fresh-container
-- fixture anywhere in this repo where Buy and Rent navigation counts (direction header,
-- per-area rows, map badge) can differ. #2083 RC_C fixed `useAreasNavigationJourney`'s
-- navigation-counts request to actually forward the full filter set (including purpose) —
-- previously it was requested with NO filters at all, so Buy and Rent were byte-identical
-- (F7) irrespective of what data existed. Proving the FIX (not just the absence of the old
-- bug) requires an area with real, differing Buy vs Rent inventory.
--
-- WHAT THIS SCRIPT ADDS — 2 new LIVE rent listings under the SAME `d:southeast` Direction
-- (from navigation-hierarchy-fixture-seed.sql) and the SAME `IN|KA|Bengaluru|RR Nagar` AREA
-- leaf that already carries exactly 1 sale listing (navigation-hierarchy-fixture-listings-seed.sql).
-- Deliberately UNEQUAL sale/rent counts, and deliberately scoped to ONE of d:southeast's three
-- AREA children, not all three:
--
--   d:southeast (DIRECTION)
--     -> a:...RR Nagar      1 sale (existing) + 2 rent (NEW)  = Buy 1 / Rent 2
--     -> a:...Vijayanagar   1 sale (existing) + 0 rent        = Buy 1 / Rent 0
--     -> a:...Nagarbhavi    1 sale (existing) + 0 rent        = Buy 1 / Rent 0  <- AC9 empty-Rent case
--
--   Direction header:  Buy 3 (1+1+1)  vs  Rent 2 (2+0+0)  — genuinely different totals,
--   never byte-identical, closing exactly the F7 symptom RC_C fixed.
--   Nagarbhavi under intent=rent is a real, deterministic ZERO-result AREA (AC9): its Buy
--   count (1) must never leak into the Rent badge/panel just because it is nonzero for Buy.
--
-- SAFETY / SCOPE — identical contract to the sibling seed files in this directory:
--   - TEST/LOCAL USE ONLY. ADDITIVE ONLY. No TRUNCATE/DELETE/UPDATE of any row this script did
--     not itself insert. Every INSERT is guarded by `ON CONFLICT (id) DO NOTHING` against fixed,
--     deterministic UUIDs, so a second run is a true no-op.
--   - Reuses the SAME synthetic [E2E] broker account already seeded by
--     scripts/db/fixtures/discover-smoke-seed.sql (a1b2c3d4-e5f6-7890-abcd-ef1234567890) — same
--     pre-flight existence guard as navigation-hierarchy-fixture-listings-seed.sql.
--   - Column set mirrors navigation-hierarchy-fixture-listings-seed.sql exactly, with
--     listing_purpose explicitly set to 'rent' (the one column that file leaves at its
--     'sale' table default) and a non-null monthly_rent so PropertyCard's rent price branch
--     renders real text rather than a blank/undefined price.

BEGIN;

DO $$
DECLARE
  v_broker_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_broker_id) THEN
    RAISE EXCEPTION 'navigation-hierarchy-fixture-rent-listings-seed: expected synthetic [E2E] broker '
      '% from discover-smoke-seed.sql to already exist — aborting rather than creating a new identity',
      v_broker_id;
  END IF;
END $$;

INSERT INTO public.property_listings
  (id, property_type, title, locality, price, monthly_rent, latitude, longitude,
   status, created_by, price_paise, area_key, listing_purpose, is_valid, address_confirmed,
   created_at, updated_at)
VALUES
  ('f2083006-0000-0000-0000-000000000001',
   'apartment', '[E2E] RR Nagar Fixture Rent Apartment A', 'RR Nagar',
   0, 22000, 12.9314733, 77.5290964,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   0, 'IN|KA|Bengaluru|RR Nagar', 'rent', true, true, NOW(), NOW()),

  ('f2083006-0000-0000-0000-000000000002',
   'house', '[E2E] RR Nagar Fixture Rent House B', 'RR Nagar',
   0, 35000, 12.9314733, 77.5290964,
   'LIVE', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   0, 'IN|KA|Bengaluru|RR Nagar', 'rent', true, true, NOW(), NOW())

ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation assertions — sanity-check THIS seed's own rows only.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rr_rent_count  INTEGER;
  v_rr_sale_count  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_rr_rent_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key = 'IN|KA|Bengaluru|RR Nagar' AND listing_purpose = 'rent';

  SELECT COUNT(*) INTO v_rr_sale_count
    FROM public.property_listings
    WHERE status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false
      AND area_key = 'IN|KA|Bengaluru|RR Nagar' AND listing_purpose = 'sale';

  IF v_rr_rent_count < 2 THEN
    RAISE EXCEPTION 'Seed assertion failed: expected 2 LIVE rent listings for RR Nagar, got %',
      v_rr_rent_count;
  END IF;

  IF v_rr_sale_count IS DISTINCT FROM 1 THEN
    RAISE WARNING 'navigation-hierarchy-fixture-rent-listings-seed: expected RR Nagar to already carry '
      '1 LIVE sale listing from navigation-hierarchy-fixture-listings-seed.sql, found % — run that '
      'seed first, or the Buy/Rent count-divergence assertions in '
      'e2e/discover/issue-2083-nav-counts-purpose-badge.spec.ts will not hold as documented',
      v_rr_sale_count;
  END IF;

  RAISE NOTICE 'navigation-hierarchy-fixture-rent-listings-seed assertions passed: RR Nagar has % LIVE '
    'rent listings (sale sibling count for reference: %)', v_rr_rent_count, v_rr_sale_count;
END $$;

COMMIT;
