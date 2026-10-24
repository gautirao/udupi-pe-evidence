# E2E retirement map — #2859 batch B5 (discover filters, routes, readiness)

Handoff 285905. Nine legacy specs (`csv7`, `csv20`, `csv55`, `csv59`, `csv65`, `csv68`, `csv99`, `csv183`, `csv202`), one disposition per subclaim. All nine legacy specs and all specialist/canonical specs stay on disk, byte-identical, and claim no new retirement. Nothing in this batch deletes any spec. Manifest `status` stays `SCHEDULED(#2859)`.

Dispositions:
- `COVERED_NEW` — a new test written in this batch, mutation-proven (`M-*` in `.claude/handoffs/issue-285905/evidence/mutation/register.tsv`).
- `COVERED_EXISTING` — an existing test, green at base (`R_base_red`), mutation-proven either by a fresh mutation (`M-*` / `RM*` in `register.tsv`) or by `R_prior_mut` (`prior MUT-*` from a merged map whose test-file and product-file git blob IDs at the prior MUT SHA equal those at `base_sha_actual`).
- `PROTECTED_SPECIALIST (<spec> csv<n>, unmutated)` — a non-coverage pointer under `R_specialist` to a `RETAIN_SPECIALIST` or canonical spec whose body was read at base and asserts the same browser-only property on the same layer/selector. Counted separately from `COVERED_*`, never mutation-proven, and never retires anything.
- `RETAIN` — browser/geometry/paint/router/DB-integration subclaim retained with a concrete reason.
- `STALE` — the product contradicts the spec (`file:line` cited); not claimed, not retained.
- `OBSOLETE` — vacuous tautology, stub echo (`R_stub_echo`), or unmounted legacy UI.

Codex: NOT RUN (usage exhausted).

---

## Evidence and base

- **Worktree & base (`base_sha_actual`).** `issue-2859-b5-discover-filters-routes` on branch `test/2859-b5-discover-filters-routes`, rebased onto `origin/main` at `13319d3177c6d583bf7c54d32f101be8d069c0f9` (`13319d31`).
- **Product tree.** `git diff --exit-code 13319d31 -- apps/web/src apps/api/src/main e2e` exits `0` outside the 8 new `*2859*.test.ts(x)` files.
- **OQ3 readiness note (AC5).** For the three readiness rows (`csv59` `e2e/discover-badge.spec.ts`, `csv99` `e2e/discover-viewport.spec.ts`, `csv183` `e2e/issue-2454-scope-aware-relaxation-previews.spec.ts`), `MOVE_DOWN` in the manifest is a **lane-director planning default** (`docs/testing/e2e-retirement-map-pr7.md` §5 and manifest rationale column), **not an owner ruling**. Browser-only subclaims on these rows are recorded as `PROTECTED_SPECIALIST` pointers (where a specialist/canonical spec asserts the same property on the same selector) or `RETAIN` on the row.
- **SEC=Y subclaims (AC8).**
  1. `csv59` `B.AC2` (anonymous count withholding when property filters are active with no area and no school radius, `discoverBadge.ts:310-322`): `COVERED_EXISTING` in `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts` (`AC2/AC6 — filters active, no area selected → stale (Filtered results, no number) > stale when bedrooms filter is active` and `Issue #1817 — anon-count-exposure guard > anon-equivalent: filters active + no area + no school-radius → no M shown, badge not numerically visible`), mutation-proven by `M-B.AC2` (`RED`).
  2. `csv183` `R3/R6.anon` (anonymous `POLYGON` zero-result recovery sends zero preview requests, renders zero relaxation rows, keeps `area-zero-recovery-clear-filters` visible, and backend rejects anonymous `/api/discover/listings/relaxation-previews` with 401 and refuses `polygon=` on `/api/discover/areas/relaxation-previews` with 400): `COVERED_EXISTING` across `apps/web/src/hooks/__tests__/useRelaxationPreviews.test.ts` (L168, `prior MUT-838`), `apps/web/src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx` (L747, `prior MUT-842`), `RelaxationPreviewsSecurityIT#polygonEndpoint_anonymous_returns401_nothingReached` (`RM845`, fresh Surefire XML `tests=3, skipped=0`), `PolygonRelaxationPreviewsControllerTest#noJwt_isRejected` (L95, fresh Surefire XML `tests=8, skipped=0`), and `RelaxationPreviewsFilterParityTest#polygonOnAnonymousRelaxationEndpoint_isRefused` (L255, fresh Surefire XML `tests=6, skipped=0`).

### Base runs (`R_base_red`)

Frontend runs executed with `VITE_SUPABASE_URL=http://127.0.0.1:1 VITE_SUPABASE_PUBLISHABLE_KEY=dummy npx vitest run --reporter=verbose --maxWorkers=1 <file>` at `13319d31`:

| Cited test file | Result at base (`13319d31`) | Exit code | Notes |
|---|---|---|---|
| `apps/web/src/components/area/__tests__/AreaGuide.test.tsx` | 41/41 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/pages/__tests__/Trends.issue1528.test.tsx` | 10/10 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx` | 12/12 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx` | 52/53 PASS (1 pre-existing Radix popover jsdom failure) | 1 | Cited only for check-marked `it`s at L145, L188, L233, L294, L422, L451, L458 per `R_base_red` |
| `apps/web/src/components/discover/__tests__/DiscoverRightPanel.test.tsx` | 63/63 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/features/discover/state/url/__tests__/resultScope.atomicCommit.test.ts` | 13/13 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/hooks/__tests__/useDiscoverSearchState.test.tsx` | 12/12 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/hooks/__tests__/useDiscoverCityListings.test.ts` | 26/26 PASS | 0 | `web-base-slice1.log` |
| `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts` | 42/42 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/hooks/__tests__/useDiscoverListings.issue2016.test.ts` | 3/3 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/features/discover/__tests__/discoverMappers.test.ts` | 48/48 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/lib/__tests__/commercialSummary.test.ts` | 27/27 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/components/property/__tests__/PropertyCard.test.tsx` | 96/96 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/hooks/__tests__/useRelaxationPreviews.test.ts` | 8/8 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx` | 47/47 PASS | 0 | `web-base-slice2.log` |
| `apps/web/src/features/discover/state/url/__tests__/resultScope.test.ts` | 40/40 PASS | 0 | `web-base-slice2.log` |

