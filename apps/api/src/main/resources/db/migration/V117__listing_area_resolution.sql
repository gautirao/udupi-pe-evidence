-- V117: listing area resolution (#1887 PR3) — additive/expand-only schema recording whether an
-- ingested listing's area_key was resolved against the canonical `areas`/`area_alias` tables at
-- ingestion time, and by which resolution method.
--
-- EXPAND-ONLY. No existing column is dropped, retyped, or renamed. area_resolution_status
-- defaults to 'RESOLVED' so every pre-existing property_listings row is treated as already
-- resolved (matches its current geocoded area_key being used as-is today) — no backfill needed,
-- and this DEFAULT is metadata-only (no table rewrite) in PostgreSQL.
--
-- This migration does NOT touch AreaOnboardingService/AreaOnboardingApplyService/
-- AreaOnboardingReviewService/AreaRegionReclassOutbox/CityRegionOnboardingService/
-- RegionalClassificationBackfillService/SearchOutboxPoller or their tables — see
-- AreaResolutionService (new, LOOKUP-only) and AreaRegionReclassOutboxPoller (new, consumer-only)
-- for the code paths this migration supports.

ALTER TABLE public.property_listings
    ADD COLUMN IF NOT EXISTS area_resolution_status TEXT NOT NULL DEFAULT 'RESOLVED'
        CHECK (area_resolution_status IN ('RESOLVED', 'UNRESOLVED')),
    ADD COLUMN IF NOT EXISTS area_resolution_method TEXT
        CHECK (area_resolution_method IS NULL OR area_resolution_method IN ('PROVIDER_ID', 'CANONICAL_KEY', 'ALIAS'));

COMMENT ON COLUMN public.property_listings.area_resolution_status IS
    'Whether this listing''s area_key was resolved against canonical areas/area_alias at ingestion '
    'time (#1887 PR3). RESOLVED (default) covers every pre-existing row and any newly-ingested row '
    'whose geocoded area matched a canonical area (by provider-id, canonical key, or reviewed alias). '
    'UNRESOLVED means the listing kept its raw geocoded area_key because no canonical match was '
    'found — set only by ListingIngestionService.createFrom via AreaResolutionService, never '
    'inferred/auto-created. See AreaResolutionService for the LOOKUP-only resolution order.';
COMMENT ON COLUMN public.property_listings.area_resolution_method IS
    'Which resolution step produced a RESOLVED area_key (#1887 PR3): PROVIDER_ID (matched an '
    'applied+finalized+approved area_onboarding_candidate by provider/external_source_id), '
    'CANONICAL_KEY (exact match on the ACTIVE areas.area_key), or ALIAS (city-scoped '
    'area_alias.alias_normalised match). NULL when area_resolution_status = UNRESOLVED or for '
    'pre-existing rows that predate this column.';

-- Partial index for an operational "find unresolved listings" query — mirrors the style of
-- idx_area_region_reclass_outbox_pending (V116) and other partial-index conventions in this repo.
CREATE INDEX IF NOT EXISTS idx_property_listings_area_unresolved
    ON public.property_listings (id)
    WHERE area_resolution_status = 'UNRESOLVED';
