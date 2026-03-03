# Sprint 11 Plan — UX Polish + Map Navigation + Market Context

**Sprint**: Sprint 11
**Date**: 2026-03-02 (active)
**Status**: SPEC — awaiting implementation approval
**Focus**: End-to-end user journey improvements: map locality navigation, listing market context widget, UX polish from review findings.

---

## 0. Sprint Goal

> A user can find listings in a specific Udupi district locality in two clicks, view any listing and immediately understand whether the price is reasonable relative to the area, and see similar nearby options — all without a paywall.

---

## 1. Goals

- **Map navigation**: Selecting a locality zooms the map to that area. Locality quick-chips on the map surface eliminate the need to open the filter panel for the most common action.
- **Listing market context**: Every listing detail page shows price-per-unit (sqft or cent) and a free "Area Market" widget with area median comparison and 6-month sparkline — using a Supabase RPC, no backend schema changes.
- **Good deal badge**: A subtle badge in the map bottom card (computed client-side from already-loaded data) tells users at a glance whether a listing is priced above or below the area median.
- **Similar listings**: 3 recent similar listings in the same locality shown below the listing detail.
- **UX polish**: Fix apartment filter bug, reorder listing detail CTAs, explain "low confidence" badge, improve empty states.
- **Insights enhancement**: Add property-type selector to Insights price trend chart; degrade gracefully when sqft data is unavailable.

---

## 2. Non-Goals

- No backend scheduled job for `area_price_weekly` population (Phase 2, deferred)
- No cross-area comparison UI
- No text search on listings
- No price alerts / email notifications
- No schema changes to existing tables in Phase 1
- No changes to auth, payments, or booking flows

---

## 3. Key Technical Decisions

### 3.1 No new API calls for map locality zoom
Bounding box computation uses already-loaded `listingsWithCoords` array. Filter by selected locality → compute `L.latLngBounds` → `fitBounds`. Zero network requests.

### 3.2 Client-side "good deal" badge in map
`useMemo` over already-loaded listings to compute per-locality median price-per-unit. Each listing is compared to its locality+type+bedrooms median in memory. Zero new API calls. Only possible because the full listing dataset is loaded upfront.

### 3.3 Supabase RPC for listing detail market context
The listing detail "Area Market" widget needs ALL same-type listings in the locality (including those without coordinates — not in the map dataset) and historical trend data. This requires a Postgres function called via Supabase `rpc()`. No new Spring Boot endpoints needed.

The function `get_listing_market_context(locality, property_type, bedrooms, months)` returns:
- Monthly buckets: `{month, listing_count, median_price_per_unit, p25, p75, price_basis}`
- `price_basis` is `'per_sqft'` for apartment/house/commercial or `'per_cent'` for land

For land: uses pre-computed `price_per_cent_paise` column (V3 migration).
For apartment/house: uses `price / built_area` where `built_area_unit = 'sqft'` AND both non-null.
Graceful degradation: if `< 5` results, returns empty → widget shows "Not enough data yet".

### 3.4 Phase 2 path (not this sprint)
When listing volume warrants it: populate `area_price_weekly` (V2 schema) with a `pg_cron` scheduled job. The `AreaMarketWidget` hook can be switched to query `area_price_weekly` instead of calling the RPC — the widget component doesn't change.

---

## 4. PR List

| PR | Name | Priority | Dependencies | Risk tier | Status |
|----|------|----------|--------------|-----------|--------|
| PR-11.1 | Bug: apartment missing from MapFilters | P0 | none | LOW | ☐ |
| PR-11.2 | Map: zoom to locality bounds on filter | P1 | none | LOW | ☐ |
| PR-11.3 | Map: locality quick-chips overlay | P1 | PR-11.2 done first (logical dependency on zoom behavior) | LOW | ☐ |
| PR-11.4 | Listing detail UX polish | P1 | none | LOW | ☐ |
| PR-11.5 | Supabase RPC + useListingMarketContext hook | P1 | none | MEDIUM | ☐ |
| PR-11.6 | AreaMarketWidget component on listing detail | P1 | PR-11.5 | LOW | ☐ |
| PR-11.7 | Good deal badge (client-side, map + bottom card) | P2 | none | LOW | ☐ |
| PR-11.8 | Similar listings section on listing detail | P2 | none | LOW | ☐ |
| PR-11.9 | Insights: property-type selector + sqft trends | P2 | PR-11.5 (reuses RPC) | MEDIUM | ☐ |
| PR-11.10 | Smoke test doc update | P2 | all P1 PRs | LOW | ☐ |

