-- cleanup-audit-2575.sql
--
-- Companion to fix-office-subtype-2575.sql (Issue #2575, Part B). Removes the
-- 'fix2575RollbackAudit' key that the forward script writes into
-- property_listings.parsed_data, and nothing else -- no other column, no
-- other row, no other key inside parsed_data.
--
-- THIS SCRIPT DOES NOT EXECUTE ANYTHING AGAINST ANY DATABASE. It is produced
-- as a reviewable artifact only. Deployment/execution is the owner's
-- responsibility.
--
-- Why this script exists (a gap in the original rollback-only design): the
-- expected case is that the forward correction succeeds and is NEVER rolled
-- back. fix-office-subtype-2575-rollback.sql clears the audit key on the
-- rollback path, but that code only runs if a rollback happens. On the
-- normal, happy path -- correction applied, no rollback ever needed -- the
-- audit blob has no code path that removes it, so it stays on the five
-- affected rows indefinitely. property_listings.parsed_data is on the
-- anon-SELECT allow-list (readable by unauthenticated clients), so a
-- permanently-lingering internal audit blob is a real, if non-PII,
-- operational exposure that this script closes.
--
-- IMPORTANT TRADEOFF -- read before running:
-- Once this script clears the audit key, fix-office-subtype-2575-rollback.sql
-- can no longer distinguish "this listing pre-existed as an lcsd row before
-- the forward correction" from "the forward correction created this lcsd row
-- from scratch." That distinction lives ONLY in the audit payload this
-- script deletes. After cleanup, the rollback script's target-selection WHERE
-- clause (parsed_data ? 'fix2575RollbackAudit') will simply no longer match
-- these rows at all -- rollback becomes impossible for any row this script
-- has cleaned up. Run this ONLY when you are confident no rollback of the
-- #2575 office-subtype correction will ever be needed for these listings.
-- This is the operator's decision to make knowingly at execution time; this
-- script does not make it for you and carries no override switch.
--
-- Sequencing: this script is a MANDATORY final step of the #2575 office-
-- subtype correction, never an optional one -- the audit blob it removes is
-- anon-readable and must not linger indefinitely. It is NOT run immediately
-- after the forward correction. The required order is:
--   1. fix-office-subtype-2575.sql (forward correction)
--   2. an owner-determined soak period, elapsed in full
--   3. cleanup-audit-2575.sql (this script)
-- This script does not specify or enforce a soak duration -- that is the
-- owner's call, made at execution time. Running this script before the soak
-- period has elapsed forfeits the rollback path (see the tradeoff above)
-- while the forward correction is still unproven, and is not a valid use of
-- this script regardless of how long "immediately" turns out to mean.
--
-- THREE GATES, IN ORDER, ALL FAIL-CLOSED. This script is the irreversible
-- boundary of the #2575 correction: it destroys the only pre-image a rollback
-- -- automated or manual -- could ever be reconstructed from. It is therefore
-- gated at least as tightly as its two siblings, not more loosely:
--
--   Gate A (identity + existence + provenance). The five derived ids must
--     resolve to EXACTLY five property_listings rows carrying the expected
--     import provenance. This is the gate that carries the whole
--     wrong-database / restored-snapshot / deleted-rows burden.
--   Gate C (audit-key cardinality). 0 or 5. A count of 0, with Gate A
--     already satisfied, means the rows are genuinely present and there is
--     genuinely nothing to clean: NOTICE and no-op, never an exception.
--   Gate B (post-forward drift). Reached only when a payload actually
--     exists to destroy. Aborts on any drift, preserving all five payloads.
--
-- WHY GATE B RUNS LAST, AFTER THE CARDINALITY CHECK, AND NOT BEFORE IT.
-- An earlier revision ordered these A -> B -> C. That ordering raised an
-- exception on `forward -> rollback -> cleanup`, which is a SANCTIONED
-- operator sequence the runbook itself prescribes: the rollback reverts the
-- rows to commercial_building/BUILDING, so a drift gate placed before the
-- cardinality check saw "not in the corrected state" and aborted. Aborting
-- there cost nothing in safety and taught something false -- that this script
-- raises on healthy paths. An operator who has seen it cry wolf on a
-- prescribed sequence reads the NEXT abort, the real drifted-state or
-- wrong-database one, as the same noise. A fail-closed gate that fires on a
-- sanctioned path erodes the thing it exists to protect.
--
-- Moving Gate B after Gate C costs no fail-closed coverage, because Gate B
-- was never the gate carrying the wrong-database burden -- Gate A is, and it
-- is unmoved and unconditional. Gate B exists to stop a payload being
-- destroyed; at a count of 0 there IS no payload, so its protective purpose
-- is vacuous exactly on the path where it used to fire.
--
-- THE ONE PROPERTY THIS ORDERING GIVES UP, stated rather than buried: a state
-- that is BOTH drifted AND keyless now exits clean instead of aborting. That
-- is deliberate. With zero payloads this script has nothing to protect and
-- nothing to do, so "nothing to clean" is a truthful report; detecting
-- unrelated drift is not this script's job, and buying that incidental
-- detection at the price of crying wolf on a prescribed sequence is a bad
-- trade. Do not re-add a drift check ahead of Gate C to recover it.
--
-- Idempotent: on a second run Gate A still passes (this script mutates
-- neither identity nor state -- it touches one jsonb key and nothing else),
-- Gate C counts 0 and reports a no-op, Gate B is skipped, and the UPDATE
-- matches nothing. Note what that idempotency rests on: Gate A proves the
-- rows are THERE. Before Gate A existed, a zero count could equally mean
-- "already cleaned" or "this is the wrong database" -- see Gate A's comment.

BEGIN;

-- The five listings fix-office-subtype-2575.sql could have touched, derived
-- the same way both sibling #2575 scripts derive them (md5('99acres:' ||
-- external_id) -- see import.sql's identity derivation), so a transcription
-- slip here is visible in this source text rather than silently widening
-- the matched set.
--
-- This set is built from a VALUES list, so it ALWAYS yields five rows,
-- independently of anything in the database. That property is what makes
-- Gate A below able to fail on an empty or wrong database, and it is
-- load-bearing: every gate that must detect absence is scoped to THIS set,
-- never to a set derived by joining property_listings.
CREATE TEMP TABLE fix_2575_cleanup_ids ON COMMIT DROP AS
SELECT (md5('99acres:' || external_id))::uuid AS listing_id
FROM (VALUES
  ('M91395690'),
  ('Z59660870'),
  ('D90432306'),
  ('U90462182'),
  ('W88736208')
) AS v(external_id);

