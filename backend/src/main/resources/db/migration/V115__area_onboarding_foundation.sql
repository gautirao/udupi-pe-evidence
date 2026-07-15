-- V115: area onboarding foundation (#1887 PR1) — additive-only staging tables for the
-- READ-ONLY area-candidate dry-run validator (AreaOnboardingService).
--
-- This migration creates STAGING tables only. It does NOT alter areas, and it does NOT
-- populate area_alias (population is a PR2 concern — see #1887 design decision D5). No
-- existing table is altered. Mirrors the #1882 V113 "expand-only" convention.
--
-- AMENDED in place (#1887 PR1 rework, pre-merge on the same unmerged branch — never applied to
-- any shared/hosted database, only ephemeral Testcontainers instances, so there is no released
-- Flyway checksum to break by editing this file directly):
--   * area_alias gains city_id + a UNIQUE (city_id, alias_normalised) constraint (was globally
--     UNIQUE (alias_normalised)) so the same display name can legitimately alias different areas
--     in different cities (e.g. "Gandhi Nagar" in Bangalore vs Udupi) without a false conflict.
--   * area_onboarding_candidate gains an immutable candidate_payload JSONB snapshot of the exact
--     candidate input + a payload_checksum, alongside the existing classification-summary columns.
--   * area_onboarding_batch gains dataset/provider identity columns so a batch is reproducible
--     without PR2 rereading a possibly-changed external file.
--
-- DESIGN NOTE (documentation only — no new mechanism introduced here): AreaOnboardingRunner's
-- classpath-JSON input is a TEMPORARY PR1 bootstrapping adapter, NOT the intended production
-- transport. Production #1887 input will be the approved, versioned artifact produced by #1900.
-- Licensed or sensitive provider extracts must NEVER be committed to this application repository.
-- PR2's apply step reads the PERSISTED validated batch/candidate rows below (candidate_payload +
-- batch identity columns), never a reread of the classpath file.

-- ── area_onboarding_batch ─────────────────────────────────────────────────────
-- One row per AreaOnboardingService.dryRun() invocation. Purely a staging/audit record — never
-- read by any canonical-geography code path.

CREATE TABLE IF NOT EXISTS public.area_onboarding_batch (
    id                    SERIAL PRIMARY KEY,
    city_id               INTEGER NOT NULL REFERENCES public.cities (id),
    source_label          TEXT,
    apply_allowed         BOOLEAN NOT NULL,
    blocking_reasons      TEXT,
    dataset_id            TEXT,
    dataset_version       TEXT,
    artifact_checksum     TEXT,
    provider              TEXT,
    input_schema_version  TEXT,
    source_extracted_at   TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.area_onboarding_batch IS
    'Staging record of one AreaOnboardingService.dryRun() batch (#1887 PR1). Never written to by '
    'anything other than dryRun(); carries zero canonical-geography semantics on its own.';
COMMENT ON COLUMN public.area_onboarding_batch.dataset_id IS
    'Immutable approved-dataset/package identity for this batch (#1887 rework REQUIRED item) — '
    'lets PR2 reproduce the batch without rereading a possibly-changed classpath file.';
COMMENT ON COLUMN public.area_onboarding_batch.provider IS
    'Single provider identity for every candidate in this batch (#1887 rework provider-namespacing '
    'fix, OPTION A: a batch is constrained to exactly one provider). external_source_id '
    'deduplication is performed within the current batch''s candidate list only (see '
    'AreaOnboardingService.findDuplicateExternalSourceIds), which is therefore already '
    'provider-scoped by construction — the same external id under a DIFFERENT provider always '
    'lives in a different batch and is never treated as a duplicate. NULL only for the legacy '
    'dryRun(cityId, sourceLabel, candidates) 3-arg overload''s BatchIdentity.EMPTY default.';

-- ── area_onboarding_candidate ─────────────────────────────────────────────────
-- One row per candidate area evaluated in a batch. matched_area_key is a PLAIN TEXT soft
-- reference, deliberately NOT a foreign key to areas — a READY_TO_CREATE candidate has no
-- existing area to reference yet, and a FK would reject exactly the staging rows this table
-- exists to hold (#1887 design decision D2).

CREATE TABLE IF NOT EXISTS public.area_onboarding_candidate (
    id                  SERIAL PRIMARY KEY,
    batch_id            INTEGER NOT NULL REFERENCES public.area_onboarding_batch (id),
    input_area_key      TEXT NOT NULL,
    normalised_area_key  TEXT NOT NULL,
    matched_area_key    TEXT,
    outcome             TEXT NOT NULL,
    conflict_types      TEXT,
    geometry_trust      TEXT NOT NULL,
    external_source_id  TEXT,
    candidate_payload   JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_checksum    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_onboarding_candidate_batch_id
    ON public.area_onboarding_candidate (batch_id);

COMMENT ON COLUMN public.area_onboarding_candidate.matched_area_key IS
    'Soft reference to areas.area_key — intentionally NOT a foreign key (#1887 D2): a '
    'READY_TO_CREATE candidate has no existing area row to point at yet.';
COMMENT ON COLUMN public.area_onboarding_candidate.conflict_types IS
    'Comma-joined ConflictType names for this candidate; empty/NULL when no conflict was raised.';
COMMENT ON COLUMN public.area_onboarding_candidate.candidate_payload IS
    'Immutable JSONB snapshot of the exact AreaOnboardingService.CandidateInput passed into '
    'dryRun() (#1887 rework BLOCKING 2, Option B) — lets PR2 reconstruct the exact candidate '
    'values without rereading any external file. Deterministic field-order serialization; see '
    'AreaOnboardingService.serializeCandidatePayload.';
COMMENT ON COLUMN public.area_onboarding_candidate.payload_checksum IS
    'sha256 hex digest of candidate_payload''s serialized JSON text, for integrity verification.';

-- ── area_alias ────────────────────────────────────────────────────────────────
-- Created EMPTY in PR1 — read-only path for ALIAS_CONFLICT detection during dry-run. Population
-- (writing real alias rows) is explicitly deferred to PR2 (#1887 design decision D5).
--
-- city_id + UNIQUE (city_id, alias_normalised) (#1887 rework BLOCKING 1): alias uniqueness is
-- scoped to a city, not global — the same normalised alias legitimately maps to different areas
-- in different cities (e.g. "Gandhi Nagar" in Bangalore vs Udupi vs Mysuru), matching the
-- non-blocking SAME_NAME_DIFFERENT_CITY classification already enforced in Java.

CREATE TABLE IF NOT EXISTS public.area_alias (
    id                SERIAL PRIMARY KEY,
    city_id           INTEGER NOT NULL REFERENCES public.cities (id),
    area_key          TEXT NOT NULL REFERENCES public.areas (area_key),
    alias             TEXT NOT NULL,
    alias_normalised  TEXT NOT NULL,
    source            TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, alias_normalised)
);

COMMENT ON TABLE public.area_alias IS
    'Alternate display names for an area (#1887). Created EMPTY in PR1 — read-only path for '
    'ALIAS_CONFLICT detection during AreaOnboardingService.dryRun(); population deferred to PR2 (D5). '
    'Uniqueness is scoped to city_id (#1887 rework BLOCKING 1), not global.';
COMMENT ON COLUMN public.area_alias.city_id IS
    'City this alias applies to — MUST match the city of the area referenced by area_key. Scopes '
    'the UNIQUE (city_id, alias_normalised) constraint so the same alias can exist in two '
    'different cities without conflict.';