---

## 5. PR Details

---

### PR-11.1 — Bug: apartment missing from MapFilters (P0)

**Problem (UX-01)**: `MapFilters.tsx` lists four property types: `['land', 'house', 'commercial', 'other']`. The `apartment` type is absent. Users see violet apartment pins on the map and in the legend, but cannot filter to show only apartments.

**Files (1)**:
1. `src/components/map/MapFilters.tsx` — add `{ value: 'apartment', label: 'Apartment' }` to the `propertyTypes` array (between `house` and `commercial`)

**Acceptance criteria**:
- Filter panel shows 5 checkboxes: Land, House, Apartment, Commercial, Other
- Checking "Apartment" filters map pins to apartment type only
- All 5 types can be combined or selected independently

**Test plan**:
- Unit: update `MapFilters.test.tsx` (if exists) to assert 5 checkboxes render
- Smoke: Section A of browser smoke test — verify apartment filter visible and functional

**Risk tier**: LOW (cosmetic + single-line change)

---

### PR-11.2 — Map: zoom to locality bounds on filter selection (P1)

**Problem (UX-02)**: Selecting a locality filter does not move the map viewport. Pins become invisible if they fall outside the default Udupi center view.

**Approach**:
1. In `Index.tsx`: when `filters.localities` is non-empty and `listingsWithCoords` is loaded, compute `L.latLngBounds` from listings filtered to selected localities.
2. Pass `focusBounds` as a prop to `PropertyMap`.
3. In `PropertyMap.tsx`: extend `MapController` to accept an optional `focusBounds` prop. Call `map.fitBounds(focusBounds, { padding: [50, 50] })` when it changes (guarded: only fires if bounds are valid and different from current view).

**Edge cases**:
- Single listing in locality: use `flyTo` with zoom 15 instead of `fitBounds` (bounds of a single point are degenerate)
- No listings with coordinates for selected locality: do not change map view; show no-pins state naturally
- Multiple localities selected: compute union of all their listing bounds

**Files (2)**:
1. `src/pages/Index.tsx` — compute `focusBounds` from filtered listings; pass to `PropertyMap`
2. `src/components/map/PropertyMap.tsx` — extend `MapController` props to accept + apply `focusBounds`

**Acceptance criteria**:
- Selecting "Karkala" in filter causes map to fly to and fit the Karkala listings bounding box
- Selecting multiple localities fits all of them in view
- Selecting a locality with no coordinate data does not crash or pan to incorrect location
- Clearing the locality filter does not reset map position (stays wherever user left it)
- No new API calls on locality selection

**Test plan**:
- Unit: test `computeLocalityBounds(listings, localities)` utility function
- Browser smoke: new Section M (locality zoom) — select locality → verify map moves

**Risk tier**: LOW (no auth, no data fetch, pure frontend map interaction)

---

### PR-11.3 — Map: locality quick-chips overlay (P1)

**Problem (UX-06)**: Locality filtering requires 4–5 interactions. First-time users don't discover locality filtering.

**Approach**:
- In `Index.tsx`, add a horizontal chip row overlaid on the map (above the map content, z-[1000]).
- Chips are computed from already-loaded listings: `useMemo` to group by locality → sort by count → take top 6.
- If `listingsWithCoords` is empty or loading, chips row is not shown (no layout shift).
- Each chip: `Button variant="outline" size="sm"` with locality name + count badge.
- Active (selected in filter) chips get a different style: `bg-primary text-primary-foreground`.
- Clicking active chip deselects it. Clicking inactive chip adds it to `filters.localities` (same behavior as the combobox in `MapFilters`).
- On mobile: chips row is horizontally scrollable with `overflow-x-auto` and `flex-nowrap`.

