# Sprint Enriched Specs — Discover & Trends Redesign
# Model B: milestone "Discover & Trends Redesign" (#9) + label "sprint-discover-trends"
# Enriched: 2026-04-19 (lightweight mode — all issues had 200+ char descriptions with explicit ACs)

---

## [#767] feat(trends): rename /area-overview to /trends; add city + repeated areaKey URL support

AC:
- [ ] `/trends` is a public route in `src/App.tsx` (no `ProtectedRoute` wrapper) and renders the Trends page
- [ ] `/trends?city={slug}` fetches `GET /api/trends/options?city={slug}` and populates defaults
- [ ] `/trends?city={slug}&areaKey=K1` (and up to three repeated `areaKey` params) passes the decoded keys to the Trends component
- [ ] Legacy `/area-overview` redirects to `/trends` with `replace: true`: `?city=X&areaKey=K` preserved; `?areaKey=K` alone → `/trends?city={inferredCity}&areaKey=K`; no params → `/trends?city=bangalore`
- [ ] City inference: parse areaKey prefix (split on `|`, index 2 = district; map Bengaluru→bangalore, Mangalore→mangalore, Udupi→udupi); fallback to `'bangalore'`
- [ ] Back button from `/trends` after redirect skips `/area-overview` (confirms `replace` is used)
- [ ] Invalid city slug renders error state; loading renders skeleton

