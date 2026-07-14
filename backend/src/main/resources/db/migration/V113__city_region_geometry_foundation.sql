-- V113: city-region geometry foundation (#1882 Track A PR1).
--
-- EXPAND-ONLY. This migration creates schema and seeds ONLY the per-city
-- region-model POLICY (city_region_policy). It deliberately does NOT populate
-- city_regions or city_region_memberships — those two tables are job-populated
-- by CityRegionOnboardingService.apply(cityId) (a Java service, not a migration),
-- which projects each area's regional_area_classifications row into a region_key
-- via CityRegionProjection and upserts the results. Running this migration alone
-- leaves city_regions/city_region_memberships empty for every city; that is the
-- expected pre-onboarding state.
--
-- No existing table/column is altered destructively. areas gets five new
-- NULLABLE columns (no FK, no NOT NULL) for future OSM geometry provenance —
-- safe to add with live traffic.

-- ── city_region_policy ───────────────────────────────────────────────────────
-- One row per city: which region model applies and the CENTRAL-bucket radius.
-- region_model:
--   CENTRAL_CARDINAL_8  — a CENTRAL bucket (distance <= central_radius_km) plus
--                         the full 8-sector compass for everything outside it.
--   CENTRAL_CARDINAL_4  — a CENTRAL bucket plus the 4 cardinal directions
--                         (N/E/S/W), with NE/SE/SW/NW collapsed onto them.
--   DIRECTIONAL_8       — no CENTRAL bucket at all; every area maps to one of
--                         the 8 compass directions regardless of distance.
-- policy_fingerprint is left NULL at seed time; CityRegionOnboardingService
-- computes and stamps it on first successful apply() (sha256 of region_model +
-- central_radius_km + the city's direction-label set).

CREATE TABLE IF NOT EXISTS public.city_region_policy (
    city_id            INTEGER PRIMARY KEY REFERENCES public.cities (id),
    region_model       TEXT NOT NULL CHECK (region_model IN ('CENTRAL_CARDINAL_4', 'CENTRAL_CARDINAL_8', 'DIRECTIONAL_8')),
    central_radius_km  NUMERIC NOT NULL,
    policy_fingerprint TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.city_region_policy IS
    'Per-city region-model policy (#1882). One row per onboarded city. See CityRegionProjection for the projection rules each region_model implies.';

-- ── city_regions ─────────────────────────────────────────────────────────────
-- The set of regions materialized for a city under its current policy.
-- Job-populated (CityRegionOnboardingService.apply); EMPTY after this migration.

CREATE TABLE IF NOT EXISTS public.city_regions (
    city_id        INTEGER NOT NULL REFERENCES public.cities (id),
    region_key     TEXT    NOT NULL,
    display_label  TEXT,
    display_order  INTEGER NOT NULL,
    centre_lat     NUMERIC,
    centre_lon     NUMERIC,
    min_lat        NUMERIC,
    max_lat        NUMERIC,
    min_lon        NUMERIC,
    max_lon        NUMERIC,
    policy_fingerprint TEXT,
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (city_id, region_key)
);

COMMENT ON TABLE public.city_regions IS
    'Materialized regions per city (#1882), job-populated by CityRegionOnboardingService.apply(). Empty until onboarding runs for a city. display_order comes from CityRegionProjection''s canonical order, never from listing volume.';

-- ── city_region_memberships ──────────────────────────────────────────────────
-- Which region each area belongs to, for a given city. AUTO rows come from the
-- geometric projection; OVERRIDE rows come from regional_area_overrides and take
-- precedence. Job-populated; EMPTY after this migration.

CREATE TABLE IF NOT EXISTS public.city_region_memberships (
    city_id          INTEGER NOT NULL,
    area_key         TEXT    NOT NULL REFERENCES public.areas (area_key),
    region_key       TEXT    NOT NULL,
    assignment_source TEXT   NOT NULL CHECK (assignment_source IN ('AUTO', 'OVERRIDE')),
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (city_id, area_key),
    FOREIGN KEY (city_id, region_key) REFERENCES public.city_regions (city_id, region_key)
);

COMMENT ON TABLE public.city_region_memberships IS
    'One row per (city, area): the region it is currently assigned to (#1882). assignment_source=OVERRIDE rows are preserved across re-onboarding; AUTO rows are recomputed and stale ones deleted.';

-- ── regional_area_overrides ───────────────────────────────────────────────────
-- Manual resolution for an area whose auto-projected region needs correcting
-- (e.g. an area_group that would otherwise be SPLIT/DEGENERATE across regions).
-- Authored by an operator ahead of an apply() run; never written by the
-- projection itself.

CREATE TABLE IF NOT EXISTS public.regional_area_overrides (
    city_id          INTEGER NOT NULL REFERENCES public.cities (id),
    area_key         TEXT    NOT NULL,
    forced_region_key TEXT   NOT NULL,
    reason           TEXT,
    author           TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (city_id, area_key)
);

COMMENT ON TABLE public.regional_area_overrides IS
    'Manual per-area region overrides (#1882). Read by CityRegionOnboardingService.apply() to resolve SPLIT/DEGENERATE area_groups before materializing city_region_memberships. Never populated automatically.';

-- ── areas: OSM geometry provenance columns (nullable, additive) ──────────────
-- Reserved for a future slice that backs area boundaries with real OSM
-- geometry instead of the current bounding-box approximation. All nullable;
-- no behaviour depends on them yet.

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS osm_element_type TEXT;
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS osm_element_id   BIGINT;
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS osm_version      INT;
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS osm_extract_date DATE;
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS geometry_source  TEXT;

COMMENT ON COLUMN public.areas.geometry_source IS
    'Provenance of the area''s geometry (e.g. ''OSM'', ''MANUAL''). NULL = legacy bounding-box seed data (#1882 reserved column, not yet populated).';

-- ── Seed city_region_policy (idempotent, resolved via slug→id join) ─────────
-- policy_fingerprint intentionally left NULL here — stamped by the service on
-- first successful apply().

INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km)
SELECT id, 'CENTRAL_CARDINAL_8', 8
FROM public.cities WHERE slug = 'bangalore'
ON CONFLICT (city_id) DO NOTHING;

INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km)
SELECT id, 'CENTRAL_CARDINAL_4', 4
FROM public.cities WHERE slug = 'udupi'
ON CONFLICT (city_id) DO NOTHING;
