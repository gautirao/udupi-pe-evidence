-- V109__correct_bengaluru_school_area_keys.sql
-- Issue #1737: correct 5 provably-false Bengaluru school area_key attributions.
--
-- ROOT CAUSE (see .claude/handoffs/issue-1737/bug-repro-report.toml for the full audit):
-- schools.area_key is computed by the V80 BEFORE INSERT OR UPDATE OF (latitude, longitude,
-- district) trigger, which assigns the nearest area centroid within the same normalised
-- district, capped at 10 km (V79/V80). The Bengaluru schools in
-- scripts/db/fixtures/bangalore-mangalore-schools-seed.sql were attributed when the area
-- catalogue held only the 10 coarse V71 areas, so e.g. "JP Nagar" was not yet an available
-- answer and the nearest available centroid was "Jayanagar". V106 later added 304 finer
-- Bengaluru localities (including "IN|KA|Bengaluru|JP Nagar") but nothing re-attributes
-- EXISTING rows: V79's backfill only touches area_key IS NULL, and the V80 trigger's OF
-- clause fires only on INSERT or on UPDATE of (latitude, longitude, district) — never on
-- a bare area_key write, and never merely because the area catalogue grew.
--
-- WHY A BARE area_key UPDATE (this migration): because the V80 trigger does not fire on
-- writes to area_key alone, this correction lands as a durable operator override — it will
-- not be silently recomputed away by a later INSERT/UPDATE of an unrelated column, and V79's
-- backfill (WHERE area_key IS NULL) will not touch it either.
--
-- SCOPE: this is a TARGETED 5-row correction, keyed on the stable udise_code (NOT id, which
-- is gen_random_uuid() in the fixture and unstable across environments). Wholesale
-- re-derivation of schools.area_key against the full 313-area catalogue is FORBIDDEN — it was
-- measured to collapse curated Bengaluru school counts from 32 to 6 (six curated areas would
-- drop to ZERO schools; see bug-repro-report.toml). The 13 additional suspect schools that do
-- not meet the plan's decision rule are deliberately LEFT UNCHANGED for a human ruling
-- (see .claude/handoffs/issue-1737/approved-plan.toml [needs_manual_decision]) — guessing an
-- area for them is explicitly forbidden.

-- STEP 0 + STEP 1 + STEP 2: precondition guard, then correction, in a single DO block so both
-- steps share ONE declaration of v_corrections — the single source of truth for the 5
-- (udise_code, expected-before, after) literals. Previously the 4 distinct destination area_keys
-- were declared a second time as a separate VALUES list for the guard; that duplication let the
-- guard silently validate a DIFFERENT string than STEP 1 writes if the two ever drifted, which
-- is exactly the failure mode this migration exists to close. Merging into one block removes
-- that possibility: the guard below reads v_corrections[i][3] directly.
DO $$
DECLARE
    v_missing TEXT;
    v_before TEXT;
    v_updated INT;
    -- Each row: udise_code, expected pre-fix (coarse) area, corrected (fine) area.
    v_corrections CONSTANT TEXT[][] := ARRAY[
        ARRAY['APIFY-BAN-JAYA-01', 'IN|KA|Bengaluru|Jayanagar',    'IN|KA|Bengaluru|JP Nagar'],
        ARRAY['APIFY-BAN-JAYA-05', 'IN|KA|Bengaluru|Jayanagar',    'IN|KA|Bengaluru|JP Nagar'],
        ARRAY['APIFY-BAN-HEBB-01', 'IN|KA|Bengaluru|Hebbal',       'IN|KA|Bengaluru|Mallasandra'],
        ARRAY['APIFY-BAN-MARA-04', 'IN|KA|Bengaluru|Marathahalli', 'IN|KA|Bengaluru|Kaggadasapura'],
        ARRAY['APIFY-BAN-MARA-06', 'IN|KA|Bengaluru|Marathahalli', 'IN|KA|Bengaluru|Panathur']
    ];
    v_row TEXT[];
    v_udise_code TEXT;
    v_expected_before TEXT;
    v_after TEXT;
