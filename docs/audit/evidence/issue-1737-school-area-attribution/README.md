# Issue #1737 — Bengaluru school area_key attribution audit

Source of truth for these numbers: `.claude/handoffs/issue-1737/bug-repro-report.toml` and
`.claude/handoffs/issue-1737/approved-plan.toml` (`[corrections]`, `[needs_manual_decision]`).
Nothing below is re-derived; it is transcribed from those approved artefacts for durable,
human-readable evidence alongside the shipped migration.

## Measured population and outcome

| Symbol | Meaning | Value |
|---|---|---|
| N | Bengaluru schools checked (complete population in the fixture, district = 'Bengaluru') | 32 |
| M | Suspected incorrect (stored area's name absent from the school's own address) | 18 |
| K | Corrected in this PR (pass the full 4-part decision rule) | 5 |
| L | Left unchanged, listed below for a human ruling | 13 |

Population definition: N = the 32 rows in `scripts/db/fixtures/bangalore-mangalore-schools-seed.sql`
with `district = 'Bengaluru'` (the 9 Mangalore rows are excluded) — the complete Bengaluru school
population in the live source of truth, not a sample.

## Root cause (summary)

`schools.area_key` is written by the V80 `BEFORE INSERT OR UPDATE OF (latitude, longitude,
district)` trigger, which assigns the nearest area centroid within the same normalised district,
capped at 10 km (V79/V80). The Bengaluru schools were attributed when the area catalogue held only
the 10 coarse V71 areas, so finer localities such as "JP Nagar" were not yet available answers.
V106 later added 304 finer Bengaluru localities (including "JP Nagar"), but nothing re-attributes
already-inserted rows: V79's backfill only touches `area_key IS NULL`, and the V80 trigger only
fires on INSERT or on UPDATE of `(latitude, longitude, district)` — never merely because the area
catalogue grew, and never on a bare `area_key` write.

Independent confirmation: nearest-centroid matching restricted to ONLY the 10 V71 areas reproduces
all 32 of the fixture's hardcoded Bengaluru `area_key` literals exactly (32/32, zero exceptions) —
proof that the live values were derived against the coarse catalogue.

## The 5 corrections (K)

Each school moves strictly CLOSER to its new area's centroid.

| udise_code | School | Coordinates | Before area | After area | Distance before → after | Evidence |
|---|---|---|---|---|---|---|
| APIFY-BAN-JAYA-01 | Frank Public School | 12.9052810, 77.5799615 | IN\|KA\|Bengaluru\|Jayanagar | IN\|KA\|Bengaluru\|JP Nagar | 2657 m → 872 m | Address "17th Cross, 33rd Main Rd, JP Nagar Phase 6, J. P. Nagar, Bengaluru 560078" names JP Nagar, never Jayanagar. **The user's reported example.** |
| APIFY-BAN-JAYA-05 | The Brigade School @ J P Nagar | 12.8922999, 77.5853675 | IN\|KA\|Bengaluru\|Jayanagar | IN\|KA\|Bengaluru\|JP Nagar | 3749 m → 1939 m | Address "Brigade Millenium Rd, ... JP Nagar 7th Phase, J. P. Nagar, Bengaluru 560078"; school's own name says J P Nagar. Never names Jayanagar. |
| APIFY-BAN-HEBB-01 | Orchids The International School - Hesaraghatta Road | 13.0597741, 77.5071341 | IN\|KA\|Bengaluru\|Hebbal | IN\|KA\|Bengaluru\|Mallasandra | 9945 m → 1067 m | Address "Hesarghatta Rd, ... Rangappa Layout, Mallasandra, T. Dasarahalli, Bengaluru 560057" names Mallasandra, never Hebbal. Stored attribution sat at the very edge of the 10 km cap. |
| APIFY-BAN-MARA-04 | Narayana eTechno (CBSE) School - Kaggadasapura | 12.9794585, 77.6774887 | IN\|KA\|Bengaluru\|Marathahalli | IN\|KA\|Bengaluru\|Kaggadasapura | 3352 m → 371 m | Address "29th C Cross Rd, ... Balaji Layout, Kaggadasapura, Bengaluru 560093" names Kaggadasapura, never Marathahalli; school's own name says Kaggadasapura. |
| APIFY-BAN-MARA-06 | ORCHIDS The International School, Panathur | 12.9375874, 77.7015855 | IN\|KA\|Bengaluru\|Marathahalli | IN\|KA\|Bengaluru\|Panathur | 2396 m → 438 m | Address "Survey No. 86/5 and 87/1, Panathur Main Rd, ... Munnireddy Layout, Panathur, Bengaluru 560087" names Panathur, never Marathahalli; school's own name says Panathur. |

