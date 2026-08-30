-- V112__resolve_thirteen_ambiguous_school_attributions.sql
-- Issue #1829 (PR2 of 2): resolve the 13 Bengaluru schools #1737/#1828 deliberately left for a
-- human ruling, under the #1828 two-concept model (V110):
--   1. CANONICAL LOCALITY  (schools.area_key)                      — where the school actually is.
--   2. CURATED COVERAGE    (school_discover_area_coverage)          — which curated Discover areas
--                                                                     may surface/count it.
-- These are NEVER forced to the same answer. Full evidence + per-school rulings:
-- docs/audit/evidence/issue-1829-thirteen-ambiguous-schools/README.md (the product ruling).
--
-- ── STEP A — canonical locality, HIGH_CONFIDENCE ONLY (exactly 2 of the 13) ───────────────────
-- Poornaprajna Education Centre, Indiranagar (APIFY-BAN-INDI-01): address AND geometry agree on
-- New Tippasandra (424m vs 1826m to Indiranagar's centroid) -> area_key corrected.
-- Narayana eTechno (CBSE) School - Bellandur (APIFY-BAN-SARJ-01): address AND geometry agree on
-- Bellandur (1322m vs 1769m to Sarjapur Road's centroid) -> area_key corrected.
-- The other 11 (10 MEDIUM + 1 UNRESOLVED) are DELIBERATELY left unchanged — address and geometry
-- disagree, and guessing between them is exactly what #1737/#1829 forbid. This is a bare
-- `area_key` UPDATE, keyed on udise_code (never id — gen_random_uuid(), unstable across
-- environments), idempotent + convergent via `IS DISTINCT FROM`, following V109's precedent.
--
-- WHY THIS DOES NOT HAND-WRITE A `primary` COVERAGE ROW (R1, mechanically enforced — see AC9):
-- V110's AFTER UPDATE trigger (trg_sync_school_discover_area_coverage_update, V110:199-204) fires
-- on `OLD.area_key IS DISTINCT FROM NEW.area_key` and moves the school's `primary` coverage row
-- ITSELF — deleting the stale primary at the old area and upserting the new one. Hand-writing a
-- `primary` row here would race that trigger and could violate uq_school_coverage_one_primary,
-- a HARD write failure on the schools table. This file contains ZERO INSERTs of relationship_type
-- = 'primary' into school_discover_area_coverage.
--
-- ── STEP B — `contained` coverage, DERIVED IN SQL from LIVE geometry (never hardcoded) ─────────
-- INSERT ... SELECT joins schools to areas and computes containment from the LIVE bbox
-- (s.latitude/longitude BETWEEN a.min_lat/max_lat, a.min_lon/max_lon), scoped to the 10 CURATED
-- (V71) areas and the 13 udise_codes, excluding degenerate (point) bboxes (69 of 313 Bengaluru
-- areas are degenerate — containment is meaningless there) and excluding a school's OWN canonical
-- area (R2 — see below). source='proximity_backfill': V110's CHECK constraint on `source` permits
-- only ('area_key_mirror','trigger','proximity_backfill','manual_review') — 'geometry' is NOT a
-- permitted value. 'proximity_backfill' is the correct choice: it is V110's own designated value
-- for a machine-derived, geometry-based coverage row created by a backfill process (see
-- SchoolCoverageBackfillIT tests (j)/(k), which use exactly this source for synthetic PR2-style
-- `contained`/`nearby` rows), as opposed to 'area_key_mirror' (a pure area_key echo) or 'trigger'
-- (an AFTER-trigger-owned row) or 'manual_review' (a human-typed override).
--
-- WHY THIS EXCLUDES A SCHOOL'S OWN CANONICAL AREA (R2, mechanically enforced — see AC12/AC5):
-- V110's coverage trigger's ON CONFLICT DO UPDATE ... WHERE relationship_type <> 'reviewed_override'
-- (V110:167-172) would silently UPGRADE a `contained` row on a school's own canonical area to
-- `primary`. For Carmel Garden Public School and ORCHIDS The International School - Sarjapur Road,
-- the containment area IS their (unchanged) canonical area, so a `primary` row already exists
-- there — this step must SKIP them (`a.area_key IS DISTINCT FROM s.area_key`, evaluated AFTER
-- STEP A, so Poornaprajna's now-New-Tippasandra canonical correctly makes its Indiranagar
-- containment row legitimate `contained` coverage, not a self-reference).
--
-- ── STEP C — precondition + catalogue-drift guards ──────────────────────────────────────────────
-- Destination/curated area_keys are HARD preconditions (RAISE EXCEPTION if missing): they are
-- seeded by V71/V106, which always precede V112 in the Flyway chain, so their absence signals a
-- genuinely broken environment. udise_code PRESENCE is deliberately treated as a SOFT precondition
-- (RAISE NOTICE, never EXCEPTION) — following V109's explicit precedent ("Zero matching rows
-- (schools never seeded in this environment) is a safe no-op"). This fixture
-- (scripts/db/fixtures/bangalore-mangalore-schools-seed.sql) is NOT part of the Flyway chain; many
-- @DataJpaTest classes elsewhere in this codebase (e.g. GroupAreaKeyFilterIT) apply the FULL
-- migration chain — including this file — without ever seeding these 13 Bengaluru schools. A hard
-- RAISE on udise absence would fail every one of those unrelated tests' Flyway bootstrap. The
-- catalogue-drift guard is therefore scoped to udise_codes that ARE present: it compares the
-- SQL-derived containment set against the human-reviewed expected pairs (README.md sections 2/4)
-- ONLY for schools that exist in this environment, so it is a true no-op when the fixture is
-- absent and a genuine deploy-time proof when it is present.

-- ── STEP A + precondition guard (canonical locality — the 2 HIGH_CONFIDENCE schools only) ──────

DO $$
DECLARE
    v_missing_area TEXT;
    v_corrections CONSTANT TEXT[][] := ARRAY[
        ARRAY['APIFY-BAN-INDI-01', 'IN|KA|Bengaluru|Indiranagar',   'IN|KA|Bengaluru|New Tippasandra'],
        ARRAY['APIFY-BAN-SARJ-01', 'IN|KA|Bengaluru|Sarjapur Road', 'IN|KA|Bengaluru|Bellandur']
    ];
    v_row TEXT[];
    v_udise_code TEXT;
    v_after TEXT;
    v_before TEXT;
    v_school_exists BOOLEAN;
    v_updated INT;
BEGIN
    -- Hard precondition: destination area_keys must already exist (seeded by V106).
    SELECT string_agg(DISTINCT dest.area_key, ', ')
    INTO v_missing_area
    FROM (
        SELECT v_corrections[i][3] AS area_key
        FROM generate_subscripts(v_corrections, 1) AS i
    ) AS dest
    WHERE NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.area_key = dest.area_key);

    IF v_missing_area IS NOT NULL THEN
        RAISE EXCEPTION 'V112 precondition failed: destination area(s) missing from public.areas: %. Expected V106 to have seeded these.', v_missing_area;
    END IF;

    FOREACH v_row SLICE 1 IN ARRAY v_corrections
    LOOP
        v_udise_code := v_row[1];
        v_after := v_row[3];

        SELECT EXISTS(SELECT 1 FROM public.schools WHERE udise_code = v_udise_code) INTO v_school_exists;

        IF NOT v_school_exists THEN
            RAISE NOTICE 'V112 STEP A udise_code=% : school not present in this environment; no-op.', v_udise_code;
            CONTINUE;
        END IF;

        SELECT area_key INTO v_before FROM public.schools WHERE udise_code = v_udise_code;

        UPDATE public.schools
        SET area_key = v_after
        WHERE udise_code = v_udise_code
          AND area_key IS DISTINCT FROM v_after;
        GET DIAGNOSTICS v_updated = ROW_COUNT;

        RAISE NOTICE 'V112 STEP A udise_code=% : OLD=% NEW=% (updated=%) — canonical locality corrected (HIGH_CONFIDENCE; address and geometry agree). V110''s coverage trigger, not this migration, moves the primary coverage row.',
            v_udise_code, v_before, v_after, (v_updated > 0);
    END LOOP;
END $$;

-- ── STEP B + catalogue-drift guard (curated coverage — derived from live geometry) ─────────────

DO $$
DECLARE
    v_curated_areas CONSTANT TEXT[] := ARRAY[
        'IN|KA|Bengaluru|Whitefield',
        'IN|KA|Bengaluru|Koramangala',
        'IN|KA|Bengaluru|Indiranagar',
        'IN|KA|Bengaluru|Hebbal',
        'IN|KA|Bengaluru|HSR Layout',
        'IN|KA|Bengaluru|Sarjapur Road',
        'IN|KA|Bengaluru|Yelahanka',
        'IN|KA|Bengaluru|Jayanagar',
        'IN|KA|Bengaluru|Marathahalli',
        'IN|KA|Bengaluru|Electronic City'
    ];
    -- The 13 schools left for a human ruling (docs/audit/evidence/issue-1829-thirteen-ambiguous-schools).
    v_thirteen_udise CONSTANT TEXT[] := ARRAY[
        'APIFY-BAN-ELEC-02', -- BS International School, Electronic City
        'APIFY-BAN-HSRL-01', -- Carmel Garden Public School
        'APIFY-BAN-HSRL-03', -- Narayana eTechno - Electronic City Phase 1
        'APIFY-BAN-HSRL-04', -- ORCHIDS The International School - Haralur
        'APIFY-BAN-HEBB-02', -- Vivekananda ORCHIDS - Sahakar Nagar
        'APIFY-BAN-INDI-01', -- Poornaprajna Education Centre, Indiranagar (HIGH, moved in STEP A)
        'APIFY-BAN-JAYA-02', -- Narayana eTechno - Rk Layout
        'APIFY-BAN-JAYA-03', -- National Public School, Banashankari
        'APIFY-BAN-JAYA-04', -- RMS International School
        'APIFY-BAN-MARA-01', -- EuroSchool Whitefield
        'APIFY-BAN-MARA-03', -- Narayana eTechno - KR Puram (UNRESOLVED)
        'APIFY-BAN-SARJ-01', -- Narayana eTechno - Bellandur (HIGH, moved in STEP A)
        'APIFY-BAN-SARJ-02'  -- ORCHIDS The International School - Sarjapur Road
    ];
    -- Expected (udise_code, curated_area_key) `contained` pairs from the human-reviewed product
    -- ruling (README.md §2/§4) — an INDEPENDENT source from the SELECT below (MECHANISM 2). This
    -- is deliberately NOT a re-statement of the query's own logic: if the live catalogue drifts
    -- from what was reviewed, this list will disagree with the SELECT's output and the guard below
    -- will RAISE.
    v_expected CONSTANT TEXT[][] := ARRAY[
        ARRAY['APIFY-BAN-INDI-01', 'IN|KA|Bengaluru|Indiranagar'],
        ARRAY['APIFY-BAN-SARJ-01', 'IN|KA|Bengaluru|Sarjapur Road'],
        ARRAY['APIFY-BAN-HSRL-04', 'IN|KA|Bengaluru|Sarjapur Road']
    ];
    v_missing_area TEXT;
    v_drift_count INT;
    v_inserted INT;
BEGIN
    -- Hard precondition: all 10 curated area_keys must already exist (seeded by V71).
    SELECT string_agg(DISTINCT c.area_key, ', ')
    INTO v_missing_area
    FROM (SELECT unnest(v_curated_areas) AS area_key) c
    WHERE NOT EXISTS (SELECT 1 FROM public.areas a WHERE a.area_key = c.area_key);

    IF v_missing_area IS NOT NULL THEN
        RAISE EXCEPTION 'V112 precondition failed: curated area(s) missing from public.areas: %. Expected V71 to have seeded these.', v_missing_area;
    END IF;

    -- Catalogue-drift guard (MECHANISM 1+2). Scoped to udise_codes PRESENT in this environment —
    -- see the header comment on why absence must never RAISE (V109 precedent; unrelated
    -- @DataJpaTest classes apply this full migration chain without seeding these fixtures).
    SELECT COUNT(*) INTO v_drift_count
    FROM (
        (
            SELECT s.udise_code, a.area_key
            FROM public.schools s
            JOIN public.areas a
              ON s.latitude  BETWEEN a.min_lat AND a.max_lat
             AND s.longitude BETWEEN a.min_lon AND a.max_lon
            WHERE a.min_lat <> a.max_lat
              AND a.min_lon <> a.max_lon
              AND a.area_key = ANY (v_curated_areas)
              AND s.udise_code = ANY (v_thirteen_udise)
              AND a.area_key IS DISTINCT FROM s.area_key
            EXCEPT
            SELECT v_expected[i][1], v_expected[i][2]
            FROM generate_subscripts(v_expected, 1) AS i
            WHERE EXISTS (SELECT 1 FROM public.schools s WHERE s.udise_code = v_expected[i][1])
        )
        UNION ALL
        (
            SELECT v_expected[i][1], v_expected[i][2]
            FROM generate_subscripts(v_expected, 1) AS i
            WHERE EXISTS (SELECT 1 FROM public.schools s WHERE s.udise_code = v_expected[i][1])
            EXCEPT
            SELECT s.udise_code, a.area_key
            FROM public.schools s
            JOIN public.areas a
              ON s.latitude  BETWEEN a.min_lat AND a.max_lat
             AND s.longitude BETWEEN a.min_lon AND a.max_lon
            WHERE a.min_lat <> a.max_lat
              AND a.min_lon <> a.max_lon
              AND a.area_key = ANY (v_curated_areas)
              AND s.udise_code = ANY (v_thirteen_udise)
              AND a.area_key IS DISTINCT FROM s.area_key
        )
    ) AS drift;

    IF v_drift_count > 0 THEN
        RAISE EXCEPTION 'V112 catalogue-drift guard failed: the SQL-derived live-geometry containment set differs from the reviewed #1829 product ruling by % row(s) (among schools present in this environment). The live schools/areas catalogue has drifted since the ruling was made; this migration must not silently ship a different verdict than was reviewed.', v_drift_count;
    END IF;

    -- The actual `contained` coverage INSERT — geometry-derived, not hardcoded.
    INSERT INTO public.school_discover_area_coverage
        (school_id, curated_area_key, relationship_type, source)
    SELECT s.id, a.area_key, 'contained', 'proximity_backfill'
    FROM public.schools s
    JOIN public.areas a
      ON s.latitude  BETWEEN a.min_lat AND a.max_lat
     AND s.longitude BETWEEN a.min_lon AND a.max_lon
    WHERE a.min_lat <> a.max_lat
      AND a.min_lon <> a.max_lon
      AND a.area_key = ANY (v_curated_areas)
      AND s.udise_code = ANY (v_thirteen_udise)
      AND a.area_key IS DISTINCT FROM s.area_key
    ON CONFLICT (school_id, curated_area_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    RAISE NOTICE 'V112 STEP B: % contained coverage row(s) inserted from live-geometry containment (rows already existing as primary/contained for the same school+area are skipped by ON CONFLICT DO NOTHING).', v_inserted;
END $$;
