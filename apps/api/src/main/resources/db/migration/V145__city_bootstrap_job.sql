-- V145: city_bootstrap_job (#2676 Slice A).
--
-- Durable job/progress identity for the admin "type a city name, Start launch" workflow.
-- This is DELIBERATELY a separate table from city_launch_revision (V118): a
-- city_launch_revision row is FK'd to cities.id and therefore cannot exist before a city
-- does. This table owns the pre-city-creation phase (resolving a name, optionally requiring
-- disambiguation) and hands off to the EXISTING city_launch_revision/prepare() pipeline once
-- resolved_city_id is set — it does not duplicate or replace that pipeline.
--
-- Idempotency (#2676 AC "Existing city names do not create duplicate canonical cities" /
-- "No hidden ... prerequisite"): the partial unique index below ensures at most one
-- in-flight (RESOLVING or DISAMBIGUATION_REQUIRED) job can exist per normalized_name at a
-- time, mirroring city_launch_revision's uq_clr_inflight discipline (V118/#1911).

CREATE TABLE IF NOT EXISTS public.city_bootstrap_job (
    id                BIGSERIAL PRIMARY KEY,
    requested_name    TEXT NOT NULL,
    normalized_name   TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'RESOLVING'
                          CHECK (status IN ('RESOLVING', 'DISAMBIGUATION_REQUIRED', 'CITY_CREATED', 'FAILED')),
    resolved_city_id  INTEGER REFERENCES public.cities (id),
    candidates        TEXT,
    failure_code      TEXT,
    failure_reason    TEXT,
    requested_by      UUID NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one non-terminal (in-flight) job per normalized city name — prevents two
-- concurrent "Start launch" submissions for the same name from racing each other into two
-- separate candidate-resolution/city-creation attempts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_city_bootstrap_job_inflight
    ON public.city_bootstrap_job (normalized_name)
    WHERE status IN ('RESOLVING', 'DISAMBIGUATION_REQUIRED');

CREATE INDEX IF NOT EXISTS idx_city_bootstrap_job_resolved_city_id
    ON public.city_bootstrap_job (resolved_city_id);

COMMENT ON TABLE public.city_bootstrap_job IS
    'Admin "type a city name -> Start launch" bootstrap job (#2676 Slice A). Owns RESOLVING -> '
    '(DISAMBIGUATION_REQUIRED ->)? CITY_CREATED|FAILED. Once CITY_CREATED, resolved_city_id feeds '
    'the existing city_launch_revision/prepare() pipeline (#1911/#2163) unchanged.';
COMMENT ON COLUMN public.city_bootstrap_job.candidates IS
    'JSON array of disambiguation candidates (name, lat/lon, bbox, source), populated only when '
    'status = DISAMBIGUATION_REQUIRED. Never read for anything except rendering the operator '
    'choice and, on confirm, re-deriving the chosen candidate''s geometry.';
