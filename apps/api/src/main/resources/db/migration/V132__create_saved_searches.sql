-- #2019 Slice A: saved-search core persistence.
--
-- Stores a user's saved/alertable search: exactly one of the three mutually exclusive
-- geographic result scopes (AREA_SET / POLYGON / VIEWPORT — mirrors #2016's
-- ResultScopeExclusivity), the normalized supported-filter snapshot, and a stable
-- fingerprint used for idempotent create / duplicate detection.
--
-- Alert frequency/status/timestamp/watermark columns are included now so Slice B's
-- matcher can be added without a further migration, but this slice performs no
-- matching, no delivery and no email. alert_status stays IDLE until Slice B lands.
--
-- Expand-only; never modify an existing migration.

CREATE TABLE IF NOT EXISTS public.saved_searches (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL,
    city_slug           VARCHAR(64) NOT NULL,

    -- Exactly one of AREA_SET / POLYGON / VIEWPORT is populated, matching
    -- result_scope_kind. Enforced in the service layer (ResultScopeExclusivity-style
    -- check), not by a DB CHECK constraint, to keep validation logic and its
    -- machine-readable rejection reasons in one place (the service).
    result_scope_kind   VARCHAR(16) NOT NULL,
    area_keys           JSONB,
    polygon             JSONB,
    viewport_south      DOUBLE PRECISION,
    viewport_west       DOUBLE PRECISION,
    viewport_north      DOUBLE PRECISION,
    viewport_east       DOUBLE PRECISION,

    -- Normalized, allow-listed filter snapshot (mirrors DiscoverFilterNormalizer's
    -- vocabulary). Never contains a free-text query field.
    filters             JSONB NOT NULL,

    -- Stable across key order / equivalent-input normalization. Unique per user so a
    -- repeat create of an equivalent search is idempotent rather than duplicated.
    fingerprint         VARCHAR(64) NOT NULL,

    label               VARCHAR(120),

    status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',

    -- ----- Slice B (matcher) columns — written now, not consumed until Slice B -----
    alert_frequency     VARCHAR(16) NOT NULL DEFAULT 'DAILY',
    alert_status        VARCHAR(16) NOT NULL DEFAULT 'IDLE',
    last_alerted_at     TIMESTAMPTZ,
    alert_watermark     TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_saved_searches_result_scope_kind
        CHECK (result_scope_kind IN ('AREA_SET', 'POLYGON', 'VIEWPORT')),
    CONSTRAINT chk_saved_searches_status
        CHECK (status IN ('ACTIVE', 'PAUSED')),
    CONSTRAINT chk_saved_searches_alert_frequency
        CHECK (alert_frequency IN ('INSTANT', 'DAILY', 'WEEKLY', 'OFF')),
    CONSTRAINT chk_saved_searches_alert_status
        CHECK (alert_status IN ('IDLE', 'PENDING', 'SENT', 'ERROR'))
);

-- Idempotent create / duplicate detection: one row per (user, fingerprint).
CREATE UNIQUE INDEX IF NOT EXISTS uq_saved_searches_user_fingerprint
    ON public.saved_searches (user_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id
    ON public.saved_searches (user_id);

-- Slice B matcher will scan active, non-paused, non-OFF-frequency rows.
CREATE INDEX IF NOT EXISTS idx_saved_searches_active_alertable
    ON public.saved_searches (status, alert_frequency)
    WHERE status = 'ACTIVE' AND alert_frequency <> 'OFF';
