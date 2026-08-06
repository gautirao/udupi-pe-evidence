# #2086 S4 — Bangalore candidate-quality report

**Test file:** `backend/src/test/java/com/example/realestate/discover/navigation/NavigationTreeBangaloreCandidateIT.java`
**Date:** 2026-08-05
**Author:** S4 (Mode-3 Phase 5, gate 6 of 10)

## 1. Data provenance — read this first

This report and its backing test do **NOT** use a production Bangalore export. This session has no
hosted/shared Supabase database access, and per the S4 handoff instructions no attempt was made to
fabricate one.

Per issue #2086's own sanctioned fallback ("Include a mock-derived structural cohort containing
recognisable north-Bangalore Areas such as Hebbal, Nagawara, Jakkur and Yelahanka. Validate the
hierarchy and membership, not one blindly pinned display name."), the test seeds a **structural
cohort**, honestly labelled as such:

| Group | Count | Composition | Provenance |
|---|---|---|---|
| North (`bangalore-cohort-north`) | 40 areas | 24 real, recognisable north-Bangalore locality names (Hebbal, Nagawara, Jakkur, Yelahanka, Yelahanka New Town, Thanisandra, Hennur, Kothanur, Vidyaranyapura, Sahakara Nagar, RT Nagar, Kalyan Nagar, HBR Layout, Banaswadi, Kammanahalli, Horamavu, Kodigehalli, Jalahalli, Jalahalli East, Peenya, Yeshwanthpur, Mathikere, Byatarayanapura, Amruthahalli) + 16 clearly synthetic "North Growth Corridor Extension NN" padding areas | Real names + coordinates are public general-knowledge approximations, entered by hand — **NOT** a `city_region_memberships`/`areas` DB export, hosted or otherwise. Synthetic padding is honestly named, never disguised as real. |
| South (`bangalore-cohort-south`) | 7 areas | 7 real, recognisable south-Bangalore locality names (Jayanagar, Basavanagudi, JP Nagar, Banashankari, BTM Layout, Koramangala, HSR Layout) | Same caveat as above. |

The `city_region_policy` row seeded for this synthetic city **is** the real hosted seeded default
(`max_direct_children=8, min_areas_per_cluster=3, max_safety_depth=6, one_child_prevention=true` —
V121's seed UPDATE, matching the values `NavigationTreeRealScaleRegenerationIT` already uses
elsewhere in this suite). Only the **geography** is a structural cohort; the **policy** is real.

Coordinates were entered by hand as decimal-degree approximations and were not looked up against
any authoritative geocoding source at test-authoring time — they are "plausible", not
survey-accurate. They are precise enough to exercise real longest-axis bisection, real centroid/
representative selection, and real bearing computation, but must never be read as ground-truth
GPS.

**No local real production/hosted Bangalore geometry export was found.** Investigated and ruled
out:
- `scripts/dev/local-fixture-backend.sh` — restores a generic throwaway PostGIS fixture (via
  `scripts/db/restore-test-fixture.sh` + `scripts/db/fixtures/discover-smoke-seed.sql`), not a
  Bangalore-specific geography export.
- `scripts/db/fixtures/bangalore-mangalore-schools-seed.sql` — real Bangalore **schools** with
  `area_key` attributions to existing named areas (Hebbal, Yelahanka, Electronic City, HSR Layout,
  etc.), but this is a `schools` table seed, not `areas`/`city_regions`/`city_region_memberships`
  geometry, and carries no region membership or hierarchy data at all.
- No `city_region_memberships`/`city_regions` Bangalore CSV/SQL export exists anywhere under
  `supabase/` or `backend/src/test/resources/` in this worktree.

## 2. Per-group candidate-quality table

Generated once (`bangalore-cohort` fixture) via `generateAndStoreForRevision`, asserted against the
persisted `sandbox_navigation_nodes` rows.

