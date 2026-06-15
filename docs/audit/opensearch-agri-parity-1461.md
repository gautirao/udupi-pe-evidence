# OpenSearch Agricultural Field Parity — Issue #1461

## 1. Field Inventory

### 1a. Fields currently indexed (pre-#1461)

| Field | OS Type | Notes |
|---|---|---|
| id | keyword | |
| title | text + keyword | |
| locality | text + keyword | |
| description | text | |
| area_key | keyword | |
| city_slug | keyword | derived via areas→cities join |
| property_type | keyword | |
| seller_type | keyword | |
| bedrooms | integer | |
| bathrooms | integer | |
| price_paise | long | |
| latitude | float | |
| longitude | float | |
| location | geo_point | derived from latitude+longitude |
| status | keyword | |
| created_at | date | |
| updated_at | date | nullable |
| first_published_at | date | nullable |
| last_updated_at | date | nullable |
| back_to_market_at | date | nullable |
| hero_image_url | keyword | nullable, correlated subquery |
| listing_number | integer | nullable |
| land_area | float | nullable |
| land_area_unit | keyword | nullable |
| built_area | float | nullable |
| built_area_unit | keyword | nullable |
| rera_number | keyword | nullable |
| trust_tier | keyword | nullable |
| possession_status | keyword | nullable |
| listing_purpose | keyword | nullable |

### 1b. Agricultural fields PREVIOUSLY MISSING from index (gap addressed by #1461)

All 9 fields below existed as Postgres columns (V84 migration or earlier) and were
exposed via backend DTOs but were not selected in `SELECT_SQL` and therefore absent
from every indexed document.

### 1c. Fields ADDED by #1461

#### Tier 1 — already public via `AgriMapListingItem`

| Field | OS Type | Postgres Source | Notes |
|---|---|---|---|
| land_category | keyword | `pl.land_category` | e.g. FARMLAND, PLANTATION |
| water_source | keyword | `pl.water_source` | `NOT_AVAILABLE` is a real keyword, NOT null |
| farmhouse_available | boolean | `pl.farmhouse_available` | False preserved (null != false) |
| fencing_done | boolean | `pl.fencing_done` | False preserved (null != false) |
| computed_area_acres | double | `ROUND(ST_Area(pl.boundary)::numeric / 4046.8564224, 2)` | NOT a stored column — see section 2 |

#### Tier 2 — columns exist V84; Gate F security review APPROVED (2026-06-15, see section 6)

| Field | OS Type | Postgres Source | Notes |
|---|---|---|---|
| soil_type | keyword | `pl.soil_type` | |
| road_access | keyword | `pl.road_access` | |
| cultivation_status | keyword | `pl.cultivation_status` | |
| ownership_type | keyword | `pl.ownership_type` | |

### 1d. Fields OMITTED (firm decisions, do NOT add)

