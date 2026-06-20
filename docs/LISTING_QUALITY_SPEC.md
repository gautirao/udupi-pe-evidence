# Listing Quality Score — Specification (V1)

Issue: #1518 — listing quality foundation
Implemented in: `backend/src/main/java/com/example/realestate/quality/`
Schema: `V92__listing_quality_foundation.sql`
Status: foundation implemented; backfill deferred to #1521.

---

## 1. Purpose

Every property listing receives a quality score in [0, 100] computed from eight
dimensions. The score is stored on `property_listings.quality_score` (smallint,
nullable until #1521 backfill). A full breakdown is stored as JSONB in
`quality_breakdown`. Every recomputation appends a row to `listing_quality_history`
(written by #1521 — not this issue).

The score is designed to help buyers evaluate listing completeness and help sellers
understand which fields need improvement. It is NOT a ranking signal (that is
`ranking_score` / trust tier) — it is a data-quality indicator.

---

## 2. Eight Dimensions

| # | `QualityComponentType` | Weight (bp) | Conditional? |
|---|------------------------|-------------|--------------|
| 1 | `TRUST`                | 2000        | Always       |
| 2 | `PHOTOS`               | 1500        | Always       |
| 3 | `DESCRIPTION`          | 1500        | Always       |
| 4 | `KEY_FIELDS`           | 1500        | Always       |
| 5 | `PRICE_SANITY`         | 1000        | Excluded when comparable unavailable (INDETERMINATE) |
| 6 | `LOCATION`             | 1000        | Always       |
| 7 | `AGRI_COMPLETENESS`    | 1000        | Agricultural land only |
| 8 | `RECENCY`              |  500        | Always       |
| **Total** | | **10 000 bp** | |

Basis points: 10 000 bp = 100%. 1 bp = 0.01%.

---

## 3. Applied-Only Denominator Rule

Two dimensions may be excluded from a given computation:

- **`AGRI_COMPLETENESS`** — applied only when `propertyType` equals `"agricultural_land"`
  (case-insensitive). For all other types `applied=false`; the 1 000 bp are removed from
  the denominator.

- **`PRICE_SANITY`** — applied only when `medianComparablePricePaise` is non-null.
  When null the dimension is marked `INDETERMINATE` (`applied=false`); the 1 000 bp are
  removed from the denominator.

### Scoring formula

```
overall = clamp( round( Σ(score_i × weightBp_i) / Σ(appliedWeightBp_i) ), 0, 100 )
```

- Sums run only over `applied=true` components.
- Rounding is half-up (integer arithmetic): `(numerator + denominator/2) / denominator`.
- `clamp(x, 0, 100)` ensures the result is always a valid percentage.

### Example denominator sizes

| Scenario                       | Denominator bp |
|--------------------------------|---------------|
| Non-agri, comparable present   | 10 000        |
| Non-agri, no comparable        | 9 000         |
| Agri, comparable present       | 10 000        |
| Agri, no comparable            | 9 000         |

---

## 4. Dimension Detail

### 4.1 TRUST (weight: 2 000 bp)

Maps `trustTier` (A/B/C/D stored on `Listing.trustTier`) to a score.

| Tier   | Score | Notes                           |
|--------|-------|---------------------------------|
| A      | 100   | Highest verification level      |
| B      | 75    | Verified with minor gaps        |
| C      | 50    | Partially verified              |
| D      | 25    | Minimal verification            |
| null/unknown | 25 | "No verification signals" — NOT 50 |

**Design rationale:** unknown verification defaults to the lowest band, not neutral
50. A listing with no trust signals should be treated as unverified, not average.

Constants: `TRUST_SCORE_A=100`, `TRUST_SCORE_B=75`, `TRUST_SCORE_C=50`,
`TRUST_SCORE_D=25`, `TRUST_SCORE_UNKNOWN=25`.

---

### 4.2 PHOTOS (weight: 1 500 bp)

Scores the `photoCount` field.

| Photo count         | Score | Finding                                 |
|---------------------|-------|-----------------------------------------|
| 0 (or missing)      | 0     | "No photos provided"                    |
| 1                   | 25    | "1 photo — very limited coverage"       |
| 2–4                 | 50    | "N photos — limited coverage"           |
| 5–9                 | 75    | "N photos — good coverage"              |
| ≥ 10                | 100   | "N photos — excellent coverage"         |

Constants: `PHOTOS_BAND_HIGH_MIN=10`, `PHOTOS_BAND_GOOD_MIN=5`,
`PHOTOS_BAND_FAIR_MIN=2`, `PHOTOS_BAND_LOW_MIN=1`.

**Design rationale:** 0 photos → score 0 (honest missing-data, NOT neutral 50).

---

### 4.3 DESCRIPTION (weight: 1 500 bp)

Scores the character length of the trimmed description.

| Length (trimmed)    | Score | Finding                                        |
|---------------------|-------|------------------------------------------------|
| null or blank       | 0     | "No description provided"                      |
| < 50 chars          | 25    | "Very short description (N chars)"             |
| 50–149 chars        | 50    | "Short description (N chars)"                  |
| 150–299 chars       | 75    | "Good description (N chars)"                   |
| ≥ 300 chars         | 100   | "Rich description (N chars)"                   |

Constants: `DESC_RICH_CHARS=300`, `DESC_GOOD_CHARS=150`, `DESC_SHORT_CHARS=50`.

---

### 4.4 KEY_FIELDS (weight: 1 500 bp)

Checks the presence of four key fields: `locality`, `areaKey`, `listingPricePaise`,
`propertyType`. Score is proportional to the number present.

| Present count | Score | Finding example              |
|---------------|-------|------------------------------|
| 4/4           | 100   | "All key fields present"     |
| 3/4           | 75    | "Missing: price"             |
| 2/4           | 50    | "Missing: locality, area"    |
| 1/4           | 25    | "Missing: ..."               |
| 0/4           | 0     | "All key fields missing"     |

---

### 4.5 PRICE_SANITY (weight: 1 000 bp, SOFT)

Compares `listingPricePaise` against `medianComparablePricePaise`.

**INDETERMINATE rule:** if `medianComparablePricePaise` is null → `applied=false`,
dimension excluded from denominator. Finding: "Comparables unavailable — price sanity
check skipped".

When comparable is present:

| Price as % of median | Score | Finding                                                              |
|----------------------|-------|----------------------------------------------------------------------|
| ≤ 100%               | 100   | "Price is at or below the area median — competitive"                 |
| 101–150%             | 75    | "Price is moderately above the area median"                          |
| 151–200%             | 50    | "Price may be above similar visible listings in this area"           |
| > 200%               | 25    | "Price appears significantly above similar visible listings in this area" |

Constants: `PRICE_SANITY_NEUTRAL_PCT=100`, `PRICE_SANITY_HIGH_PCT=150`,
`PRICE_SANITY_VERY_HIGH_PCT=200`.

**Language rule:** finding strings MUST use soft, factual language ("may be above",
"appears significantly above"). Never use the word "overpriced".

---

### 4.6 LOCATION (weight: 1 000 bp)

Scores presence of three location signals: `locality` (non-blank), `areaKey`
(non-blank), and `latitude`+`longitude` (both non-null).

| Signals present | Score | Finding                                   |
|-----------------|-------|-------------------------------------------|
| 3/3             | 100   | "Locality, area, and coordinates all confirmed" |
| 2/3             | 75    | "Location mostly confirmed — [gap]"       |
| 1/3             | 40    | "Location partially confirmed — [gaps]"   |
| 0/3             | 0     | "Location unconfirmed — locality, area, and coordinates missing" |

Note: 1/3 scores 40 (not 33) to avoid penalising listings with one strong signal
(e.g. precise coordinates but no locality string).

---

### 4.7 AGRI_COMPLETENESS (weight: 1 000 bp, AGRICULTURAL LAND ONLY)

Applied only when `propertyType == "agricultural_land"` (case-insensitive,
`Locale.ROOT`). For all other types `applied=false`, finding: "Not applicable
(non-agricultural listing)".

Counts the 8 sub-fields present:
`landCategory`, `waterSource`, `soilType`, `roadAccess`, `cultivationStatus`,
`ownershipType`, `farmhouseAvailable`, `fencingDone`.

For string fields: null or blank → absent. For boolean fields (`farmhouseAvailable`,
`fencingDone`): null → absent; `false` → **present** (a deliberate answer of "no" is
informative).

| Present (0–8) | Score | Finding                                          |
|---------------|-------|--------------------------------------------------|
| 0             | 0     | "No agricultural fields completed"               |
| 1–2           | 25    | "N of 8 agricultural fields complete"            |
| 3–4           | 50    | "N of 8 agricultural fields complete"            |
| 5–6           | 75    | "N of 8 agricultural fields complete"            |
| 7–8           | 100   | "N of 8 agricultural fields complete — excellent"|

Score is strictly monotone: more fields present → higher score.

Constant: `AGRI_FIELD_COUNT=8`.

---

### 4.8 RECENCY (weight: 500 bp)

Computes age in whole days: `ChronoUnit.DAYS.between(createdAt.toInstant(), now)`.

| Age (days)    | Score | Finding                                                    |
|---------------|-------|------------------------------------------------------------|
| null createdAt| 0     | "Creation date unavailable"                                |
| < 0 (skew)    | 100   | "Listing posted recently"                                  |
| 0–30          | 100   | "Listing posted within the last N day(s) — very fresh"     |
| 31–90         | 75    | "Listing posted N days ago — recent"                       |
| 91–180        | 50    | "Listing posted N days ago — moderately aged"              |
| 181–365       | 25    | "Listing posted N days ago — consider refreshing"          |
| > 365         | 10    | "Listing is over a year old (N days)"                      |

Constants: `RECENCY_FRESH_DAYS=30`, `RECENCY_RECENT_DAYS=90`,
`RECENCY_MODERATE_DAYS=180`, `RECENCY_STALE_DAYS=365`.

**Design rationale:** null createdAt → score 0 (NOT assumed fresh). Score 10 (not 0)
for very stale listings acknowledges the listing exists but flags the staleness.

---

## 5. Worked Examples

### 5.1 HIGH-quality listing (non-agri, comparable available)

Inputs:
- trustTier: A, photoCount: 12, description: 400 chars
- locality: "Manipal", areaKey: "manipal_main", listingPricePaise: 5_000_000_00L, propertyType: "land"
- medianComparablePricePaise: 6_000_000_00L (listing is 83% of median)
- createdAt: 10 days ago, now: today

| Dimension        | Applied | Weight bp | Score | Contribution |
|------------------|---------|-----------|-------|--------------|
| TRUST            | true    | 2000      | 100   | 200 000      |
| PHOTOS           | true    | 1500      | 100   | 150 000      |
| DESCRIPTION      | true    | 1500      | 100   | 150 000      |
| KEY_FIELDS       | true    | 1500      | 100   | 150 000      |
| PRICE_SANITY     | true    | 1000      | 100   | 100 000      |
| LOCATION         | true    | 1000      | 100   | 100 000      |
| AGRI_COMPLETENESS| false   | 1000      | —     | excluded     |
| RECENCY          | true    |  500      | 100   |  50 000      |
| **Denominator**  |         | **9000**  |       |              |

overall = round(900 000 / 9 000) = **100**

---

### 5.2 LOW-quality listing (agri, no comparable)

Inputs:
- trustTier: null, photoCount: 0, description: null
- locality: null, areaKey: null, listingPricePaise: null, propertyType: "agricultural_land"
- medianComparablePricePaise: null (INDETERMINATE)
- Only landCategory present (1 of 8 agri fields)
- createdAt: 400 days ago, now: today

| Dimension        | Applied | Weight bp | Score | Contribution |
|------------------|---------|-----------|-------|--------------|
| TRUST            | true    | 2000      | 25    | 50 000       |
| PHOTOS           | true    | 1500      | 0     | 0            |
| DESCRIPTION      | true    | 1500      | 0     | 0            |
| KEY_FIELDS       | true    | 1500      | 25    | 37 500       |
| PRICE_SANITY     | false   | 1000      | —     | excluded     |
| LOCATION         | true    | 1000      | 0     | 0            |
| AGRI_COMPLETENESS| true    | 1000      | 25    | 25 000       |
| RECENCY          | true    |  500      | 10    | 5 000        |
| **Denominator**  |         | **9000**  |       |              |

numerator = 117 500; denominator = 9 000
overall = half-up-round(117 500 / 9 000) = (117500 + 4500) / 9000 = **13**

> **Correction note — why the original draft showed overall=9:**
> The original version of this table assumed `propertyType` was absent and scored KEY_FIELDS=0
> with a denominator of 8 500 bp, producing overall=round(80 000/8 500)=9. That assumption
> was wrong. `scoreKeyFields` in `QualityScoreService` checks exactly four directly-available
> key fields: `locality`, `areaKey`, `listingPricePaise`, and `propertyType`. In these §5.2
> inputs `propertyType="agricultural_land"` is explicitly present while the other three are
> null, so `present==1` and KEY_FIELDS scores 25 (not 0). With only PRICE_SANITY excluded
> (null median), the applied-weight denominator is the full 10 000 bp minus PRICE_SANITY's
> 1 000 bp = 9 000 bp. The corrected numerator is
> 25×2000 + 0×1500 + 0×1500 + 25×1500 + 0×1000 + 25×1000 + 10×500 = 117 500, and
> overall = half-up-round(117 500 / 9 000) = 13. The implementation and the test
> `goldenVector_agriLowQuality_overall13` are authoritative.

---

## 6. JSON Breakdown Format

`QualityScoreService.toCanonicalJson(QualityScore)` produces byte-identical JSON:

```json
{
  "overall": 13,
  "computedAt": "2026-06-18T18:00:00Z",
  "components": [
    { "type": "TRUST", "score": 25, "weightBp": 2000, "applied": true, "finding": "No verification signals — listing has not been reviewed" },
    { "type": "PHOTOS", "score": 0, "weightBp": 1500, "applied": true, "finding": "No photos provided" },
    ...
  ]
}
```

Field order within each component is always: `type`, `score`, `weightBp`, `applied`, `finding`.

---

## 7. PII Policy

Finding strings MUST NOT contain PII. Specifically forbidden in findings:
- Owner name, phone, email
- Survey number
- Raw GPS coordinates
- Any field value that directly identifies an individual

Findings describe the dimension result and guidance only.

---

## 8. Recompute Hooks (#1521)

Quality is recomputed automatically on all write paths that move a listing toward or into
a visible state. A recompute is registered as an `afterCommit` synchronization — it runs
in its own `REQUIRES_NEW` transaction **after** the listing write has committed. A failure
in the recompute never rolls back the listing write.

### Hooks wired (recompute triggered)

| Service                   | Method                    | Reason                                    |
|---------------------------|---------------------------|-------------------------------------------|
| `ListingCrudService`      | `createDraft` (widest)    | New listing created                       |
| `ListingCrudService`      | `updateListing` (widest)  | Content or agri fields changed            |
| `ListingWorkflowService`  | `submitListing`           | Listing enters admin review queue         |
| `ListingWorkflowService`  | `approveListing`          | Listing goes LIVE (trust tier set)        |
| `ListingWorkflowService`  | `approveScrapedListing`   | Scraped listing approved to LIVE          |
| `ListingWorkflowService`  | `restoreArchivedListing`  | Listing fast-restored to LIVE             |
| `ListingWorkflowService`  | `restoreRejectedListing`  | Admin restores REJECTED → LIVE            |
| `ListingIngestionService` | `createFrom`              | Ingestion creates new scraped listing     |
| `ListingImageRegistrar`   | `register`                | Image added (PHOTOS count changes)        |
| `ListingImageService`     | `deleteImage`             | Image removed (PHOTOS count changes)      |
| `ListingImageService`     | `reorderImages`           | Image reorder (position consistency)      |

### Hooks deliberately skipped (downgrades out of LIVE)

`rejectListing`, `archiveListing`, `adminArchiveListing`, `adminForceDelete`,
`withdrawListingFromReview`, `reopenRejectedListing`, `reopenArchivedListingAsDraft`,
`returnForEdits` — these all move listings away from a visible state. The existing score
is left in place; an afterCommit-window crash leaving a stale score is acceptable per the
honest-null contract (the backfill is the safety net).

### Reentrancy prevention

The recompute write uses a direct `@Modifying UPDATE` on `ListingRepository.updateQualityColumns`
targeting only the three quality columns. It does NOT go through a listing-save path. Therefore
no new `afterCommit` synchronization is registered during the recompute write. No infinite loop.

---

## 9. Honest-Null / Diagnostic State Contract (#1521)

| Condition                        | `quality_score` | `quality_breakdown`                                | `quality_computed_at` |
|----------------------------------|-----------------|----------------------------------------------------|-----------------------|
| Never computed                   | `NULL`          | `NULL`                                             | `NULL`                |
| Computed, sufficient data        | `0`–`100`       | Full canonical JSON                                | set                   |
| Computed, insufficient data      | `NULL`          | `{"status":"insufficient_data","missing":[...]}` | set                   |

**Sufficiency floor**: the sum of applied-component weights must be ≥ **5 000 bp** (50% of
the 10 000 bp total). If fewer than 5 000 bp of dimensions are applicable and computable for
a listing, the result is INSUFFICIENT.

**Zero is never fabricated.** A stored `quality_score = NULL` with `quality_computed_at`
set means "insufficient data to score", not "never computed". Both a never-computed and an
insufficient listing have `NULL` `quality_score`; they are distinguished by whether
`quality_computed_at` is set.

---

## 10. Materiality & History Append Contract (#1521)

`listing_quality_history` is an append-only audit log. A row is appended only when the
new computation is materially different from the most recent prior row.

**Materiality rule** (`QualityHistoryPolicy.isMaterial`):
- `prevBreakdown == null` (no prior row exists): **always append** (first-ever computation).
- `prevBreakdown != null`: compare canonical JSON strings byte-for-byte.
  - **Identical** → not material → suppress (no new history row).
  - **Different** → material → append.

The insufficient-data diagnostic JSON participates in the same check: it is appended once
on the first INSUFFICIENT result, then suppressed until the breakdown changes.

This guarantees:
- No duplicate history rows on repeated recomputes with unchanged data (idempotent backfill).
- Every material change (score improvement, field addition, image count change) is recorded.
- The first-ever computation always creates a row (for audit completeness).

---

## 11. PRICE_SANITY — Both Operands Required (#1521)

PRICE_SANITY requires **both** `listingPricePaise` and `medianComparablePricePaise` to be
non-null and the median > 0. Either missing → `applied=false` (INDETERMINATE, excluded from
denominator).

| `listingPricePaise` | `medianComparablePricePaise` | Result                                  |
|---------------------|------------------------------|-----------------------------------------|
| non-null            | non-null & > 0               | Scored (applied=true)                   |
| null                | any                          | INDETERMINATE (applied=false) — #1521   |
| any                 | null                         | INDETERMINATE (applied=false)           |
| non-null            | 0                            | INDETERMINATE (applied=false)           |

The per-cent basis: `QualityRecomputeService` supplies `listing.pricePerCentPaise` as
`listingPricePaise` and `area_stats_latest.median_price_per_cent_paise` (cross-type 'all' row
for the listing's area_key) as `medianComparablePricePaise`. This normalises for plot size,
making comparisons meaningful across differently-sized parcels.

---

## 12. One-Shot Backfill (#1521)

`QualityBackfillRunner` is a `CommandLineRunner` activated only when
`app.quality-backfill.enabled=true`. It pages over all LIVE listings using keyset pagination
(`id > lastId`, batch size 500), calling `QualityRecomputeService.recompute(id)` per row
with per-row try/catch (one bad row → log + failed++, continue).

The backfill is **idempotent**: re-running with unchanged data produces the same scores and
no new history rows (materiality guard suppresses duplicates).

**How to run:**
```
mvn spring-boot:run -Dspring-boot.run.arguments='--app.quality-backfill.enabled=true'
```

---

## 13. Limitations (V1)

1. **Comparable price is a single area-median.** `medianComparablePricePaise` is a
   caller-supplied scalar — typically the median for the listing's `areaKey`. It does
   not account for property type, size, or listing purpose. Richer comparables are
   deferred.

2. **Trust uses `trustTier` string only.** The richer `listing_verification_dimension`
   table (added in RE-142 / Phase 3.1) is not consulted. Dimension-level trust scoring
   is deferred.

3. **Locality confidence is heuristic.** `KEY_FIELDS` and `LOCATION` check for
   non-blank strings — they do not validate that `locality` or `areaKey` values are
   canonical or geocoded.

4. **Scores are nullable until #1521 backfill.** The three new columns on
   `property_listings` (`quality_score`, `quality_breakdown`, `quality_computed_at`)
   are NULL for all existing rows until the #1521 scheduled backfill job runs.
   Application code must handle NULL gracefully.

5. **`listing_quality_history` is written by #1521, not this issue.** The table and
   index are created here so qa can write IT coverage now, but no rows are inserted
   until #1521 ships.

6. **No scheduled recompute.** Score recomputation on listing updates is deferred.
   V1 scores are computed on-demand or by the #1521 backfill.

7. **`title` is not in `QualityScoreInputs`.** `KEY_FIELDS` currently checks
   `locality`, `areaKey`, `listingPricePaise`, and `propertyType`. Title presence
   can be added to inputs in #1521 without a breaking API change.