-- Gate A: identity + existence + provenance. The five derived ids must
-- resolve to exactly five property_listings rows carrying the expected
-- import provenance (parsed_data->>'importIssue' = '2304' and
-- parsed_data->>'source' = '99acres' -- the same provenance precedent both
-- sibling #2575 scripts use). Mirrors the forward script's own Gate 1+2, and
-- is time-invariant for the same reason: it does not depend on whether any
-- correction or cleanup has already run, only on whether the intended
-- dataset is present.
--
-- WHY THIS CANNOT BE FOLDED INTO GATE C'S COUNT. Gate C counts rows still
-- carrying the audit key, and that count reaches 0 by two completely
-- different routes: "the five rows are here and were already cleaned" (a
-- valid no-op re-run, or a prior rollback) and "the five rows are not here at
-- all" (wrong database, restored snapshot, deleted dataset, an import that
-- never completed). Without this gate those two are observationally
-- identical: every counter in this script reaches property_listings through a
-- join, so on an absent dataset they ALL degrade to 0, Gate C passes, the
-- UPDATE matches nothing, the post-condition finds no stray keys, and the
-- script COMMITs reporting success -- while the anon-readable audit blob is
-- still sitting on the real database and the operator, following a runbook
-- that calls this step mandatory, believes it is done.
--
-- Zero matching rows must never read as successful idempotent cleanup. This
-- gate is the only thing in the script that establishes the dataset exists
-- before any counter is allowed to mean "already clean". It is scoped to
-- fix_2575_cleanup_ids -- the VALUES set, always five rows -- so on an empty
-- database it counts 0 against an expected 5 and raises, rather than
-- vanishing along with the data it was supposed to be checking. This is the
-- same structural reason fix-office-subtype-2575-rollback.sql's
-- missing_lcbd_count survives an empty database.
DO $$
DECLARE
  identity_count integer;