BEGIN
    -- STEP 0: precondition guard. schools.area_key is a FK REFERENCES areas(area_key) (V79:9)
    -- with no ON DELETE rule, so an UPDATE to a missing destination would fail anyway — this
    -- turns that failure into a clear, actionable RAISE before any row is touched. Destination
    -- list is DERIVED from v_corrections (distinct 3rd column) rather than restated.
    SELECT string_agg(DISTINCT dest.area_key, ', ')
    INTO v_missing
    FROM (
        SELECT v_corrections[i][3] AS area_key
        FROM generate_subscripts(v_corrections, 1) AS i
    ) AS dest
    WHERE NOT EXISTS (
        SELECT 1 FROM public.areas a WHERE a.area_key = dest.area_key
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'V109 precondition failed: destination area(s) missing from public.areas: %. Expected V106 to have seeded these.', v_missing;
    END IF;

    -- STEP 1 + STEP 2: the correction (idempotent, WHERE-scoped, keyed on udise_code) with a
    -- per-row audit RAISE NOTICE.
    --
    -- The `IS DISTINCT FROM` predicate is MANDATORY and load-bearing: it is what makes this
    -- migration CONVERGENT rather than merely corrective. A hosted DB seeded before V106 holds
    -- the COARSE value (e.g. Frank Public School -> Jayanagar) — this is the buggy state the
    -- user reported. A FRESHLY seeded local DB with the full Flyway chain applied already holds
    -- the FINE value (Frank -> JP Nagar), because the V80 trigger fires at INSERT against the
    -- complete 313-area catalogue. `WHERE udise_code = '<code>' AND area_key IS DISTINCT FROM
    -- '<after>'` reaches the correct end state from EITHER starting point and is a true no-op
    -- on re-run. Writing `WHERE area_key = '<before>'` as the sole predicate would silently skip
    -- on a fresh DB and mask a real difference — it must not be used.
    --
    -- Zero matching rows (schools never seeded in this environment) is a safe no-op — none of
    -- the WHERE clauses below raise or fail when udise_code is absent.
    FOREACH v_row SLICE 1 IN ARRAY v_corrections
    LOOP
        v_udise_code := v_row[1];
        v_expected_before := v_row[2];
        v_after := v_row[3];

        SELECT area_key INTO v_before FROM public.schools WHERE udise_code = v_udise_code;

        IF v_before IS NULL AND NOT EXISTS (SELECT 1 FROM public.schools WHERE udise_code = v_udise_code) THEN
            RAISE NOTICE 'V109 udise_code=% : school not present in this environment; no-op.', v_udise_code;
            CONTINUE;
        END IF;

        UPDATE public.schools
        SET area_key = v_after
        WHERE udise_code = v_udise_code
          AND area_key IS DISTINCT FROM v_after;
        GET DIAGNOSTICS v_updated = ROW_COUNT;

        IF v_before IS NOT DISTINCT FROM v_expected_before THEN
            RAISE NOTICE 'V109 udise_code=% : OLD=% NEW=% (updated=%) — expected coarse pre-fix state, corrected.',
                v_udise_code, v_before, v_after, (v_updated > 0);
        ELSIF v_before IS NOT DISTINCT FROM v_after THEN
            RAISE NOTICE 'V109 udise_code=% : OLD=% NEW=% (updated=%) — already at target (fine pre-fix state), no-op.',
                v_udise_code, v_before, v_after, (v_updated > 0);
        ELSE
            RAISE NOTICE 'V109 udise_code=% : OLD=% NEW=% (updated=%) — UNEXPECTED prior value (neither known coarse state nor target); environment diverges from plan assumptions, correction still applied.',
                v_udise_code, v_before, v_after, (v_updated > 0);
        END IF;
    END LOOP;
END $$;
