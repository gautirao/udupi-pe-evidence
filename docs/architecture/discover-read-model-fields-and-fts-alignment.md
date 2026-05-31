# Discover Read-Model: Field Specification and FTS Alignment

**Status:** LOCAL/DEV POC — not production-wired  
**Issue:** #1311 (Stage B)  
**Prerequisite:** [OpenSearch POC Report (#1309)](opensearch-poc-report.md)  
**Related ADR:** [discover-opensearch-search-architecture.md](discover-opensearch-search-architecture.md)

---

## 1. FTS Semantics: Strategy Comparison

### 1.1 Background

The #1309 baseline used `multi_match` with default `operator: or` — meaning OpenSearch matches
any of the query terms. Postgres `websearch_to_tsquery('english', :q)` uses implicit AND between
unquoted terms. The #1309 POC showed a count difference of 408 (OS) vs 134 (PG) for
`"sea view apartment"` on the 1k seed=42 dataset — a ~3x recall ratio (OR vs AND).

### 1.2 Strategies Tested (seed=42, 1k dataset)

`scripts/opensearch_fts_compare.py` was designed to run the following 5 strategies identically
across a configurable set of query strings with identical field boosts (`title^3, locality^2,
description`) to isolate the operator effect from relevance tuning.

> **Local verification status:** DEFERRED — the local PostGIS perf DB and OpenSearch container
> were not running at the time of Stage B authoring. The script exits 0 on empty index
> (DATA_GAP message). Script logic is verified by inspection; counts below are from the
> #1309 baseline run (QP-1d) plus the known behaviour of each OS strategy.

| Strategy | label | count for "sea view apartment" (1k, seed=42) — **measured** or *\*estimated* | Notes |
|---|---|---|---|
| PG websearch AND | [baseline] | **134** | `websearch_to_tsquery('english', q)` via V18 `search_vector` GIN index |
| OR-default | multi_match OR | **408** | Any term matches; broadest recall — #1309 baseline |
| AND-best_fields | multi_match AND best_fields | ~134* | All terms required; per-field scoring; closest to PG AND semantics |
| AND-cross_fields | multi_match AND cross_fields | ~134* | All terms required; treats fields as one text stream; better for multi-word spans |
| MSM-100% | minimum_should_match=100% | ~134* | Effectively AND via `minimum_should_match`; gives BM25 flexibility in edge cases |
| MSM-75% | minimum_should_match=75% | ~200–250* | Intermediate recall; 3-term query requires ≥2 terms |

*Estimated based on known strategy semantics applied to #1309 OR count of 408 and PG AND count of 134.
Run `python scripts/opensearch_fts_compare.py` against the live seed to replace with measured counts.

### 1.3 Analyzer / Stemming Caveat

Exact count parity between any OpenSearch strategy and Postgres `websearch_to_tsquery('english')`
is **not achievable** even with `operator: and`:

| Dimension | OpenSearch `standard` analyser | Postgres `english` dictionary |
|---|---|---|
| Stemming | None (keeps raw tokens) | Yes (`apartment` → `apart`, `sea` → `sea`) |
| Stop-words | None | Yes (`the`, `a`, `in` stripped) |
| Ranking | BM25 `_score` | `ts_rank` float |

A query like `"apartments"` → PG matches `apartment` (stemmed); OS `standard` does not stem.
`cross_fields` with a language analyser (`english`) would improve parity but requires a mapping
change (add `"analyzer": "english"` to `title`/`locality`/`description`). That is out of scope
for the POC.

### 1.4 RECOMMENDED Discover Default FTS Strategy

**Recommendation: `multi_match type:best_fields operator:and`**

Rationale:
1. **Closest precision match to Postgres AND** — all terms must be present, matching the
   existing Discover FTS semantics users experience via the Postgres path.
2. **Best-fields scoring** — the field with the highest match score drives the document
   score, appropriate for property search where title carries the most signal.
3. **Simpler than cross_fields** — `cross_fields` helps when terms span fields (e.g.
   "Udupi apartment" where `Udupi` is in `locality` and `apartment` is in `title`);
   this is a valid pattern, so `cross_fields` is a viable alternative if cross-field
   spanning becomes a real recall issue.
4. **More predictable than MSM-100%** — `MSM-100%` is functionally equivalent to AND for
   exact-term matching but interacts with BM25 in subtle ways for multi-term queries;
   best_fields AND is easier to reason about.

**Recommended query shape:**

```json
{
  "multi_match": {
    "query": "<user_query>",
    "fields": ["title^3", "locality^2", "description"],
    "type": "best_fields",
    "operator": "and"
  }
}
```

**When to relax to OR / MSM-75%:** If recall metrics show users are getting zero results too
frequently (e.g. a 3-word query where two words match but one does not), consider MSM-75%
as a fallback or secondary pass. This is a product decision; start with AND.

---

## 2. Read-Model Field Specification

### 2.1 Complete Field Table (public-safe, LIVE listings only)

Every field below is present in `scripts/opensearch_backfill.py` mapping and SELECT.
Security rule: `WHERE pl.status = 'LIVE'` is always enforced; no other status rows are indexed.

| Field | OpenSearch type | Source | Classification | Notes |
|---|---|---|---|---|
| `id` | `keyword` | `property_listings.id` | direct column | Document `_id` |
| `title` | `text` + `.keyword` | `property_listings.title` | direct column | `keyword` sub-field for sort |
| `locality` | `text` + `.keyword` | `property_listings.locality` | direct column | `keyword` sub-field for sort |
| `description` | `text` | `property_listings.description` | direct column | Full-text only |
| `area_key` | `keyword` | `property_listings.area_key` | direct column | Exact-match filter |
| `city_slug` | `keyword` | `cities.slug` via `areas.city_id` join | areas–cities join | See §2.3 for acquisition strategy |
| `property_type` | `keyword` | `property_listings.property_type` | direct column | Facet / filter |
| `seller_type` | `keyword` | `property_listings.seller_type` | direct column | Facet / filter |
| `bedrooms` | `integer` | `property_listings.bedrooms` | direct column | Range filter |
| `bathrooms` | `integer` | `property_listings.bathrooms` | direct column | Range filter |
| `price_paise` | `long` | `property_listings.price_paise` | direct column | Range filter |
| `latitude` | `float` | `property_listings.latitude` | direct column | Stored for reference |
| `longitude` | `float` | `property_listings.longitude` | direct column | Stored for reference |
| `location` | `geo_point` | derived: `{lat, lon}` | geo derived | Used for geo queries |
| `status` | `keyword` | `property_listings.status` | direct column | Always `'LIVE'` in index |
| `created_at` | `date` | `property_listings.created_at` | direct column | ISO-8601 |
| `hero_image_url` | `keyword` | `listing_images.url` (lowest position) | listing_images subquery | See §2.4; absent (not null) when no image |

**Total: 17 fields** (15 original + `city_slug` + `hero_image_url`)

### 2.2 PRIVATE / FORBIDDEN Fields

The following fields MUST NEVER appear in the index mapping, SELECT statement, or any
document returned from the read-model API. They are either PII, auth-gated, or owner-only.

| Field | Reason |
|---|---|
| `user_id` | Auth-gated; internal identity |
| `seller_id` | Auth-gated; internal identity |
| `supabase_user_id` | Auth-gated; internal identity |
| `seller_phone` / `phone` | PII — owner contact |
| `seller_email` / `email` | PII — owner contact |
| `rejection_reason` / `rejectionReason` | Owner-only; internal moderation data |
| `status` values other than `'LIVE'` | Non-public (DRAFT, PENDING, REJECTED) |
| Any raw contact field | PII |

Any future field addition to the backfill SELECT must be reviewed against this list.

### 2.3 city_slug Acquisition Strategy

**Correct join chain:**

```sql
LEFT JOIN areas a ON a.area_key = pl.area_key
LEFT JOIN cities c ON c.id = a.city_id
-- use: c.slug AS city_slug
```

Table sources:
- `areas` table: `V71__cities_and_areas.sql` — `area_key` (PK), `city_id` (FK → `cities.id`)
- `cities` table: `V71__cities_and_areas.sql` — `id` (PK), `slug` (UNIQUE, e.g. `'udupi'`, `'kundapur'`)

**The area_key-parse pitfall:**

`area_key` values are opaque identifiers (e.g. `kundapura-riverside-north`). It is tempting
to derive `city_slug` by splitting on `-` and taking the first segment. This is WRONG:

- Kundapura areas are seeded with `district='Udupi'` but `city_slug='kundapur'` (note the spelling difference).
- `area_key` format is not a contract — it can change.
- Always use the `areas → cities` join. NULL-safe via LEFT JOIN: a listing with no matching
  area or city gets `city_slug = NULL`, which is indexed as absent (not an error).

### 2.4 hero_image_url Acquisition Strategy

**Correlated subquery:**

```sql
(
    SELECT li.url
    FROM listing_images li
    WHERE li.listing_id = pl.id
    ORDER BY li.position ASC, li.id ASC
    LIMIT 1
) AS hero_image_url
```

Source: `listing_images` table (`V9__create_listing_images_notifications_saved_areas.sql`):
columns `listing_id` (FK), `url`, `position`, `id`. Index on `(listing_id, position)`.

This is the same selection logic as `CityAreaListingsService.java:164-168`
(`primaryImageUrl` in the public listing DTO).

NULL-safe: listing with no `listing_images` rows gets `hero_image_url = NULL`, indexed as absent.

**In `_row_to_doc`:** null-valued `city_slug` and `hero_image_url` keys are removed from the
`_source` dict before indexing to keep documents lean. OS treats absent fields as `null`.

---

## 3. Local Validation

### 3.1 What Was Exercised

| Check | Status | Notes |
|---|---|---|
| `opensearch_fts_compare.py` syntax | PASS | `python -m py_compile` passes |
| `opensearch_backfill.py` diff review | PASS | SELECT/mapping/`_row_to_doc` changes reviewed |
| Live run (OS + PG running) | DEFERRED | Container not running at authoring time |
| FTS count comparison table | DEFERRED | Requires live run |
| city_slug non-null count | DEFERRED | Requires live run + seeded `areas`/`cities` join |
| hero_image_url non-null count | DEFERRED | Requires live run + seeded `listing_images` rows |

### 3.2 DATA_GAP Notes

When running against `gen_perf_listings.py --count 1000 --seed 42`:

- **city_slug** may be 100% NULL if seeded `area_key` values are not present in the `areas`
  table. The backfill will print `WARNING: city_slug is 100% null`. This is acceptable for
  the POC seed; verify once production-quality seed data or real rows are used.
- **hero_image_url** will be 100% NULL if `gen_perf_listings.py` did not insert into
  `listing_images`. The backfill will print `WARNING: hero_image_url is 100% null`. Same caveat.
- Both WARNINGs are visible in the backfill output — they are not silent failures.

### 3.3 Index Reset Requirement

If the `listings_poc` index already exists (from a prior #1309 backfill run), the `_ensure_index`
function skips creation and the new mapping fields (`city_slug`, `hero_image_url`) will NOT be
added. To apply the new mapping:

```bash
docker compose -f docker-compose.opensearch.yml down -v
# then re-run:
python scripts/opensearch_backfill.py
```

### 3.4 Running the FTS Comparison

```bash
# Prerequisites: OS running, index populated with backfill
export DATABASE_URL=postgresql://postgres:perf@localhost:5434/postgres
export OPENSEARCH_URL=http://localhost:9200

python scripts/opensearch_fts_compare.py
# With custom query strings:
python scripts/opensearch_fts_compare.py --queries "sea view apartment" "2bhk udupi" "garden"
# Show top-10 IDs per strategy:
python scripts/opensearch_fts_compare.py --top-n 10
```

Expected output format:

```
==========================================================================================
FTS STRATEGY COMPARISON
Boosts: title^3, locality^2, description  (identical across all strategies)
...
──────────────────────────────────────────────────────────────────────────────────────────
Query string: "sea view apartment"
──────────────────────────────────────────────────────────────────────────────────────────
  Strategy               Count  Top-N IDs
  ──────────────────── ───────  ────────────────────────────────────────
  [PG websearch AND]       134  (websearch_to_tsquery 'english')
  OR-default               408  <id1>, <id2>, ...
  AND-best_fields          ~134 <id1>, <id2>, ...
  AND-cross_fields         ~134 <id1>, <id2>, ...
  MSM-100%                 ~134 <id1>, <id2>, ...
  MSM-75%                  ~200 <id1>, <id2>, ...
```

Replace `~` estimates with actual measured counts from a live run.

---

## 4. Security Summary

| Check | Result |
|---|---|
| PII fields in mapping | NONE |
| `user_id`, `seller_id`, `seller_phone`, `seller_email`, `supabase_user_id`, `rejectionReason` | Absent from mapping and SELECT |
| `status='LIVE'` enforcement | `WHERE pl.status = 'LIVE'` in SELECT_SQL |
| city_slug derivation | JOIN only — no area_key parsing |
| SQL injection risk | Postgres baseline in fts_compare uses psycopg2 `%s` parameterisation; LIMIT/OFFSET are ints |
| Credential leakage | `_safe_db_url_display()` strips credentials in all log/error output |
| Hardcoded credentials | None — all from env vars |
