-- V96: area_demand_signal — hourly demand-vs-supply rollup per buyer-need bucket.
--
-- DESIGN NOTES
-- ============
-- 1. Standalone NEW table — does NOT alter area_intelligence_snapshot or any existing table.
--    The demand_score column on area_intelligence_snapshot (V94) already exists and is
--    populated at runtime by AreaDemandSignalService via UPDATE; no DDL change needed.
--
-- 2. PRIMARY KEY (city_slug, area_key, property_type, listing_purpose, budget_band,
--    period_start, window_days) is the covering identity for per-bucket reads.
--    window_days is included so 7d and 30d rollups coexist without PK collision.
--    city_slug is carried in the PK (not derived from area_key string-split) because
--    the rollup JOINs areas->cities for correct slug resolution.
--
-- 3. gap_score is nullable: NULL when suppressed (k-anon: demand_total < 10, or
--    statistical guard: peer population N < 3). NEVER stored as 0 when absent.
--    CHECK constraint validates the [-3, 3] range on non-null rows only.
--
-- 4. signal_type and confidence use CLOSED vocabulary enforced by CHECK constraints.
--    Vocabulary intentionally differs from area_intelligence_snapshot.confidence
--    (which uses full|limited|insufficient) — these are independent columns on
--    separate tables with separate semantics.
--
-- 5. Plain (non-CONCURRENTLY) index — table is empty at migration apply time.
--    Matches V94 design note: CONCURRENTLY on an empty table is unnecessary and
--    causes @DataJpaTest Hikari-transaction hangs under the postgis:15 test image.
--
-- 6. budget_band stores the 7 canonical band labels from DiscoverEventAllowList
--    (UNDER_5L, 5L_20L, 20L_50L, 50L_1CR, 1CR_2CR, ABOVE_2CR, UNSPECIFIED).
--    Supply-side bands are mapped from price_paise via a deterministic CASE in the
--    rollup query (see AreaDemandSignalRepository) reproducing the client toPriceBand
--    half-open intervals exactly.
--
-- REVERSIBILITY
-- =============
-- To roll back: DROP TABLE IF EXISTS public.area_demand_signal;
-- Also reset demand_score to NULL:
--   UPDATE public.area_intelligence_snapshot SET demand_score = NULL;
-- (No FK dependents; safe to drop independently.)

CREATE TABLE IF NOT EXISTS public.area_demand_signal (
    city_slug         TEXT        NOT NULL,   -- resolved via areas->cities JOIN (never string-split)
    area_key          TEXT        NOT NULL,
    property_type     TEXT        NOT NULL,
    listing_purpose   TEXT        NOT NULL,   -- 'sale' | 'rent' (shared vocabulary with discover_event)
    budget_band       TEXT        NOT NULL,   -- 7 canonical bands incl. UNSPECIFIED
    period_start      TIMESTAMPTZ NOT NULL,   -- DATE_TRUNC('hour', NOW() AT TIME ZONE 'UTC') anchor
    period_end        TIMESTAMPTZ NOT NULL,
    window_days       INTEGER     NOT NULL,   -- rolling window length (e.g. 7 or 30)
    search_count      INTEGER     NOT NULL DEFAULT 0,
    panel_open_count  INTEGER     NOT NULL DEFAULT 0,
    lead_intent_count INTEGER     NOT NULL DEFAULT 0,
    listing_count     INTEGER     NOT NULL DEFAULT 0,   -- LIVE visible matching supply in same bucket
    gap_score         REAL,                              -- NULL when suppressed; [-3,3] when present
    signal_type       TEXT        NOT NULL
                          CHECK (signal_type IN ('supply_gap', 'information_gap', 'price_signal', 'possible_gap')),
    confidence        TEXT        NOT NULL
                          CHECK (confidence IN ('enough_data', 'limited_data', 'insufficient_data')),
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_area_demand_signal
        PRIMARY KEY (city_slug, area_key, property_type, listing_purpose, budget_band, period_start, window_days),

    CONSTRAINT chk_area_demand_signal_gap_range
        CHECK (gap_score IS NULL OR (gap_score >= -3 AND gap_score <= 3))
);

COMMENT ON TABLE public.area_demand_signal IS
    'Hourly demand-vs-supply rollup per buyer-need bucket. Keyed by (city_slug, area_key, '
    'property_type, listing_purpose, budget_band, period_start, window_days). '
    'gap_score NULL means suppressed (k-anon or degenerate peer population) — never 0. '
    'Populated by AreaDemandSignalRollupJob (issue #1532).';

COMMENT ON COLUMN public.area_demand_signal.gap_score IS
    'z(weighted_demand) - z(supply_intensity) clamped to [-3,3]. '
    'NULL when suppressed (demand_total < 10 k-anon, or peer N < 3 statistical guard). '
    'NEVER NaN, NEVER Infinity, NEVER 0 as a surrogate for unknown.';

COMMENT ON COLUMN public.area_demand_signal.confidence IS
    'Demand volume confidence: enough_data (>=30), limited_data (10-29), insufficient_data (<10). '
    'insufficient_data means the bucket is k-anon suppressed (gap_score is NULL).';

COMMENT ON COLUMN public.area_demand_signal.signal_type IS
    'Deterministic signal classification: supply_gap | information_gap | price_signal | possible_gap. '
    'Provisional cutoffs defined in DemandSignalThresholds (issue #1532); '
    'a follow-up issue finalises cutoffs after real data.';

COMMENT ON COLUMN public.area_demand_signal.budget_band IS
    'Canonical buyer-need band (UNDER_5L/5L_20L/20L_50L/50L_1CR/1CR_2CR/ABOVE_2CR/UNSPECIFIED). '
    'Supply-side mapped from price_paise via locked paise CASE matching client toPriceBand.';

-- Secondary index for per-area collapse and city-scoped reads.
-- Plain (non-CONCURRENTLY) — table is empty at apply time; matches V94 design note.
CREATE INDEX IF NOT EXISTS idx_area_demand_signal_city_area
    ON public.area_demand_signal (city_slug, area_key);
