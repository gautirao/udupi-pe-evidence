# Mangalore Commercial acquisition — issue #2575

Third city acquired under the owner's ruling `5680529409` point 4 ("around Udupi" satisfied by
Mangalore/Kundapur runs). Measured, not narrated: every figure below came from a command whose
output is reproducible from the committed artefacts.

## 1. Run

| | |
|---|---|
| actor | `memo23/99acres-property-scraper` |
| run id | `eNBc0TvOJtWtIr6Mk` |
| dataset id | `L84eUdt16eM4GxykL` |
| input | `city=Mangalore`, `searchMode=commercial`, `maxItems=100`, `enrichEmails=false` |
| status | SUCCEEDED, 100 rows |
| cost | **$0.25005** |

`enrichEmails` was asserted **false on the wire**, not assumed from the schema default. A default
is a claim about the actor; it is not a claim about the request that was actually sent. Enabling it
would add `contactEmail`, `contactWebsite` and an `emailEnrichment` object — precisely the contact
data the sanitiser exists to strip.

Cost matches the actor's own `pricingInfos` exactly: 100 × $0.0025 + $0.00005 start = $0.25005.
The figure is quoted only because it equals the model; a partial settle reads lower.

## 2. The city value was verified, not assumed

`city` is a free `textfield` with no enum, resolved server-side by 99acres. An unrecognised value
therefore **succeeds and returns nothing** rather than erroring. So the check is made on output:

- `city` = `Mangalore` on **100 of 100** returned rows — checked on every row, not sampled.

### Kundapur is not obtainable from this source

Recorded here because a future reader will otherwise assume it was merely skipped.

| city value | searchMode | rows |
|---|---|---:|
| Kundapur | commercial | 0 |
| Kundapura | commercial | 0 |
| Kundapur | buy | 0 |
| Kundapura | buy | 0 |
| **Mangalore (positive control)** | **buy** | **5** |

Two zeros under `commercial` had two indistinguishable readings — the value does not resolve, or it
resolves with no commercial inventory. Re-running under `buy`, where residential inventory in a town
that size is near-certain, plus a known-good city as a control, forecloses the third reading that the
probe itself was broken. **The value does not resolve at 99acres**, and it is not a spelling problem:
both spellings were tested. Cost: **$0.0002 for the four zero-row probes — but $0.01275 for the
proof**, because the fifth row of the table above is a 5-row Mangalore run at $0.01255, and that
control is what forecloses "the probe was broken". ⚠ An earlier revision quoted the $0.0002 alone,
which understates the cost of the proof by roughly 64× **by excluding the one run that makes it a
proof rather than an unexplained zero** — the single number in this PR that undercut its own
doctrine. The headline $0.51285 was always right and only reconciles with that run counted:
2 × $0.25005 + 4 × $0.00005 + $0.01255.

Consequence: ruling 4 is **half-satisfied**. Mangalore delivered; Kundapur cannot be delivered at any
price from this source. The coverage boundary sits between Udupi (resolves) and Kundapur (does not).

## 3. Coordinate trust — the figure the run was bought for

**46 trusted / 54 untrusted of 100 = 46.0%**, computed with the adapter's own
`coordinate_trusted_rows`, never a re-implementation. Identical on the sanitised capture (46/54), so
the figure is not an artefact of measuring unredacted data.

| city | market size | trust |
|---|---|---:|
| Udupi | small | 29% |
| **Mangalore** | **mid** | **46.0%** |
| Bengaluru | large | 81% |

Monotonic in market size, landing between the two rather than near either — which weakens both
available stories. "Udupi is uniquely hard to geocode" is weakened, since a neighbouring coastal city
in the same region also degrades badly; "the source geocodes fine" is weakened too, since 46% is
nowhere near 81%. Consistent with a source that degrades as market density falls.

**Consistent with, not proof.** Three points, and market size is confounded with coastal-versus-inland,
listing volume and dealer professionalism. It is a hypothesis.

