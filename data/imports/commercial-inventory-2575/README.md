# Commercial inventory acquisition (#2575)

Acquisition, normalization and staging pipeline for **Commercial** inventory.

This directory is deliberately separate from `../udupi-properties-2304/`. That directory is the
#2304 multi-source Udupi import.

⚠ **Corrected 2026-09-15.** This read *"is currently under active correction by **PR #2594**; this
lane must not modify, duplicate or re-derive any file it owns."* **#2594 is merged**, so the
don't-fork-while-open constraint has lapsed. Two files in that directory are now edited by this lane
as ordinary changes to shared code, and both are disclosed rather than slipped in:

- `normalise_v2.py` — one label variant added (`Shop` → `SHOP`), verified non-retroactive against
  both prior captures before adding.
- `pii_residuals.py` — `--dir` made required, `--require-all-layers` added, `PARTIAL` verdict,
  canary-quality guard, and a corrected module header.

The separation still holds for everything else: this lane does not duplicate or re-derive #2304's
artefacts, and imports its taxonomy rather than copying it.

```
API / Apify actor
  → immutable raw capture          (committed, PII-sanitised, never edited in place)
  → source-specific adapter        (adapter_99acres_commercial.py)
  → validation + reject report     (<city>-reject-report.json)
  → staging candidates             (<city>-staging-candidates.json)
  → staging LOAD                   (load_staging_sql.py → <city>-load-staging.sql
                                    → commercial_import_candidate)
  → EXPLICIT promotion             (promote.sql / promote-rollback.sql — WRITTEN and tested)
```