| Metric | North group | South group |
|---|---|---|
| Total canonical Areas | 40 | 7 |
| Local Destination (CLUSTER) level required? | Yes (40 > 15) | No (7 <= 15, and <= policy's `max_direct_children`=8) |
| Generated LD count | 5 clusters | 0 (direct-to-AREA) |
| Cluster sizes (min / median / max) | 8 / 8 / 8 (arithmetically exact: 40 areas / bucketSize(8) = k=5, 40 divisible evenly by 5) | n/a |
| One-child LD present? | No — every cluster holds 8 members | n/a |
| Stable node keys / display_order | Yes — 1..5 gapless per cluster, 1..8 gapless per cluster's AREA children | Yes — 1..7 gapless |
| Representative names complete/resolvable | Yes — every DIRECTION/CLUSTER label resolves to `name(rep0)` or `name(rep0) & name(rep1)` from its own `representative_area_keys` | Yes |
| Complete membership (no missing/duplicate/orphaned) | Yes — all 40 area_keys appear exactly once as AREA leaves | Yes — all 7 area_keys appear exactly once |
| Max children per node | 5 (DIRECTION's CLUSTER children) / 8 (each CLUSTER's AREA children) — both <= 15 | 7 (DIRECTION's AREA children) <= 15 |
| Max public depth | 2 (City -> Direction -> Local Destination -> AREA) | 1 (City -> Direction -> AREA) |
| Bearing degrees | NULL at DIRECTION (depth 0); populated, in [0,360), at CLUSTER (depth 1) and AREA (depth 1/2) | NULL at DIRECTION; populated, in [0,360), at AREA (depth 1) |
| Raw seeded `city_regions.display_label` | `"north"` (direction word) | `"south-bangalore-cohort"` |
| Actual persisted DIRECTION `display_label` | Derived from area names — asserted `!= "north"` and `!= region_key` | Derived from area names — asserted `!= "south-bangalore-cohort"` and `!= region_key` |
| Disconnected/suspicious membership | None found — every non-root node's `parent_node_id` resolves within the same persisted revision | None found |

Determinism (AC8, separate `bangalore-cohort-det` fixture, own city): re-running
`generateAndStoreForRevision` on the same revision produced a byte-identical tree — same
node_keys, `display_label`, `representative_area_keys`, `display_order`, `depth`, `centre_lat/lon`,
`min/max_lat/lon`, and `bearing_degrees` for every one of the 54 persisted nodes across both runs.

Shuffled input order (AC9, separate `bangalore-cohort-base` / `bangalore-cohort-shuf` fixtures,
fixed seed 42): with each area's `area_key` identity held stable (assigned from a canonical,
never-shuffled name→index map — see the "confound avoided" note below) and only the **physical row
insertion order** shuffled, the generated tree was structurally identical (same
type/depth/display_order path, `display_label`, representative *names*, area *names*, centre,
bounds, bearing) between the shuffled and unshuffled runs. The test explicitly asserts the
fixed-seed shuffle actually reordered the input (`shuffledNorth != unshuffledNorth` by name) before
trusting the "identical tree" comparison, closing the false-pass risk qa-fast flagged at gate 1.

*Confound avoided:* an early draft of this fixture derived each area's `area_key` numeric suffix
from its position in the (possibly shuffled) insertion list, which would have silently changed each
area's **identity** whenever the list was shuffled — confounding the very variable AC9 is meant to
isolate. The final fixture assigns `area_key` from a canonical, always-unshuffled name→index map,
so shuffling only ever changes physical INSERT statement order, never area identity.

## 3. Q1 — maximum canonical Area count in a single first-level group

**Answer (for the data actually used in this test): 40**, in the north group of the
`bangalore-cohort` structural cohort described above.

This is **NOT** a measurement of production Bangalore. **Q1 remains UNRESOLVED against real hosted
Bangalore `city_region_memberships` data** — this session had no access to that data and did not
attempt to fabricate a substitute claiming production fidelity. A future slice with hosted/shared
Supabase read access (or a committed read-only export, per the original design.R7 assumption)
should re-run this same measurement against the real membership counts per `city_regions.region_key`
for `citySlug=bangalore` to get the true answer.

**Design.R9 branch determination for the data this test actually used:** 40 <= 225, so the
**"<= 225 proceed"** branch applies to this structural cohort. No relaxation of the Direction
fan-out to 20 was needed, and no PR-blocking "> 300, ask one evidence-backed question" branch was
triggered. This says nothing about which branch production Bangalore falls into — that determination
is exactly the open question above.

## 4. What this proves / what this does NOT prove

**Proves**, over the #2086 generator/validator pipeline as it stands in this worktree (S1/S1b/S2/S3
complete, navigation package green at 227/227):
- A first-level group shaped exactly like Bangalore's real defect (a region well past the 15-area
  Local-Destination threshold, seeded under a policy whose `max_safety_depth` would previously have
  suppressed clustering entirely) now correctly produces a Local Destination (CLUSTER) level instead
  of 40 flat AREA children.