**A prediction was stated before the Kundapur run and remains UNTESTED.** If market size drives the
effect, Kundapur should return at or below 29%; 60%+ would kill the size story. Kundapur cannot be
measured from this source, so the prediction is neither confirmed nor refuted. It is recorded open
rather than quietly retired, and the Mangalore result is **not** claimed as support for it.

## 4. Yield — measured, not bounded

**18 staged / 82 rejected** of 100 fetched.

| reject reason | n |
|---|---:|
| coordinate_untrusted | 54 |
| area_unresolved | 14 |
| ambiguous_or_missing_type | 6 |
| out_of_geography | 3 |
| unsupported_area_unit | 3 |
| not_commercial_family | 2 |

Subtypes staged: **OFFICE 11 · SHOP 4 · LAND 2 · WAREHOUSE 1**.

**BUILDING remains 0.** Four of five subtypes now carry inventory across three cities; an assertion on
BUILDING still passes by having nothing to examine. Volume does not fix this.

**Sale-only for the third time.** `transactionType` is `{'Sale': 100}`, as it was for Udupi and
Bengaluru. Three captures make this a property of what `searchMode=commercial` returns from this
source, not an accident of one city: **no number of additional 99acres runs will populate the Rent
contract**, which remains proved only against rows labelled SYNTHETIC.

### Area coverage is the binding constraint here

Mangalore has **8 seeded areas** (`IN|KA|Mangalore|*`, V71), **zero degenerate** — contrast Bengaluru,
where 68 of 308 have `min == max` on an axis and can contain no coordinate at all. But 8 boxes of
roughly 0.02° × 0.03° is thin coverage, and 14 rows rejected as `area_unresolved` inside the city
envelope are the direct cost. Widening the boxes would fabricate geography.

## 5. Taxonomy changes

- **`Commercial Showrooms` → `commercial`/`SHOP`** — no change made. It was already mapped in merged
  `normalise_v2.py`. An instruction to reject it as unmapped was withdrawn once checked: it conflated
  the actor's *input filter* vocabulary with the source's *output label* vocabulary.
- **`Shop` ×3 → `SHOP`, added.** A bare string variant of `Commercial Shops`; same concept, so this is
  normalisation. **Verified non-retroactive before adding**: the exact label occurs **0 times** in both
  prior captures (which carry `Commercial Shops` 21 and 5 times), so no already-staged row changes
  classification and the 11 Udupi / 32 Bengaluru counts are untouched. Asserted in the suite, with a
  positive companion proving those captures were genuinely read.
- **`Co-working office space` ×1 → rejected as unmapped.** A distinct commercial product, not an office.
  Folding it into OFFICE by resemblance would be a product judgement wearing normalisation's clothes.

The line: a **string variant of an existing concept** is normalisation; a **new concept** is a taxonomy
decision and stays visible as a reject.

### A guard documented as dead turned out to be live

`unsupported_area_unit` rejected **3 real Mangalore rows**. Its committed comment read "currently
unreachable (all 100 rows in the committed capture are areaUnit 'sqft')" — true of Udupi and
Bengaluru, false here. The comment has been corrected to state the measured count.

## 6. PII

### 🔴 TWO DISTINCT CLASSES OF EXPOSURE — stated as two, because they are not one problem

Required by owner ruling **`5683862755`** (2026-09-15T16:18:47Z), which directs that this pipeline
**not claim the PII sanitisation removes all names from every retained field**, and that
structured/contact PII removal be distinguished from residual source-provided identifiers embedded
in URLs. This report previously blurred them; they are separated here before any figure is quoted.

| | class 1 — structured / contact PII | class 2 — residual source-provided identifiers in URLs |
|---|---|---|
| **what it is** | `dealerName`, `companyName`, `builderName`, `description`, `reraId`, plus phone/e-mail shapes in free text | **human-readable name fragments inherited from the source**, in `source_url` and `url`/`images` — the row's own retained `projectName`/`buildingName` |
| **status** | **REMOVED** — field denylist + shape detectors, each proved load-bearing by a negative control | **RETAINED BY DECISION** — kept deliberately for provenance and auditability |
| **why** | contact data has no provenance value | `coordinate_trusted_rows` consumes these fields, and the URL is the audit trail back to the source |
| **scope** | 0 identity fields, 0 contact shapes across all three captures | **35 / 300 capture rows, 20 staged** — the final measured scope |

