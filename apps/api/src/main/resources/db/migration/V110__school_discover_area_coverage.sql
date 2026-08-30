-- V110__school_discover_area_coverage.sql
-- Issue #1828 (PR1 of 2): split canonical school locality from curated Discover-area coverage.
--
-- schools.area_key is ONE column answering TWO questions today: (a) where is the school
-- actually located (canonical locality), and (b) which curated Discover areas should
-- surface/count it. That conflation is why a truthful locality fix (e.g. #1737's
-- Jayanagar -> JP Nagar correction) mechanically zeroes the curated count badge.
--
-- This migration:
--   1. Creates school_discover_area_coverage, a junction table carrying curated coverage,
--      independent of schools.area_key.
--   2. Backfills exactly one 'primary' coverage row per school with a non-NULL area_key —
--      ALL cities, keyed on schools.id (never udise_code — see V66:12-16, only PARTIALLY
--      unique). This makes PR1 a pure MIRROR: it changes the counting MECHANISM, not the
--      numbers.
--   3. Adds a DO $$ identity guard that RAISEs and blocks deploy if the mirror is not exact
--      for every single row of `areas` (old string-equality count vs new coverage count).
--   4. Adds AFTER INSERT / AFTER UPDATE triggers on schools so future writes keep coverage
--      convergent, without ever downgrading a human 'reviewed_override' (PR2, #1829) back to
--      a machine-derived 'primary'. The UPDATE trigger fires on the VALUE of area_key
--      actually changing (OLD.area_key IS DISTINCT FROM NEW.area_key), not on which columns
--      the caller's own UPDATE named — see the note at section 4 for why this matters.
--
-- schools.area_key is NEITHER renamed NOR rewritten by this migration. V80 (the BEFORE
-- INSERT OR UPDATE OF latitude/longitude/district trigger that computes area_key) is NOT
-- modified — this migration only adds independent AFTER triggers that observe area_key's
-- FINAL value for the statement (AFTER triggers, and AFTER-trigger WHEN clauses, always
-- evaluate after every BEFORE trigger — including V80 — has already run).
--
-- PR1 emits ONLY 'primary' rows. Generating 'contained' or 'nearby' rows is explicitly
-- out of scope (would change counts) and is left to a future issue.

-- ── 1. Table ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_discover_area_coverage (
    school_id         UUID NOT NULL
                       REFERENCES public.schools(id) ON DELETE CASCADE,
    curated_area_key   TEXT NOT NULL
                       REFERENCES public.areas(area_key) ON DELETE RESTRICT,
    relationship_type  TEXT NOT NULL
                       CHECK (relationship_type IN ('primary', 'contained', 'nearby', 'reviewed_override')),
    distance_meters    DOUBLE PRECISION NULL
                       CHECK (distance_meters IS NULL OR distance_meters >= 0)
                       CHECK (relationship_type <> 'nearby' OR distance_meters IS NOT NULL),
    source             TEXT NOT NULL
                       CHECK (source IN ('area_key_mirror', 'trigger', 'proximity_backfill', 'manual_review')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (school_id, curated_area_key)
);

-- ON DELETE RESTRICT on curated_area_key (not CASCADE): a pure mirror means any area with
-- coverage rows necessarily has a school pointing at it via schools.area_key, so V108's
-- existing area-delete guard (NOT EXISTS ... FROM schools WHERE area_key = a.area_key)
-- already blocks the delete before RESTRICT would ever fire. CASCADE would instead let a
-- future area deletion silently drop coverage rows and quietly move badge counts — directly
-- against this migration's entire thesis. school_id keeps CASCADE: coverage is a dependent
-- fact about a school, and deleting a school is already an explicit, reviewed act.

-- Partial unique: at most one 'primary' coverage row per school.
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_coverage_one_primary
    ON public.school_discover_area_coverage (school_id)
    WHERE relationship_type = 'primary';

-- Partial covering index for the counted relationship types. The predicate below is
-- written CHARACTER-IDENTICALLY to AreaSummaryService's SCHOOL_COUNT_SUBQUERY WHERE
-- clause (see AreaSummaryService.SCHOOL_COUNT_SUBQUERY — no space after the commas) —
-- a divergent predicate here would make the planner miss the index (seq scan), not
-- silently return wrong results, but it must still be kept in lockstep.
CREATE INDEX IF NOT EXISTS idx_school_coverage_counted
    ON public.school_discover_area_coverage (curated_area_key, school_id)
    WHERE relationship_type IN ('contained','primary','reviewed_override');

-- ── 2. Backfill: exactly one 'primary' row per school with a non-NULL area_key ────────────
-- ALL cities (Bengaluru, Mangalore, Udupi, Kundapur, the synthetic E2E school) — no city
-- filter. Keyed on schools.id (the real PK), never udise_code (V66:14-16 partial-unique
-- only; the synthetic E2E school in discover-smoke-seed.sql has none). Idempotent via
-- ON CONFLICT DO NOTHING — a re-run of this migration file (or a manual re-application in
-- a hand-rolled environment) cannot duplicate or disturb existing rows.

INSERT INTO public.school_discover_area_coverage
    (school_id, curated_area_key, relationship_type, source)
SELECT s.id, s.area_key, 'primary', 'area_key_mirror'
FROM public.schools s
WHERE s.area_key IS NOT NULL
ON CONFLICT (school_id, curated_area_key) DO NOTHING;

-- ── 3. Identity guard (D6 / AC4) — proves the mirror, does not merely assert it ───────────
-- For EVERY row of `areas`, the OLD school count (string equality against schools.area_key)
-- must equal the NEW school count (through coverage, positive relationship_type IN-list).
-- Because PR1 has only ever inserted 'primary' rows, and 'primary' is in the counted set,
-- this must hold exactly for a correct backfill. RAISEs and blocks the deploy on any
-- mismatch, in every environment (local, CI, dev, prod) — a deploy-time proof, not a test
-- that can be skipped.

DO $$
DECLARE
    mismatch_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO mismatch_count
    FROM public.areas a
    WHERE (
        SELECT COUNT(*) FROM public.schools s WHERE s.area_key = a.area_key
    ) <> (
        SELECT COUNT(*)
        FROM public.school_discover_area_coverage c
        WHERE c.curated_area_key = a.area_key
          AND c.relationship_type IN ('contained', 'primary', 'reviewed_override')
    );

    IF mismatch_count > 0 THEN
        RAISE EXCEPTION
            'V110 identity guard violated: % area(s) have a school_count mismatch between the legacy area_key equality and the new coverage mirror. PR1 must be numerically neutral.',
            mismatch_count;
    END IF;
END $$;

-- NOTE: this identity guard is only valid against a pure-mirror state. Once PR2 (#1829)
-- has generated 'contained'/'nearby' rows, a manual re-application of this exact file in a
-- hand-rolled environment will (correctly) RAISE here, because the two counts are then
-- expected to diverge — that is not a regression, it means the guard is doing its job.

-- ── 4. Coverage trigger — keeps future schools.area_key writes convergent ─────────────────
-- TWO triggers, not one combined "AFTER INSERT OR UPDATE OF area_key" trigger.
--
-- Postgres decides whether an "UPDATE OF <col>" trigger fires from the SET target list of
-- the UPDATE COMMAND ITSELF — never from what some OTHER (e.g. V80's BEFORE) trigger
-- subsequently assigns to NEW at runtime. V80 is `BEFORE UPDATE OF latitude, longitude,
-- district` and recomputes NEW.area_key from those columns. So `UPDATE schools SET
-- latitude = ?, longitude = ?` — the DOMINANT way area_key changes in this system (a
-- geocoding fix, a seed re-run) — genuinely moves schools.area_key, but an "OF area_key"
-- -scoped AFTER trigger would NEVER fire for it, leaving coverage silently stale. A single
-- combined trigger can't fix this either way: Postgres rejects a reference to OLD in a WHEN
-- clause on an INSERT trigger, so an INSERT-OR-UPDATE trigger cannot carry an
-- "OLD.area_key IS DISTINCT FROM NEW.area_key" WHEN clause.
--
-- So INSERT and UPDATE are split:
--   * AFTER INSERT fires unconditionally (there is no OLD to compare against).
--   * AFTER UPDATE fires only WHEN OLD.area_key IS DISTINCT FROM NEW.area_key. AFTER-trigger
--     WHEN clauses are evaluated once every BEFORE trigger for the statement (including V80)
--     has already run, so this observes area_key's FINAL value regardless of whether the
--     caller's own UPDATE named area_key, or lat/lon/district, or both.

CREATE OR REPLACE FUNCTION public.sync_school_discover_area_coverage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Remove any stale 'primary' row pointing at a DIFFERENT area than the new value.
    -- Without this, an A->B area_key move would attempt to insert a SECOND 'primary' row
    -- for this school (the old (school,A,'primary') row is still there) and violate
    -- uq_school_coverage_one_primary, hard-failing the UPDATE on schools. This delete only
    -- ever removes a row this trigger itself owns (relationship_type = 'primary'); a
    -- 'reviewed_override' (or 'contained'/'nearby') row for a DIFFERENT area is untouched.
    DELETE FROM public.school_discover_area_coverage
    WHERE school_id = NEW.id
      AND relationship_type = 'primary'
      AND curated_area_key IS DISTINCT FROM NEW.area_key;

    IF NEW.area_key IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.school_discover_area_coverage
        (school_id, curated_area_key, relationship_type, source, updated_at)
    VALUES (NEW.id, NEW.area_key, 'primary', 'trigger', now())
    ON CONFLICT (school_id, curated_area_key) DO UPDATE SET
        relationship_type = 'primary',
        source = 'trigger',
        distance_meters = NULL,
        updated_at = now()
    WHERE school_discover_area_coverage.relationship_type <> 'reviewed_override';
    -- ^ LOAD-BEARING conditional. The invariant is "never downgrade a HUMAN ruling", not
    -- "only overwrite rows this trigger already owns": if the existing row for this
    -- (school, area) is a machine-derived 'contained' or 'nearby' row (PR2, #1829) on the
    -- school's OWN canonical area, it is upgraded to 'primary' so the school is never
    -- silently dropped from its own canonical area's count. Only 'reviewed_override' (a
    -- human ruling) blocks the WHERE and is left completely untouched, and NO error is
    -- raised — per Postgres's documented ON CONFLICT DO UPDATE ... WHERE semantics. Without
    -- this guard, any later lat/lon touch (a seed re-run, a geocoding fix) would silently
    -- destroy a human ruling. distance_meters is reset to NULL on upgrade to 'primary' (it
    -- only has meaning for 'nearby'); the CHECK constraint only applies when
    -- relationship_type = 'nearby', so this is always safe.

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_school_discover_area_coverage ON public.schools;
DROP TRIGGER IF EXISTS trg_sync_school_discover_area_coverage_insert ON public.schools;
DROP TRIGGER IF EXISTS trg_sync_school_discover_area_coverage_update ON public.schools;

CREATE TRIGGER trg_sync_school_discover_area_coverage_insert
    AFTER INSERT
    ON public.schools
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_school_discover_area_coverage();

CREATE TRIGGER trg_sync_school_discover_area_coverage_update
    AFTER UPDATE
    ON public.schools
    FOR EACH ROW
    WHEN (OLD.area_key IS DISTINCT FROM NEW.area_key)
    EXECUTE FUNCTION public.sync_school_discover_area_coverage();