| Field | Reason |
|---|---|
| survey_number | Anon-gated: withheld from public payloads (#1454). Indexing in OS would create a side-channel bypassing the auth gate. |
| boundary (geo_shape) | Index bloat without corresponding query need. Centroid is sufficient for all current spatial queries; reuses the existing `location` geo_point. |
| separate centroid field | Redundant — `location` geo_point already carries lat/lon derived from `latitude`/`longitude`. |

---

## 2. `computed_area_acres` Derivation Note

`computed_area_acres` is **not** a stored column. It is computed at query time via:

```sql
ROUND(ST_Area(pl.boundary)::numeric / 4046.8564224, 2) AS computed_area_acres
```

This mirrors `DiscoverAgriMapListingsService` exactly:

- `pl.boundary` is `geography(Polygon,4326)`.
- `ST_Area` on a geography type returns area in **square metres**.
- Dividing by `4046.8564224` converts to **acres** (1 acre = 4046.8564224 m²).
- `ROUND(..., 2)` rounds to 2 decimal places.
- `NULL boundary` → `NULL` → omitted by the null-omission loop in `_row_to_doc`.

**WARNING — the phantom-column trap (#1410):** Selecting `pl.computed_area_acres`
as a bare column reference would cause a Postgres `ERROR: column does not exist` at
runtime (the #1410 incident). The ST_Area expression must always be used verbatim.

In `_row_to_doc` the value is cast: `float(row["computed_area_acres"])`. Postgres
returns it as a `Decimal` (from the `ROUND` cast to `numeric`); this cast ensures
OS receives a native Python float matching the `double` mapping type.

---

## 3. Local Reindex / Backfill

### Dependencies

Requires a running OpenSearch node. Start with:

```bash
docker compose -f docker-compose.opensearch.yml up -d opensearch
# Verify health:
curl -sf http://localhost:9200
```

### Rebuild command

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
export OPENSEARCH_URL=http://localhost:9200

python scripts/opensearch_rebuild.py
```

For a dry-run (SQL + count only, no indexing):

```bash
python scripts/opensearch_rebuild.py --dry-run
```

With cleanup of the previous index after alias swap:

```bash
python scripts/opensearch_rebuild.py --cleanup-old
```

### Index name and alias

- **Versioned index**: `listings_v{YYYYMMDD_HHMMSS}` (e.g. `listings_v20261001_140523`)
- **Alias**: `listings_read` — atomically swapped to point at the new index after successful bulk-index + count validation.

### Backward compatibility

**YES.** The rebuild creates a fresh versioned index then atomically swaps the alias.
Readers querying `listings_read` experience zero downtime. No existing index is
modified in place. No index version bump is needed — the alias swap is the cutover.

Non-agri documents indexed before #1461 are unaffected: the 9 new fields are absent
from their source rows (all `NULL`) and therefore omitted by the null-omission loop,
preserving exact byte-compat with pre-#1461 indexed non-agri docs.

### Production reindex / cutover

**NOT performed by this PR.** The production OpenSearch instance is not touched.
A production rollout requires:

1. Confirm `PARITY_DATABASE_URL` points to production Postgres (read-only replica recommended).
2. Run `python scripts/opensearch_rebuild.py --allow-non-localhost` with production `DATABASE_URL` + `OPENSEARCH_URL`.
3. Validate count output and alias swap confirmation in script stdout.
4. Run `scripts/test_opensearch_agri_container.py` with `OPENSEARCH_TEST_URL` pointing to a **staging** OS instance first.
5. Only then perform production alias swap.

### Follow-up rollout steps

- [ ] Trigger production rebuild after merging #1461 (ops team).
- [ ] Confirm `listings_read` alias points to new versioned index.
- [ ] Delete old versioned index: `python scripts/opensearch_rebuild.py --cleanup-old`.
- [ ] Gate F security review sign-off on Tier 2 fields (`soil_type`, `road_access`, `cultivation_status`, `ownership_type`) before exposing via search API.
- [ ] Wire Tier 2 fields into `DiscoverQueryDsl` filter clauses only after Gate F approval.

---

## 4. Feature-Flag Safety

- **Read-path feature flags**: unchanged and default-off. No new code paths in the
  Spring Boot query layer are activated by this PR. The OS index now stores the
  extra fields, but no filter clause or response mapping reads them yet.
- **Container tests opt-in**: `scripts/test_opensearch_agri_container.py` skips at
  module level unless `OPENSEARCH_TEST_URL` is set. Normal `python -m pytest` runs
  (CI, local dev without Docker) are completely unaffected.
- **No production OS dependency in normal dev/test**: `scripts/opensearch_rebuild.py`
  requires explicit `DATABASE_URL` + `OPENSEARCH_URL` env vars and enforces a
  localhost-only safety gate. It cannot accidentally run against production.
- **Mocked unit tests** (`scripts/test_opensearch_rebuild.py`) have zero external
  dependencies (no DB, no OS connection) and always run in CI.

---

## 5. Parity Nuance — Eligibility Filter Follow-Up

The OpenSearch rebuild's eligibility filter is:

```sql
WHERE pl.status = 'LIVE'
```

The public agri map SQL (`DiscoverAgriMapListingsService`) additionally filters:

```sql
AND pl.archived_at IS NULL
AND pl.is_duplicate = FALSE
```

This means the OS index may include a small number of listings that are `LIVE`
but also `archived_at IS NOT NULL` or `is_duplicate = TRUE`. These are identical
semantics to all other listing types in the index (the non-agri rebuild filter has
always been `status = 'LIVE'` only).

**This discrepancy is documented here and intentionally NOT changed in #1461.**
Changing the WHERE clause would affect all listing types and is a separate,
deliberate decision. A follow-up issue should evaluate whether `archived_at IS NULL`
and `is_duplicate = FALSE` guards should be added to the rebuild script globally.

---

## 6. Security (Gate F) — Verdict and Follow-Up

**Gate F verdict: APPROVE** (security-reviewer, 2026-06-15).

- **Tier 2 fields ruled public-safe** (none omitted): `soil_type`, `road_access`,
  `cultivation_status` are agronomic/parcel descriptors; `ownership_type` is a legal
  tenure enum (`FREEHOLD`/`LEASEHOLD`) — it describes the parcel's tenure type, NOT
  the owner's identity, name, or contact. No PII exposure.
- **`survey_number` confirmed absent** from `SELECT_SQL` and every indexed document
  (anon-gated per #1454; would be a side-channel bypassing the auth gate).
- **No PII / no `**row` splat**: `_row_to_doc` builds `_source` from explicit named
  keys only. Adversarial no-PII tests inject `user_id`/`seller_id`/`supabase_user_id`/
  `survey_number`/`phone`/`email`/`owner_name`/`rejection_reason` and assert none reach
  `_source` (unit + live-container).
- **Eligibility unchanged**: `WHERE pl.status = 'LIVE'` not weakened.
- **No production exposure**: OS read-path flags default-off; container tests opt-in
  (`OPENSEARCH_TEST_URL`); live-PG parity requires `PARITY_DATABASE_URL` AND passes an
  `_is_safe_url` localhost guard; the rebuild script enforces `_check_safety_gates`.

### Pre-cutover follow-up (NOT a blocker for this PR)

- [ ] **Anon coordinate coarsening on the OpenSearch read path.** The index stores raw
  `latitude`/`longitude` for ALL listing types (pre-existing behaviour, unchanged by
  #1461). The #1454 anon ~1.1 km coarsening for agri is applied at the API/response
  layer (`DiscoverAgriMapListingsService`), not at index time. When the OpenSearch
  read path is promoted from flags-off to serving anon traffic, the anon-serving code
  MUST apply the same ~1.1 km coarsening to agri lat/lng read from the index, matching
  the Postgres path. Add to the pre-cutover checklist. No current exposure (flags-off).