**Class 1 is solved. Class 2 is a knowing policy choice, not a defect under repair.** Any sentence
that reads as "the PII was removed" without that split is **false as to class 2**, and the
remediation and query rules must stay honest about the asymmetry.

**Operative constraints from the ruling:** `images` is **not** the remedy and must not be presented
as one; source URLs must **never be silently rewritten**, because that destroys source provenance;
and the disclosure must carry the **final** measured scope above, never one of the earlier narrower
counts this report corrected three times.

---

The sweep was run with **all three layers** — shape detectors (always on), the row-keyed **name
invariant** (`--baseline`), and the **literal canary** layer (`--canary-file`). `--dir` is the
sweep's *target*, not a layer; counting it as one is the miscount being corrected here, flagged by
three successive reviewers in this file. The current run covers **28 files as of `49e6129d`+, 74 rows
under the name invariant, 81 corpus-tested canaries. 0 findings.**

⚠ **"ALL THREE LAYERS" DESCRIBES THE RUN, NOT ITS REACH — and the three do not reach equally.**
Measured at `6983cbd4` by enumerating what `baseline_index` actually indexes, rather than by reading
the flag that was passed:

| layer | files reached | the limit |
|---|---|---|
| shape detectors | **28 of 28** | pattern-based, so city-independent — no per-city blind spot, **but the RULE is not uniform across those 28.** `pii_residuals.py:293` passes `bare_digits=fn.endswith(('.py','.sh'))`, so `.md` and `.sql` are swept **without** the unseparated-10-digit rule — the rule §6 credits with catching exposure class 1. That includes `mangalore-load-staging.sql`, which this report calls a vector rather than merely a capture. The justification is real and sits in the code: generated artefacts are a pure function of the JSON, and the JSON **is** swept strictly (`:269`, default `bare_digits=True`). Recorded because a table whose purpose is naming each layer's limit is the one place that asymmetry must not be silent. |
| literal canary | **28 of 28** scanned | but its LITERALS are harvested from the Mangalore baseline only, so Udupi and Bengaluru identities are not among the values being sought |
| row-keyed name invariant | **1 of 28** | `baseline_index` keys per FILENAME, and the baseline directory holds only `raw-99acres-commercial-mangalore.json` |

So **7 JSON files carry no name layer at all**: both Udupi artefacts, both Bengaluru artefacts, the
Bengaluru capture — **and Mangalore's own `mangalore-staging-candidates.json` and
`mangalore-reject-report.json`**. The file holding the promotable rows is name-layer-blind *even for
the city the baseline came from*, because only the capture's filename matches the index key.

This is the same shape as the fourth correction below, which exists precisely to say the class is
**not** Mangalore's — while the strongest layer was only ever pointed at one Mangalore file.
`PASS (0 residuals, all 3 layers)` is true of the run and **silent on that reach**; it must not be
read as three-city coverage of the name class. Closing it needs one baseline entry per capture
filename, which needs the uncommitted pre-sanitisation copies of the Udupi and Bengaluru captures.

⚠ **THE FILE COUNT IS DATED ON PURPOSE — quoting it bare has expired three times already** (25 → 26 →
27 → 28), each time because a later commit added a file to the swept directory: `gen_canaries.py`,
then `measure_url_identity_scope.py`, then revisions of this report. **Re-run the sweep instead of
quoting this number.** The canary count is different in kind: re-derived against the larger corpus it
is unchanged at 81, because the corpus test rejects only candidates occurring in `.py`/`.md`/`.sh` and
neither committed script carries a captured value — measured, not assumed inert.

This paragraph said "25 files, 66 canaries" until those figures expired underneath it: `gen_canaries.py`
and this report's own later revisions entered the swept directory, and the canary list was rebuilt
after its generator was fixed twice. **A cited sweep covers only the files that existed when it ran** —
the same lesson recorded elsewhere in this PR, where an earlier cited run covered 25 of the 26 files
its own commit contained.

