# Discover Query Baseline — Postgres

**Generated:** [DATE PLACEHOLDER — fill after running harness]
**Dataset:** [VOLUME PLACEHOLDER] listings tagged `[PERF]`
**Database:** Local/staging Postgres with PostGIS
**Harness:** `scripts/run_explain_harness.py`

## Summary

This document records the Postgres query performance baseline for the key Discover query paths.
It is the reference point for comparing a future OpenSearch/Elasticsearch read model.
This is NOT a Postgres optimisation project — the purpose is to measure current behaviour.

## Query Plan Baseline

| Query path | Dataset size | Runtime (ms) | Index used? | Plan type | Notes |
|---|---:|---:|---|---|---|
| QP-1a: Listings COUNT (city only) | TBD | TBD | TBD | TBD | |
| QP-1b: Listings SELECT page (city only) | TBD | TBD | TBD | TBD | Lateral hero-image subquery |
| QP-1c: Listings SELECT (school-radius) | TBD | TBD | TBD | GiST expected | ST_DWithin on pl.geog |
| QP-1d: Listings SELECT (FTS keyword) | TBD | TBD | TBD | GIN expected | websearch_to_tsquery on search_vector |
| QP-2: Aggregates GROUP BY locality | TBD | TBD | TBD | TBD | Full filtered scan |
| QP-3a: Markers city-only | TBD | TBD | TBD | TBD | LIMIT 1001, ORDER BY id |
| QP-3b: Markers bbox | TBD | TBD | TBD | GiST expected | && bbox operator on pl.geog |
| QP-5: City-area listings (ROW_NUMBER) | TBD | TBD | TBD | TBD | PARTITION BY area_key |

_Run `scripts/run_explain_harness.py --volume=<N>` to populate this table._

## Key Findings

_To be filled after running the harness._

Expected areas of interest:
- PostGIS GiST index on `pl.geog`: should be used for QP-1c (ST_DWithin) and QP-3b (bbox).
- FTS GIN index on `pl.search_vector`: should be used for QP-1d.
- Sequential scan expected on `price_paise`: no index present (see Known Limitations).
- Lateral hero-image subquery in QP-1b: I/O impact at scale.

## Known Limitations (Index Gaps)

These are documented as part of the baseline. They are **out of scope** for this issue.

| Gap | Affected queries | Symptom | Follow-up |
|---|---|---|---|
| No index on `price_paise` | QP-1a/b/c/d with price filter | Sequential scan on price range | File follow-up issue |
| No composite index on `(listing_id, position, id)` for `listing_images` | QP-1b lateral subquery | Sequential scan per row | File follow-up issue |
| Markers ORDER BY `pl.id` | QP-3a | Returns first 1000 by insertion order, not viewport relevance | Design question for follow-up |

## Recommended Follow-ups

_To be filled after running the harness._

Candidates identified during static audit:
1. Add composite index on `listing_images(listing_id, position, id)` (QP-1b lateral subquery)
2. Add index on `price_paise` (QP-1a/b/c/d with price filter)
3. Consider COUNT(*) caching or approximation at scale (QP-1a runs per paginated request)
4. Investigate markers viewport-required gate (QP-3a/b currently cap at 1000 by insertion order)

## OpenSearch Comparison Notes

When OpenSearch/Elasticsearch is implemented as the read model, compare against this baseline:

- **Latency target**: OpenSearch results should be ≤ Postgres baseline for single-query paths.
- **Scale target**: OpenSearch should maintain consistent latency at 1M listings where Postgres degrades.
- **Index utilisation**: Postgres GiST + GIN are functionally equivalent to OpenSearch geo + text indexes.
- **Consistency model**: OpenSearch is eventually consistent; Postgres is always consistent. Document the trade-off.

This baseline is a prerequisite for any OpenSearch migration proposal.