- A sparse group correctly stays flat (direct-to-AREA, no spurious CLUSTER).
- Every canonical Area appears exactly once; no node exceeds 15 children; no one-child LD; max
  public depth 2.
- Every DIRECTION/CLUSTER label is structurally derivable from its own representative area names,
  and the specific Bangalore incident detail — a raw `city_regions.display_label` of `"north"`
  leaking through as the customer-facing label — does **not** recur.
- The generated tree is deterministic across regeneration (AC8) and independent of DB row physical
  insertion order (AC9), including labels, centres, bounds, and the new `bearing_degrees` column.
- `bearing_degrees` is NULL at depth 0 and populated, normalised to `[0,360)`, below.

**Does NOT prove** (restated from the #2086 approved plan's honest limits — unchanged by this
slice):
- That promotion into live `navigation_nodes` succeeds.
- That the city-wide delete-and-reinsert is safe under concurrent reads.
- That the frontend renders end-to-end against hosted data.
- That hosted `city_region_memberships` still match this (or any) fixture at promotion time.
- Anything about the TRUE maximum group size in production Bangalore (Q1 — see section 3).
- Anything about geometry accuracy: this cohort's coordinates are hand-entered approximations, not
  survey data.

## 5. Findings in files this slice does not own (reported, not fixed)

`NavigationTreeValidationService.validate(...)` (the 6-arg overload, lines ~121-136 in this
worktree) carries a javadoc comment claiming: *"Known production-wiring gap (#2086 S2 report):
`NavigationTreeGenerationService#generateAndStoreForRevision` — a file outside this change's
ownership — still calls the 6-arg overload above, so check #16 does not yet run against real
generated trees."*

This appears to be **stale documentation**. Reading
`NavigationTreeGenerationService#generateAndStoreForRevision` directly (lines ~171-176) shows it
already calls the full 7-arg `validate(...)` overload, passing a `displayLabelByNodeKey` map built
from `GeneratedNode::nodeKey` / `GeneratedNode::displayLabel` — i.e. check #16 (label provenance)
**is** wired into the real generation path today. This test's own AC6/AC7 assertions (the `"north"`
label case) only pass because check #16 (or an equivalent structural guarantee) is genuinely active
on this path; if it were truly disconnected as the comment claims, a regression there would go
undetected by the validator, though this test's own direct label assertions would still catch it.

Recommend a follow-up doc-only fix (owned by whichever slice next touches
`NavigationTreeValidationService`) to remove or correct that stale "known gap" paragraph so a future
reader doesn't mistakenly believe check #16 is a no-op in production.

## 6. Test results

```
rtk mvn -f backend/pom.xml test -Dtest=NavigationTreeBangaloreCandidateIT -DfailIfNoTests=true
Tests run: 3, Failures: 0, Errors: 0, Skipped: 0
exit code: 0

rtk mvn -f backend/pom.xml test -Dtest='com.example.realestate.discover.navigation.*Test' -DfailIfNoTests=true
Tests run: 227, Failures: 0, Errors: 0, Skipped: 0
exit code: 0
```

Both commands ran real Testcontainers PostGIS (`postgis/postgis:15-3.4-alpine`), real Flyway
(migrations through V124), and real assertions against persisted `sandbox_navigation_nodes` rows —
not mocked. The navigation package's pre-existing 227/227 baseline is unchanged.