Two real problems were found on the way there, both by layers that had never run before:

1. **Identity surviving in URLs.** The field denylist dropped `builderName`, while the same value
   persisted inside `images[0..4]` on one row (5 URLs). The field layer saw the field was gone; the
   shape layer hunts phone/e-mail patterns. **The two-layer sweep reported 0 findings on that same
   file.** Fixed by adding a row-local, value-driven identity-erasure layer, with a negative control
   proving the residue survives when the layer is disabled and a discrimination control proving an
   unrelated URL is left intact.
2. **A real builder name committed into source.** The docstring documenting the fix above quoted the
   actual company name from the capture — a live identity written into the very function built to
   erase it. The canary layer failed the run and named the file. Replaced with a synthetic example;
   **no exemption was added**, because an exemption list is how a fail-closed gate stops being one.

### Known limitation, stated because a passing sweep would otherwise imply more than it measured

**An earlier revision of this section was wrong twice over, and is corrected here rather than amended
quietly.** It said a *third-party* business name, "matching none of its own identity fields", was
unreachable by row-local erasure, and that dropping `images` would close the class deterministically.

**It is not a third-party name.** Measured per row:

| row | image URLs | redaction markers | what the slug matches |
|---|---:|---:|---|
| `411487` | 5 | **5** | its own **retained `projectName`** — erased only because the *dropped* `builderName` shares the string |
| `439814` | 2 | **0** | its own **retained `projectName`** — no dropped field matches, so nothing fired |

**THE STRUCTURAL CLAIM, which holds regardless of any count: dropping `images` would NOT close the
class.** Two independent reasons:

- **`source_url` is never scrubbed by any layer.** The denylist is `dealerName · companyName ·
  builderName · description · reraId`; URLs are touched only incidentally, by row-local value erasure.
- **`buildingName` and `projectName` are KEPT DELIBERATELY** — `normalise_v2.coordinate_trusted_rows`
  consumes them, and the sanitiser suite asserts they survive. Both are carried into `raw_payload`.

So with `images` dropped entirely the name would remain in `source_url` and in two deliberately-kept
fields. **That remedy is withdrawn.**

**The erasure is also weaker than claimed.** On `411487` the value was scrubbed from the image URLs
while **the identical value remains in `projectName` on the same row**. That redaction is substantially
cosmetic. This layer closes *"a **dropped** field's value reappearing elsewhere in the row"*; it does
not and cannot close *"a **retained** field's value appearing in a URL"* — a deliberate policy
position, not an implementation gap.

**SCOPE — CORRECTED FOR THE THIRD TIME, and the instrument is the story.** An earlier revision of
this paragraph said "at least 1 row and 2 committed files", and that the slug appeared in **0** rows
of the candidates and reject reports. **That was wrong.** It came from a variant list I hand-built
from the one token I had already seen. Re-measured by seeding the sanitiser's **own**
`_identity_variants` from each row's retained `projectName`/`buildingName` — the canonical carrier
this very section names — the picture is:

| artefact | rows carrying a retained name in a **URL field** |
|---|---:|
| `mangalore-staging-candidates.json` | **11**, in `source_url` — **staged, therefore promotable** |
| `mangalore-reject-report.json` | **9**, in `source_url` |
| `raw-99acres-commercial-mangalore.json` | in `url` / `images` |
| `mangalore-load-staging.sql` | 101 occurrences across variant forms |

### FOURTH CORRECTION — THIS IS NOT A MANGALORE PHENOMENON

Every revision above, the third correction included, framed this class as Mangalore's. **It is not.**
The identical unbiased query — variants seeded from each row's **own** retained
`projectName`/`buildingName` through `_identity_variants`, searched across every URL-bearing field of
every row — run over **all three** captures:

| city | capture rows with a retained name in a URL field | staged rows affected |
|---|---:|---:|
| Udupi | 2 / 100 | **2 / 11** |
| Bengaluru | 13 / 100 | **7 / 32** |
| Mangalore | 20 / 100 | **11 / 18** |
| **total** | **35 / 300** | **20 staged** |

