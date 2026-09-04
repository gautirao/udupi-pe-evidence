# Issue #2427 — Option 2 applied: J1-J4 retargeted onto the Bangalore fixture

Owner ruling on PR #2435: **Option 2**. `e2e/discover-real-data-smoke.spec.ts`
now runs against the canonical Bangalore branch the isolated fixture already
contains, instead of Udupi canonical nodes the fixture has never held.

Udupi coverage loss is tracked as **#2446** — "Restore isolated-fixture
canonical Discover smoke coverage for Udupi".

## Result

| Gate | Command | Project | Exit | Result |
| --- | --- | --- | --- | --- |
| J1-J4 targeted | `bash scripts/run-e2e-local.sh --project=smoke e2e/discover-real-data-smoke.spec.ts` | `smoke` | 0 | 4 passed |
| Full #2427 smoke set | `bash scripts/run-e2e-local.sh` | `smoke` | 0 | 30 passed, 1 skipped (31 collected) |
| Bangalore Central (#2142) | `bash scripts/run-e2e-local.sh --project=full e2e/discover/issue-2142-hierarchy-back-direction-root.spec.ts` | `full` | 0 | 2 passed |

Raw output: `after-option-2-j1-j4.log.txt`, `after-option-2-smoke.log.txt`,
`after-option-2-issue-2142.log.txt`.

The one skip is `Q7 — duplicate booking request is rejected`, which was **already
skipped** on the previous head — see `after-central-branch-smoke.log.txt`, same
`- 30 [smoke] … Q7` line. No test newly skips.

### Movement against the previous head (`606df5c0`)

Previous smoke state was **1 failed / 26 passed**, the failure being J1, with
J2-J4 never running because `mode: 'serial'` masked them behind it. Now: J1
passes, the three masked tests run and pass, and nothing else changed — 26 + 4 =
30 passed. Since this run has **zero** failures over the same 31 collected tests
with the same single skip, no previously passing smoke test can have regressed.

Group A (the 7 broker tests repaired earlier in this PR) is green in the same
run: `broker-dashboard-v2` BD1-BD4, `broker-listing-quality` LQ1-LQ5,
`broker-smoke` D1-D4. J5 and the #2124 review-gap-2 test are green in the same
run too.

## Per-test substitutions

Every value below was read out of the fixture SQL or measured against the
running fixture. None was guessed.

| Item | Was (Udupi) | Now (Bangalore) | Source |
| --- | --- | --- | --- |
| City slug | `udupi` | `bangalore` | `navigation-hierarchy-schools-agri-fixture-seed.sql:68` asserts `cities.slug='bangalore'`; canonical specs use the same slug |
| Direction node | `d:n` | `d:southeast` | `navigation-hierarchy-fixture-seed.sql:41,61` |
| AREA node (J1) | `a:IN\|KA\|Udupi\|Brahmavar` | `a:IN\|KA\|Bengaluru\|RR Nagar` | `navigation-hierarchy-fixture-seed.sql:124`, depth-1 leaf under `d:southeast` |
| AREA node (J4) | `a:IN\|KA\|Udupi\|Manipal` | `a:IN\|KA\|Bengaluru\|RR Nagar` | same leaf — it is the only fixture AREA carrying listings **and** a school |
| School prefetch areaKey | `IN\|KA\|Udupi\|Manipal` | `IN\|KA\|Bengaluru\|RR Nagar` | `navigation-hierarchy-schools-agri-fixture-seed.sql:76-78` |
| School selection | element `[0]` of the response | pinned by name, `[E2E] RR Nagar Fixture Public School` | see retune 2 |

## Retune derivations

**1. `radiusKm` stays 2, now derived rather than inherited.**

The RR Nagar fixture school sits at `12.9314733, 77.5290964`
(`navigation-hierarchy-schools-agri-fixture-seed.sql:78`). RR Nagar's two LIVE
residential listings (`navigation-hierarchy-fixture-listings-seed.sql:93-97`
and `:147-151`):

| Listing | Coordinates | Distance from the school |
| --- | --- | --- |
| `[E2E] RR Nagar Fixture Apartment` | 12.9314733, 77.5290964 | 0.000 km — identical coordinates |
| `[E2E] RR Nagar Fixture House Two` | 12.9314733, 77.5318614 | 0.300 km |

The second is computed, not assumed: same latitude, delta-longitude
`0.0027650` degrees; one degree of longitude at latitude 12.9314733 is
`111.320 × cos(12.9314733°) = 108.497 km`; `0.0027650 × 108.497 = 0.300 km`.
That independently reproduces the seed's own "+300m EAST" note at `:144-146`.

2 km therefore reaches both listings with a ~6.7x margin, while still excluding
the nearest listings in neighbouring AREAs (Deepanjali Nagar ~2.3 km,
Nagarbhavi ~2.4 km) — so a passing J2/J3 is genuinely about RR Nagar rather than
about the radius having swallowed half the city.

**2. The school is pinned by name instead of taken as element `[0]`.**

`SchoolController#byArea` returns "all schools within 2 km of the area centroid",
not schools whose `area_key` matches. Element `[0]` could therefore drift onto an
unrelated Bangalore school, and the radius derived above is only valid for THIS
school's coordinates. The prefetch now requests `size=50` and selects by name.
This mirrors the reason J1 already pinned its AREA marker by identity rather than
using `.first()`.

Confirmed in every run: `School prefetch OK: id=f1713003-0000-0000-0000-000000000001
lat=12.9314733 lon=77.5290964`.

**3. J4's keyword stays `apartment`, and it is still meaningful.**

Verified against the implementation rather than assumed. `q` is forwarded
server-side to `/api/discover/cities/{city}/listings` and becomes
`pl.search_vector @@ websearch_to_tsquery('english', ?)`
(`DiscoverListingPredicateBuilder`). `V18__add_listing_fts_vector.sql` defines
`search_vector` over `title + locality + description`. Of RR Nagar's LIVE
listings only `[E2E] RR Nagar Fixture Apartment` carries that token — the others
are `… House Two` and the two `… Agri Parcel` rows — so the keyword provably
narrows the set instead of matching everything.

**4. J4's `test.skip(baselineCount < 2)` became a hard assertion.**

RR Nagar has exactly two LIVE residential listings, so the old guard sat directly
on its own threshold: one listing fewer and J4 would have silently skipped rather
than failed. The fixture asserts the same `>= 2` at seed time
(`navigation-hierarchy-fixture-listings-seed.sql:200-203`), so a shortfall can
only mean a broken fixture. Nothing in the test architecture requires the skip —
it dates from running against a shared hosted database whose seed could
legitimately be stale, which the isolated fixture makes obsolete.

## Assertions: what changed

**No assertion was weakened.** Every contract the ruling named is still proved:
canonical `node=` ownership on both the Direction and the AREA hop, legacy
`areaKey=` absent, zero 401/403 across the anon journeys, `/school-radius-listings`
invocation on both the anon and authenticated paths, real listing visibility, and
keyword narrowing plus restoration.

Three assertions were **strengthened**, each flagged deliberately rather than
slipped in:

1. J4's skip became an assertion (retune 4 above).
2. J4's narrowing check moved from `filteredCount <= baselineCount` to
   `filteredCount < baselineCount`. The old form was satisfied by equality, so a
   `q` that filtered *nothing* passed it — it never actually proved narrowing.
   The fixture makes strict narrowing deterministic.
3. The two `node=` checks moved from a regex over the raw URL to exact equality
   on the decoded `node` param. This was forced: the app form-encodes a space as
   `+` while `encodeURIComponent` produces `%20`, so a raw-string match on an
   AREA key containing a space (`RR Nagar`) fails for a purely representational
   reason. Exact equality on the parsed value is also stronger than the substring
   regex it replaces.

J2/J3's school-data `test.skip` was likewise replaced by an explicit assertion,
for the same reason as J4's: the fixture guarantees the school and asserts it at
seed time. J3's **credential** skip is genuinely environmental and was kept.

## Map interaction: what the retarget actually required

Bangalore is a dense city root and the fixture is deliberately dense, so neither
hop is a bare marker click. Both shapes were **measured against the running
fixture**, not assumed, after the first attempts failed:

- **City root (zoom 12).** Only `d:northeast` renders as its own destination
  marker. The southern three collapse into
  `visual-cluster:d:central|d:southeast|d:southwest`. Clicking that cluster is the
  app's break-out interaction: it zooms one level, which promotes `d:central` and
  leaves `visual-cluster:d:southeast|d:southwest`.
- **Inside `d:southeast`.** All three AREA leaves sit in ONE cluster,
  `visual-cluster:IN|KA|Bengaluru|Nagarbhavi|IN|KA|Bengaluru|RR Nagar|IN|KA|Bengaluru|Vijayanagar`,
  that **no zoom level separates** — by design.
  `navigation-hierarchy-fixture-listings-seed.sql` places those markers ~10-15m
  apart precisely so the clusterer merges them at any zoom. Clicking the cluster
  opens `areas-cluster-focus-panel`, whose per-member rows
  (`areas-cluster-focus-member-a:<areaKey>`) are how a real user picks one of
  several coincident areas. That panel **is** the marker-activation surface here.
  Note the cluster key lists AREA members with the `a:` prefix **stripped**.

Two real bugs in the old helpers were exposed and fixed in the process:

- The zoom loop raced the first paint. It read `count === 0` purely because
  nothing had rendered yet, zoomed in anyway, and repeated.
- `toBeVisible()` does not mean *clickable*. Leaflet keeps markers in the DOM
  while they are panned outside the visible pane, so an off-screen marker passed
  every pre-click check and `page.mouse.move()` to its out-of-viewport
  coordinates landed on nothing — a click into the void that looks exactly like a
  broken app. `markerHittable` now checks the marker centre against the viewport.

Net effect on coverage: the journey exercises **more** of the product than the
Udupi original did, since the dense-root cluster break-out and the
coincident-marker disambiguation panel are both now on the path. Every step waits
on real app state (the URL camera advancing, an element existing), never a sleep,
and each loop ends in a hard assertion so an unreachable target fails loudly.
