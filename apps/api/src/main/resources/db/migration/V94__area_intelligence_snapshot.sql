-- V94: area_intelligence_snapshot — pre-computed per-area aggregate cache.
--
-- DESIGN NOTES
-- ============
-- 1. Standalone table — does NOT alter area_overview_stats or any existing table.
--
-- 2. PRIMARY KEY (city_slug, area_key) is the covering index for city-scoped reads;
--    no extra index is required.
--
-- 3. Plain CREATE TABLE inside the transaction (no CONCURRENTLY) — the table is
--    brand-new and empty at migration time, matching V92's design note to avoid
--    the V90-style Hikari-transaction hang that CONCURRENTLY triggers in @DataJpaTest.
--
-- 4. confidence stores the lowercase internal enum value ('full'|'limited'|'insufficient')
--    matching AdminIntelligenceService.toResponse convention (AreaConfidence.name().toLowerCase()).
--    Enforced by CHECK constraint.
--
-- 5. demand_score is RESERVED and stays NULL this issue (#1526). Populated by #1532.
--    NEVER fabricate a value for this column.
--
-- 6. median_price_paise and dominant_property_type are suppressed (NULL) when
--    active_listing_count < K_ANON_MIN (10) — k-anonymity. NEVER store 0 as a
--    surrogate for a suppressed value; use NULL.

CREATE TABLE IF NOT EXISTS public.area_intelligence_snapshot (
    city_slug                    TEXT         NOT NULL,
    area_key                     TEXT         NOT NULL,
    area_label                   TEXT,
    computed_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    active_listing_count         INTEGER      NOT NULL DEFAULT 0,
    median_price_paise           BIGINT,
    dominant_property_type       TEXT,
    fresh_listing_count          INTEGER      NOT NULL DEFAULT 0,
    avg_listing_quality          NUMERIC(5,2),
    price_comparison_sample_count INTEGER     NOT NULL DEFAULT 0,
    price_comparison_supported   BOOLEAN      NOT NULL DEFAULT false,
    confidence                   TEXT         NOT NULL,
    demand_score                 NUMERIC(5,2),

    CONSTRAINT pk_area_intelligence_snapshot
        PRIMARY KEY (city_slug, area_key),

    CONSTRAINT chk_area_intelligence_snapshot_confidence
        CHECK (confidence IN ('full', 'limited', 'insufficient'))
);

COMMENT ON TABLE public.area_intelligence_snapshot IS
    'Pre-computed per-area aggregate cache. Recomputed on demand by AreaIntelligenceSnapshotService. '
    'Composite PK (city_slug, area_key) is the covering index for city-scoped reads.';

COMMENT ON COLUMN public.area_intelligence_snapshot.demand_score IS
    'Deferred — populated by #1532; NULL until then; never fabricate.';

COMMENT ON COLUMN public.area_intelligence_snapshot.median_price_paise IS
    'Suppressed (NULL) when active count < K_ANON_MIN (10) — k-anonymity; never 0.';

COMMENT ON COLUMN public.area_intelligence_snapshot.dominant_property_type IS
    'Suppressed (NULL) when active count < K_ANON_MIN (10) — k-anonymity; never 0.';

-- Optional secondary index for city-scoped reads (plain, non-CONCURRENTLY — table is empty at apply time).
-- V92 design note: CONCURRENTLY on an empty table requires flyway no-transaction pragma and causes
-- @DataJpaTest Hikari-transaction hangs. Using plain index here.
CREATE INDEX IF NOT EXISTS idx_area_intelligence_snapshot_city_slug
    ON public.area_intelligence_snapshot (city_slug);
