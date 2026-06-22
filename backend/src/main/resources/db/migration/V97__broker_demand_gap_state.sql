-- V97: broker_demand_gap_state — broker-specific dismiss/read state for demand-gap buckets.
--
-- DESIGN NOTES
-- ============
-- 1. NARROW, EXPAND-ONLY table. Persists ONLY two lifecycle timestamps (read_at, dismissed_at)
--    for a specific demand-gap bucket keyed to a broker. No demand signal data is duplicated
--    here — the gap payload is always DERIVED READ-ONLY from area_demand_signal at query time.
--    This is PATH_C_MINIMAL; a broader broker_alert table + generator is deferred to #1589.
--
-- 2. UNIQUE(broker_id, area_key, property_type, listing_purpose, budget_band, week) is the
--    idempotency anchor for ON CONFLICT upserts. The week column (ISO week Monday UTC DATE) is
--    the temporal identifier of the demand-gap bucket — not the wall-clock time of the
--    dismiss/read action (which is read_at / dismissed_at). Multiple upserts for the same
--    bucket in the same week produce no duplicate rows.
--
-- 3. week = ISO week Monday (TRUNC to Monday of the ISO week, UTC). Deterministic formula:
--      week_start = DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')::date
--    This ensures the UNIQUE constraint is consistent across Java and SQL.
--    The Java service computes the same value via:
--      LocalDate.now(ZoneOffset.UTC).with(DayOfWeek.MONDAY)
--
-- 4. read_at / dismissed_at are nullable — null = not-yet-read / not-yet-dismissed.
--    Both may be set independently (reading does not imply dismissal and vice versa).
--    The service writes them via separate ON CONFLICT DO UPDATE paths.
--
-- 5. broker_id is always the JWT-resolved userId. The application layer enforces
--    broker_id = :userId on every read and write. No client-supplied broker_id is accepted.
--
-- 6. No foreign key to area_demand_signal PK — the V96 PK includes period_start + window_days,
--    which are rollup-run identifiers, not per-broker state. A bucket may be dismissed for the
--    current week even if the signal row has not yet been refreshed, and the state row must
--    survive signal re-runs. No FK is correct.
--
-- 7. No FK to broker_market_focus or property_listings — the gap bucket may reference any
--    area the signal covers, regardless of whether the broker has declared focus or listed there.
--
-- 8. REVERSIBILITY:
--    To roll back V97 manually: DROP TABLE IF EXISTS public.broker_demand_gap_state;
--    No other table has a FK into this table. Roll back the application layer first.
--
-- 9. Indexes:
--    - PRIMARY KEY (surrogate uuid) for stable row identity used in /alerts/{id}/read|dismiss
--      endpoints (IDOR-safe ownership load-then-check pattern).
--    - UNIQUE constraint (broker_id, area_key, property_type, listing_purpose, budget_band, week)
--      is the natural business key and idempotency anchor.
--    - Index on broker_id accelerates GET /api/broker/alerts (all rows for the calling broker).
--
-- 10. created_at tracks first upsert time. Not updated on subsequent read/dismiss upserts.

CREATE TABLE IF NOT EXISTS public.broker_demand_gap_state (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    broker_id        UUID        NOT NULL,
    area_key         TEXT        NOT NULL,
    property_type    TEXT        NOT NULL,
    listing_purpose  TEXT        NOT NULL,   -- 'sale' | 'rent'
    budget_band      TEXT        NOT NULL,   -- canonical band incl. UNSPECIFIED
    week             DATE        NOT NULL,   -- ISO week Monday UTC (TRUNC to Monday)
    read_at          TIMESTAMPTZ,            -- NULL until broker marks this gap as read
    dismissed_at     TIMESTAMPTZ,            -- NULL until broker dismisses this gap
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_broker_demand_gap_state
        PRIMARY KEY (id),

    CONSTRAINT uq_broker_demand_gap_state_bucket
        UNIQUE (broker_id, area_key, property_type, listing_purpose, budget_band, week)
);

COMMENT ON TABLE public.broker_demand_gap_state IS
    'Broker-specific dismiss/read state for demand-gap buckets (PATH_C_MINIMAL, issue #1534). '
    'Persists ONLY read_at and dismissed_at per (broker_id, bucket-tuple, week). '
    'Gap payload is always DERIVED READ-ONLY from area_demand_signal at query time. '
    'A broader broker_alert table + generator is deferred to #1589.';

COMMENT ON COLUMN public.broker_demand_gap_state.week IS
    'ISO week Monday UTC: DATE_TRUNC(''week'', NOW() AT TIME ZONE ''UTC'')::date. '
    'Identifies the demand-gap weekly bucket. Deterministic across Java and SQL.';

COMMENT ON COLUMN public.broker_demand_gap_state.read_at IS
    'Timestamp when the broker first marked this gap as read. NULL = not yet read.';

COMMENT ON COLUMN public.broker_demand_gap_state.dismissed_at IS
    'Timestamp when the broker dismissed this gap. NULL = not yet dismissed. '
    'Dismissed gaps are suppressed from the demand-gaps page payload.';

-- Accelerates GET /api/broker/alerts (all rows for the calling broker, no other predicate).
CREATE INDEX IF NOT EXISTS idx_broker_demand_gap_state_broker_id
    ON public.broker_demand_gap_state (broker_id);
