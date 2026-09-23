-- V142: seed the missing city_region_policy rows for Mangalore and Kundapur (#2675).
--
-- DEFECT
-- V71 seeds four ACTIVE cities (bangalore, mangalore, udupi, kundapur). V113 seeds
-- city_region_policy for only two of them (bangalore, udupi). Admin City Launch's
-- prerequisite self-materialisation (#2163) calls CityRegionOnboardingService.apply(),
-- which throws RegionOnboardingBlockedException(MISSING_POLICY) when no policy row
-- exists. Kundapur (city_id=4) and Mangalore (city_id=2) therefore fail Prepare/Retry
-- deterministically -- retrying re-runs the identical check and cannot repair the state.
--
-- EXPAND-ONLY / IDEMPOTENT
-- Two INSERT ... SELECT ... ON CONFLICT (city_id) DO NOTHING statements, resolved via
-- slug->id join (never a hard-coded id). No UPDATE, no DELETE: an existing policy row
-- for ANY city -- including an operator-tuned bangalore or udupi row that has already
-- diverged from the V113 seed -- is left byte-for-byte untouched. Safe to re-run.
--
-- CHOSEN VALUES AND THEIR DERIVATION (see the PR for the full measurement table)
--   region_model = 'CENTRAL_CARDINAL_4' for both.
--     Every city_region_policy row actually in use is CENTRAL_CARDINAL_4; it is the only
--     model present in live data, and the only model this product has ever operated.
--   central_radius_km = 4 for both.
--     4 km is the value already ratified for udupi, the other coastal-district city
--     (8 km is reserved for bangalore, the metro). It is also the value the two cities'
--     own geometry supports: measured from each city's geo_center against its seeded
--     areas, radius 4 yields non-degenerate region sets
--       kundapur  -> CENTRAL(1), N(2)                 [3 areas,  max 28.2 km out]
--       mangalore -> CENTRAL(1), S(4), W(2), N(1)     [8 areas,  max 11.3 km out]
--     whereas radius 8 collapses 7 of Mangalore's 8 areas into a single CENTRAL bucket.
--
-- policy_fingerprint is intentionally left NULL, exactly as V113 does -- it is stamped by
-- CityRegionOnboardingService on the first successful apply().

INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km)
SELECT id, 'CENTRAL_CARDINAL_4', 4
FROM public.cities WHERE slug = 'mangalore'
ON CONFLICT (city_id) DO NOTHING;

INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km)
SELECT id, 'CENTRAL_CARDINAL_4', 4
FROM public.cities WHERE slug = 'kundapur'
ON CONFLICT (city_id) DO NOTHING;