BEGIN
  SELECT count(*) INTO identity_count
  FROM property_listings pl
  JOIN fix_2575_cleanup_ids ids ON ids.listing_id = pl.id
  WHERE pl.parsed_data->>'importIssue' = '2304'
    AND pl.parsed_data->>'source' = '99acres';

  IF identity_count <> 5 THEN
    RAISE EXCEPTION 'cleanup-audit-2575: expected 5 rows matching id list + provenance, found %. Aborting -- refusing to report success against an unestablished dataset.', identity_count;
  END IF;
END $$;

-- Rows to clean: id-bound to the five listings above, carrying the same
-- provenance both sibling #2575 scripts require, and still holding the audit
-- key. Gate A has already established that all five rows exist and carry that
-- provenance, so the only thing this set's cardinality still varies on is
-- whether the audit key is present -- which is exactly what Gate C reads it
-- for.
CREATE TEMP TABLE cleanup_2575_audit_targets ON COMMIT DROP AS
SELECT pl.id AS listing_id
FROM property_listings pl
JOIN fix_2575_cleanup_ids ids ON ids.listing_id = pl.id
WHERE pl.parsed_data->>'importIssue' = '2304'
  AND pl.parsed_data->>'source' = '99acres'
  AND pl.parsed_data ? 'fix2575RollbackAudit';

-- Gate C: audit-key cardinality, and NOTHING ELSE. With identity, existence
-- and provenance already established above, the only two legitimate counts
-- here are 0 (nothing to clean) and 5 (the real first run). A count of 1-4 is
-- a partial state that neither this script nor its two siblings can produce
-- on their own -- reaching it requires something outside these three #2575
-- scripts to have touched parsed_data for a subset of the five rows. The old
-- `> 5` gate let that kind of partial state straight through, silently
-- stripped the remainder, and left an operator believing cleanup was complete
-- while rollback was now permanently impossible for the rows it stripped and
-- still possible for the rest -- an inconsistent, unrecoverable mix. Abort
-- instead so a 1-4 count gets investigated rather than silently resolved by
-- deletion.
--
-- A count of 0 is NOT an error and must never be raised as one. Gate A has
-- already proven the five rows are present with the expected provenance, so
-- 0 here can only mean the keys are genuinely gone -- either a previous
-- cleanup run, or a rollback, which clears the key itself as its Step 4.
-- Both are sanctioned. Report and no-op.
--
-- This gate is deliberately NOT the existence check. Do not re-widen it to
-- carry both jobs: that conflation is what let a wrong-database run report
-- success.
DO $$
DECLARE
  target_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM cleanup_2575_audit_targets;

  IF target_count NOT IN (0, 5) THEN
    RAISE EXCEPTION 'cleanup-audit-2575: expected 0 (already cleaned) or 5 (full uncleaned set) rows to clean, found %. Aborting -- partial/unexpected state.', target_count;
  END IF;

  IF target_count = 0 THEN
    RAISE NOTICE 'cleanup-audit-2575: no audit payload present on the five targets -- nothing to clean. Gate A has confirmed all five listings are present with the expected provenance, so this is a genuine no-op (a prior cleanup, or a prior rollback, which clears the key itself), not a wrong-database run.';
  END IF;
END $$;

