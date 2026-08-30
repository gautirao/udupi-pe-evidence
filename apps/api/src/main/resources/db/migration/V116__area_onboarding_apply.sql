-- V116: area onboarding APPLY foundation (#1887 PR2) — additive/expand-only schema for the
-- transactional apply path that writes reviewed AreaOnboardingService dry-run candidates into
-- canonical `areas`, plus its audit trail and a decoupled region-reclassification outbox.
--
-- EXPAND-ONLY. No existing column is dropped, retyped, or renamed. No existing row's
-- area_key changes. lifecycle_status defaults to 'ACTIVE' so every pre-existing area row stays
-- exactly as it is today.

-- ── area_onboarding_candidate: per-candidate review decision (#1887 D1) ─────────
-- AreaOnboardingApplyService.apply() acts ONLY on rows with review_decision = 'APPROVED' (and a
-- clean outcome) — apply never self-approves. AreaOnboardingReviewService.approve(batchId, ...)
-- is the only writer of 'APPROVED'.

ALTER TABLE public.area_onboarding_candidate
    ADD COLUMN IF NOT EXISTS review_decision TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (review_decision IN ('PENDING', 'APPROVED', 'REJECTED')),
    ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.area_onboarding_candidate.review_decision IS
    'Explicit per-candidate reviewer decision (#1887 D1). apply() only acts on APPROVED + a clean '
    'outcome (READY_TO_CREATE/READY_TO_UPDATE/UNCHANGED). Set by AreaOnboardingReviewService.approve, '
    'never by apply() itself.';

-- ── area_onboarding_batch: advisory apply bookkeeping (#1887 D6, OQ2) ───────────
-- Advisory only — NOT the idempotency safety mechanism (that is apply()'s per-row
-- compare-before-write against current canonical state). Lets an operator see, at a glance,
-- whether/when/by-whom a batch was last applied.

ALTER TABLE public.area_onboarding_batch
    ADD COLUMN IF NOT EXISTS apply_status TEXT,
    ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS applied_by TEXT;

COMMENT ON COLUMN public.area_onboarding_batch.apply_status IS
    'Advisory fast-path marker (#1887 D6/OQ2), e.g. ''APPLIED''. NOT the correctness mechanism for '
    'idempotency — apply() always re-runs compare-before-write against current canonical state '
    'regardless of this column, so a stale/missing value never causes incorrect double-writes.';

-- ── areas: lifecycle scaffolding (#1887 D3) ─────────────────────────────────────
-- Columns only in PR2 — no dry-run outcome yet drives an actual INACTIVATE_AREA/MERGE_AREA write
-- (see ApplyAction). Existing rows are unaffected: lifecycle_status defaults to 'ACTIVE'. areas is
-- referenced by schools/area_group_members/city_region_memberships/area_alias — apply() NEVER
-- hard-deletes a row here; this column set exists so a FUTURE inactivate/merge write has somewhere
-- traceable to land without orphaning those foreign keys.

ALTER TABLE public.areas
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'
        CHECK (lifecycle_status IN ('ACTIVE', 'INACTIVE', 'MERGED')),
    ADD COLUMN IF NOT EXISTS merged_into_area_key TEXT REFERENCES public.areas (area_key);

COMMENT ON COLUMN public.areas.lifecycle_status IS
    'Soft lifecycle state (#1887 D3). PR2 only ever writes ACTIVE (on CREATE_AREA); '
    'INACTIVE/MERGED are scaffolded for a future PR — apply() never hard-deletes an areas row.';
COMMENT ON COLUMN public.areas.merged_into_area_key IS
    'Set when lifecycle_status = MERGED, pointing at the surviving canonical area. NOT written by '
    'any PR2 code path (#1887 D3) — reserved for a future merge-write feature.';

-- ── area_onboarding_apply_audit: canonical-change audit trail (#1887 D2) ────────
-- One row per canonical change (or protected non-change) apply() makes. candidate_id is nullable
-- because a REGION_RECLASS_ENQUEUED row is batch-scoped, not tied to one candidate.

CREATE TABLE IF NOT EXISTS public.area_onboarding_apply_audit (
    id           BIGSERIAL PRIMARY KEY,
    batch_id     INTEGER NOT NULL REFERENCES public.area_onboarding_batch (id),
    candidate_id INTEGER REFERENCES public.area_onboarding_candidate (id),
    area_key     TEXT,
    action       TEXT NOT NULL CHECK (action IN (
                     'CREATE_AREA', 'UPDATE_AREA', 'GEOMETRY_PRESERVED', 'ALIAS_ADDED',
                     'REGION_RECLASS_ENQUEUED', 'INACTIVATE_AREA', 'MERGE_AREA')),
    before_json  JSONB,
    after_json   JSONB,
    reason       TEXT,
    applied_by   TEXT,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_onboarding_apply_audit_batch_id
    ON public.area_onboarding_apply_audit (batch_id);
CREATE INDEX IF NOT EXISTS idx_area_onboarding_apply_audit_area_key
    ON public.area_onboarding_apply_audit (area_key);

COMMENT ON TABLE public.area_onboarding_apply_audit IS
    'Durable provenance trail for AreaOnboardingApplyService.apply() (#1887 D2/PR2). INACTIVATE_AREA '
    'and MERGE_AREA are reserved CHECK values — no PR2 code path writes them (see areas.lifecycle_status).';

-- ── area_region_reclass_outbox: decoupled downstream signal (#1887 D5) ──────────
-- Mirrors listing_search_outbox's SHAPE (V81/V83) for a per-city, per-batch event. ENQUEUE ONLY:
-- no consumer/poller exists yet (that is PR3+ scope) — apply() never synchronously triggers
-- CityRegionOnboardingService/RegionalClassificationBackfillService/OpenSearch indexing.
-- event_id is a deterministic name-based UUID (namespace 'area-region-reclass', name
-- "<batchId>:<cityId>") so re-applying an already-applied batch computes the SAME event_id and
-- the ON CONFLICT (event_id) DO NOTHING insert is a true no-op — see AreaRegionReclassOutbox.

CREATE TABLE IF NOT EXISTS public.area_region_reclass_outbox (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL UNIQUE,
    aggregate_type  VARCHAR(64) NOT NULL DEFAULT 'CITY_REGION',
    city_id         INTEGER NOT NULL REFERENCES public.cities (id),
    batch_id        INTEGER NOT NULL REFERENCES public.area_onboarding_batch (id),
    event_type      VARCHAR(64) NOT NULL,
    event_version   INT NOT NULL DEFAULT 1,
    payload         JSONB NOT NULL,
    status          VARCHAR(32),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    error_message   TEXT,
    failed_at       TIMESTAMPTZ,
    retry_count     INT NOT NULL DEFAULT 0
);

-- Partial index for a future consumer's poll query (mirrors V83's predicate exactly — `now()` is
-- STABLE, not IMMUTABLE, so the next_attempt_at <= now() bound is deliberately left OUT of the
-- index predicate and applied as a residual filter at query time by the consumer, same as
-- idx_listing_search_outbox_pending).
CREATE INDEX IF NOT EXISTS idx_area_region_reclass_outbox_pending
    ON public.area_region_reclass_outbox (id)
    WHERE published_at IS NULL
      AND (status IS NULL OR status NOT IN ('DEAD', 'FAILED'));

CREATE INDEX IF NOT EXISTS idx_area_region_reclass_outbox_city_id
    ON public.area_region_reclass_outbox (city_id);

COMMENT ON TABLE public.area_region_reclass_outbox IS
    'Durable, decoupled signal that city_id needs region reclassification after an area apply '
    '(#1887 D5/PR2). ENQUEUE ONLY — no consumer/poller exists in this PR (see #1882/PR3). '
    'apply() never synchronously calls CityRegionOnboardingService or RegionalClassificationBackfillService.';
COMMENT ON COLUMN public.area_region_reclass_outbox.event_id IS
    'Deterministic name-based UUID over "area-region-reclass:<batch_id>:<city_id>" — '
    're-applying the same batch computes the identical event_id, making the '
    'ON CONFLICT (event_id) DO NOTHING insert idempotent (#1887 AC4).';

-- ── #1887 PR2 REWORK amendments (pre-merge on the same unmerged branch — never applied to any
-- shared/hosted database, only ephemeral Testcontainers instances, so there is no released Flyway
-- checksum to break by editing this file directly; mirrors V115's "AMENDED in place" precedent).
-- These implement REWORK FIX 2 and FIX 7 from the user's independent PR review. FIX 1/3/4/5/6 are
-- validation/materialisation logic changes in AreaOnboardingApplyService/AreaOnboardingReviewService
-- and need no schema change. NO new table is introduced anywhere in this amendment.

-- FIX 2: make the per-candidate apply audit trail idempotent under a repeat, unchanged apply.
-- Without this, GEOMETRY_PRESERVED re-fires on EVERY unchanged re-apply, since the candidate's
-- (lower-trust) geometry still differs from the existing (higher-trust) geometry every time —
-- AreaOnboardingApplyAudit.record now inserts ON CONFLICT (batch_id, candidate_id, action) DO
-- NOTHING against this constraint. candidate_id is nullable (REGION_RECLASS_ENQUEUED is
-- batch-scoped) — Postgres treats distinct NULLs as non-conflicting, which is fine here because
-- REGION_RECLASS_ENQUEUED's own idempotency is already guaranteed by
-- area_region_reclass_outbox's deterministic event_id.
ALTER TABLE public.area_onboarding_apply_audit
    ADD CONSTRAINT uq_area_onboarding_apply_audit_batch_candidate_action
        UNIQUE (batch_id, candidate_id, action);

COMMENT ON CONSTRAINT uq_area_onboarding_apply_audit_batch_candidate_action
    ON public.area_onboarding_apply_audit IS
    '#1887 PR2 rework FIX 2: makes the per-candidate audit trail idempotent under a repeat '
    'unchanged apply (see AreaOnboardingApplyAudit.record''s ON CONFLICT ... DO NOTHING insert).';

-- FIX 7: stale-canonical-target guard for UPDATE-family candidates. AreaOnboardingReviewService
-- .approve() captures a fingerprint of the canonical target's identity-bearing fields (area_key,
-- city_id, name, district, geo_center_lat/lon, min/max_lat/lon, geometry_source,
-- lifecycle_status) AT REVIEW TIME, for candidates matched to an EXISTING area
-- (matched_area_key IS NOT NULL) only. AreaOnboardingApplyService.apply() recomputes the CURRENT
-- fingerprint and aborts the WHOLE apply on any mismatch (including a NULL stored fingerprint for
-- a matched candidate) — never silently overwriting a canonical target that changed after review.
ALTER TABLE public.area_onboarding_candidate
    ADD COLUMN IF NOT EXISTS reviewed_canonical_fingerprint TEXT;

COMMENT ON COLUMN public.area_onboarding_candidate.reviewed_canonical_fingerprint IS
    '#1887 PR2 rework FIX 7: sha256 fingerprint of the canonical target as it existed at '
    'AreaOnboardingReviewService.approve() time, for UPDATE-family candidates only '
    '(matched_area_key IS NOT NULL). NULL for READY_TO_CREATE candidates (no existing target to '
    'fingerprint) and for any row approved before this column existed. apply() recomputes the '
    'CURRENT fingerprint and aborts the whole batch on any mismatch — see '
    'AreaOnboardingApplyService.canonicalFingerprint.';

-- ── #1887 PR2 REWORK #2 amendment (pre-merge on the same unmerged branch — same "never applied to
-- any shared/hosted database" precedent as the amendment above; only ephemeral Testcontainers
-- instances have ever seen this file, so there is no released Flyway checksum to break). Splits
-- FIX 4's single artifact_checksum column into two distinct semantics (see the code-reviewer
-- ADVISORY that prompted this): area_onboarding_batch.artifact_checksum is LEFT UNCHANGED from
-- PR1's dry-run (the provider/curator-supplied source-artifact checksum — pure provenance,
-- never read/recomputed/validated by PR2 apply logic). This new column carries the INTERNAL
-- deterministic digest FIX 4's apply-side logic was computing all along, which needed its own
-- column instead of colliding with artifact_checksum's different meaning.

ALTER TABLE public.area_onboarding_batch
    ADD COLUMN IF NOT EXISTS persisted_batch_checksum TEXT;

-- ── #1887 PR2 REWORK #4 amendments (pre-merge on the same unmerged branch — same "never applied to
-- any shared/hosted database" precedent as the amendments above; only ephemeral Testcontainers
-- instances have ever seen this file). Implements a FINALIZED review state machine (BLOCKING 1),
-- the locking total-order (BLOCKING 1/2), CREATE-family fingerprint parity (BLOCKING 3), and a
-- second, independently-frozen applied_batch_checksum column (THE CRUX). NO new table is
-- introduced. dry-run (V115/AreaOnboardingService) is untouched by this amendment.

-- BLOCKING 1: an explicit terminal review state. A batch starts IN_REVIEW; the moment
-- AreaOnboardingReviewService.approve() drives every candidate to a final decision, it transitions
-- the batch to FINALIZED in ONE guarded atomic UPDATE (... WHERE review_status = 'IN_REVIEW'),
-- storing review_finalized_at and persisted_batch_checksum in the SAME statement. Once FINALIZED,
-- approve() refuses ANY further mutation for that batch (decisions and persisted_batch_checksum
-- become immutable at finalisation, not only after a successful apply) — closing the "checksum
-- laundering via repeated approve()" gap: a batch already fully reviewed used to have its checksum
-- silently RECOMPUTED AND OVERWRITTEN by every subsequent approve() call, even one approving zero
-- new candidates. That refresh path no longer exists.
ALTER TABLE public.area_onboarding_batch
    ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'IN_REVIEW'
        CHECK (review_status IN ('IN_REVIEW', 'FINALIZED')),
    ADD COLUMN IF NOT EXISTS review_finalized_at TIMESTAMPTZ;

ALTER TABLE public.area_onboarding_batch
    ADD CONSTRAINT chk_area_onboarding_batch_review_status_checksum
        CHECK (review_status = 'FINALIZED' OR persisted_batch_checksum IS NULL),
    ADD CONSTRAINT chk_area_onboarding_batch_review_status_finalized_at
        CHECK (review_status = 'FINALIZED' OR review_finalized_at IS NULL);

COMMENT ON COLUMN public.area_onboarding_batch.review_status IS
    '#1887 PR2 rework #4 (BLOCKING 1): explicit review state machine. IN_REVIEW (default) while any '
    'candidate remains PENDING or the batch has never been finalised. AreaOnboardingReviewService'
    '.approve() transitions IN_REVIEW -> FINALIZED in ONE guarded atomic UPDATE the moment zero '
    'PENDING candidates remain, storing review_finalized_at + persisted_batch_checksum together. '
    'Once FINALIZED, approve() REFUSES to mutate anything for this batch ever again (decisions and '
    'persisted_batch_checksum are immutable at finalisation) — a fresh dry-run (new batch) is '
    'required instead. AreaOnboardingApplyService.apply() requires review_status = FINALIZED before '
    'any write (replaces the old, weaker "zero PENDING candidates right now" scan).';
COMMENT ON COLUMN public.area_onboarding_batch.review_finalized_at IS
    '#1887 PR2 rework #4 (BLOCKING 1): set exactly once, in the same UPDATE that transitions '
    'review_status IN_REVIEW -> FINALIZED and stores persisted_batch_checksum. NULL while '
    'review_status = IN_REVIEW (enforced by chk_area_onboarding_batch_review_status_finalized_at).';

-- BLOCKING 1/2 (THE CRUX): applied_batch_checksum is a SECOND, independently-frozen digest —
-- distinct from persisted_batch_checksum — so an idempotent re-apply of an unchanged batch never
-- needs (and never gets) a refreshed persisted_batch_checksum. persisted_batch_checksum is written
-- EXACTLY ONCE by the FINALIZED transition above (over review-time rows, including each
-- CREATE-family candidate's sentinel reviewed_canonical_fingerprint) and is NEVER rewritten by
-- apply(). applied_batch_checksum is written EXACTLY ONCE by the FIRST successful apply, AFTER
-- Phase 2's writes (including any CREATE-family self-heal from sentinel to a real fingerprint,
-- BLOCKING 3) settle — via "UPDATE ... SET applied_batch_checksum = ? WHERE id = ? AND
-- applied_batch_checksum IS NULL". Every SUBSEQUENT re-apply recomputes the same digest over
-- CURRENT rows and compares against applied_batch_checksum instead of persisted_batch_checksum —
-- see AreaOnboardingApplyService#apply's apply_status-gated reference selection. Neither checksum
-- is ever refreshed after its one write.
ALTER TABLE public.area_onboarding_batch
    ADD COLUMN IF NOT EXISTS applied_batch_checksum TEXT;

ALTER TABLE public.area_onboarding_batch
    ADD CONSTRAINT chk_area_onboarding_batch_applied_requires_finalized
        CHECK (apply_status IS DISTINCT FROM 'APPLIED'
            OR (review_status = 'FINALIZED' AND applied_batch_checksum IS NOT NULL));

COMMENT ON COLUMN public.area_onboarding_batch.applied_batch_checksum IS
    '#1887 PR2 rework #4 (THE CRUX): the "applied anchor" digest, DISTINCT from '
    'persisted_batch_checksum (the "finalisation anchor"). Written EXACTLY ONCE by the FIRST '
    'successful AreaOnboardingApplyService.apply() call, computed AFTER Phase 2''s writes (incl. '
    'any CREATE-family self-heal) settle, via an UPDATE guarded by "... AND applied_batch_checksum '
    'IS NULL". Every subsequent re-apply of the SAME batch compares its fresh recomputation against '
    'THIS column instead of persisted_batch_checksum — keeping a genuinely idempotent re-apply from '
    'spuriously mismatching against its own prior self-heal, while persisted_batch_checksum stays '
    'byte-identical to what review-finalisation stored, forever (no laundering path exists for '
    'either column).';

-- #1887 PR2 rework #4 (R2 doc correction): persisted_batch_checksum's own comment, below, was
-- previously stale after rework #3 widened the digest and rework #2 added the artifact_checksum
-- completeness check — both facts are now corrected in place.
COMMENT ON COLUMN public.area_onboarding_batch.persisted_batch_checksum IS
    '#1887 PR2 rework #2 (FIX 4b), widened by rework #3, re-scoped by rework #4 (BLOCKING 1/THE '
    'CRUX): deterministic sha256 digest — via AreaOnboardingApplyService.computePersistedBatchChecksum '
    'and its length-prefixed appendField encoding — covering EVERY batch-level identity field '
    '(dataset_id, dataset_version, provider, input_schema_version, source_extracted_at, '
    'apply_allowed) PLUS, for every candidate row (ordered by id): id, input_area_key, '
    'normalised_area_key, matched_area_key, outcome, review_decision, candidate_payload, '
    'payload_checksum, external_source_id, and reviewed_canonical_fingerprint — i.e. every field '
    'apply() actually gates its decisions on, not merely candidate_payload/payload_checksum. Stored '
    'EXACTLY ONCE, in the SAME UPDATE that transitions review_status IN_REVIEW -> FINALIZED (see '
    'that column''s comment) — never refreshed by any later call, including a repeat approve() call '
    'that approves zero new candidates (rework #4 BLOCKING 1 closes that laundering path). '
    'AreaOnboardingApplyService.apply() recomputes this same digest on a batch''s FIRST apply only '
    'and aborts the WHOLE apply — before any write — on any mismatch (a re-apply instead compares '
    'against applied_batch_checksum; see that column''s comment). Distinct from artifact_checksum '
    '(FIX 4a, unchanged provenance from PR1): apply() DOES read artifact_checksum, but only as a '
    '"must be present" completeness check (see validateDatasetIdentity) — artifact_checksum''s VALUE '
    'is never read, recomputed, or compared as a digest input by this column''s algorithm.';

-- #1887 PR2 rework #4 (R3 scope/documentation clarification, not a code fix): V115's own comment on
-- area_alias framed alias POPULATION as deferred to "PR2". PR2 (this migration + its service code)
-- removed ALL automatic alias-population logic (rework FIX 5) and defers it again — this is
-- honestly reflected here, without editing V115 itself: reviewed, human-curated alias POPULATION
-- remains a FUTURE PR's responsibility (PR3+), distinct from mere alias LOOKUP during listing
-- ingestion, which was already independently in PR3's scope. See the FIX 5 doc block in
-- AreaOnboardingApplyService for the code-level statement of the same fact.