**Udupi and Bengaluru carried this before Mangalore existed**, in artefacts committed earlier. This
acquisition did not introduce the class; it made it visible. And the consequential detail for the
promotion decision: **2 of the 11 coordinate-trusted Udupi rows the owner ruled to promote** are among
the affected staged rows.

**Why the earlier city-scope statement was wrong is the same failure as the earlier row-scope
statement.** Udupi and Bengaluru had been checked only with a **suspicious-slug regex heuristic**,
which returned 0 for both — never with the `_identity_variants` anchor. A weaker instrument produced a
clean result on the other two cities, that result agreed with what I expected, and it therefore went
unexamined. **A measurement that confirms your prior is the one that needs the most scrutiny, not the
least.**

⚠ **THREE DIFFERENT QUANTITIES IN THIS REPORT ARE ALL "20", and conflating them changes the answer.**
The promotion question turns on which is meant: **20 / 100** is Mangalore *capture* rows carrying a
retained name in a URL field; **11 + 9 = 20** is Mangalore *artefact* rows affected, staged **plus**
rejected, one city; **20 staged** is the three-city total of staged rows (Udupi 2 + Bengaluru 7 +
Mangalore 11). Only the last is promotion-relevant. The coincidence is arithmetic, not meaning —
re-derive any of them with `measure_url_identity_scope.py` rather than reading a number off prose.

**Four committed files, and 11 + 9 = 20 Mangalore ARTEFACT rows** (staged **plus** rejected) —
**numerically equal to, but NOT the same quantity as**, the 20 / 100 Mangalore *capture* figure.
⚠ An earlier revision of this sentence said one "is exactly" the other, asserting the precise
conflation this section forbids six lines above. It was the fifth stale spot found on this PR, and
it sat exactly where a reader lands when checking promotion scope — a rule and its violation in the
same artefact, twenty lines apart. The earlier non-reproduction was a
property of the instrument, not of the data: the *display* form (with spaces) really does occur in
only two files, while it is the **hyphen/underscore slug** form that travels into `url` /
`source_url` and onward into the SQL.

**`source_url` IS A FIRST-CLASS V136 COLUMN.** So the earlier characterisation — "inside
`raw_payload`, so a staging load would write it into `commercial_import_candidate`" — understates
the vector: it also lands in the **`source_url` column** of **11 staged, promotable rows**.

**One caveat on the measurement above, stated so nobody quotes the larger number.** The probe seeded
variants from every row and searched every row, so a hit confined to `buildingName`/`projectName` is
a row's own name matching itself and is vacuous. **Only the URL-field hits are the finding** — which
for Mangalore is the **20 / 100 capture** figure, and across all three cities is **35 / 300 capture
and 20 staged**. Both are named explicitly because a bare "the 20" reads as whichever of this
report's three 20s the reader arrived with.

**NO CENSUS OF BUSINESS NAMES IN URLs HAS BEEN RUN, so the class size is unknown.** What *is* measured:
**20 of 100 rows** carry a retained `buildingName`/`projectName` inside a URL field. **That is not 20
leaks** — it is the same value this policy keeps in a field, also appearing in that listing's URL, so
there may be **no incremental exposure beyond what retaining the field already represents.**

**The sweep is blind to this class by construction** — the name layer compares against *dropped*-field
values and the canaries derive from those same fields, so a value carried by a *retained* field is
outside what either can see. `PASS (0 residuals, all 3 layers)` is true of what it measures and silent
on this. No personal name, phone number or e-mail is involved: this is a company name, outside the
stated PII rule and inside this pipeline's own stricter denylist.

**Owner ruling: keep `images`, disclose.** Recorded as taken knowingly — and noting that the
alternative put to the owner was **ineffective**, which was not known when the ruling was first made.
The recommendation, the override, and the fact that the analysis underneath it was faulty are all
recorded rather than a version in which everyone agreed.

### Re-affirmed on the corrected scope — DURABLE, owner ruling `5683862755` (2026-09-15T16:18:47Z)

