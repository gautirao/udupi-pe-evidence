# Issue #2575 — OFFICE→BUILDING correction runbook

**This directory now contains three SQL scripts that mutate live production data. None of them
has been executed against any database other than a throwaway Testcontainers instance.
Deployment and execution are the owner's, not this lane's.**

Read this file before running anything. It is the operator-facing companion to the scripts;
where it and a script's own header differ, **the script header wins** — it is what you are
looking at when you execute.

---

## What went wrong

Five 99acres listings were imported as `property_type='commercial_building'` /
`commercial_subtype='BUILDING'` when they are offices.

The root cause is in `normalise_v2.py`: `map_commercial_subtype` consulted the coarse
`PROPERTY_TYPE_TO_SUBTYPE` fallback *before* the explicit raw-label map, so its own OFFICE
entries were unreachable. Both office labels ("Ready to move office space", "Bare shell office
space") short-circuited to `BUILDING`.

The correction is forced rather than chosen: **only `listing_commercial_space_details` (lcsd)
carries a `commercial_subtype` column.** `listing_commercial_building_details` (lcbd) does not.
An OFFICE listing routed through the lcbd path is structurally unrepresentable, so the flat
columns *and* the detail row must move.

The five affected 99acres ids:

    M91395690   Z59660870   D90432306   U90462182   W88736208

Their listing UUIDs are derived in-script as `(md5('99acres:' || id))::uuid`, matching
`import.sql`'s own identity derivation. Never paste pre-computed literals: a transcription slip
in a derived id is visible in the source text, whereas a wrong literal silently shrinks the
matched set.

---

## The three artefacts

| Script | Lines | Statements | `DO $$` blocks |
|---|---|---|---|
| `fix-office-subtype-2575.sql` | 376 | 13 | 4 |
| `fix-office-subtype-2575-rollback.sql` | 306 | 11 | 2 |
| `cleanup-audit-2575.sql` | 322 | 9 | 4 |

**10 `DO $$` blocks in total.** They are not incidental: they *are* the safety mechanism — the
state gates deciding whether a step runs, and the post-condition assertions deciding whether the
transaction commits. `pglast` parses these files clean while treating every `DO $$` body as an
opaque string, so static validation says nothing about any of them.

The forward script also writes a `fix2575RollbackAudit` object into `parsed_data` on the five
rows, holding the pre-image the rollback needs. It carries 14 keys; the rollback reads all 14
(machine-checked, both set differences empty). `parsed_data` is anon-readable, which is why
cleanup is mandatory rather than optional — see below.

---

## Execution order

    1.  fix-office-subtype-2575.sql        (forward correction)
    2.  an owner-determined soak period, elapsed in full
    3.  cleanup-audit-2575.sql             (mandatory final step)

`fix-office-subtype-2575-rollback.sql` is run **only** if the correction must be undone, and
**only before** step 3.

### Cleanup is mandatory, and it is soak-gated

`cleanup-audit-2575.sql`'s own header (lines 36-47) is the authority on this and states it in
full. Deliberately not restated here — two copies of a subtle rule drift, and this lane already
had one such pair go wrong. In summary:

- It is a **mandatory** final step, not an optional follow-up. The audit blob it removes is
  anon-readable and must not linger.
- It is **not** run immediately after the forward correction.
- The soak duration is the owner's call. The script neither specifies nor enforces one.

### Cleanup is irreversible with respect to rollback

Once cleanup clears the audit key, the rollback script's target predicate
(`parsed_data ? 'fix2575RollbackAudit'`) **no longer matches these rows at all**. Rollback does
not become harder; it becomes impossible. The pre-image distinguishing "this lcsd row pre-existed"
from "the correction created it" lives only in that payload.

Run cleanup only when confident no rollback will ever be needed. The script carries no override
switch and will not make that decision for you.

### Cleanup refuses three ways before it deletes anything

Because it is the irreversible boundary, cleanup is gated at least as tightly as its siblings, not
more loosely. In order, and all fail-closed — the script's own header is the authority:

1. **Identity + existence + provenance.** The five derived ids must resolve to exactly five rows
   carrying the `#2304` / `99acres` import provenance. **A zero count aborts.** It does not read as
   a clean idempotent re-run: against a wrong database, a restored snapshot or a deleted dataset
   every join-derived counter degrades to zero, and without this gate the script would COMMIT
   reporting success while the anon-readable blob sat untouched on the real database. This gate
   carries the entire wrong-database burden.
2. **Audit-key cardinality, 0 or 5.** Tells a first cleanup from a re-run, and does nothing else.
   A count of 1–4 aborts as partial state. **A count of 0 is not an error** — gate 1 has already
   proven the rows are present, so 0 can only mean the keys are genuinely gone. It reports a
   NOTICE and no-ops. Do not re-widen this into the existence check; that conflation is what let a
   wrong-database run report success.
3. **Post-forward drift.** Reached only when a payload actually exists to destroy. All five must
   be fully corrected — `commercial`/`OFFICE`, an `OFFICE` lcsd projection, no stale lcbd row.
   Drift aborts with **all five audit payloads preserved**.

### What cleanup does after a rollback

**It exits cleanly and reports that there is nothing to clean. It does not raise.**

`forward → rollback → cleanup` is a sanctioned sequence, and the rollback's own Step 4 already
clears the audit key from every row it reverts — so by the time cleanup runs there is no payload
left to remove. Gate 1 confirms the five rows are still present, gate 2 finds zero keys and
no-ops, and gate 3 is not reached.

An earlier ordering ran the drift check *before* the cardinality check, and so raised on this
path: the rolled-back rows are back at `commercial_building`/`BUILDING`, which the drift check
read as drift. That abort bought no safety and taught something false — that this script raises
on healthy paths. An operator who has seen it cry wolf on a prescribed sequence discounts the
next abort, which is the real one.

**The single property this ordering gives up:** a state that is *both* drifted *and* keyless now
exits clean rather than aborting. That is deliberate. With zero payloads cleanup has nothing to
protect and nothing to do, so "nothing to clean" is truthful; detecting unrelated drift is not
this script's job. Do not re-add a drift check ahead of the cardinality gate to recover it.

---

## What has actually been executed, and by what

`OfficeSubtypeCorrection2575IT` is the only thing that has ever executed these scripts. It runs
the **shipped files** from disk — not copies pasted into test resources, which would keep passing
after someone narrowed the real script — against a Testcontainers PostgreSQL instance.

    mvn -f apps/api/pom.xml test -Dtest=OfficeSubtypeCorrection2575IT

**Untagged, and with no `-P` profile flag.** Every profile in this `pom.xml` skips surefire and
narrows failsafe to other named files, so under any profile this IT runs *nowhere* while the
build reports success.

### Coverage: 25 `@Test` methods = 24 discriminating + 1 consolidation

The raw count of 18 would overstate it. The consolidation is
`forwardScript_capturedSet_isPopulatedOnFirstRunAndEmptyOnRerun`, which restates in one method
two properties already asserted separately elsewhere. It was kept for regression locality (a
`fix_2575_captured` regression now fails an assertion named for it) and because that set is the
newest, least-reviewed code in the three scripts — not because it adds coverage.

Every gate and post-condition is exercised by planting a violation and observing the abort.
An assertion never observed failing is decoration, so the expected message text was in every case
**captured from observed runtime output**, never transcribed from the SQL source — the source
contains `%` placeholders that only become numbers at execution.

### Two findings worth carrying

**Trigger-bypass guards (bounded claim).** The *absence* branches of `bad_lcsd_count` and
`missing_lcsd_count` — the ones that fire when an expected lcsd row is gone — cannot be reached
through normal DML *while V135's trigger on `listing_commercial_space_details` is enabled*: that
trigger has no `WHEN` clause and rejects the corrupting DELETE at its own commit. They are **not**
dead assertions: under `session_replication_role = replica`, which bypasses user triggers and is
routine in bulk loads, restores and replication apply, **both fire**. Not covered by either arm:
`bad_lcsd_count`'s eight-column value-comparison branch, which V135 cannot police at all
(`assert_commercial_subtype_projected` compares only `commercial_subtype`) and which the
rollback's own Step 3 restore pre-satisfies.
*Assumptions named: V135 enabled, single transaction, no replication apply, no disabled triggers.*

Note which trigger this is. V135 defines **two**: one on `property_listings` **with** a `WHEN
(NEW.property_type = 'commercial' AND ...)` clause, and one on
`listing_commercial_space_details` **without** one. Only the second is unconditional, and it is
the one meant here. Getting this wrong invites the generalisation that *V135 protects the lcsd
payload* — it does not: the assert function compares `commercial_subtype` alone and is blind to
the other seven columns, so an ordinary `UPDATE` of any of them commits cleanly.

**Reset proof vs inference.** Both bypass arms end with a check that
`session_replication_role` was reset on the *same physical connection* before release.
`rollbackScript_lcsdDeleteUnderReplicaMode_raisesBadLcsdCount` is **proof** — the assertion was
observed failing when the reset was deliberately neutered.
`forwardScript_lcsdDeleteUnderReplicaMode_raisesMissingLcsdCount` is **symmetric by reading**;
its falsifiability is inferred, not demonstrated. The distinction is deliberate and should not be
collapsed.

---

## What this runbook does not cover

- **`import.sql` is not regenerated.** It still encodes the pre-fix mapping for these five ids.
  Verified by grep: it contains zero `DO UPDATE` and zero `EXCLUDED` assignments — all 104
  `property_listings` inserts are `ON CONFLICT (id) DO NOTHING` — so **re-running it cannot revert
  these rows**. The narrow residual risk is delete-then-reimport, which would restore the pre-fix
  shape. Regenerating from the fixed `normalise_v2.py` is the durable resolution and is
  deliberately out of scope here.
- **No staging schema, no promotion path.** Deferred to a follow-up.
- **The scripts have never run against production.** Every result in this file comes from a
  throwaway container.