-- Gate B: post-forward state, checked only when there is a payload to lose.
-- All five targets must be in the COMPLETE corrected state -- flat
-- property_type='commercial' AND commercial_subtype='OFFICE', a matching lcsd
-- projection carrying 'OFFICE', and no stale lcbd row. These are exactly the
-- three counters fix-office-subtype-2575.sql's own Step 5 asserts after
-- correcting; this gate re-asserts them before destroying the ability to undo
-- that correction.
--
-- WHY THIS GATE EXISTS AT ALL. An earlier revision of this script did NOT
-- require the corrected state, on the reasoning that the audit key should be
-- removable whatever state the row is in, as long as the key is present. That
-- reasoning is wrong at THIS boundary specifically. If something out of band
-- moves one or more rows off the corrected state while all five audit keys
-- remain, the key-presence count is still 5, so the old gate passed and the
-- payload was deleted from all five rows and committed -- destroying the
-- pre-image precisely in the scenario where drift makes someone most likely
-- to need it. The automated rollback is already unusable in that scenario
-- (its own target CTAS requires commercial/OFFICE, so it would find 4 and
-- abort on its 0-or-5 gate); what this gate protects is the pre-image a human
-- would need to reconstruct the row by hand. Losing that is a real loss on a
-- one-way door, so drift aborts here rather than being cleaned through.
--
-- The early RETURN at 0 is what keeps the sanctioned post-rollback and
-- re-run paths quiet -- see the header for why that ordering is deliberate
-- and what single property it gives up. Gate C has already rejected every
-- count except 0 and 5, so reaching the counters below means exactly 5.
--
-- NOT VACUOUS. This gate reads state that nothing in this script writes: the
-- only mutation below touches a single jsonb key in parsed_data, never
-- property_type, commercial_subtype, lcsd or lcbd. The corrected state it
-- checks was established by the forward script in an EARLIER, separate
-- transaction, so this is a genuine observation of the database, not a
-- comparison against a value this transaction just assigned.
--
-- All three counters are scoped to fix_2575_cleanup_ids (the five-row VALUES
-- set), not to the audit-key-derived set -- so they are non-zero on drift
-- whether or not the drifted row still carries its own key.
DO $$
DECLARE
  target_count integer;
  bad_flat_count integer;
  missing_lcsd_count integer;
  stray_lcbd_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM cleanup_2575_audit_targets;

  IF target_count = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO bad_flat_count
  FROM property_listings pl
  JOIN fix_2575_cleanup_ids ids ON ids.listing_id = pl.id
  WHERE NOT (pl.property_type = 'commercial' AND pl.commercial_subtype = 'OFFICE');

  SELECT count(*) INTO missing_lcsd_count
  FROM fix_2575_cleanup_ids ids
  LEFT JOIN listing_commercial_space_details lcsd ON lcsd.listing_id = ids.listing_id
  WHERE lcsd.listing_id IS NULL OR lcsd.commercial_subtype IS DISTINCT FROM 'OFFICE';

  SELECT count(*) INTO stray_lcbd_count
  FROM fix_2575_cleanup_ids ids
  JOIN listing_commercial_building_details lcbd ON lcbd.listing_id = ids.listing_id;

  IF bad_flat_count <> 0 OR missing_lcsd_count <> 0 OR stray_lcbd_count <> 0 THEN
    RAISE EXCEPTION 'cleanup-audit-2575: post-forward state gate failed (bad_flat=%, missing_lcsd=%, stray_lcbd=%). Aborting -- audit payload preserved.',
      bad_flat_count, missing_lcsd_count, stray_lcbd_count;
  END IF;
END $$;

-- Step 1: remove ONLY the fix2575RollbackAudit key from parsed_data. The '-'
-- jsonb key-delete operator removes exactly this one top-level key; every
-- other key already in parsed_data (including unrelated ones written by
-- other code paths) is left byte-for-byte as-is. On a zero-target run this
-- matches nothing, which is what makes "exit clean" above a genuine no-op
-- rather than an early exit that skips work.
UPDATE property_listings pl
SET parsed_data = pl.parsed_data - 'fix2575RollbackAudit'
FROM cleanup_2575_audit_targets t
WHERE pl.id = t.listing_id;

-- Step 2: post-condition assertion. None of the five listings this script
-- targets may still carry the audit key after this script runs. Scoped to
-- fix_2575_cleanup_ids (all five listings), NOT to cleanup_2575_audit_targets
-- (only the rows THIS run stripped) -- step 1 above unconditionally strips
-- the key from every row in the targets set, so a targets-scoped check would
-- be vacuously 0 every time, and on a zero-target run (already cleaned) the
-- set is empty, so it would pass without inspecting a single row. Scoping to
-- the full five-id set instead asserts the real invariant -- "none of these
-- five listings carries the audit key" -- unconditionally, whether this run
-- stripped any of them or not. This check is NOT skipped on the zero-target
-- path: it is the one assertion that still has something to say there.
DO $$
DECLARE
  stray_audit_count integer;
BEGIN
  SELECT count(*) INTO stray_audit_count
  FROM property_listings pl
  JOIN fix_2575_cleanup_ids ids ON ids.listing_id = pl.id
  WHERE pl.parsed_data ? 'fix2575RollbackAudit';

  IF stray_audit_count <> 0 THEN
    RAISE EXCEPTION 'cleanup-audit-2575: post-condition failed (stray_audit=%). Aborting.', stray_audit_count;
  END IF;
END $$;

COMMIT;