The first ruling predated the three-city measurement, and that gap was flagged here rather than left
implicit. **It is now closed.** The owner re-ruled with the corrected facts in front of them — **and
this enumeration stops where the decision prompt stopped**:

- **2 of the 11** coordinate-trusted Udupi rows authorised for promotion carry a retained name in
  `source_url` — a first-class V136 column, not `raw_payload`
- the **name-invariant layer reaches 1 of 28 swept files**, including blindness on the file holding
  the promotable rows, for its own baseline's city

⚠ **AND NOTHING BEYOND THOSE TWO — an earlier revision of this list overstated it, and the correction
matters more than the list.** That revision also named the **canary-vocabulary limit** (literals
derived from the Mangalore baseline alone) and the **shape-rule asymmetry** (`.md`/`.sql` swept
without the unseparated-10-digit rule). Both were surfaced in the same turn, but **neither formed part
of the decision prompt**, so **neither is accepted by this ruling.** They remain open disclosures,
stated in §6 and unchanged by anything here.

Recording the owner as having ruled with limits they were never shown would be **broader and tidier
than the truth** — the precise overstatement class this report exists to catch. **Narrower and true
beats broader and tidy**, and where two relayed accounts of a decision disagree, the narrower one is
the safe record: understating is recoverable by widening, **overstating an authorisation is not.**

🔴 **THE COMMIT MESSAGE OF `d8af14a1` CARRIES THE OVERSTATEMENT AND CANNOT BE FIXED.** It states, as
fact, that the owner re-ruled with *"the canary layer scanning 28/28 with a Mangalore-derived
vocabulary, and the .md/.sql bare-digit asymmetry"* in front of them. **That is false as to the
decision prompt**, and a pushed commit message cannot be edited without a history rewrite, which is
not authorised here. **This paragraph is the pointer that contradicts it** — an unfixable artefact
stands uncontradicted in the history unless a fixable one names it. Anyone reading `d8af14a1`'s
message should read this section instead.

**How it happened, recorded because the mechanism matters more than the instance.** The four-item
enumeration came from a **relayed** account of a conversation I did not witness, and I wrote it into a
commit message **as fact rather than as a relay**. A reviewer's superseded prescription had specified
the same four items and was implemented faithfully; that reviewer has since corrected itself and
called the lane blameless. **It is not entirely blameless.** Labelling a relay as a relay is the
author's job, and had I done it, the claim would have been recoverable without needing a pointer like
this one.

**Ruling 6 stands unchanged. Promotion scope remains all 11 Udupi rows, the 2 affected included, and
they go live with identity in `source_url` knowingly.**

⚠ **This is a limit KNOWINGLY ACCEPTED — not a finding withdrawn, not a concern resolved, not a
reviewer satisfied.** Nothing in §6 is softened by it. The ruling changes what is **authorised**, never
what is **true**, and the only thing withdrawn remains the **remedy** (dropping `images`), for the
structural reason stated above.

### NOW DURABLE — owner comment `5683862755`

⚠ **An earlier revision of this block said "NOT YET DURABLE — no top-level owner comment records
this" and cited no id "because none exists to cite". That was true when written and is now false.**
The owner posted **`5683862755`** at **2026-09-15T16:18:47Z**, which **supersedes the chat-only
re-affirmation and is the durable record.** Recorded as the ruling itself directs: a ruling was
taken in session, and **until that comment it was not durable** — several reviewers correctly
declined to treat it as such, and they were right to.

**The owner's own precision note confirms the narrowing above**, independently of my reasoning: the
prompt named the 2-of-11 `source_url` overlap and the name-invariant layer's 1-of-28 reach, and it
**did not** name the `.md`/`.sql` bare-digit asymmetry. No artefact may state that it did.

**What the durable ruling requires of this pipeline:**

- **KEEP the affected source URLs** — retained for provenance and auditability, as an **intentional
  provenance-retention decision**, not an oversight.
- **Never silently rewrite a source URL**; doing so destroys source provenance.
- **`images` is not the remedy** and must not be presented as one — consistent with the structural
  argument above.
