-- fix-office-subtype-2575-rollback.sql
--
-- Rollback for fix-office-subtype-2575.sql (Issue #2575, Part C).
-- Restores the five listings identified there to their exact pre-correction
-- state: property_type='commercial_building', commercial_subtype='BUILDING',
-- an lcbd detail row, and either no lcsd row or the lcsd row's prior
-- subtype -- whichever was true before the forward script ran.
--
-- THIS SCRIPT DOES NOT EXECUTE ANYTHING AGAINST ANY DATABASE. It is produced
-- as a reviewable artifact only. Deployment/execution is the owner's
-- responsibility.
--
-- Idempotent: safe to run more than once. Every mutating step is scoped by
-- a "row still carries the fix2575 audit marker and is still in the
-- corrected (commercial/OFFICE) state" gate. On a second run this matches
-- zero rows for TWO independent reasons, not one: step 4 below clears the
-- audit marker on every row this script successfully rolls back, so a
-- second run is excluded both by the reverted property_type/commercial_subtype
-- AND by the now-absent audit key -- fail-closed by absence, not merely by
-- a state condition that happens to hold.
--
-- Rows are identified via parsed_data->>'importIssue' = '2304' (the same
-- provenance precedent used by the forward script), narrowed further to
-- only rows carrying this script's own audit key
-- (parsed_data->'fix2575RollbackAudit'), which the forward script wrote
-- during its capture step. That audit payload is the only place the
-- pre-existing lcsd state (present or absent, and its prior subtype) is
-- recorded -- the rollback script has no other way to reconstruct it, since
-- it runs as a separate transaction/script with no access to the forward
-- script's in-flight state.
--
-- Why step 4 clears the audit key rather than leaving it in place: a
-- leftover 'fix2575RollbackAudit' blob is indistinguishable from a
-- correction that is still applied -- a later reader has no way to tell
-- "corrected, not yet rolled back" from "corrected, then rolled back, key
-- just never cleared." Clearing it on successful rollback makes the key's
-- presence an unambiguous state signal: present means "forward-corrected
-- and not reverted," absent means either "never corrected" or "corrected
-- then rolled back." This is a deliberate design choice, not an oversight
-- left for a later pass.
--
-- Ordering within the single transaction:
--   1. revert property_type/commercial_subtype to commercial_building/BUILDING
--   2. re-insert (UPSERT) the lcbd row from captured audit data
--   3. restore or delete the lcsd row per the captured audit flag
--   4. clear the fix2575RollbackAudit key now that its data has been consumed
--   5. assert post-conditions
--
-- The only real ordering dependencies are at the edges. The CREATE TEMP
-- TABLE below must run before any of steps 1-4: it snapshots both the target
-- set and the audit payload in a single read, and once property_type is
-- reverted the CTAS predicate (commercial/OFFICE) would no longer match, so
-- capture has to happen first. The post-condition assertion (step 5) must
-- run last, after every mutation it checks.
--
-- CANONICAL: this is the single source of truth for how V135's deferred
-- trigger interacts with statement order in this script pair --
-- fix-office-subtype-2575.sql references this comment rather than
-- restating it. Steps 1-4 have NO ordering dependency on each other. Two
-- separate triggers are involved, and they behave differently:
--   * The trigger on property_listings has WHEN (NEW.property_type =
--     'commercial' AND NEW.commercial_subtype IS NOT NULL). A WHEN clause
--     is evaluated EAGERLY, at the moment of the row write, not deferred --
--     so an UPDATE that reverts a row back to commercial_building enqueues
--     nothing at all from this trigger.
--   * The trigger on listing_commercial_space_details has NO WHEN clause,
--     so every lcsd UPDATE/DELETE enqueues the deferred check
--     unconditionally. That queued
--     assert_commercial_subtype_projected(p_listing_id) is id-based and
--     re-reads the row at COMMIT time, early-returning whenever
--     property_type is not 'commercial' at that moment, regardless of what
--     intermediate states the row passed through earlier in the same
--     transaction.
-- So whatever order steps 1-4 run in, by COMMIT the row is back to
-- commercial_building/BUILDING and the check early-returns. Only the
-- transaction boundary matters here, not statement order inside it.
--
-- WHY ONE CANONICAL COPY IS SAFE HERE, AND WHAT WOULD MAKE IT UNSAFE.
-- An earlier revision of this script pair stated this invariant TWICE, once
-- per file, and the two copies drifted: both were wrong initially, then one
-- was corrected while the other went on asserting the opposite at greater
-- length -- and length reads as authority. Consolidating to a single copy
-- removes that drift. But it also removes a cross-check: two copies disagree
-- LOUDLY when one is wrong, and a lone copy cannot disagree with anything.
-- What makes this copy trustworthy is therefore NOT that it is labelled
-- canonical. It is that the mechanism was derived INDEPENDENTLY TWICE from
-- the same primary source -- once by the implementing lane, reading V135's
-- trigger definitions directly, and once by an opus code review that
-- verified it against V135 without seeing the lane's reasoning, and reached
-- the same conclusion. Two independent derivations agreeing is what a second
-- copy was standing in for.
-- If you maintain this passage: RE-DERIVE it from V135 rather than trusting
-- it. Every claim above is checkable against
-- V135__backfill_and_guard_commercial_subtype_projection.sql -- the trigger
-- definitions and the assert function body -- and its being checkable is the
-- point. This comment has been wrong before.

BEGIN;

-- Rows to roll back: still carry this script's audit marker AND are still
-- in the corrected (commercial/OFFICE) state. Both halves of this gate now
-- independently guarantee idempotency: once reverted, a row's property_type
-- is no longer 'commercial' (excludes it via the state half), AND step 4
-- below clears the audit key from parsed_data on every row this script
-- successfully rolls back (excludes it via the marker half too). A second
-- run therefore matches zero rows for two independent reasons at once.
-- The five listings fix-office-subtype-2575.sql could have touched, derived
-- the same way the forward script derives them (md5('99acres:' ||
-- external_id) -- see import.sql's identity derivation), so a transcription
-- slip here is visible in this source text rather than silently shrinking
-- the matched set.
CREATE TEMP TABLE fix_2575_rollback_ids ON COMMIT DROP AS
SELECT (md5('99acres:' || external_id))::uuid AS listing_id
FROM (VALUES
  ('M91395690'),
  ('Z59660870'),
  ('D90432306'),
  ('U90462182'),
  ('W88736208')
) AS v(external_id);

CREATE TEMP TABLE fix_2575_rollback_targets ON COMMIT DROP AS
SELECT
  pl.id AS listing_id,
  pl.parsed_data->'fix2575RollbackAudit' AS audit
FROM property_listings pl
JOIN fix_2575_rollback_ids ids ON ids.listing_id = pl.id
WHERE pl.parsed_data->>'importIssue' = '2304'
  AND pl.parsed_data ? 'fix2575RollbackAudit'
  AND pl.parsed_data->>'source' = '99acres'
  AND pl.property_type = 'commercial'
  AND pl.commercial_subtype = 'OFFICE';

-- Sanity assertion: this rollback's in-scope set (rows still carrying the
-- audit key AND still in the corrected state) must be either empty (already
-- rolled back / nothing to do) or the full 5-row set the forward script
-- could have touched. Any count in between (1-4) means some of the 5 rows
-- have been rolled back and others haven't -- partial/corrupt state -- and a
-- count above 5 means the audit marker or provenance filter is matching
-- something unexpected. Abort in either case rather than rolling back a
-- partial or unbounded set.
DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM fix_2575_rollback_targets;

  IF target_count NOT IN (0, 5) THEN
    RAISE EXCEPTION 'fix-office-subtype-2575-rollback: expected 0 (already rolled back) or 5 (full uncorrected set) rows to roll back, found %. Aborting -- partial/corrupt state.', target_count;
  END IF;
END $$;

-- Step 1: revert the flat columns. This has no ordering dependency on
-- steps 2-4 (see header comment) -- listed first here purely for readability.
UPDATE property_listings pl
SET property_type = 'commercial_building',
    commercial_subtype = 'BUILDING'
FROM fix_2575_rollback_targets t
WHERE pl.id = t.listing_id;

-- Step 2: re-insert the lcbd row. UPSERT (not a plain INSERT) so this step
-- is idempotent and genuinely restores captured values if run again before
-- the state gate above would exclude the row. created_at is sourced from
-- the captured audit payload (t.audit->>'lcbdCreatedAt'), not from the live
-- property_listings row: the forward script's DELETE destroyed the original
-- lcbd row before this rollback could ever observe it, but the forward
-- script captured that row's created_at into parsed_data->'fix2575RollbackAudit'
-- before deleting it (see fix-office-subtype-2575.sql's pre_image CTE), so
-- that captured value -- not the unrelated property_listings.created_at --
-- is the correct source of truth here.
INSERT INTO listing_commercial_building_details (
  listing_id, number_of_units, total_floors, road_frontage_ft,
  commercial_usage, created_at
)
SELECT
  pl.id,
  (t.audit->>'lcbdNumberOfUnits')::integer,
  (t.audit->>'lcbdTotalFloors')::integer,
  (t.audit->>'lcbdRoadFrontageFt')::numeric,
  t.audit->>'lcbdCommercialUsage',
  (t.audit->>'lcbdCreatedAt')::timestamptz
FROM fix_2575_rollback_targets t
JOIN property_listings pl ON pl.id = t.listing_id
ON CONFLICT (listing_id) DO UPDATE
SET number_of_units = EXCLUDED.number_of_units,
    total_floors = EXCLUDED.total_floors,
    road_frontage_ft = EXCLUDED.road_frontage_ft,
    commercial_usage = EXCLUDED.commercial_usage,
    created_at = EXCLUDED.created_at;

-- Step 3: restore or remove the lcsd row per the captured audit flag.
-- If an lcsd row pre-existed before the forward correction, put all eight of
-- its captured columns back (it may have carried values unrelated to this
-- fix, which must not be lost -- the forward script's UPSERT overwrote all
-- eight, so all eight must be restored here; see fix-office-subtype-2575.sql
-- Step 2). If the forward script created the lcsd row fresh (no pre-existing
-- row), delete it so the pre-image is exactly restored.
UPDATE listing_commercial_space_details lcsd
SET commercial_subtype = t.audit->>'lcsdPriorSubtype',
    floor_number = (t.audit->>'lcsdPriorFloorNumber')::integer,
    total_floors = (t.audit->>'lcsdPriorTotalFloors')::integer,
    furnishing_status = t.audit->>'lcsdPriorFurnishingStatus',
    washrooms = (t.audit->>'lcsdPriorWashrooms')::integer,
    parking_count = (t.audit->>'lcsdPriorParkingCount')::integer,
    road_frontage_ft = (t.audit->>'lcsdPriorRoadFrontageFt')::numeric,
    commercial_usage = t.audit->>'lcsdPriorCommercialUsage'
FROM fix_2575_rollback_targets t
WHERE lcsd.listing_id = t.listing_id
  AND (t.audit->>'lcsdPreExisted')::boolean IS TRUE;

DELETE FROM listing_commercial_space_details lcsd
USING fix_2575_rollback_targets t
WHERE lcsd.listing_id = t.listing_id
  AND (t.audit->>'lcsdPreExisted')::boolean IS NOT TRUE;

-- Step 4: clear the fix2575RollbackAudit key now that its data has been
-- consumed by steps 1-3 above. Removes ONLY this one key from parsed_data --
-- every other key in parsed_data (including unrelated ones) is left exactly
-- as-is, via the '-' jsonb key-delete operator, which is a targeted single-key
-- removal, not a column overwrite. Scoped to the same target set already
-- established (fix_2575_rollback_targets), so this never touches a row this
-- script did not just roll back. See header comment for why the key is
-- cleared here rather than left in place.
UPDATE property_listings pl
SET parsed_data = pl.parsed_data - 'fix2575RollbackAudit'
FROM fix_2575_rollback_targets t
WHERE pl.id = t.listing_id;

-- Step 5: post-condition assertion. Every rolled-back listing must be back
-- at property_type='commercial_building'/commercial_subtype='BUILDING',
-- must have an lcbd row, must match the captured lcsd expectation (present
-- with all eight of its prior captured columns, or absent), and must no
-- longer carry the fix2575RollbackAudit key.
DO $$
DECLARE
  bad_flat_count integer;
  missing_lcbd_count integer;
  bad_lcsd_count integer;
  stray_audit_count integer;
BEGIN
  -- bad_flat_count, missing_lcbd_count and stray_audit_count are scoped to
  -- fix_2575_rollback_ids (all five listings this script targets), NOT to
  -- fix_2575_rollback_targets (only the rows THIS run mutated). Scoping to
  -- the targets set would make each of these vacuously 0 on every run --
  -- steps 1, 2 and 4 above unconditionally establish exactly the state
  -- being checked for every row in that set, and on a zero-target run
  -- (already rolled back, or nothing to roll back) the set is empty, so a
  -- targets-scoped check would pass without inspecting a single row.
  -- Scoping to the full five-id set instead asserts the real invariant --
  -- "these five listings are in the pre-correction state" -- unconditionally,
  -- whether this run rolled any of them back or not.
  SELECT count(*) INTO bad_flat_count
  FROM property_listings pl
  JOIN fix_2575_rollback_ids ids ON ids.listing_id = pl.id
  WHERE NOT (pl.property_type = 'commercial_building' AND pl.commercial_subtype = 'BUILDING');

  SELECT count(*) INTO missing_lcbd_count
  FROM fix_2575_rollback_ids ids
  LEFT JOIN listing_commercial_building_details lcbd ON lcbd.listing_id = ids.listing_id
  WHERE lcbd.listing_id IS NULL;

  -- bad_lcsd_count MUST STAY scoped to fix_2575_rollback_targets, unlike the
  -- three checks above. The expected lcsd shape (whether a row should exist,
  -- and its prior column values) lives only in the captured audit payload
  -- (t.audit), which step 4 has just deleted from every row in the targets
  -- set. There is no full-five-id source for that expectation to compare
  -- against once the audit key is gone, so this check cannot be reformulated
  -- the way the other three were. This asymmetry with the checks above is
  -- deliberate -- do not "fix" it into a fix_2575_rollback_ids scope, which
  -- would either error (t.audit undefined) or silently check nothing.
  SELECT count(*) INTO bad_lcsd_count
  FROM fix_2575_rollback_targets t
  LEFT JOIN listing_commercial_space_details lcsd ON lcsd.listing_id = t.listing_id
  WHERE
    (
      (t.audit->>'lcsdPreExisted')::boolean IS TRUE
      AND (
        lcsd.listing_id IS NULL
        OR lcsd.commercial_subtype IS DISTINCT FROM t.audit->>'lcsdPriorSubtype'
        OR lcsd.floor_number IS DISTINCT FROM (t.audit->>'lcsdPriorFloorNumber')::integer
        OR lcsd.total_floors IS DISTINCT FROM (t.audit->>'lcsdPriorTotalFloors')::integer
        OR lcsd.furnishing_status IS DISTINCT FROM t.audit->>'lcsdPriorFurnishingStatus'
        OR lcsd.washrooms IS DISTINCT FROM (t.audit->>'lcsdPriorWashrooms')::integer
        OR lcsd.parking_count IS DISTINCT FROM (t.audit->>'lcsdPriorParkingCount')::integer
        OR lcsd.road_frontage_ft IS DISTINCT FROM (t.audit->>'lcsdPriorRoadFrontageFt')::numeric
        OR lcsd.commercial_usage IS DISTINCT FROM t.audit->>'lcsdPriorCommercialUsage'
      )
    )
    OR
    (
      (t.audit->>'lcsdPreExisted')::boolean IS NOT TRUE
      AND lcsd.listing_id IS NOT NULL
    );

  SELECT count(*) INTO stray_audit_count
  FROM property_listings pl
  JOIN fix_2575_rollback_ids ids ON ids.listing_id = pl.id
  WHERE pl.parsed_data ? 'fix2575RollbackAudit';

  IF bad_flat_count <> 0 OR missing_lcbd_count <> 0 OR bad_lcsd_count <> 0 OR stray_audit_count <> 0 THEN
    RAISE EXCEPTION 'fix-office-subtype-2575-rollback: post-condition failed (bad_flat=%, missing_lcbd=%, bad_lcsd=%, stray_audit=%). Aborting.',
      bad_flat_count, missing_lcbd_count, bad_lcsd_count, stray_audit_count;
  END IF;
END $$;

COMMIT;