**Files (1)**:
1. `src/pages/Index.tsx` — add `LocalityChips` sub-component (inline or extracted); wire to `filters` state

**Acceptance criteria**:
- Up to 6 chips visible on map surface showing top localities by listing count
- Clicking a chip selects the locality filter AND triggers the zoom from PR-11.2
- Clicking an active chip removes it from filter
- Chips work in concert with the MapFilters sidebar (both update the same `filters.localities` state)
- On mobile: chips scroll horizontally without wrapping
- No new network requests

**Test plan**:
- Unit: test `computeTopLocalities(listings, n)` utility function
- Browser smoke: verify chips appear and interact correctly with filter and map zoom

**Risk tier**: LOW

---

### PR-11.4 — Listing detail UX polish (P1)

**Problems**: UX-03 (price-per-unit), UX-04 (CTA order), UX-08 (confidence tooltip), UX-10 (back button)

**Changes (all in one file)**:

**A. Price-per-unit calculation** (below primary price, title section):
- Land: if `price_per_cent_paise` is set → show `₹{(price_per_cent_paise/100).toLocaleString('en-IN')} / cent` in muted text
- Apartment/House: if `built_area` set + `built_area_unit === 'sqft'` + `price` set → show `₹{Math.round(price/built_area).toLocaleString('en-IN')} / sqft`
- Other combinations: omit silently (no fallback text, no empty space)

**B. Sidebar reorder**:
Current: Contact → Additional Contact → Quick Actions (Copy Link, Open in Maps) → Request Viewing
New: Request Viewing → Contact → Additional Contact → Quick Actions

**C. Low confidence tooltip**:
Wrap `<Badge>` with shadcn `<Tooltip>` (already available in project):
```
Tooltip content: "This listing was extracted automatically from a social media post.
Some details may need verification with the seller."
```

**D. Back button**:
Replace `navigate(-1)` with `navigate('/', { replace: false })` and change label to "Back to Map". Keeps the same ghost variant and ArrowLeft icon.

**Files (1)**:
1. `src/pages/ListingDetail.tsx`

**Acceptance criteria**:
- Listings with `price_per_cent_paise` show price-per-cent line below primary price
- Apartment listings with `built_area` (sqft) show price-per-sqft line
- Listings without sufficient data for rate calculation show primary price only (no error, no empty space)
- "Request Viewing" card appears first in the sidebar
- "Low confidence" badge has a tooltip on hover (desktop) / tap (mobile)
- "Back" button always navigates to `/` and is labeled "Back to Map"

**Test plan**:
- Unit: update `ListingDetail.test.tsx` (if exists) to assert price-per-unit renders when data available; assert it's absent when data missing
- Browser: open an apartment listing → verify price-per-sqft shown. Open a land listing → verify price-per-cent shown.

**Risk tier**: LOW (display logic only, no data fetching changes)

---

### PR-11.5 — Supabase RPC + useListingMarketContext hook (P1)

**Problem (UX-05)**: No backend data source for listing detail market context widget.

**Approach**:

