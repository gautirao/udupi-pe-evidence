# Bengaluru Commercial acquisition — run record and pre-build measurement (#2575)

Recorded 2026-09-15, **before** any staging artefact was built on it, so that a poor yield would be
discovered from a $0.25 measurement rather than from a finished pipeline.

---

## 1. Run provenance

| field | value |
|---|---|
| actor | `memo23/99acres-property-scraper` (owner-approved for both cities, 2026-09-15) |
| run id | `n4y3cFqJh5TAutvM5` |
| dataset id | `tnvaQS5trNQ7dMcPe` |
| started / finished | 2026-09-15T11:20:02Z → 11:20:29Z |
| status | SUCCEEDED, exit 0 |
| rows | 100 |
| charged events | `apify-actor-start` ×1, `result` ×100 |
| **actual cost** | **$0.25005** |

Input, recorded verbatim rather than remembered:

```json
{ "city": "Bangalore", "searchMode": "commercial",
  "includeProjects": false, "maxItems": 100, "scrapeDetails": false }
```

### 1.1 A correction about the cost, kept rather than tidied away

The first reading of this run reported **$0.13005**. That was wrong — not a pricing surprise but a
**premature read**: `usageTotalUsd` was taken from the run record seconds after `SUCCEEDED`, before
billing settled. The settled figure reconciles exactly to the charged events
(1 × $0.00005 + 100 × $0.0025 = $0.25005) and matches the pre-run projection to the fifth decimal.

The operational lesson is about the instrument, not the cost model: **a cost field read immediately
after a run finishes is not yet the cost.** Any future run must re-read usage after settling.

### 1.2 Terms

Unchanged and unresolved. `robots.txt` returned **403** to an ordinary fetch; no workaround was
attempted and none may be. The owner decided on 2026-09-15 to proceed knowingly — recorded as a
**decision**, never as verified permission, and it now covers Bangalore as well as Udupi since the
same third-party source serves both.

---

## 2. Capability verified, not assumed

The failure this whole issue guards against is an actor that silently ignores an unsupported input
and returns the wrong inventory **successfully**. So the output was checked before anything else
was believed:

| check | result |
|---|---|
| `searchMode` | `commercial` on **100/100** |
| `transactionType` | `Sale` on **100/100** |
| `city` | Bangalore South 38 · East 22 · North 21 · West 10 · Central 9 — **100/100 Bangalore** |

The actor honoured both inputs. This is a genuine Commercial Bengaluru capture.

---

## 3. PII — and why two different numbers both matter

Measured on the raw capture **before** it entered the repository (it was captured to a scratch
directory precisely so unsanitised scraped bytes never sat in the working tree):

| layer | measurement |
|---|---|
| identity **fields** | `dealerName` 100 · `description` 100 · `listedBy` 100 · `companyName` 71 · `reraId` 10 |
| contact **shapes** | **1 row**, in `description` |

Those two say different things and neither is sufficient alone. A shape-only sweep would have
reported all-but-clean while leaving `dealerName` intact on **all 100 rows**. The field denylist
removes identity; the shape sweep catches a number pasted into free text.

After sanitising: **0 identity fields, 0 contact shapes.** 500 key instances removed — that is
5 keys × 100 rows of *key presence*, of which 281 carried non-null values (`builderName` was
present-but-null throughout). Stated precisely because "500 PII values removed" would be false.

`listedBy` is **kept** deliberately — its values are the categories Owner/Dealer, not identities —
as are `buildingName`/`projectName`, which `coordinate_trusted_rows` consumes.

**The sanitiser is proved, not asserted.** Its suite runs 15/15 including three negative controls:
with the field layer disabled the identity fields must **survive**; with the shape layer disabled a
planted number must **survive** — planted in `buildingName` rather than `description`, because
`description` is dropped by the field layer and the control would otherwise have passed for the
wrong reason. It also asserts its denylist still matches the #2304 upstream policy, so "reuses the
existing policy" is a property rather than a comment. The fail-closed residuals sweep then reports
**0 residuals** with the capture in its repository location.

---

## 4. The funnel — measured before building

Each filter measured independently against the real implementations, not approximations:

| stage | rows |
|---|---:|
| fetched | 100 |
| coordinate-trusted | 81 |
| inside V71's Bangalore city envelope | 74 |
| area-resolvable | 47 |
| label-mappable to COMMERCIAL | 82 |
| has price | 100 |
| **intersection — would stage** | **32** |

> **32 was a PROJECTION when first recorded — and it REPRODUCED.** It was computed with the real
> `coordinate_trusted_rows` filter and the real `NINETYNINE_COMMERCIAL_TYPE_MAP`, but not through
> `adapter_99acres_commercial.py`, because no Bengaluru `CityProfile` existed yet. The prediction
> was written down *before* the profile was built, with the explicit condition that a mismatch
> would be a finding rather than something to reconcile quietly.
>
> **The profile was then built and the adapter run: 32 staged, subtypes OFFICE 21 · LAND 6 ·
> SHOP 3 · WAREHOUSE 2 — identical, split for split.** Two independent implementations agree.
>
> The agreement is stronger than the row count suggests, because the adapter's `_load_seeded_areas`
> parses the migrations itself rather than reusing the projection's parser: it independently reads
> **308** Bengaluru areas with **68** degenerate boxes, matching the standalone parse exactly. So
> the match is not two paths sharing one possibly-wrong area set.

### 4.0 Actual adapter output

```
fetched 100 · normalized 32 · rejected 68          office_precedence: PASS
subtype_OFFICE 21 · subtype_LAND 6 · subtype_SHOP 3 · subtype_WAREHOUSE 2
```