Out of scope: Page UI rewrite, dropdown, charts (owned by #768); auth on dealer/admin Trends dashboards.

Key unknowns resolved:
- City inference: prefix-parse from areaKey (`IN|KA|{district}|{locality}`), index 2 maps to city slug; hard fallback = 'bangalore'

---

## [#768] feat(trends): rename AreaOverview to Trends; add dropdown, Recharts, and public access

AC:
- [ ] `src/pages/AreaOverview.tsx` renamed to `src/pages/Trends.tsx`; all imports updated; renders without auth from all entry points
- [ ] Dropdown init from URL: up to three `areaKey` params populate dropdown in URL order; first selected
- [ ] With no areaKey params: `GET /api/trends/options?city=X` populates `defaultAreas`; first selected
- [ ] With >3 areaKey params: first 3 kept; URL immediately normalized via `replace` to drop excess
- [ ] Invalid/unknown areaKey: silently removed from dropdown + URL; fall back to backend `defaultAreas` if all invalid
- [ ] Dropdown change: re-orders URL so selected areaKey is at position 0; cards + charts update
- [ ] After every dropdown transition: URL `areaKey` params exactly match dropdown items in order
- [ ] 4 metric cards bind to `GET /api/trends/overview?areaKey=K` response: Price Change, Demand Score, Avg Price, Listing Quality; no stubbed/hard-coded values
- [ ] Recharts LineChart renders `priceHistory` (month labels X, ₹ Cr Y); PieChart renders `popularTypes` with percentage labels on slices
- [ ] Time range selector: client-side filters `priceHistory` array by month count (no backend param change)
- [ ] Tab switching hides inactive content; loading skeleton; error state if area unavailable
- [ ] "Explore on Map" → `/discover?city={city}&areaKey={selectedAreaKey}` (URL-encoded)
- [ ] Anonymous users: page renders with no redirect to `/auth`; no comparison layout anywhere

Out of scope: Route wiring and legacy redirect (#767); colour palette (#770).

Key unknowns resolved:
- Time range: client-filter only (no backend contract change needed)
- Invalid-areaKey detection: attempt fetch; on 404/error remove from dropdown and URL
- Recharts: verify `npm list recharts`; install if missing (part of this PR)

---

## [#764] feat(home): add city + locality search form with URL-aware Discover navigation

AC:
- [ ] City Select renders [Bangalore, Mangalore, Udupi]; defaults to Bangalore (enabled, not disabled/placeholder state)
- [ ] Area selector populated from `useTrendingAreas(selectedCity)`; updates on city change; curated fallback (3 areas per city in a constants file) shown when trending returns empty
- [ ] "Explore on Map" enabled with city only; city-only → `/discover?city={slug}`; city+area → `/discover?city={slug}&areaKey={encodeURIComponent(areaKey)}`
- [ ] Trending locality cards → `/discover?city={card.city}&areaKey={encodeURIComponent(card.areaKey)}`
- [ ] "View All Trends" → `/trends?city={selectedCity}`
- [ ] Footer CTA routes through selector (not bypassing it)
- [ ] Anonymous users can use form — no auth prompt

Out of scope: Backend changes to `/api/public/areas/trending`; multi-city; routing inside Discover.

Key unknowns resolved:
- Curated fallback: small hard-coded constant in `src/constants/areaDefaults.ts` (3 areas per city)
- "Explore Area" card links updated from `/area-overview` to `/trends` in this PR (owned here)

---

## [#765] feat(discover): read city + areaKey URL params; two-way sync with chip selection

AC:
- [ ] On mount: `?city=bangalore` scopes listing fetch to Bangalore; city label shown
- [ ] On mount: up to three `?areaKey=` params pre-select matching locality chips in order; 4th+ ignored, no crash
- [ ] Selecting/removing chip immediately writes result back to URL using `replace: true` semantics
- [ ] URL read runs before write-back; write-back does NOT erase inbound `?areaKey` on hydration for anonymous OR authenticated users — URL-supplied areaKeys treated as source of truth when `listings` is empty (anon case)
- [ ] Unrelated URL params (`schoolId`, `radiusKm`) preserved across chip toggles and city changes
- [ ] Back button restores prior chip state

Out of scope: Anonymous users seeing MapFilters (owned by #783); backend city scoping (assumed existing).

Key unknowns resolved:
- Anon write-back fix: skip clearing areaKey in write-back effect when keys came from URL and `listings` is empty; URL is authoritative for initial chip state

---

## [#783] feat(discover): anonymous-user journey — render filters and listings without auth

Decision D8: **Option A** — remove auth gate on MapFilters sidebar, city label, chips, and "View Trends" CTA. Powered from teaser data already available. Signed-in users see no change.

AC:
- [ ] Anonymous `/discover?city=bangalore&areaKey=K1` renders: city label visible, K1 chip pre-selected, "View Trends" CTA present — no auth redirect
- [ ] Click "View Trends" → `/trends?city=bangalore&areaKey=K1` without auth prompt
- [ ] No auth redirect on `/discover`
- [ ] URL write-back does not erase `?areaKey` on anonymous hydration (aligns with #765 fix)
- [ ] Teaser listings render unchanged for anonymous users
- [ ] "Sign in" CTA visible but non-blocking
- [ ] Authenticated users: no behavioural, visual, or layout change

Out of scope: Full map pins for anonymous; save/contact/advanced filter access for anonymous.

Key unknowns resolved:
- D8 = Option A; surfaces to un-gate: `src/pages/Index.tsx` — MapFilters wrapper, filteredListings scoping, city label display; selected-listing preview card remains auth-gated
- Teaser API `areaKey` field: if absent, chips derive from URL params only

---

## [#784] feat(discover): layout parity with mockup — explicit Option A or documented divergence

Decision: **Option B** — document divergence. Current Discover layout retained as production direction. Mockup applies only to colour and component placement from #770/#765.

AC:
- [ ] Epic #763 body updated to state: "Discover retains the existing layout; the mockup reference applies only to colour and component placement from #770/#765"
- [ ] A follow-up issue filed to reconcile mockup artifact to shipped layout (linked from #784 closing comment)
- [ ] PR is doc-only: epic body edit + new GitHub issue; no code changes

Out of scope: Any layout refactoring; Sheet/drawer filter trigger; 50/50 split rendering.

Key unknowns resolved:
- Option B chosen (near-zero risk; avoids Leaflet/PropertyMap rework this sprint)

---

## [#772] feat(listing): add Listing → Trends deep link on listing cards and detail page

AC:
- [ ] `PropertyCard` renders "View Area Trends" link when `showTrendsLink=true` AND `listing.areaKey` is non-empty; target: `/trends?city={city}&areaKey={encodeURIComponent(listing.areaKey)}`
- [ ] No link and no crash when `listing.areaKey` is null/undefined/empty or `showTrendsLink=false`
- [ ] `ListingDetail` "Locality Insights" section link updated from `/area-overview` to `/trends?city={city}&areaKey={encodeURIComponent(listing.areaKey)}`; section hidden when `areaKey` absent
- [ ] Both entry points land on Trends with the listing's area already selected
- [ ] No regression on existing listing card actions; no regression on other Listing Detail sections

Out of scope: Backend changes to compute areaKey; broker-facing card instances.

Key unknowns resolved:
- Anonymous teaser `areaKey`: hide trends link when field absent (safe fallback; no backend change)
- City field: use `listing.city` (not URL city)

---

## [#770] chore(ui): migrate home + discover + trends pages to blue/green palette

AC:
- [ ] Landing page hero CTA: `bg-blue-600 hover:bg-blue-700 text-white`; no terracotta/amber classes on hero CTAs
- [ ] Discover selected locality chips: `bg-blue-100 text-blue-700`; "View Trends" button: blue primary
- [ ] Trends metric cards: green for positive price change, red for negative (literal sign convention)
- [ ] Trends tabs active state: blue underline/highlight; "Explore on Map" CTA: blue primary
- [ ] Broker/admin/dashboard pages: zero palette diffs (verified by file-scope grep)
- [ ] All changed text/background pairs pass WCAG AA (4.5:1) contrast
- [ ] Map pin colours unchanged
- [ ] PropertyCard shared component: colour changes scoped via prop or wrapper class — must not reach broker renders

Out of scope: Layout changes (#784); new components; CSS variable changes; dark mode.

Key unknowns resolved:
- Sign convention: literal — negative price delta = red, positive = green

---

## [#773] test(e2e): realign journeys for Home → Discover → Trends flow

AC:
- [ ] Zero `/area-overview` navigation references in `e2e/**/*.spec.ts`; legacy redirect has dedicated redirect test
- [ ] Specs cover: Home→Discover, Discover→Trends, Listing card→Trends, Listing Detail Locality Insights→Trends, direct `/trends?city=X&areaKey=K` deep link — all pass locally
- [ ] URL normalization asserted: >3 areaKeys trimmed to 3; invalid areaKey removed from URL
- [ ] Dropdown↔URL two-way sync asserted
- [ ] Anonymous flow covered by ≥1 spec without `storageState`: city label, pre-selected chip, "View Trends" CTA, click navigates to `/trends` without auth prompt
- [ ] Authenticated specs use role-based `storageState` fixtures; no UI login loops
- [ ] No `page.waitForTimeout` with arbitrary ms
- [ ] Obsolete comparison-layout specs removed; `.e2e-passed` regenerated by full green run before merge

Out of scope: New product flows beyond covered journeys; backend test harness.

Key unknowns resolved:
- storageState fixtures: check existing `e2e/fixtures/`; create consumer fixture if missing
- Anonymous chip preselection depends on #783 being merged first (hard dependency)