**Part A — Postgres function** (registered via Supabase Dashboard SQL editor, not a Flyway migration since it's Supabase-managed):

```sql
CREATE OR REPLACE FUNCTION get_listing_market_context(
  p_locality TEXT,
  p_property_type TEXT,
  p_bedrooms INT DEFAULT NULL,
  p_months INT DEFAULT 6
)
RETURNS TABLE (
  month DATE,
  listing_count INT,
  median_price_per_unit NUMERIC,
  p25_price_per_unit NUMERIC,
  p75_price_per_unit NUMERIC,
  price_basis TEXT,
  total_similar_count INT
)
LANGUAGE SQL STABLE AS $$
  WITH price_basis AS (
    SELECT CASE
      WHEN p_property_type IN ('apartment', 'house', 'commercial') THEN 'per_sqft'
      ELSE 'per_cent'
    END AS basis
  ),
  normalized AS (
    SELECT
      DATE_TRUNC('month', pl.created_at)::DATE AS month,
      CASE
        WHEN p_property_type IN ('apartment', 'house', 'commercial')
          THEN ROUND(pl.price / NULLIF(pl.built_area, 0))
        ELSE ROUND(pl.price_per_cent_paise / 100.0)
      END AS price_per_unit
    FROM property_listings pl, price_basis pb
    WHERE pl.locality = p_locality
      AND pl.property_type = p_property_type
      AND pl.is_valid = true
      AND (p_bedrooms IS NULL OR pl.bedrooms = p_bedrooms)
      AND pl.created_at > NOW() - (p_months || ' months')::INTERVAL
      AND (
        (p_property_type IN ('apartment', 'house', 'commercial')
          AND pl.built_area IS NOT NULL AND pl.built_area > 0
          AND pl.built_area_unit = 'sqft' AND pl.price IS NOT NULL)
        OR
        (p_property_type NOT IN ('apartment', 'house', 'commercial')
          AND pl.price_per_cent_paise IS NOT NULL)
      )
  ),
  totals AS (
    SELECT COUNT(*)::INT AS total_similar_count FROM normalized
  )
  SELECT
    month,
    COUNT(*)::INT AS listing_count,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_unit)::NUMERIC AS median_price_per_unit,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_unit)::NUMERIC AS p25_price_per_unit,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_unit)::NUMERIC AS p75_price_per_unit,
    (SELECT basis FROM price_basis) AS price_basis,
    (SELECT total_similar_count FROM totals) AS total_similar_count
  FROM normalized
  WHERE price_per_unit IS NOT NULL
  GROUP BY month
  ORDER BY month ASC;
$$;
```

> **Note on registration**: This function is created via Supabase SQL editor (or a `.sql` file run once), not via Spring Boot Flyway (Flyway manages the Spring Boot PostgreSQL instance; Supabase has its own management layer). Document the SQL in `backend/src/main/resources/db/supabase-rpcs/` for reference.

**Part B — Frontend hook** (`src/hooks/useListingMarketContext.ts`):
```ts
export interface MarketContextDataPoint {
  month: string;        // 'YYYY-MM-DD'
  listingCount: number;
  medianPricePerUnit: number | null;
  p25PricePerUnit: number | null;
  p75PricePerUnit: number | null;
  priceBasis: 'per_sqft' | 'per_cent';
  totalSimilarCount: number;
}

export function useListingMarketContext(params: {
  locality: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  enabled?: boolean;
}): UseQueryResult<MarketContextDataPoint[]>
```

The hook calls `supabase.rpc('get_listing_market_context', {...})`. TanStack Query cache key includes all params. `enabled` defaults to true when all three of locality, propertyType are non-null.

**Files (2)**:
1. `backend/src/main/resources/db/supabase-rpcs/get_listing_market_context.sql` — SQL function definition (reference only; must be run in Supabase dashboard)
2. `src/hooks/useListingMarketContext.ts` — frontend hook

**Acceptance criteria**:
- RPC function exists in Supabase and returns expected shape when called from SQL editor with test params
- Hook returns `[]` when locality or propertyType is null
- Hook returns `[]` (not error) when no matching listings in DB (empty gracefully)
- Hook data is cached by TanStack Query (second call uses cache)
- `priceBasis` is always `'per_sqft'` for apartment/house/commercial, `'per_cent'` for land/other

**Test plan**:
- Unit: mock Supabase RPC → test hook returns correctly shaped data
- Integration: run SQL function against dev DB with known test data

**Risk tier**: MEDIUM (new Postgres function + hook, but no auth change, no schema change)

---

### PR-11.6 — AreaMarketWidget component on listing detail (P1)

**Problem (UX-05 continued)**: Hook exists (PR-11.5) but no UI widget.

**Widget behavior**:

**When data available (≥ 5 listing-months)**:
```
┌─────────────────────────────────────────┐
│ 📈 Area Market                           │
│ 2BHK Apartments · Udupi · 6 months     │
│ [recharts LineChart sparkline - 6 pts]  │
│                                         │
│ Area median    ₹3,200 / sqft           │
│ This listing   ₹2,850 / sqft  ✅ 11% below │
│ Based on 18 listings                    │
└─────────────────────────────────────────┘
```

**When data available but no per-unit for this listing** (e.g., built_area null):
```
Area median: ₹3,200 / sqft (18 listings in Udupi)
[no comparison badge — can't compare without this listing's rate]
```

**When < 5 listings in area**:
```
Not enough data for this area yet.
Check back as more listings are added.
```

**Loading state**: 3 skeletons (chart area + two data rows)
**Error state**: AlertCircle + "Could not load market data"

**"Good deal" badge logic**:
| Condition | Badge | Color |
|-----------|-------|-------|
| listing_rate ≤ 85% of median | "Good value" | `bg-green-100 text-green-800` |
| listing_rate ≤ 70% of median | "Great deal" | `bg-green-100 text-green-800` (bold) |
| listing_rate > 130% of median | "Above market" | no badge (don't show) |
| Otherwise | no badge | — |

Note: We only show positive signals ("good value"/"great deal"). We never show "overpriced" to avoid being inadvertently harmful to sellers.

**Chart**: `recharts` `LineChart` (already in project). Show `medianPrice` line + `p25`/`p75` dashed band. X-axis: month labels (MMM). No legend to keep compact.

**Files (2)**:
1. `src/components/listing/AreaMarketWidget.tsx` — new component
2. `src/pages/ListingDetail.tsx` — import and render widget in sidebar (above "Contact" section, below "Request Viewing")

**Acceptance criteria**:
- Widget appears on listing detail for listings with `locality` and `property_type` set
- Widget not rendered for listings without locality (graceful omit)
- All four states handled: loading (Skeleton), error, empty (< 5 data points), data
- Sparkline chart renders with at least 2 data points
- "Good value" badge appears correctly when listing rate is ≤ 85% of area median
- No badge appears when listing rate is above median (no negative labeling)
- Widget is not paywalled (any authenticated user sees it)

**Test plan**:
- Unit: `AreaMarketWidget.test.tsx` — test all four states, badge threshold conditions
- Browser: open any apartment listing → verify widget appears with appropriate state

**Risk tier**: LOW (UI component, reads from RPC hook, no auth logic)

---

### PR-11.7 — Good deal badge in map bottom card and popup removal (P2)

**Problem (UX-07 + market context on map)**:
Map pin click triggers both Leaflet popup and bottom card (redundant). Bottom card should show a lightweight market signal computed from already-loaded listings.

**Approach**:

**A. Remove map popup**:
Remove `marker.bindPopup(...)` from `MarkerClusterLayer`. The bottom card (in `Index.tsx`) already shows all the same info plus the "View Details" action. Removing the popup simplifies click interaction to a single response.

**B. Price analysis utility** (`src/lib/priceAnalysis.ts`):
```ts
// Groups listings by locality:propertyType:bedrooms (null bedrooms treated as null)
// Returns a Map<string, number> of median price_per_unit
// For land: uses price_per_cent_paise / 100 (rupees per cent)
// For apartment/house: uses price / built_area where both available
// Listings without computable rate are excluded from the median
export function computeAreaMedians(
  listings: (PropertyListing & { images?: PropertyImage[] })[]
): Map<string, number>

// Returns the market position signal for a single listing
// Returns null if this listing or the area lacks sufficient data (< 5 comps)
export function getMarketSignal(
  listing: PropertyListing,
  medians: Map<string, number>
): { signal: 'good_value' | 'great_deal' | null; percent: number; rate: number; basis: 'per_sqft' | 'per_cent' } | null
```

**C. Bottom card badge**:
In `Index.tsx`, the bottom card already shows price, area, bedrooms. After this PR, also compute `getMarketSignal(selectedListing, areaMedians)` and render a small badge below the price:
- `"✅ 11% below market"` in `text-green-700 text-xs`
- If signal is null: show nothing (don't show "average" or "above market")

**Files (3)**:
1. `src/lib/priceAnalysis.ts` — new utility (pure functions, testable)
2. `src/components/map/PropertyMap.tsx` — remove `bindPopup`, remove `createPopupContent` function
3. `src/pages/Index.tsx` — add `useMemo(computeAreaMedians, [listings])`, pass signal to bottom card

**Acceptance criteria**:
- Clicking a map pin no longer opens a Leaflet popup
- Clicking a map pin still shows the bottom card as before
- Bottom card shows "✅ X% below market" for listings meeting the good value threshold
- Bottom card shows no badge for listings at or above median
- Bottom card shows no badge for listings without enough area comps (< 5)
- Popup-related CSS can be removed (cleanup)

**Test plan**:
- Unit: `priceAnalysis.test.ts` — test `computeAreaMedians` and `getMarketSignal` with various inputs including edge cases (nulls, single listing, zero area)
- Browser smoke: click map pin → verify no popup, verify bottom card appears, verify badge appears/absent correctly

**Risk tier**: LOW

---

### PR-11.8 — Similar listings section on listing detail (P2)

**Problem**: No way to browse alternatives from a listing detail page. Users must navigate back to map to find comparable listings.

**Approach**:
Query `property_listings` via Supabase for:
- Same `locality` + `property_type`
- Exclude current listing (`neq('id', listingId)`)
- Order by `created_at DESC`
- Limit 3
- Include images via `raw_posts(images)` join

Show as a row of compact cards below the listing description. Each card: thumbnail + type badge + price + bedrooms.

**Files (3)**:
1. `src/hooks/useSimilarListings.ts` — new hook (Supabase query)
2. `src/components/listing/SimilarListings.tsx` — horizontal card row component
3. `src/pages/ListingDetail.tsx` — import and render below description card

**Acceptance criteria**:
- "More in {locality}" section shows ≤ 3 listings
- Current listing is excluded
- Empty state: if no similar listings, section is not rendered (not shown as empty card)
- Each card links to `/listing/{id}`
- Loading state: 3 skeleton cards
- Does not render if listing has no locality

**Test plan**:
- Unit: test hook returns correct shape; test component renders cards
- Browser: open a listing → verify "More in Udupi" section appears with 3 cards; verify clicking navigates correctly

**Risk tier**: LOW

---

### PR-11.9 — Insights: property-type selector + sqft trends (P2)

**Problem (UX-09 + Insights scope)**: Insights price trend chart only supports land (price per cent). Apartments and houses cannot be visualized. Also, the `area_price_weekly` table is unpopulated — charts show empty states with no helpful message.

**Approach**:

**A. Improve empty state copy** in `Insights.tsx`:
Replace bare `"No price data available"` with icon + explanation + expected behavior.

**B. Property type selector** on Price Trend card:
Add a `Select` dropdown above the area selector: "Land (price/cent)" | "Apartment (price/sqft)" | "House (price/sqft)".

**C. Data source switch**:
- When "Land" is selected: use existing `usePriceTrend(areaKey)` (reads from `area_price_weekly` via backend)
- When "Apartment" or "House" is selected: use the `useListingMarketContext` hook from PR-11.5 (RPC), passing `locality` (extracted from `areaKey`) + selected type, null bedrooms.
- Chart Y-axis label and tooltip unit change based on selection: "₹/cent" or "₹/sqft"

**D. Graceful degradation**:
When RPC returns empty (< 5 data points):
- Show empty state: "Not enough apartment/house data in {area} yet. More listings will appear here as the market grows."
- This is honest and educational rather than misleading

**Files (2)**:
1. `src/pages/Insights.tsx` — add type selector, wire data sources, update empty states
2. `src/hooks/useInsights.ts` — add `useAreaMarketTrend` hook (wraps `useListingMarketContext` for Insights use case, extracting locality from areaKey)

**Acceptance criteria**:
- Property type selector visible on Price Trend card (Land / Apartment / House)
- Selecting Apartment or House fetches from RPC (PR-11.5), not `area_price_weekly`
- Chart Y-axis label updates: "₹ / sqft" vs "₹ / cent"
- Empty state for apartments has explanatory copy (not bare "No data")
- Existing land trend chart behavior unchanged
- Paywall gate still applies (all Insights content gated)

**Test plan**:
- Unit: test type selector renders; test correct hook is called per type selection
- Browser smoke: update Section E to verify type selector works

**Risk tier**: MEDIUM (touches Insights, which is paywalled/gated)

---

### PR-11.10 — Smoke test and documentation update (P2)

**Updates to `docs/BROWSER_SMOKE_TEST.md`**:
- Add Section M: Map locality navigation (locality chip click → map zoom → verify pins visible)
- Add Section N: Listing detail market context (open listing → verify Area Market widget appears / empty state shows as appropriate)
- Update Section I3 (dealer nav) and I4 (admin nav) if any nav changes occurred
- Update "Last updated" date and sprint version

**Files (1)**:
1. `docs/BROWSER_SMOKE_TEST.md`

---

## 6. Acceptance Criteria — Sprint-Level

At sprint end, all of the following must be true:

- [ ] MapFilters shows 5 property types including Apartment
- [ ] Selecting a locality in the filter zooms the map to fit that locality's listings
- [ ] Top-6 locality chips visible on map surface; clicking selects filter and zooms
- [ ] Listing detail shows price-per-sqft (apartments) or price-per-cent (land) where data available
- [ ] "Request Viewing" is the first card in the listing detail sidebar
- [ ] "Low confidence" badge has an accessible tooltip
- [ ] "Back" button on listing detail navigates to the map page consistently
- [ ] AreaMarketWidget renders on listing detail for listings with locality data
- [ ] Widget shows sparkline chart, area median, comparison badge where data allows
- [ ] Widget degrades gracefully when < 5 listings in area (no crash, helpful copy)
- [ ] Map bottom card shows "✅ X% below market" badge for underpriced listings
- [ ] Map pin click no longer shows Leaflet popup (just the bottom card)
- [ ] "More in {locality}" section shows up to 3 similar listings on detail page
- [ ] Insights price trend chart has a property-type selector
- [ ] All new components pass four-state pattern (loading/error/empty/data)
- [ ] Browser smoke test updated with Sections M and N
- [ ] 0 regression in existing 96 frontend tests and 500 backend tests

---

## 7. Test Plan

### Unit tests

| PR | Test file | What to test |
|----|-----------|--------------|
| PR-11.2 | `PropertyMap.test.tsx` | `computeLocalityBounds` returns correct bounds; handles empty and single-pin cases |
| PR-11.3 | `Index.test.tsx` | `computeTopLocalities` returns top N sorted by count |
| PR-11.5 | `useListingMarketContext.test.ts` | Hook returns correct shape; returns `[]` when params null; handles RPC error |
| PR-11.6 | `AreaMarketWidget.test.tsx` | All four states render correctly; badge appears at correct thresholds; badge absent above median |
| PR-11.7 | `priceAnalysis.test.ts` | `computeAreaMedians` correct for land and apartment; handles null areas; `getMarketSignal` at all threshold boundaries |
| PR-11.8 | `useSimilarListings.test.ts` | Excludes current listing; returns ≤ 3 results |
| PR-11.9 | `Insights.test.tsx` | Type selector renders; correct hook called per selection |

### E2E / Smoke additions

**Section M — Map locality navigation** (new, PR-11.2 + PR-11.3):
| # | Action | Expected |
|---|--------|----------|
| M1 | Open map page. Observe chip row. | Top-N locality chips visible above map, each with listing count. |
| M2 | Click a locality chip (e.g., "Udupi"). | Map flies to fit Udupi listings in view. Chip becomes active (different style). Filter shows Udupi selected. |
| M3 | Click the active chip again. | Chip deselected. Map does not reset position. Filter cleared. |
| M4 | Select a locality in the MapFilters sidebar. | Same zoom behavior as chip click. |

**Section N — Listing market context** (new, PR-11.6):
| # | Action | Expected |
|---|--------|----------|
| N1 | Open any listing with locality set. | "Area Market" widget visible in sidebar. Either shows data, loading, or "Not enough data" empty state. No crash. |
| N2 | Open a listing in a well-populated locality. | Widget shows sparkline chart and area median price. |
| N3 | If listing has computable rate and area has sufficient data. | "Good value" or "Great deal" badge appears alongside comparison text. |
| N4 | Open map, click any pin. | No Leaflet popup. Bottom card appears. If listing is below area median, badge visible. |

---

## 8. Dependencies and Parallelization

```
PR-11.1 ─────────────────────────────────────────── no deps, can start immediately
PR-11.2 ─────────────────────────────────────────── no deps
  └─→ PR-11.3 (depends on PR-11.2 UX concept but not code — can overlap)
PR-11.4 ─────────────────────────────────────────── no deps, can start immediately
PR-11.5 ─────────────────────────────────────────── no deps
  └─→ PR-11.6 (depends on hook from PR-11.5)
      └─→ PR-11.9 (reuses hook from PR-11.5)
PR-11.7 ─────────────────────────────────────────── no deps
PR-11.8 ─────────────────────────────────────────── no deps
PR-11.10 ────────────────────────── depends on all P1 PRs done
```

**Parallel batches**:
- **Batch 1** (can all start in parallel): PR-11.1, PR-11.2, PR-11.4, PR-11.5, PR-11.7, PR-11.8
- **Batch 2** (starts after batch 1): PR-11.3 (after 11.2), PR-11.6 (after 11.5)
- **Batch 3**: PR-11.9 (after 11.5 + 11.6), PR-11.10 (after all P1s)

---

## 9. Recommended Build Order (Highest ROI First)

1. **PR-11.1** — Bug fix. Ships immediate value, zero risk. Do this first.
2. **PR-11.4** — UX polish on listing detail. No deps. High daily user-facing value.
3. **PR-11.2** — Map zoom. High impact, medium effort. Fixes core navigation pain.
4. **PR-11.3** — Locality chips. Builds on PR-11.2 UX concept. Quick wins on discoverability.
5. **PR-11.5** — RPC + hook. Enabler for the market context feature set.
6. **PR-11.6** — Area Market widget. Core feature, high user value, depends on PR-11.5.
7. **PR-11.7** — Good deal badge + popup removal. Clean up + map intelligence.
8. **PR-11.8** — Similar listings. Engagement driver, independent.
9. **PR-11.9** — Insights enhancement. Paywalled, moderate impact.
10. **PR-11.10** — Docs. Always last.

---

## 10. Deferred to Sprint 12

| Item | Reason |
|------|--------|
| `area_price_weekly` population job (pg_cron) | Phase 2 — needs stable listing volume first |
| Text search on listing title/description | Separate feature, separate sprint |
| Price alerts / email notifications | Significant backend work |
| Cross-area comparison (Insights) | Needs more data population |
| Locality normalizer for admin | Admin tooling sprint |
| Bedroom filter on map | Lower priority, can wait |

---

## 11. Flyway / Schema Notes

No new Flyway migrations needed for Sprint 11.

The Supabase RPC function (`get_listing_market_context`) is registered directly in the Supabase SQL editor. A reference copy lives in `backend/src/main/resources/db/supabase-rpcs/get_listing_market_context.sql`. This is documentation, not a migration file.

Flyway remains at V17 after Sprint 11.