- **Do NOT claim the PII sanitisation removes all names from every retained field.** It does not.
  **Structured/contact PII removal** (the denylist and the shape detectors) is a different thing from
  **residual source-provided identifiers embedded in URLs**, and the two must stay distinguished
  wherever either is described.
- **The disclosure must reflect the FINAL measured scope** — 35/300 capture rows, 20 staged across
  three cities — never any of the earlier narrower counts.

**CONDITIONS ON PROMOTION — all four must be COMMITTED AND VERIFIED first:**

1. the corrected disclosure
2. the canary guard
3. the Mangalore IT arm
4. the final measured scope

⚠ **DECISION REQUIRED — condition 3 has two readings, and they differ exactly where this ruling
bites.** Raised rather than resolved, because only the owner can say which was meant.

- **Reading A — the STAGING arm.** `CommercialStagingLoad2575IT.mangaloreLoadApplies()` exists,
  applies the generated Mangalore load, and asserts 18 staged / 82 rejected plus the
  `unsupported_area_unit` reason only Mangalore exercises. **Committed.** It predates the ruling
  rather than being written for it.
- **Reading B — Mangalore carried through PROMOTION.** **No such test exists, and none is claimed.**
  §5.1 and the PR body both state that Mangalore is proved only as far as **staging**.

The two readings matter because the rows this ruling is about — the **2 of 11 in `source_url`** — are
**Udupi**, while the untested path is **Mangalore's promotion**. Reading A is satisfied today;
reading B is not, and satisfying it would need a new test.

**WHAT A REVIEWER CAN AND CANNOT CHECK — recorded so any adjudication rests on a known basis, and
because the pattern is uncomfortable: the conditions whose evidence sounds strongest are the ones a
reviewer cannot reproduce.**

| # | condition | reviewer reach |
|---|---|---|
| 1 | corrected disclosure | **FULLY VERIFIABLE** — committed prose, independently confirmed |
| 2 | canary guard | **SPLIT** — the guard's code and logic are inspectable; that it runs clean is **lane testimony**, because `--canary-file` is an uncommitted 0600 list, correctly so |
| 3 | Mangalore IT arm | **SPLIT** — the arm is committed and inspectable; its **execution** is lane testimony (no Maven or Docker on any reviewer, and `disabledWithoutDocker = true` turns an absent Docker into a silent skip) |
| 4 | final measured scope | **FULLY VERIFIABLE** — `measure_url_identity_scope.py` takes no arguments and reads no uncommitted input; anyone with the repository reproduces 35/300 and 20 staged |

**A route to lifting condition 2 out of testimony, not taken here:** a committed test that builds a
**synthetic** corpus with synthetic literals and asserts the guard's exit codes — 2 on a
non-discriminating list, 1 when a real finding coexists with a poor list. It needs no captured value
and would make the guard reviewer-reproducible, exactly as the sanitiser suite's negative and
discrimination controls already do for their layers. Recorded as an available improvement rather
than a silent gap.

**Promotion is to `DRAFT` only. `LIVE` publication remains out of scope**, and the §7 preconditions
stand unchanged, including `area-seed.sql` in the target. The ruling authorises promotion **under
those conditions**; it is not itself an instruction to execute one, and nothing here is an undraft or
a merge authorisation.

## 7. Verification

| check | result |
|---|---|
| adapter self-test | **33/33** |
| sanitiser suite | **25/25** |
| PII residuals, **all 3 layers** (81 corpus-tested canaries) | **0 findings** |
| `CommercialStagingLoad2575IT` | **8/8** — includes the Mangalore load arm |
| `CommercialPipelineEndToEnd2575IT` | 6/6 |
| `CommercialImportPromotion2575IT` | 9/9 |
| Maven total | **23/23, Skipped 0**, untagged, no `-P`, after `mvn clean` |
| load SQL | PASS — 100 rows emitted, 18 staged, 82 rejected, 0 without raw_payload |

Promotion into any real environment remains owner-gated and additionally requires
`data/imports/udupi-properties-2304/area-seed.sql` in the target. Browser/API verification is
**NOT_RUN**: it requires promoted rows in a served environment.