New `*2859*` test files in this batch (all green at `13319d31`, single batch run `10/10 it`s across 8 files, exit `0`):
- `apps/web/src/hooks/__tests__/useAreaIntelligence.2859.test.tsx` (1/1 PASS, exit 0)
- `apps/web/src/pages/__tests__/Trends.areaIntelligenceWire2859.test.tsx` (1/1 PASS, exit 0)
- `apps/web/src/__tests__/App.trendsAreaRoute2859.test.tsx` (2/2 PASS, exit 0)
- `apps/web/src/hooks/__tests__/useDiscoverPageState.chipDismiss2859.test.tsx` (2/2 PASS, exit 0)
- `apps/web/src/hooks/__tests__/useDiscoverUrlState.searchQuery2859.test.ts` (1/1 PASS, exit 0)
- `apps/web/src/features/discover/controllers/__tests__/useDiscoverFilterChromeController.search2859.test.tsx` (1/1 PASS, exit 0)
- `apps/web/src/features/discover/presentation/__tests__/discoverBadge.searchQuery2859.test.ts` (1/1 PASS, exit 0)
- `apps/web/src/pages/__tests__/Trends.noErrorGuide2859.test.tsx` (1/1 PASS, exit 0)

Backend runs executed with `./mvnw test -Dtest=<Class> -Dsurefire.failIfNoSpecifiedTests=false` in `apps/api` at `13319d31`:

| Cited backend test class | Surefire XML (`TEST-*.xml`) | Exit code |
|---|---|---|
| `com.example.realestate.security.RelaxationPreviewsSecurityIT` | `tests=3, failures=0, errors=0, skipped=0` | 0 |
| `com.example.realestate.discover.PolygonRelaxationPreviewsControllerTest` | `tests=8, failures=0, errors=0, skipped=0` | 0 |
| `com.example.realestate.discover.RelaxationPreviewsFilterParityTest` | `tests=6, failures=0, errors=0, skipped=0` | 0 |

### `R_prior_mut` blob-equality verification (`prior-mut-blobs.tsv`)

Every `COVERED_EXISTING (prior MUT-*)` citation below was checked by comparing `git rev-parse <mut_sha>:<path>` against `git rev-parse 13319d31:<path>` for **both** the cited test file and the mutated product file (recorded in `.claude/handoffs/issue-285905/evidence/mutation/prior-mut-blobs.tsv`). Where either blob differed from the prior record SHA, the mutation was re-run freshly in `register.tsv` as `RM*`. The rows whose test and product blobs are byte-identical at `13319d31` are:
- From `pr5` (`fbcf003e` / `61677992`): `MUT-924` (L7 AI11), `MUT-906` (L20 BR2), `MUT-907` (L20 BR4), `MUT-908` (L20 BR5), `MUT-909` (L20 BR6), `MUT-1015` & `MUT-1016` (L68 FC1), `MUT-1017` (L68 FC2), `MUT-1018` & `MUT-1023` (L68 FC3), `MUT-1019` & `MUT-1024` (L68 FC4), `MUT-1318` (L55 K1.chip), `MUT-1319` (L55 K3.click), `MUT-1323` (L55 K4 cause=empty), `MUT-835..844` (L183 `useRelaxationPreviews.test.ts` + `AreaZeroResultRecovery.test.tsx`), `MUT-846` (L183 `resultScope.test.ts`).
- From `pr6b` (`f6b292a1`): `MUT-B17` (L65 A2-3 `discoverMappers.test.ts`), `MUT-B18` (L65 A2-3/A2-4 `PropertyCard.test.tsx`).

### Mutation summary (`register.tsv`)

42 fresh mutations run in `.claude/handoffs/issue-285905/evidence/mutation/register.tsv`: **42/42 `RED`**, `cited_test_in_observed=yes`, `restored_sha_ok=true`, `green_after=true`.

| Slice | Count | Mutation IDs |
|---|---|---|
| New claims (`COVERED_NEW`) | 8 | `M-AI13`, `M-BR8`, `M-FC6`, `M-K2`, `M-K2b`, `M-K3`, `M-KB`, `M-M4` |
| Existing claims (`COVERED_EXISTING` fresh + `RM*` blob-changed re-runs) | 31 web + 3 backend | `M-K1r`, `RM1301`, `RM1603`, `RM1604`, `RM903`, `RM1302`, `RM1303`, `RM901`, `RM902`, `RM1304`, `RM1306`, `RM1305`, `RM1307`, `RM1308`, `RM1310`, `RM1311`, `RM1312`, `RM1020`, `RM1316`, `RM1317`, `M-B.AC3`, `M-B.AC1`, `M-B.AC2`, `M-B.AC1AC2`, `M-A22`, `M-R.order`, `RM801`, `RM802`, `RM803`, `RM847`, `RM-B30`, `RM845`, `M-R.policy`, `M-R.parity` |

---

## Per-spec retirement map

### csv7 — `e2e/area-intelligence-1528.spec.ts`