The adapter **cannot** write to `property_listings`. Scraping alone cannot make a listing LIVE
(#2575); promotion is a distinct, explicitly-invoked step.

## Files

⚠ **This table listed ONLY the Udupi artefacts until 2026-09-15**, while the Bengaluru and Mangalore
outputs sat unlisted in the same directory. A "Files" section that silently omits two thirds of the
files is worse than no table, because it reads as complete.

| file | what it is |
|---|---|
| `SOURCE-AND-COMPLIANCE.md` | The issue's required `PLAN_REVIEW` record. ⚠ **Carries a dated SUPERSEDED header** — its body reasons from a pre-acquisition state. |
| `actor-evaluation-2575.md` | Actor reliability/capability measurement and the owner's gate waiver. ⚠ **Its outcome line is struck and superseded.** |
| `adapter_99acres_commercial.py` | Raw capture → staging candidates + rejects. Pure function of its input. Profiles: Udupi, Bengaluru, Mangalore. |
| `test_adapter_99acres_commercial.py` | Regression suite, **33/33**, with controls in both directions. |
| `sanitise_bengaluru.py` · `test_sanitise_bengaluru.py` | PII sanitiser for new captures, **25/25**, incl. row-local identity-value erasure. |
| `load_staging_sql.py` | Staging candidates → `<city>-load-staging.sql` against V136. Emits SQL; opens no socket, imports no driver. |
| `gen_canaries.py` | Builds a corpus-tested canary list from an **uncommitted** baseline. Output uncommitted, mode 0600. |
| `measure_url_identity_scope.py` | Re-derives the retained-name-in-URL scope table. **No arguments**, counts and field names only — the one PII figure a reviewer can reproduce unaided. |
| `<city>-staging-candidates.json` | Generated, per city. Candidates eligible for promotion. |
| `<city>-reject-report.json` | Generated, per city. Every rejected row with its source id, URL, raw label and reason. |
| `<city>-load-staging.sql` | Generated, per city. Explicitly cast INSERTs into `commercial_import_candidate`. |
| `udupi-validation-report.md` · `bengaluru-acquisition-report.md` · `mangalore-acquisition-report.md` | Per-city run accounting, **including what each run does not establish**. The first two carry dated superseded blocks. |
| `staging-load-report.md` | The adapter↔V136 seam, and the six V136 CHECKs proved to have teeth. |
| `promote.sql` | The **explicit** promotion step: staging candidates → `property_listings` as `DRAFT`. Run it deliberately, never as part of an acquisition run. |
| `promote-rollback.sql` | Undoes the promotion (provenance-keyed) and returns candidates to `STAGED`. Leaves the staging rows and the capture intact. |

The staging schema lives in `apps/api/src/main/resources/db/migration/V136__commercial_import_staging.sql`.

## 🔴 WHAT A SWEEP OF THIS DIRECTORY REACHES — AND THE THREE ARTEFACTS IT CANNOT

**Read this before declaring any claim-class closed.** Every phrase sweep on this lane runs over
**files in the tree**. Three artefacts that carry the same claims are **not files in the tree**, so a
tree-based sweep is structurally blind to them and returns a clean result anyway:

| artefact | in a tree sweep? | how to check it |
|---|---|---|
| the files above | ✅ yes | the sweep |
| **the PR body** | ❌ **NO** | `gh pr view --json body`, then enumerate |
| **review / owner comments** | ❌ **NO** | `gh api …/issues/N/comments --paginate` |
| **pushed commit messages** | ❌ **NO** | `gh api …/commits/<sha> --jq .commit.message` — and they are **unfixable**, so a wrong one needs a pointer from a fixable artefact naming it |

**This enumeration exists because the omission happened twice in two reviews.** A tier correction
swept both compliance artefacts and left the PR body asserting the superseded figure in its
**headline line** — in the very commit that wrote up the mechanism. Before that, a "not durable"
sweep cleared the artefacts while a false header stood in the body through three revisions.

**Three rules, all earned:**

1. **After editing, enumerate what REMAINED — never confirm what you ADDED.** A probe built from the
   form you just wrote is blind to the form you did not touch: striking a **bolded** claim and then
   sweeping for the bolded form returned **zero** while nine unbolded sites survived across two files.
2. **Name the artefacts your instrument cannot reach, in the same breath as the result.** A sweep
   that cannot see the body is not evidence about the body, and its silence looks identical to a pass.
3. 🔴 **THE THREE SURFACES ARE PART OF THE CHANGE, NOT A CHECK PERFORMED AFTER IT.**

### Why rule 3 exists: rules 1 and 2 were already written here when the omission recurred twice more

The table above and rules 1–2 were added **in response to** two instances of this class. It then
happened **twice more** — four in total across two agents — and the **fourth landed inside the very
pointer added to fix the third**, in a commit whose own message explains the mechanism.

**So the failure is not ignorance of the surfaces; this document lists them, with the command for
each.** The failure is that **nothing fires the check.** Rules 1 and 2 are both things to do *after*
editing, and "after" is exactly where a step gets skipped by an author who believes the work is done.

**The reframing that closes it:** when a commit changes a **claim**, the PR body is part of **that
commit's change-set** — drafted in the same pass, not audited in a later one.

- Before staging, take the sentence you are changing and ask **where else does this sentence live?**
- Treat `gh pr view --json body` as part of **the diff you are about to make**, not part of the
  review of it.
- **A claim that moved in an artefact and not in the body is an INCOMPLETE CHANGE, not a missed
  check.** The distinction is the whole rule: an incomplete change is visible at commit time; a
  missed check is only visible to whoever reviews you next.

**The tell that it has happened again:** the body *understates* rather than overstates — it keeps the
older, more cautious sentence. That fails conservatively, which is why it survives review after
review, and why it needs a structural trigger rather than more care.

## Promotion

```bash
psql "$DATABASE_URL" <<'SQL'
BEGIN;
SET LOCAL app.import_owner = '<uuid of the owning profile>';
\i promote.sql
COMMIT;
SQL
```

**The surrounding transaction is required, not stylistic.** V135 installs a DEFERRED constraint
trigger over the V102/V104 `commercial_subtype` seam; it asks its question at COMMIT.
`promote.sql` writes the write model and the read model together, so it commits cleanly inside one
transaction — and the identical statements run statement-autocommitted do **not**: the
`property_listings` INSERT would commit alone and the guard would raise. Do not split the file.

Promotion writes `status='DRAFT'`, never `LIVE`. Publishing is a separate step that deliberately
does not live here — scraping alone cannot make a listing LIVE (#2575).

## Verification

⚠ **This section named only the promotion IT until 2026-09-15. There are three**, and a reader who
runs one has verified a third of the chain.

```bash
mvn -f apps/api/pom.xml test -Dtest=CommercialImportPromotion2575IT \
    -DfailIfNoTests=true -Dsurefire.failIfNoSpecifiedTests=true   # 9 tests — promotion
mvn -f apps/api/pom.xml test -Dtest=CommercialStagingLoad2575IT \
    -DfailIfNoTests=true -Dsurefire.failIfNoSpecifiedTests=true   # 8 tests — adapter<->V136 seam
mvn -f apps/api/pom.xml test -Dtest=CommercialPipelineEndToEnd2575IT \
    -DfailIfNoTests=true -Dsurefire.failIfNoSpecifiedTests=true   # 7 tests — capture -> promotion (Udupi, Bengaluru, Mangalore)
```

**Run `mvn clean` first.** Incremental test-compile can report green over stale bytecode, which
makes a suite look like it proved something it never recompiled.

The Python gates are separate and **manual — nothing in CI re-runs them**:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 test_adapter_99acres_commercial.py   # 33/33
PYTHONDONTWRITEBYTECODE=1 python3 test_sanitise_bengaluru.py           # 25/25
PYTHONDONTWRITEBYTECODE=1 python3 measure_url_identity_scope.py        # no args; PII scope table
```

The PII residuals sweep needs two **uncommitted** inputs (a pre-sanitisation baseline and a canary
list), so only its shape layer is reproducible from the tree alone — see
`mangalore-acquisition-report.md` §6.

**Untagged, and with no `-P`** — both deliberate. Surefire includes `**/*IT.java` and excludes the
`integration` group, so an untagged IT runs under a plain `mvn test`. Every `-P` profile in this
pom sets surefire `<skip>true</skip>` and narrows failsafe to a single named file, so this IT run
under any profile would execute **nowhere** and the build would still say SUCCESS. Read the
`Tests run` / `Skipped` totals, not the exit code: `disabledWithoutDocker = true` turns an absent
Docker into a skip, and a skip is not a pass.

## Running it

```bash
PYTHONDONTWRITEBYTECODE=1 python3 adapter_99acres_commercial.py \
    --capture ../udupi-properties-2304/raw-99acres-commercial-output.json \
    --city Udupi \
    --out udupi-staging-candidates.json \
    --rejects udupi-reject-report.json

PYTHONDONTWRITEBYTECODE=1 python3 test_adapter_99acres_commercial.py
```

**The adapter exits 0.** ⚠ This read *"currently exits 1 … `office_precedence: BLOCKED on #2594`"*
until 2026-09-15. **#2594 is merged** (synced here via `6dbc6e9c`), which cleared the block with no
edit in this directory — exactly as designed. Corrected rather than deleted, because the mechanism
in §1 below is the reason this lane imports instead of copying.

## Two things that will trip you up

**1. The adapter imports from `../udupi-properties-2304/`.** `normalise_v2.py` (the subtype
mapping) and `pii_filter.py` (the contact detectors) are imported, never copied. Copying would
fork the canonical taxonomy, which #2575 forbids.

⚠ **HISTORICAL — and the clearest evidence this arrangement works.** Before #2594 merged, five
office listings mapped to `BUILDING` instead of `OFFICE`, and the adapter **refused to report a
clean run** rather than working around it. On merge the corrected precedence arrived
**automatically, with no edit here**, and those five rows became `property_type='commercial'` /
`OFFICE` — moving them inside V135's guard scope. A local workaround would have hidden the
dependency and made the merge untestable.

**2. ⚠ THIS SECTION IS FALSE AS ORIGINALLY WRITTEN — corrected 2026-09-15.** It read: *"There is no
Bangalore profile, and that is deliberate. `profile_for("Bengaluru")` raises … Bangalore is blocked
on acquisition."*

**A Bengaluru profile exists**, and so does a Mangalore one (`PROFILES`,
`adapter_99acres_commercial.py`). `profile_for("Bengaluru")` does **not** raise, Bangalore was
acquired under the owner's 2026-09-15 source approval, and **32 Bengaluru + 18 Mangalore rows are
staged**.

**The principle that sentence protected is unchanged and still binding:** area resolution needs
**evidenced** bounds, so every profile's envelope is parsed from V71's own seeded rows — never
invented. Fabricating bounds would fabricate coordinates, which is what this issue forbids. The
profiles were added when evidence for them existed, not when they became convenient.

## Privacy

The committed captures are PII-sanitised upstream by `../udupi-properties-2304/sanitize_pii.py`.
The adapter re-checks with `assert_no_pii()` and **fails closed** rather than trusting that the
upstream sweep ran. On a finding it prints JSON **paths and hit counts only** — never the matched
value, which would put contact data into the very transcript the gate exists to keep clean.

Any new capture must go through the same sanitiser **before** being committed.
