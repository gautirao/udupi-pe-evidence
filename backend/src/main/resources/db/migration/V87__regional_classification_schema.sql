-- V87: Regional classification schema — precomputed city-relative direction × distance grouping.
--
-- Three tables:
--   regional_distance_bands   — SEEDED (4 rows), static band definitions
--   regional_directions       — SEEDED (8 rows), compass direction sectors
--   regional_area_classifications — EMPTY at migration; populated by backfill only
--
-- city_key in regional_area_classifications stores the city slug (TEXT), not the integer
-- cities.id FK, to avoid join overhead on the read path and to remain stable across
-- future city-table restructuring. This intentionally diverges from curated
-- area_groups.city_id INTEGER — see comment on the column below.

-- ── Distance bands ────────────────────────────────────────────────────────────
-- Ranges are [min_km, max_km) — lower-inclusive, upper-exclusive.
-- The outermost band has NULL max_km meaning "no upper bound" (≥ 50 km).
-- SQL guard must be: distance_km >= min_km AND (max_km IS NULL OR distance_km < max_km)

CREATE TABLE IF NOT EXISTS public.regional_distance_bands (
    band_key   TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    min_km     NUMERIC NOT NULL,
    max_km     NUMERIC,          -- NULL = ∞ (no upper bound)
    sort_order INTEGER NOT NULL
);

COMMENT ON COLUMN public.regional_distance_bands.max_km IS
    'Exclusive upper bound in km. NULL means no upper bound (≥ min_km). Guard: distance >= min_km AND (max_km IS NULL OR distance < max_km).';

INSERT INTO public.regional_distance_bands (band_key, label, min_km, max_km, sort_order) VALUES
    ('0_10',  'Within 10 km',  0,    10,   1),
    ('10_25', '10–25 km',      10,   25,   2),
    ('25_50', '25–50 km',      25,   50,   3),
    ('50_up', '50+ km',        50,   NULL, 4)
ON CONFLICT (band_key) DO NOTHING;

-- ── Compass directions ────────────────────────────────────────────────────────
-- 8-sector compass: each sector spans 45°. Bearing is measured clockwise from north.
-- N sector wraps: [337.5, 360) ∪ [0, 22.5)
-- Remaining sectors are contiguous [min_bearing_deg, max_bearing_deg).
-- Columns bearing_min_deg / bearing_max_deg are for reference/audit only;
-- the N-wrap is handled in application code (RegionalGeo.java), not enforced by DB.

CREATE TABLE IF NOT EXISTS public.regional_directions (
    direction_key    TEXT PRIMARY KEY,
    label            TEXT NOT NULL,
    sort_order       INTEGER NOT NULL,
    bearing_min_deg  NUMERIC NOT NULL,  -- inclusive lower bound (reference only)
    bearing_max_deg  NUMERIC NOT NULL   -- exclusive upper bound (reference only; N wraps at 360→0)
);

COMMENT ON COLUMN public.regional_directions.bearing_min_deg IS
    'Inclusive lower bearing bound (degrees, clockwise from north). N sector wraps: [337.5,360) and [0,22.5) both map to N — handled in RegionalGeo.java.';

INSERT INTO public.regional_directions (direction_key, label, sort_order, bearing_min_deg, bearing_max_deg) VALUES
    ('N',  'North',     1,   337.5,  22.5),   -- wraps; RegionalGeo handles 337.5–360 and 0–22.5
    ('NE', 'Northeast', 2,   22.5,   67.5),
    ('E',  'East',      3,   67.5,   112.5),
    ('SE', 'Southeast', 4,   112.5,  157.5),
    ('S',  'South',     5,   157.5,  202.5),
    ('SW', 'Southwest', 6,   202.5,  247.5),
    ('W',  'West',      7,   247.5,  292.5),
    ('NW', 'Northwest', 8,   292.5,  337.5)
ON CONFLICT (direction_key) DO NOTHING;

-- ── Area classifications ───────────────────────────────────────────────────────
-- Populated exclusively by RegionalClassificationBackfillService (never by migration).
-- Seed rows = ZERO by design.
--
-- city_key: TEXT slug (e.g. 'udupi'), NOT an FK to cities.id.
--   Rationale: slug is the natural key used throughout the discover read path;
--   avoids a join and remains stable under city-table refactoring.
--   Diverges intentionally from curated area_groups.city_id INTEGER — do NOT
--   add a FK here without careful migration of the backfill runner.

CREATE TABLE IF NOT EXISTS public.regional_area_classifications (
    city_key          TEXT NOT NULL,
    area_key          TEXT NOT NULL,
    direction_key     TEXT NOT NULL REFERENCES public.regional_directions (direction_key),
    distance_band_key TEXT NOT NULL REFERENCES public.regional_distance_bands (band_key),
    bearing_deg       DOUBLE PRECISION,
    distance_km       DOUBLE PRECISION,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regional_area_classifications_pkey PRIMARY KEY (city_key, area_key)
);

COMMENT ON COLUMN public.regional_area_classifications.city_key IS
    'City slug TEXT (e.g. ''udupi''), NOT an integer FK. Diverges from area_groups.city_id INTEGER by design — see V87 header comment.';

CREATE INDEX IF NOT EXISTS idx_regional_area_classifications_city_key
    ON public.regional_area_classifications (city_key);