Note: Manifest rationale text notes "owner had approved deletion"; per plan rules, no deletion is performed in this batch (deletion requires an explicit by-name owner comment on a deleting PR).

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `AI1` | Full-data hero `h1` renders area label (`Malpe`) | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — six render states (AC9) > full-data: renders real metric values (AC9, AC3)` | `RM1301` |
| `AI2.chip` | Composed hero subtree carries the confidence chip (`Enough data`) | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — composed full-data render (#2750 PR-5 area-intelligence-1528) > composed AreaGuide (full data) hero subtree carries the confidence chip and the primary CTA` | `RM1603` |
| `AI2.cta` | Composed hero subtree carries primary CTA (`View homes in Malpe`) | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — composed full-data render (#2750 PR-5 area-intelligence-1528) > composed AreaGuide (full data) hero subtree carries the confidence chip and the primary CTA` | `RM1604` |
| `AI3` | Composed full-data guide renders at-a-glance section (`How active is the market here?`) | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — composed full-data render (#2750 PR-5 area-intelligence-1528) > composed AreaGuide (full data) shows the at-a-glance section` | `RM903` |
| `AI4` | Typical price label is `"Typical price"`, never `"Median price"` | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AC3, AC4, AC5, AC15, AC16 — AtAGlanceMetrics > Typical price card label is exactly "Typical price" — NOT "Median price" (AC15)` | `RM1302` |
| `AI5` | `mostSearchedBudget` card label `"Most searched budget"` renders `"Not enough data yet"` | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AC3, AC4, AC5, AC15, AC16 — AtAGlanceMetrics > mostSearchedBudget ALWAYS renders "Not enough data yet" (AC4, Q2=A)` | `RM1303` |
| `AI6` | Composed full-data guide renders trust note | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — composed full-data render (#2750 PR-5 area-intelligence-1528) > composed AreaGuide (full data) renders the trust note and the transparency footer` | `RM901` |
| `AI7` | Composed full-data guide renders transparency footer | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — composed full-data render (#2750 PR-5 area-intelligence-1528) > composed AreaGuide (full data) renders the trust note and the transparency footer` | `RM902` |
| `AI8` | `available=false` no-snapshot state shows `"View homes"` CTA and not error screen | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — six render states (AC9) > no-snapshot: available=false shows "View homes" CTA — NOT the error screen (AC9)` | `RM1304` |
| `AI9` | No-snapshot non-Udupi city shows no leaked Udupi/Malpe label or numeric metrics | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AC11 — No-data city: no leaked Udupi markers/pills > no-snapshot Bangalore shows no Udupi/Malpe label or numeric metrics (AC11)` | `RM1306` |
| `AI10` | Dynamic city/area copy (`Bangalore` / `Whitefield`, no `Udupi`/`Malpe` strings) | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AC10 — Dynamic city/area copy > Bangalore fixture shows Bangalore copy — no Udupi/Malpe in user-facing strings (AC10)` | `RM1301` |
| `AI11` | API error on `/trends?city&areaKey&guide=1` renders calm error copy with no fake numeric metrics | `COVERED_EXISTING` | `apps/web/src/pages/__tests__/Trends.issue1528.test.tsx > Area-guide route — useAreaIntelligence error is passed to the guide (#2750 PR-5 1528 row 11) > 1528-api-error: guide=1 area route with useAreaIntelligence isError shows the calm error copy and NO numeric metric` (+ `AreaGuide.test.tsx > AreaGuide — six render states (AC9) > api-error: renders calm error message with no fake values (AC9)`) | `prior MUT-924` (blobs equal) + `RM1305` |
| `AI12` | Loading state renders `aria-busy="true"` guide skeleton on both `AreaGuide` and `Trends` redirect URL | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — six render states (AC9) > loading: renders skeleton` + `apps/web/src/pages/__tests__/Trends.issue1528.test.tsx > Full pipe areaKey redirect — guide renders with real area data (AC14 non-regression) > guide skeleton shows while area intelligence is loading (redirect URL)` | `RM1307`, `RM1308` |
| `AI13.path` | HOP: `useAreaIntelligence` issues public `GET /api/trends/area-intelligence?city=<city>&areaKey=<encoded>` with `skipAuth: true` (and issues nothing when `areaKey` is empty) | `COVERED_NEW` | `apps/web/src/hooks/__tests__/useAreaIntelligence.2859.test.tsx > useAreaIntelligence request on the wire (#2859 B5 L7 AI13.path) > issues exactly one public GET /api/trends/area-intelligence?city&areaKey (encoded pipe key, no Authorization) and nothing while areaKey is empty` | `M-AI13` |
| `AI13.render` | HOP: `Trends` page mounted with the real `useAreaIntelligence` hook renders the hero `h1` and confidence chip from `/api/trends/area-intelligence` (and calm error copy when unserved) | `COVERED_NEW` | `apps/web/src/pages/__tests__/Trends.areaIntelligenceWire2859.test.tsx > Trends area guide wired to the real useAreaIntelligence (#2859 B5 L7 AI13.render) > renders the hero h1 and confidence chip from the transport response; an unserved key renders the calm error copy instead` | `M-AI13` |
| `AI.route-mock` | Legacy spec's own `page.route` stub bodies | `OBSOLETE` | `R_stub_echo`: assertions reading the spec's own route stub payload | — |

destination-cell hop: `COVERED_NEW` (`AI13.path` in `useAreaIntelligence.2859.test.tsx` + `AI13.render` in `Trends.areaIntelligenceWire2859.test.tsx`, `M-AI13` RED).

---

### csv20 — `e2e/buyer-area-route-1539.spec.ts`

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `BR1` | Matched `/trends/:citySlug/areas/:areaSlug` renders `AreaGuide` hero `h1` | `COVERED_EXISTING` | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — matched=true > renders AreaGuide content when resolver returns matched=true` + `AreaGuide.test.tsx` | `RM1310`, `RM1301` |
| `BR2` | Matched route renders `Breadcrumb` landmark naming city and area | `COVERED_EXISTING` | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — #2750 PR-5 buyer-area-route-1539 destination > matched slug: breadcrumb landmark names city and area, both View-homes CTAs carry the exact discover href` | `prior MUT-906` (blobs equal) |
| `BR3` | Matched route renders at-a-glance section | `COVERED_EXISTING` | `apps/web/src/components/area/__tests__/AreaGuide.test.tsx > AreaGuide — composed full-data render (#2750 PR-5 area-intelligence-1528) > composed AreaGuide (full data) shows the at-a-glance section` | `RM903` |
| `BR4` | Both `"View homes in ..."` CTAs carry exact `/discover?city=<slug>&areaKey=<encoded>` `href` | `COVERED_EXISTING` | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — #2750 PR-5 buyer-area-route-1539 destination > matched slug: breadcrumb landmark names city and area, both View-homes CTAs carry the exact discover href` | `prior MUT-907`, `prior MUT-908` (blobs equal) |
| `BR5` | Unmatched slug renders level-1 heading `"Area not found"` | `COVERED_EXISTING` | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — #2750 PR-5 buyer-area-route-1539 destination > unmatched slug: level-1 heading "Area not found" and the map link href` | `prior MUT-909` (blobs equal) + `RM1311` |
| `BR6` | Unmatched slug renders `/discover?city=<citySlug>` map link `href` | `COVERED_EXISTING` | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — #2750 PR-5 buyer-area-route-1539 destination > unmatched slug: level-1 heading "Area not found" and the map link href` | `RM1311` |
| `BR7` | Unmatched slug does not render no-snapshot copy or fabricated metrics | `COVERED_EXISTING` | `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx > TrendsAreaResolved — matched=false (slug-not-found) > slug-not-found does NOT show no-snapshot copy` | `RM1312` |
| `BR8.wiring` | HOP: `App.tsx` declares `/trends/:citySlug/areas/:areaSlug` wrapped in `AppLayout` -> `TrendsAreaResolved`, and mounting that extracted route at `/trends/udupi/areas/malpe` renders the real `TrendsAreaResolved` (`h1` `Malpe`, control `/trends/udupi/areaz/malpe` does not) | `COVERED_NEW` | `apps/web/src/__tests__/App.trendsAreaRoute2859.test.tsx > App.tsx wiring of /trends/:citySlug/areas/:areaSlug (#2859 B5 L20 BR8.wiring) > (a) declares the TrendsAreaResolved route once, at the exact path, wrapped in AppLayout, lazily imported` & `(b) the path App.tsx declares mounts the real TrendsAreaResolved at /trends/udupi/areas/malpe; /trends/udupi/areaz/malpe does not` | `M-BR8` |
| `BR8.real-app` | Full real `<App/>` tree (top-level providers, `RouteErrorBoundary`, `Suspense` lazy boundary) mounting the route | `RETAIN` | `R_injected`: `App.trendsAreaRoute2859.test.tsx` extracts the `<Route>` from `App.tsx` source and mounts it in a `MemoryRouter`; the full `<App/>` provider tree is not mounted in unit tests | — |

destination-cell hop: `COVERED_NEW` (`BR8.wiring` in `App.trendsAreaRoute2859.test.tsx`, `M-BR8` RED; `BR8.real-app` `RETAIN` per `R_injected`).

---

### csv55 — `e2e/discover-area-keyword-search.spec.ts`

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `K.chip-area` | `[data-testid="chip-area"]` visible on cold `areaKey` + `q` URL (spec L317, L567) | `STALE` | `apps/web/src/components/discover/ActiveContextChips.tsx:11-13` (scope objects are never chips) and `ActiveContextChips.tsx:136, 311-323` (`chip-area` is the sq-ft size filter chip from `#2459`); `ActiveContextChips.test.tsx:145-148` asserts `chip-area` absent when `areaMin`/`areaMax` are unset | — |
| `K1.chip` | Cold `q=villa` URL renders `[data-testid="chip-search"]` containing `"villa"` | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx > ActiveContextChips > renders search chip when searchQuery is non-empty` (L422) | `prior MUT-1318` (blobs equal) |
| `K1.input` | Cold `q=villa` URL populates `area-search-input` with `"villa"` (URL -> LIVE reverse-sync + input value) | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/DiscoverRightPanel.test.tsx > DiscoverRightPanel — search input (#952) > reflects searchQuery value in the input` + `apps/web/src/hooks/__tests__/useDiscoverSearchState.test.tsx` (L98/L120) | `RM1317` |
| `K1.request` | `useDiscoverCityListings` appends `q=villa` alongside `areaKeys` on the city listings request (and omits `q` when empty) | `COVERED_EXISTING` | `apps/web/src/hooks/__tests__/useDiscoverCityListings.test.ts > useDiscoverCityListings > appends q to URL params when provided` + `apps/web/src/features/discover/controllers/__tests__/useDiscoverFilterChromeController.search2859.test.tsx` (initial request before dismiss) | `M-K1r` |
| `K1.cards` | Rendered card list shows the 2 `q=villa` cards and hides the unfiltered Apartment card | `RETAIN` | `R_injected`: no lightweight scoped panel+hook card-list mount is wired in this batch without full `MapDiscovery` page composition; server-side `q` filtering is also excluded from unit scope | — |
| `K.badge==cards` | HOP: `deriveDiscoverBadge` under `selectedArea` + `searchQuery` sets `M = areaListings.length` (`2 of 3 match "villa" in Manipal`, `discoverBadge.ts:269-278, 346-375`; control without `q` uses `selectedArea.listingCount = 3`) | `COVERED_NEW` (derivation); rendered-cards equality `RETAIN` | `apps/web/src/features/discover/presentation/__tests__/discoverBadge.searchQuery2859.test.ts > deriveDiscoverBadge — area + keyword search (#2859 B5 L55 K.badge==cards derivation) > area + q: M = areaListings.length (2), N = listingCount (3), copy "2 of 3 match \"villa\" in Manipal"; control without q: unfiltered N=M=3`; composed DOM equality between rendered badge and rendered cards is `RETAIN` (`R_injected`) | `M-KB` |
| `K2.debounce` | HOP: typing `"villa"` updates LIVE `searchQuery` immediately, `debouncedSearch` at 250 ms, and commits `q=villa` to the URL only at 300 ms via `REPLACE` while keeping `areaKey` | `COVERED_NEW` | `apps/web/src/hooks/__tests__/useDiscoverUrlState.searchQuery2859.test.ts > keyword typing: LIVE first, URL q after the debounce, as a REPLACE (#2859 B5 L55 K2.debounce) > handleSearchChange("villa"): LIVE searchQuery at once, debouncedSearch at 250 ms, URL q absent at 299 ms and present at 300 ms via REPLACE; areaKey kept` | `M-K2`, `M-K2b` |
| `K3.click` | Clicking `chip-search-dismiss` invokes `onClearSearch` | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx > ActiveContextChips > calls onClearSearch when search chip dismiss button is clicked` (L451) | `prior MUT-1319` (blobs equal) |
| `K3.dismiss` | HOP: clicking `chip-search-dismiss` through the real `useDiscoverFilterChromeController` + `useDiscoverUrlState` clears `q` from the URL immediately (`delay=0`), preserves `areaKey`, and reverse-syncs LIVE `searchQuery` to `""` | `COVERED_NEW` | `apps/web/src/features/discover/controllers/__tests__/useDiscoverFilterChromeController.search2859.test.tsx > search chip dismiss -> URL and next city-listings request (#2859 B5 L55 K3.dismiss + K3.request) > before: request has areaKeys + q=villa; dismiss chip-search; after: URL q gone (areaKey kept), input empty, next request has areaKeys and no q` | `M-K3` |
| `K3.request` | HOP: in the same `it()` as `K3.dismiss`, the real `useDiscoverCityListings` hook issues a before-dismiss request with `areaKeys` + `q=villa` and, after clicking `chip-search-dismiss`, issues the next request with `areaKeys` and no `q` | `COVERED_NEW` | `apps/web/src/features/discover/controllers/__tests__/useDiscoverFilterChromeController.search2859.test.tsx > search chip dismiss -> URL and next city-listings request (#2859 B5 L55 K3.dismiss + K3.request) > before: request has areaKeys + q=villa; dismiss chip-search; after: URL q gone (areaKey kept), input empty, next request has areaKeys and no q` | `M-K3`, `M-K1r` |
| `K3.badge3` | Rendered `[data-testid="discover-badge"]` DOM transition `2 -> 3` after chip dismiss | `RETAIN` | `R_outcome` / `R_injected`: derivation of both arms (`q` active -> `M=2`, `q` cleared -> `N=M=3` from `selectedArea.listingCount`) is proven in `discoverBadge.searchQuery2859.test.ts`, but the composed badge DOM transition on dismiss is not mounted in the controller harness | — |
| `K4` | Empty-search cause derivation (`searchQuery` active + 0 listings -> `cause='empty'`) and zero-search badge copy (`No results for "zzzznonexistent" in Manipal` with no digit, `discoverBadge.ts:355-357`) | `COVERED_EXISTING` (cause + badge copy); panel empty-state DOM `RETAIN` | `apps/web/src/features/discover/selectors/__tests__/areaSelectedResults.test.ts` (`prior MUT-1323`, blobs equal) + `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts > Issue #1817 — formatDiscoverBadgeCopy > search-zero: "No results for "{q}" in {scope}"` (`M-B.AC1AC2`); composed panel copy `"No listings match this search"` is `RETAIN` | `prior MUT-1323` (blobs equal), `M-B.AC1AC2` |
| `K5` | No area + `q`: spec L520 expects `chip-search` NOT visible (`STALE`: `#1817` `ActiveContextChips.tsx:95-97` renders `chip-search` whenever `searchQuery` is non-empty); URL `q` preserved + city-listings disabled without area (`RETAIN`) | `STALE` (chip-search negative) / `RETAIN` (no-area page mount) | `apps/web/src/components/discover/ActiveContextChips.tsx:95-97` (`chip-search` is no longer gated on area selection); no-area page mount is `RETAIN` | — |
| `K6` | Authenticated parity duplicate of `K1` | Same as `K1` (`K1.chip`, `K1.input`, `K1.request` `COVERED_EXISTING`; `K1.cards` and real signed-in session `RETAIN`) | `R_injected`: real authenticated browser session is `RETAIN` | `prior MUT-1318`, `RM1317`, `M-K1r` |

destination-cell hop: `COVERED_NEW` (`K.badge==cards` derivation in `discoverBadge.searchQuery2859.test.ts` `M-KB`, `K2.debounce` in `useDiscoverUrlState.searchQuery2859.test.ts` `M-K2`/`M-K2b`, `K3.dismiss` + `K3.request` in `useDiscoverFilterChromeController.search2859.test.tsx` `M-K3`/`M-K1r`; `K.chip-area` `STALE` at `ActiveContextChips.tsx:11-13, 136`; `K1.cards`/`K3.badge3` DOM composition `RETAIN`).

---

### csv59 — `e2e/discover-badge.spec.ts` (readiness row, OQ3 planning default)

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `B.ready` | `[data-testid="area-marker"]` visible on bare `/discover?city=udupi` (spec L103, L142) | `STALE` | On a bare `/discover?city=udupi` URL, `journey` defaults to `'area-first'` (`apps/web/src/features/discover/state/url/area.ts:154-169`), which sets `showAreasNavigationDestinations = true` and mounts `AreaDestinationMarkerLayer` (`data-testid="area-destination-marker"`, `apps/web/src/components/map/AreaMarkerLayer.tsx:881-886`) in the mutually-exclusive ternary at `apps/web/src/components/map/PropertyMap.tsx:3235-3275`, never mounting legacy `AreaMarkerLayer` (`data-testid="area-marker"`, `AreaMarkerLayer.tsx:460`) | — |
| `B.click` | Real click on an area marker selects the area (`areaKey` in URL, spec L144) | `PROTECTED_SPECIALIST (e2e/discover-area-nav-journey.spec.ts csv56, unmutated)` | `e2e/discover-area-nav-journey.spec.ts:130-199` (`Journey 1 — area marker click → back → forward > clicking area marker pushes areaKey; Back removes it; Forward restores it`: `.leaflet-marker-icon.area-marker` visible L158, click L164, `areaKey` URL L167 on `/discover?city=udupi&scope=`). Pointer only under `R_specialist`; not counted as `COVERED_*` | — |
| `B.AC3` | No area + no filters: badge shows `cityTotal` (`"{N} verified properties in {City}"`) | `COVERED_EXISTING` | `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts > AC3 — no area, no filters > shows cityTotal when areas are loaded` | `M-B.AC3` |
| `B.AC1` | Area selected + no filters: badge shows `selectedArea.listingCount` (distinct from `cityTotal`) | `COVERED_EXISTING` | `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts > AC1 — area selected > shows selectedArea.listingCount (distinct from cityTotal)` | `M-B.AC1` |
| `B.AC2` | **SEC=Y**: Filters active (`beds=2`) + no area selected: badge withholds numeric count (`stale`, `"Filtered results"`, no number exposed to anonymous caller) | `COVERED_EXISTING` | `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts > AC2/AC6 — filters active, no area selected → stale (Filtered results, no number) > stale when bedrooms filter is active` & `Issue #1817 — anon-count-exposure guard > anon-equivalent: filters active + no area + no school-radius → no M shown, badge not numerically visible` | `M-B.AC2` |
| `B.AC1+AC2` | Area selected + `beds=2` filter active: badge shows filtered `areaListings.length` (`"{M} of {N} match your filters in {area}"`) | `COVERED_EXISTING` | `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts > AC1+AC2 — area selected with filters active > team-lead repro shape — count=2, not 4 (unfiltered area), not 247 (cityTotal)` | `M-B.AC1AC2` |

destination-cell hop: `STALE` (`B.ready` on bare `/discover?city=udupi` at `PropertyMap.tsx:3235-3275` / `AreaMarkerLayer.tsx:881-886`) + `PROTECTED_SPECIALIST` (`B.click` in `e2e/discover-area-nav-journey.spec.ts:158-167`, `csv56`, unmutated); all four badge derivation rows (`B.AC3`, `B.AC1`, `B.AC2` SEC=Y, `B.AC1+AC2`) are `COVERED_EXISTING` with fresh mutations `M-B.AC3`, `M-B.AC1`, `M-B.AC2`, `M-B.AC1AC2`.

---

### csv65 — `e2e/discover-commercial-card-summary.spec.ts`

Note: Retained by owner ruling `6246476795` (named gaps `A2-2` viewport-journey wiring and `A2-5` authenticated area journey). This batch records the lower-level request/mapper/card proofs and leaves the row's `RETAIN` gaps and `SCHEDULED(#2859)` status unchanged.

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `A2-1` | `test.describe` skip gate when `user-auth.json` is absent | `OBSOLETE` | Harness precondition gate (`e2e-retirement-map-pr6b.md`) | — |
| `A2-2.request` | Committed `VIEWPORT` (`rscope=vp`) round-trips to `viewportScope` request param with `areaKeys` absent on `/api/discover/listings` | `COVERED_EXISTING` | `apps/web/src/hooks/__tests__/useDiscoverListings.issue2016.test.ts > useDiscoverListings — Issue #2016 result-scope threading > committed_VIEWPORT_round-trips_to_the_viewportScope_request_param_with_areaKeys_absent` (L61) | `M-A22` |
| `A2-2.parse` | Hook parses `commercialFacts` from the `VIEWPORT` response | `OBSOLETE` | `apps/web/src/hooks/useDiscoverListings.ts:220` returns `api.get` untransformed; the mapper seam is `A2-3` | — |
| `A2-2.wiring` | Authenticated `VIEWPORT` journey renders `>= 1` commercial card in the right panel | `RETAIN` | `OUT_OF_SCOPE_COMPOSITION` per owner ruling `6246476795` (shared page-composition harness not in this batch) | — |
| `A2-3` | `mapListingDtoToProperty` preserves `commercialFacts` and `commercialSubtype` onto the card model | `COVERED_EXISTING` | `apps/web/src/features/discover/__tests__/discoverMappers.test.ts` + `apps/web/src/components/property/__tests__/PropertyCard.test.tsx > PropertyCard > #2516 commercialFacts on the card > keeps the area fact when commercialFacts is spread in after it` | `prior MUT-B17`, `prior MUT-B18` (blobs equal) + `RM-B30` |
| `A2-4` | `PropertyCard` renders non-empty subtype-aware commercial summary and suppresses the generic residential specs row | `COVERED_EXISTING` | `apps/web/src/lib/__tests__/commercialSummary.test.ts` + `apps/web/src/components/property/__tests__/PropertyCard.test.tsx > PropertyCard > #2516 commercialFacts on the card > suppresses the generic specs row once any fact arrives — and the control proves the row renders without one` | `prior MUT-B18` (blobs equal) + `RM-B30` |
| `A2-5` | Authenticated area journey renders `>= 1` commercial card in the right panel | `RETAIN` | Retained per owner ruling `6246476795` (`UNCOVERED`, duplication with canonical area-first unverified on an authenticated session) | — |
| `A2-6` | Test annotation on `#2516` | `OBSOLETE` | Annotation only; no `expect` | — |

destination-cell hop: `RETAIN` (`A2-2.wiring` and `A2-5` retained per owner ruling `6246476795`; `A2-2.request` `COVERED_EXISTING` via `M-A22`, `A2-3`/`A2-4` `COVERED_EXISTING` via `prior MUT-B17`/`MUT-B18` + `RM-B30`).

---

### csv68 — `e2e/discover-filter-chips.spec.ts`

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `FC1` | Cold URL params (`seller=OWNER`, `from`/`to`, `ntm=true`, `rera=true`) render corresponding `ActiveContextChips` (`chip-seller-OWNER`, `chip-date-range`, `chip-new-to-market`, `chip-rera`) | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx` (L188, L233, L294) | `prior MUT-1015`, `prior MUT-1016` (blobs equal) |
| `FC2` | Dismissing `chip-seller-OWNER` calls `onFiltersChange` with `sellerTypes: []` and removes only `seller` from the URL after the 300 ms `REPLACE` debounce | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx` + `apps/web/src/features/discover/state/url/__tests__/resultScope.atomicCommit.test.ts > #2750 PR-5 T2 — filter chip dismiss URL write (FC-5) > writing filters without seller removes only seller from the URL, as a REPLACE after the 300 ms debounce` | `prior MUT-1017` (blobs equal) + `RM1020` |
| `FC3` | Dismissing `chip-date-range` clears both `dateFrom` and `dateTo` | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx` (L233) | `prior MUT-1018`, `prior MUT-1023` (blobs equal) |
| `FC4` | Dismissing `chip-new-to-market` / `chip-rera` clears the boolean flag while preserving remaining filters | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/ActiveContextChips.test.tsx` (L294) | `prior MUT-1019`, `prior MUT-1024` (blobs equal) |
| `FC5` | Chip strip mounts in `guided-entry` state when `activeContextChips` is provided (no area selected) | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/DiscoverRightPanel.test.tsx > DiscoverRightPanel — chip strip mount gate (Issue #1151) > renders chip strip in guided-entry state when activeContextChips is provided` | `RM1316` |
| `FC6` | HOP: clicking chip dismiss (`chip-seller-OWNER-dismiss`, `chip-date-range-dismiss`) flows through the real `useDiscoverFilterChromeController` -> real `useDiscoverPageState.handleFiltersChange` (`useDiscoverPageState.ts:434-447`) -> `urlActions.setFiltersLive` -> URL search params after the 300 ms debounce while preserving sibling filters | `COVERED_NEW` | `apps/web/src/hooks/__tests__/useDiscoverPageState.chipDismiss2859.test.tsx > chip dismiss reaches the URL through the real page state (#2859 B5 L68 FC6) > seller chip x: seller leaves the URL after the live debounce; from/to/ntm/rera stay (control)` & `date chip x: BOTH from and to leave the URL; seller/ntm/rera stay (control)` | `M-FC6` |

destination-cell hop: `COVERED_NEW` (`FC6` in `useDiscoverPageState.chipDismiss2859.test.tsx`, `M-FC6` RED).

---

### csv99 — `e2e/discover-viewport.spec.ts` (readiness row, OQ3 planning default)

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `V.scope` | `expect(page.url()).toMatch(/scope=/)` immediately after `page.goto('/discover?city=udupi&scope=')` (spec L43, L79); `scope=` suppressing the `area-first` default | `OBSOLETE` (URL read-back after `goto`, `R_vacuous`) / `RETAIN` (`scope=` journey gate) | Reading `page.url()` immediately after `page.goto` of that same URL is vacuous (`R_vacuous`, `e2e-retirement-map-pr5.md:407`); the `scope=` gate suppressing `area-first` in `state/url/area.ts` is `RETAIN` (not mutated in this batch) | — |
| `V.paint-city` | `.leaflet-marker-icon.area-marker` visible at city zoom on `/discover?city=udupi&scope=` (spec L44, L80) | `PROTECTED_SPECIALIST (e2e/discover-area-nav-journey.spec.ts csv56, unmutated)` | `e2e/discover-area-nav-journey.spec.ts:158` (`Journey 1 — area marker click → back → forward > clicking area marker pushes areaKey; Back removes it; Forward restores it` asserts `.leaflet-marker-icon.area-marker` visible on `/discover?city=udupi&scope=`). Pointer only under `R_specialist`; not counted as `COVERED_*` | — |
| `V.urls` | `areaKey` / `zoom=14` in URL after `page.goto(areaUrl)`; `areaKey` absent after `page.goBack()`; `areaKey` present after `page.goForward()` (spec L53-54, L62-63, L89-90, L96, L104-105) | `OBSOLETE` | `R_vacuous`: the spec drives two full-document `page.goto()` calls and then calls `goBack()` / `goForward()`; browser history restores the URL entry of two `page.goto()` navigations by construction (`e2e-retirement-map-pr5.md:407`) | — |
| `V.paint-back` | `.leaflet-marker-icon.area-marker` visible again after browser `Back` (spec L67) | `RETAIN` | Real Leaflet marker paint after browser `popstate`; `e2e/discover-area-nav-journey.spec.ts` J1 L178-189 asserts the panel text/card after `Back`, not `.area-marker`. Never claimed from jsdom (`R_jsdom`) | — |
| `V.heading-fwd` | Heading `/Manipal\|properties/i` visible after browser `Forward` (spec L108) | `RETAIN` | Real browser `Forward` + right-panel heading render (`useDiscoverPageState.legacyZoomAreaKeyDeepLink.d9.test.ts` is a hook test and does not mount panel headings) | — |

destination-cell hop: `RETAIN` (`V.paint-back` and `V.heading-fwd` retained as real browser history + Leaflet/panel paint subclaims; `V.paint-city` has a `PROTECTED_SPECIALIST` pointer to `e2e/discover-area-nav-journey.spec.ts:158` `csv56`; `V.urls` `OBSOLETE` per `R_vacuous`).

---

### csv183 — `e2e/issue-2454-scope-aware-relaxation-previews.spec.ts` (readiness row, OQ3 planning default)

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `R1.draw` | Desktop real-pointer polygon draw via the map draw control -> committed `POLYGON` scope + zero-result relaxation apply (spec L374-432) | `PROTECTED_SPECIALIST (e2e/issue-2461-polygon-panel-parity.spec.ts csv185, unmutated)` + `PROTECTED_SPECIALIST (e2e/issue-2016-result-scope-contract.spec.ts csv179, unmutated)` | `e2e/issue-2461-polygon-panel-parity.spec.ts:273-459` (`Issue #2461 — committed POLYGON panel parity (desktop 1366x768, mouse, signed-in) > cards follow the canonical polygon query; zero-result apply refetches and re-renders the polygon set`: real pointer draw L280-310, zero-result relaxation apply L400-458) and `e2e/issue-2016-result-scope-contract.spec.ts:323-345` (`1. draw polygon over committed AREA_SET drives the J3.3 replace-confirmation dialog and commits POLYGON`). Pointers only under `R_specialist`; not counted as `COVERED_*` | — |
| `R.request` | `VIEWPORT` previews hit public `/api/discover/areas/relaxation-previews` with `viewportScope` and no `areaKeys`; signed-in `POLYGON` hits authenticated `/api/discover/listings/relaxation-previews` with `polygon`; `/api/discover/areas/relaxation-previews` never receives `polygon=`; applying a relaxation preserves `rpoly` / `rscope=vp` in the URL | `COVERED_EXISTING` | `apps/web/src/hooks/__tests__/useRelaxationPreviews.test.ts` (L134, L150, L199) + `apps/web/src/features/discover/state/url/__tests__/resultScope.test.ts` | `prior MUT-835`, `prior MUT-836`, `prior MUT-837`, `prior MUT-846` (blobs equal) |
| `R3/R6.anon` | **SEC=Y**: Anonymous `POLYGON` zero-result recovery sends zero preview requests and zero `polygon=` requests, renders 0 relaxation rows while keeping `area-zero-recovery-clear-filters` visible; backend rejects anonymous `GET /api/discover/listings/relaxation-previews` with `401` before reaching controller/service and refuses `polygon=` on `/api/discover/areas/relaxation-previews` with `400` | `COVERED_EXISTING` | `apps/web/src/hooks/__tests__/useRelaxationPreviews.test.ts > POLYGON scope (signed out): disabled — never hits either endpoint, never leaks polygon= to the anonymous endpoint` (L168); `apps/web/src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx > POLYGON (signed OUT): renders NO relaxation rows even if a reply is somehow present — no anonymous polygon path exists` (L747); `com.example.realestate.security.RelaxationPreviewsSecurityIT#polygonEndpoint_anonymous_returns401_nothingReached`; `com.example.realestate.discover.PolygonRelaxationPreviewsControllerTest#noJwt_isRejected` (L95); `com.example.realestate.discover.RelaxationPreviewsFilterParityTest#polygonOnAnonymousRelaxationEndpoint_isRefused` (L255) | `prior MUT-838`, `prior MUT-842` (blobs equal), `RM845` |
| `R.order/copy` | Section DOM order `[scope-actions, relaxations]`, polygon preservation note `"Your drawn area stays exactly as it is."`, scope-specific headings (`"inside your drawn area"` / `"in the visible map area"`), and `VIEWPORT` never naming a previously selected area | `COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx > AreaZeroResultRecovery — scope-aware relaxation previews (#2454) > VIEWPORT: hands the committed viewport to the hook and renders the rows with its numbers, anonymously` (L677) & `POLYGON (signed in): hands the committed polygon to the hook and renders the rows with its numbers` (L700) & `VIEWPORT names the visible map area, never a previously-selected area` (L309) | `M-R.order` + `prior MUT-839..844` (blobs equal) |
| `R.count` | Rendered relaxation row badge count equals `previews[i].resultingCount` (`+8`, `+5`, `+4`) | `COVERED_EXISTING` | `apps/web/src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx > AreaZeroResultRecovery — scope-aware relaxation previews (#2454) > VIEWPORT: hands the committed viewport to the hook and renders the rows with its numbers, anonymously` (L691-693) & `POLYGON (signed in): hands the committed polygon to the hook and renders the rows with its numbers` (L718-719) | `M-R.order` + `prior MUT-843` (blobs equal) |
| `R.parity` | Backend filter-parsing parity between `PolygonRelaxationPreviewsController` and `AreaRelaxationPreviewsController` (`COVERED_EXISTING`); post-apply DB count-equality between `relaxation-previews` and `/api/discover/listings?polygon=` (`RETAIN`) | `COVERED_EXISTING` (filter-parsing parity) / `RETAIN` (DB count-equality IT) | `com.example.realestate.discover.RelaxationPreviewsFilterParityTest#filterParsing_polygonVersusAreas` (`tests=6, skipped=0`, `M-R.parity` RED); `RelaxationPreviewsServiceIT` requires Docker/Testcontainers (`skipped` without Docker daemon) and is `RETAIN` per `approved-plan.toml` L164 | `M-R.parity` |
| `R.policy` | Outside-city, too-broad, or malformed polygon on `/api/discover/listings/relaxation-previews` returns `400` and never invokes `RelaxationPreviewsService` | `COVERED_EXISTING` | `com.example.realestate.discover.PolygonRelaxationPreviewsControllerTest#policyRejection_outsideCity_returns400_serviceNeverCalled` (L132) & `#policyRejection_tooBroad_returns400_serviceNeverCalled` (L145) | `M-R.policy` |
| `R2/R5.vp-substitution` | Committed `VIEWPORT` in `DiscoverRightPanel` substitutes `authViewportListings` (never `polygonListings` or area listings) | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/DiscoverRightPanel.test.tsx > DiscoverRightPanel > Issue #2461 — committed POLYGON substitutes polygonListings for the AREA-keyed list > control: a committed AUTHENTICATED VIEWPORT still substitutes authViewportListings, never polygonListings` (L625) | `RM847` |
| `R4-R6.mobile` | Mobile `390x844` viewport shell arms (`R4` signed-in polygon by URL, `R5` mobile viewport, `R6` mobile anonymous polygon) | `RETAIN` (mobile viewport shell); hook/panel/backend subclaims take desktop dispositions above | Mobile `390x844` layout/sheet shell is `RETAIN` (`R_retain`) | — |

destination-cell hop: `COVERED_EXISTING` (`R.request`, `R3/R6.anon` SEC=Y, `R.order/copy`, `R.count`, `R.parity` filter-parsing half, `R.policy`, `R2/R5.vp-substitution` proven by `RM845`, `M-R.policy`, `M-R.parity`, `M-R.order`, `RM847`, and blob-equal `prior MUT-835..844, 846`) + `PROTECTED_SPECIALIST` (`R1.draw` in `e2e/issue-2461-polygon-panel-parity.spec.ts:273-459` `csv185` and `e2e/issue-2016-result-scope-contract.spec.ts:323-345` `csv179`, unmutated) + `RETAIN` (`R.parity` DB Testcontainers half in `RelaxationPreviewsServiceIT` and `R4-R6.mobile` `390x844` shell).

---

### csv202 — `e2e/map-filters.spec.ts`

| Id | Subclaim | Disposition | Destination / reason | Mutation |
|---|---|---|---|---|
| `M1` | Legacy filter Sheet drawer content (`BHK`, `Price`, `Seller`) | `OBSOLETE` | Legacy filter Sheet props are no longer forwarded (`DiscoverRightPanel.commercialCapability2596.test.tsx:100`; `e2e-retirement-map-pr5.md` row 1) | — |
| `M2` | Legacy filter Sheet BHK clear action | `OBSOLETE` | Same unmounted legacy Sheet drawer (`e2e-retirement-map-pr5.md` row 2) | — |
| `M3` | Right-panel search input reflects `searchQuery`, typing fires `onSearchChange`, and clear button calls `onSearchChange("")` | `COVERED_EXISTING` | `apps/web/src/components/discover/__tests__/DiscoverRightPanel.test.tsx > DiscoverRightPanel — search input (#952) > typing in the input fires onSearchChange` (L871) & `clear button appears when searchQuery is non-empty and clicking it calls onSearchChange("")` (L891) | `RM803`, `RM802` |
| `M4.h1` | `/trends?city=udupi&areaKey=IN|KA|Udupi|Malpe` renders the area guide `h1` (`Malpe`) | `COVERED_EXISTING` | `apps/web/src/pages/__tests__/Trends.issue1528.test.tsx > Full pipe areaKey redirect — guide renders with real area data (AC14 non-regression) > /trends?city=udupi&areaKey=IN|KA|Udupi|Malpe renders guide, NOT legacy` (L260) | `RM801` |
| `M4.neg` | HOP: `/trends?city=udupi&areaKey=IN|KA|Udupi|Malpe` renders the guide `h1` (positive control) and never renders legacy `"Area not found"` even when `useAreaOverview` errors (`COVERED_NEW`); top-level Sentry error boundary (`"Something went wrong. Please refresh the page."`, `main.tsx:14`) (`RETAIN`) | `COVERED_NEW` (`"Area not found"` negative) / `RETAIN` (`main.tsx:14` error boundary) | `apps/web/src/pages/__tests__/Trends.noErrorGuide2859.test.tsx > Trends pipe areaKey never renders legacy "Area not found" (#2859 B5 L202 M4.neg) > renders the guide h1 and never "Area not found" for a pipe areaKey even when useAreaOverview errors` (`M-M4` forces `shouldRenderGuide = false` in `Trends.tsx:101` and fails specifically on `expect(screen.queryByText(/area not found/i)).not.toBeInTheDocument()`); `main.tsx:14` error boundary sits outside the unit-mountable `<Trends/>` tree (`RETAIN`) | `M-M4` |
| `M5.count` | `expect(markerCount).toBeGreaterThanOrEqual(0)` (spec L169) | `OBSOLETE` | `R_vacuous`: `count() >= 0` is a mathematical tautology (`e2e-retirement-map-pr5.md` row 5) | — |
| `M5.container` | `.leaflet-container` visible on `/discover` | `PROTECTED_SPECIALIST (e2e/canonical/discover-intent.canonical.ts T23, unmutated)` | `e2e/canonical/discover-intent.canonical.ts:54-108` (`[role:user] T23 — Buy -> Rent changes the result set by id, and the intent survives a List <-> Map switch`, L95 `await expect(page.locator('.leaflet-container')).toHaveCount(1)`; canonical file byte-identical to verified baseline `13319d31` where canonical E2E passed 59/59 twice). Pointer only under `R_specialist`; not counted as `COVERED_*` | — |

destination-cell hop: `COVERED_NEW` (`M4.neg` `"Area not found"` negative with positive `h1` control in `Trends.noErrorGuide2859.test.tsx`, `M-M4` RED on the negative assertion; `main.tsx:14` top-level error boundary `RETAIN`; `M5.container` has a `PROTECTED_SPECIALIST` pointer to canonical `T23`).

---

## Disposition totals across the 9 specs

- `COVERED_NEW`: 8 subclaims (all 8 mutation-proven in `register.tsv`: `M-AI13`, `M-BR8`, `M-K2`/`M-K2b`, `M-K3`, `M-KB`, `M-FC6`, `M-M4`).
- `COVERED_EXISTING`: 38 subclaims (all 38 mutation-proven via fresh `M-*`/`RM*` rows in `register.tsv` or blob-equal `prior MUT-*` records in `prior-mut-blobs.tsv`).
- `PROTECTED_SPECIALIST` pointers (non-coverage, unmutated, counted separately per `R_specialist` / AC1): 4 subclaims (`csv59 B.click`, `csv99 V.paint-city`, `csv183 R1.draw`, `csv202 M5.container`).
- `RETAIN`: 12 subclaims (`csv20 BR8.real-app`, `csv55 K1.cards`, `csv55 K.badge==cards` DOM-cards half, `csv55 K3.badge3`, `csv55 K4` panel DOM, `csv55 K5` no-area mount, `csv55 K6` session, `csv65 A2-2.wiring`, `csv65 A2-5`, `csv99 V.scope` gate + `V.paint-back` + `V.heading-fwd`, `csv183 R.parity` Testcontainers IT + `R4-R6.mobile`, `csv202 M4.neg` `main.tsx:14` boundary).
- `STALE`: 3 subclaims (`csv55 K.chip-area`, `csv55 K5` chip-search negative, `csv59 B.ready`).
- `OBSOLETE`: 8 subclaims (`csv7 AI.route-mock`, `csv65 A2-1`, `csv65 A2-2.parse`, `csv65 A2-6`, `csv99 V.scope` URL read-back, `csv99 V.urls`, `csv202 M1/M2`, `csv202 M5.count`).