> Note: the raw distance figures above are keyed per-school by `udise_code` against
> `bug-repro-report.toml`'s `[observations].database_findings` TIER 1 entries, not by list
> position — `[decision_rule].outcome` is ordered by descending before-distance while
> `[corrections].items` is ordered by `udise_code`, so the two lists are not in the same order.

## Decision rule (why exactly these 5, and not more)

AUTO-CORRECT a school only when ALL FOUR hold; otherwise LEAVE UNCHANGED:

1. The stored area's name does not appear anywhere in the school's own address.
2. Some other configured area C's name DOES appear in that address (the address's own claim).
3. Geometry corroborates C (nearest centroid over the full 313-area catalogue, or non-degenerate
   bbox containment).
4. Counter-signal guard: the school does NOT fall inside the stored area's own non-degenerate
   bbox (this demotes two otherwise-plausible candidates out of auto-correct — see below).

## The 13 NEEDS-MANUAL schools (L) — left unchanged, for a human ruling

These fail the decision rule (address and geometry disagree, or the address names no configured
area at all). Guessing an area for any of them is explicitly forbidden by the issue.

1. BS International School, Electronic City — stored: Electronic City · address says: S.Bingipura · geometry says: Koppa Gate
2. Carmel Garden Public School — stored: HSR Layout · address says: Koramangala · geometry says: Sarjapur
3. Narayana eTechno (CBSE) School - Electronic City Phase 1 — stored: HSR Layout · address says: Electronic City · geometry says: Hongasandra
4. ORCHIDS The International School in Haralur — stored: HSR Layout · address says: Haralur · geometry says: Kasavanahalli
5. Vivekananda ORCHIDS The International School - Sahakar Nagar — stored: Hebbal · address says: Kodigehalli · geometry says: Vignana Kendra
6. Poornaprajna Education Centre, Indiranagar — stored: Indiranagar · address says: New Tippasandra · geometry says: New Tippasandra · **DEMOTED by condition 4** (sits inside Indiranagar's real bbox, defensible as-is)
7. Narayana eTechno (CBSE) School - Rk Layout — stored: Jayanagar · address says: Kanakapura · geometry says: Banashankari Temple Ward
8. National Public School, Banashankari — stored: Jayanagar · address says: Banashankari · geometry says: Subramanyapura
9. RMS International School — stored: Jayanagar · address says: Bikasipura · geometry says: Konanakunte
10. EuroSchool Whitefield — stored: Marathahalli · address says: Whitefield · geometry says: Hoodi
11. Narayana eTechno (CBSE) School - KR Puram — stored: Marathahalli · address names NO configured area · geometry says: Hoodi
12. Narayana eTechno (CBSE) School - Bellandur — stored: Sarjapur Road · address says: Bellandur · geometry says: Bellandur · **DEMOTED by condition 4** (sits inside Sarjapur Road's real bbox)
13. ORCHIDS The International School - Sarjapur Road — stored: Sarjapur Road · address says: Sarjapur · geometry says: Lakeview Residency

## What this PR deliberately does NOT do

- Does not re-derive `schools.area_key` wholesale against the full 313-area catalogue. Measured to
  collapse curated Bengaluru school counts from 32 to 6 (six curated areas would drop to zero
  schools).
- Does not touch any of the 13 NEEDS-MANUAL schools above.
- Does not change the V80 nearest-centroid algorithm, the 10 km cap, or district normalisation.
- Does not change any school's latitude/longitude/district.
- Does not re-run `scripts/db/fixtures/bangalore-mangalore-schools-seed.sql` against a
  V106-present database (its `ON CONFLICT ... DO UPDATE` touches latitude/longitude and would
  re-fire the V80 trigger, producing the same 32→6 collapse).

## Regression coverage

`backend/src/test/java/com/example/realestate/school/SchoolAreaKeyCorrectionIT.java` — real
Postgres/PostGIS Testcontainers IT running the full Flyway chain through V109. Explicitly
constructs the coarse pre-fix state (insert, then a bare `area_key` UPDATE that does not fire the
V80 trigger) before asserting the correction, so the test can actually fail without V109. Asserts
all 5 corrected schools move to their new `area_key`, that 2 NEEDS-MANUAL schools (EuroSchool
Whitefield, Narayana eTechno Bellandur) are left unchanged, that Mangalore schools are untouched,
and that the correction is idempotent and convergent from either starting state.
