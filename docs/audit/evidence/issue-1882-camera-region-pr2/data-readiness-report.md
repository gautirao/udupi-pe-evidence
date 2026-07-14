# PR2 upfront acceptance-area data-readiness report — issue #1882

**Method:** real migration-seeded data (Flyway V1-V113 applied to a fresh `postgis/postgis:15-3.4` Testcontainer), NOT synthetic/fabricated. `RegionalClassificationBackfillService.runBackfill()` + `CityRegionOnboardingService.apply()` (PR1's real onboarding code) were run once to materialize `city_regions`/`city_region_memberships` from the actual seeded `areas`/`regional_area_classifications`/`area_groups` data — this is exactly what production onboarding would produce, not a fabricated snapshot. Read-only SELECTs; no data was modified beyond the standard onboarding materialization (which is itself idempotent and matches PR1's IT pattern). Not run against shared Supabase.

## Acceptance area readiness table

| Area | `area_key` | Centre | bbox | bbox quality | Region | Group | `boundsStatus` |
|---|---|---|---|---|---|---|---|
| **Hebbal** (primary area-selection acceptance) | `IN\|KA\|Bengaluru\|Hebbal` | 13.0451, 77.5977 | 13.03–13.06 lat, 77.58–77.62 lon | **real, non-degenerate** | `N` (AUTO) | `north-growth` | COMPLETE |
| **Yelahanka** (validation control) | `IN\|KA\|Bengaluru\|Yelahanka` | 13.1007, 77.5963 | 13.08–13.12 lat, 77.58–77.62 lon | **real, non-degenerate** | `N` (AUTO) | `north-growth` | COMPLETE |
| **Indiranagar** (central-Bangalore control) | `IN\|KA\|Bengaluru\|Indiranagar` | — | 12.97–12.99 lat, 77.63–77.66 lon | **real, non-degenerate** | `CENTRAL` | — | COMPLETE |
| **Basavanagudi** (boundary-case control) | `IN\|KA\|Bengaluru\|Basavanagudi` | 12.940754, 77.571934 | min==max both axes | **degenerate (point-only)** | not queried (excluded from CENTRAL sample due to degenerate bbox) | — | COMPLETE *(false positive — see finding 2 below)* |
| **Manipal** (Udupi control) | `IN\|KA\|Udupi\|Manipal` | — | 13.34–13.37 lat, 74.78–74.82 lon | real, non-degenerate | (CENTRAL_CARDINAL_4 model) | — | COMPLETE |
| **Kunjibettu** (Udupi control) | `IN\|KA\|Udupi\|Kunjibettu` | — | 13.32–13.35 lat, 74.73–74.76 lon | real, non-degenerate | (CENTRAL_CARDINAL_4 model) | — | COMPLETE |

## Findings requiring plan awareness (not blockers — no #1887 correction needed for any chosen acceptance area)

1. **No data blocker for Hebbal.** Hebbal has a complete, real, non-degenerate bbox. The plan's "primary acceptance journey" assumption holds as-is — no #1887 routing needed.
2. **Plan correction: Hebbal and Yelahanka are NOT in distinct region/group.** The approved plan (line ~415) describes Yelahanka as "northern, adjacent to Hebbal — distinct region/group" for validation purposes. Under the actual materialized `CENTRAL_CARDINAL_8` projection for Bangalore, both Hebbal and Yelahanka land in region `N` and area_group `north-growth` (real data, not a projection bug — they are genuinely close/same-sector). **Recommendation:** keep Yelahanka as a same-region/same-group sibling-area control (validates area→area navigation and group-scope fan-out within one group), and pick a genuinely different-region area (e.g. a `CENTRAL` or `S`/`E`/`W` region area) as the "distinct region/group" control if the plan's original intent (proving cross-region camera/URL-scope reset) needs a dedicated case. This does not block PR2 — it is a factual correction to record in the PR2 plan, not a design change.
3. **69 of 313 Bangalore areas (22%) have a "degenerate" bbox** — `min_lat == max_lat` and `min_lon == max_lon` (a single point duplicated into all four bbox fields, not a real rectangle). PR1's `boundsStatus`/`missingBoundsAreaCount` only detects **null** bbox fields (by design, documented in PR1's validation matrix and code-reviewer nit) — it does **not** detect degenerate/zero-size bboxes. **Consequence for PR2:** fitting the camera to a degenerate area's "bbox" would produce a zero-size `fitBounds` call (undefined/extreme zoom behavior), even though the API reports `boundsStatus: COMPLETE`. **Basavanagudi** (a real, well-known central-Bangalore locality) is a concrete example — degenerate bbox despite `COMPLETE` status.
4. **Chosen boundary-case control:** Basavanagudi is used deliberately as the "one boundary-case area" specifically because of this degenerate-bbox condition — it exercises the fallback chain (padded-synthetic-bounds around centroid, §9 of the approved plan) for real, not synthetically. This is the correct data-driven interpretation of "one boundary-case area."
5. **Recommendation for #1887 (record only, not implemented here):** the degenerate-bbox detection gap (min==max not treated as incomplete) should be added to the #1887 narrowing scope as a data-quality check, alongside the already-recorded malformed/zero-size bbox SQL query from PR1's evidence doc. Not a #1882 PR2 blocker — the fallback chain in the approved plan (§9) already exists to handle exactly this shape (missing/zero-area/invalid/outlier geometry → padded synthetic bounds around centroid → city bounds → city centre+default_zoom).

## Read-only SQL evidence (for reference; run against Testcontainers only, not shared Supabase)

Bangalore bbox quality: `null bbox: 0`, `degenerate (min==max) bbox: 69`, `real non-degenerate bbox: 244` (of 313 total areas).