Reject breakdown, which the projection did not produce and which is new information:

| count | reason |
|---:|---|
| 24 | `area_unresolved` |
| 19 | `coordinate_untrusted` |
| 11 | `ambiguous_or_missing_type` |
| 10 | `out_of_geography` |
| 3 | `not_commercial_family` |
| 1 | `unmapped_type` |

`32 + 68 = 100` — every fetched row accounted for, asserted rather than eyeballed.

The single `unmapped_type` is the `Commercial Office/Space` label (§5): it **rejected honestly**
rather than being inferred into OFFICE, which is the behaviour the issue requires and the reason
that label is flagged for review instead of quietly mapped here.

Note the reject reasons are gate-ordered, so they do not equal the standalone filter counts in the
table above: a row failing coordinate trust never reaches the area gate. Both views are correct and
measure different things — the table counts each filter independently, this counts first-failure.

Projected staged `property_type`: `commercial` 24 · `commercial_land` 6 · `warehouse` 2.

**Projected subtype split, now measured** (an earlier revision of this line said it had not been
computed and was not being guessed — it has since been computed, and the figure replaces the
disclaimer rather than sitting beside it):

| subtype | Udupi (actual) | Bengaluru (projected) | combined |
|---|---:|---:|---:|
| OFFICE | 5 | **21** | 26 |
| LAND | 3 | 6 | 9 |
| SHOP | 3 | 3 | 6 |
| WAREHOUSE | 0 | **2** | 2 |
| **BUILDING** | **0** | **0** | **0** |
| total | 11 | 32 | **43** |

The split reconciles to 32 independently of the funnel arithmetic in §4, which is the point of
computing it separately.

**BUILDING remains 0 across BOTH cities.** Bengaluru fixes WAREHOUSE's vacuity and **not**
BUILDING's, so even with both cities staged only **four of five** subtypes carry inventory. An
assertion that "each populated subtype returns only matching inventory" would still pass
**vacuously** on the BUILDING axis. Stated because "Bengaluru fills the gaps" is the natural and
wrong summary of the row above it.

### 4.1 Bengaluru's binding constraint is the OPPOSITE of Udupi's

| | Udupi | Bengaluru |
|---|---:|---:|
| coordinate trust | **29%** | 81% |
| area resolution | fine | **47%** |
| staged | 11 | **32 (projected)** |

Udupi was throttled by coordinate trust with area resolution healthy. Bengaluru is the mirror:
trust is healthy and **area coverage** is the constraint. The same headline ("thin inventory") has a
different cause in each city, and the two need different remedies — which is why the funnel is
recorded stage by stage rather than as a single yield number.

### 4.2 The 53 unresolved rows split into two populations with different remedies

- **21 fall outside V71's Bangalore city envelope** (12.8340–13.1411, 77.3770–77.7800). 99acres'
  "Bangalore" — spanning North/South/East/West/Central — is geographically **wider than the envelope
  this repository defines**. The remedy is a geography decision about the city's extent, not more
  area rows. Not made here.
- **32 fall inside the envelope with no area covering them.** Genuine coverage holes, despite 308
  Bengaluru areas seeded across V71 + V106 — of which **68 are degenerate zero-area boxes**
  (`min == max`), which can never contain a real coordinate and so contribute nothing. The remedy is
  more or better area seed data.

Conflating these two would send the fix in the wrong direction, which is why they are counted
separately.

---

## 5. What this run does NOT resolve

- **Still Sale-only.** All 100 Bengaluru rows are `Sale`, exactly as Udupi was. So across **both**
  cities there is still **not one real Commercial Rent row**, and the Rent/monthly-rent contract
  remains testable only against rows explicitly labelled SYNTHETIC.
- **A new source label appeared: `Commercial Office/Space`** (1 row), absent from the existing
  vocabulary. It will be rejected as `unmapped_type`. It reads obviously as OFFICE and is
  **deliberately not mapped here** — the issue requires an explicitly reviewed mapping rule rather
  than inference, and a vocabulary addition is exactly the kind of quiet judgement that should be
  visible. Flagged for decision.
- **Other-family leakage is present here too:** 4 `Agricultural/Farm Land` rows inside a capture
  named "commercial". They must be rejected explicitly, not silently dropped.
- ~~**No Bengaluru `CityProfile` exists.** `profile_for("Bengaluru")` raises by design rather than
  inventing bounds. Building it is the next step.~~
  ⚠ **SUPERSEDED 2026-09-15 — the profile was built in this same PR, so this bullet was false by
  the time the PR was reviewed.** `profile_for("Bengaluru")` resolves, and the profile does exactly
  what the bullet promised: it resolves against the **evidenced** V71/V106 bboxes, parsed from the
  migrations themselves, never fabricated. Kept struck rather than deleted because "it will resolve
  against evidenced bounds" is the commitment the built profile has to be checked against.

> ⚠ **A note on "projected" throughout this file.** §4 and §4.1 label the 32 as *projected*, and
> §6 says Bengaluru *"projects"* 2 WAREHOUSE rows. Those labels were accurate when written and are
> now **actual** — §4.0 records the adapter's real output, identical split for split. The wording is
> left in place because the projection-then-measurement sequence is the evidence that two
> independent implementations agree; read "projected" as "predicted, and since confirmed".

## 6. What it does resolve

**WAREHOUSE stops being vacuous.** Udupi staged zero WAREHOUSE rows — both its "Ware House" rows
were lost to coordinate trust — so any assertion on that axis passed by having nothing to test.
Bengaluru projects **2 WAREHOUSE rows**, which makes that axis capable of failing for the first
time. That is worth more than its row count suggests.
