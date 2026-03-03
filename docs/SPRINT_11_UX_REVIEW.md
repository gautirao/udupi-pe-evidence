# Sprint 11 UX Review — Udupi Property Explorer

**Date**: 2026-03-02
**Reviewer**: team-lead (spec sprint)
**Method**: Code walkthrough of `Index.tsx`, `MapFilters.tsx`, `PropertyMap.tsx`, `ListingDetail.tsx`, `Insights.tsx`, `AppLayout.tsx` against `docs/DESIGN_SYSTEM.md` + `docs/BROWSER_SMOKE_TEST.md`
**Journey covered**: Map → filter by locality → open listing → request viewing → dealer listing lifecycle

---

## Finding Index (Ranked by Impact × Effort)

| Rank | ID | Severity | Title | Effort | File |
|------|----|----------|-------|--------|------|
| 1 | UX-01 | **BUG** | Apartment missing from MapFilters property type list | Tiny | `MapFilters.tsx` |
| 2 | UX-02 | High | Map does not zoom/pan when locality filter is applied | Medium | `Index.tsx`, `PropertyMap.tsx` |
| 3 | UX-03 | High | Listing detail shows no price-per-unit (sqft / cent) | Small | `ListingDetail.tsx` |
| 4 | UX-04 | High | "Request Viewing" CTA buried below secondary actions in sidebar | Tiny | `ListingDetail.tsx` |
| 5 | UX-05 | High | No market context — user can't tell if price is good or bad | Medium | `ListingDetail.tsx` + new |
| 6 | UX-06 | Medium | Locality discovery requires opening a popover — no quick-select | Medium | `Index.tsx` |
| 7 | UX-07 | Medium | Map pin click shows popup AND bottom card — redundant on mobile | Small | `Index.tsx`, `PropertyMap.tsx` |
| 8 | UX-08 | Medium | "Low confidence" badge is unexplained — no tooltip | Tiny | `ListingDetail.tsx` |
| 9 | UX-09 | Medium | Insights charts show bare "No price data" with no explanation | Small | `Insights.tsx` |
| 10 | UX-10 | Low | `navigate(-1)` on listing detail goes nowhere if user arrived via direct link | Tiny | `ListingDetail.tsx` |

---

## Detailed Findings

---

### UX-01 — BUG: Apartment missing from MapFilters property type list

**Severity**: Bug (functional defect)
**File**: `src/components/map/MapFilters.tsx:22-27`

**Finding**:
The `propertyTypes` array used to render the filter checkboxes contains four entries:
```ts
['land', 'house', 'commercial', 'other']
```
`apartment` is absent. `PropertyType` in the TypeScript interface includes `'apartment'`, and `PropertyMap.tsx` renders apartment pins in violet with their own config. The map legend shows "Apartment" as a type. But users cannot filter to show only apartments — the checkbox simply does not exist.

**Screenshot placeholder**: `[screenshot: MapFilters panel showing 4 checkboxes — Land, House, Commercial, Other — with no Apartment option despite violet apartment pins visible on the map]`

**Proposed fix**: Add `{ value: 'apartment', label: 'Apartment' }` to the `propertyTypes` array.

**Design system note**: Section 9 badge and section 2 property type config both include apartment. This omission is inconsistent with the established type system.

---

### UX-02 — Map does not zoom/pan when locality filter is applied

**Severity**: High impact UX failure
**Files**: `src/pages/Index.tsx`, `src/components/map/PropertyMap.tsx`

**Finding**:
When a user selects "Karkala" in the locality multi-select filter, the list of visible pins is filtered but the map viewport does not change. The default center is `UDUPI_CENTER [13.3409, 74.7421]` at zoom 11. If the selected locality's pins are outside the viewport, the user sees no pins and gets no feedback about whether listings exist there.

`MapController` already supports flyTo for a single selected listing:
```tsx
function MapController({ selectedListing }) {
  useEffect(() => {
    if (selectedListing?.latitude && selectedListing?.longitude) {
      map.flyTo([selectedListing.latitude, selectedListing.longitude], 15);
    }
  }, [selectedListing, map]);
```
But no equivalent exists for fitting bounds to a locality's listings.

**Screenshot placeholder**: `[screenshot: locality filter shows "Karkala" selected as chip, but map remains centered on Udupi with no visible pins because Karkala pins are not in viewport]`

**Proposed fix**:
1. Compute `L.latLngBounds` from listings filtered to selected localities (using already-loaded data — no new API calls).
2. Pass `focusBounds` prop to `PropertyMap` / `MapController`.
3. `MapController` calls `map.fitBounds(focusBounds, { padding: [40, 40] })` when focusBounds changes.

**Design system note**: Design system section 15 (Map UI Rules) already mandates z-index discipline. This fix is additive and follows the existing `MapController` pattern.

---

### UX-03 — Listing detail shows no price-per-unit

**Severity**: High — core comparison metric missing
**File**: `src/pages/ListingDetail.tsx:250-255`

**Finding**:
The listing detail page shows total price prominently (`₹45,00,000`) but provides no rate:
- For apartments/houses: no price per sqft
- For land: no price per cent

Users cannot compare two listings without mentally computing rates themselves. This is the primary mental model for Udupi real estate buyers (land in cents, apartments in sqft).

The data is available: `price`, `land_area`, `land_area_unit`, `built_area`, `built_area_unit`, `price_per_cent_paise` (from V3 migration — already stored).

**Screenshot placeholder**: `[screenshot: ListingDetail price section showing only "₹45,00,000" with no per-sqft or per-cent breakdown below it]`

**Proposed fix**:
Below the price in the title area, add a computed secondary line:
- Land (when `price_per_cent_paise` is set): `₹X / cent`
- Land (fallback from price + land_area in cents): compute inline
- Apartment/House (when `built_area` is set and unit is sqft): `₹X / sqft`
- If neither computable: omit silently

Display using design system price pattern: `font-semibold text-primary` + smaller muted unit label.

---

### UX-04 — "Request Viewing" CTA buried below secondary actions

**Severity**: High — conversion friction
**File**: `src/pages/ListingDetail.tsx:380-413`

**Finding**:
Current sidebar order (bottom of listing detail):
1. Contact card (green, phone number + "Call Now")
2. Additional Contact Info card
3. Quick Actions card: **Copy Link**, **Open in Maps**
4. Request Viewing card: **Request Viewing** button ← primary action

"Request Viewing" is the primary in-app CTA and the core booking flow entry point. It's the last thing in the sidebar. "Copy Link" and "Open in Maps" are secondary utility actions but appear above it.

**Screenshot placeholder**: `[screenshot: ListingDetail right sidebar showing Contact (green) → Additional Contact → Copy Link / Open in Maps → Request Viewing — in that order]`

**Proposed fix**: Reorder sidebar:
1. **Request Viewing** (move to top of sidebar — or just before contact)
2. Contact card
3. Quick Actions (Copy Link, Open in Maps)

The "Request Viewing" card should come before the contact cards since it's the structured, tracked booking path.

---

### UX-05 — No market context: user can't tell if price is good or bad

**Severity**: High — core user need unmet
**File**: `src/pages/ListingDetail.tsx` (absent feature)

**Finding**:
A user viewing a 2BHK apartment in Udupi at ₹45L has no context:
- Is this above or below market?
- What do similar 2BHKs in Udupi typically cost?
- Has the price been declining or increasing?

The Insights page (paywalled) has some trend data but:
- It's land-only (price per cent)
- It requires navigating away from the listing
- It's behind the paywall

The listing detail page should provide a free, contextual "Area Market" mini-widget showing the area median for the same type/locality/bedroom count and where this listing sits relative to it.

**Screenshot placeholder**: `[screenshot: ListingDetail sidebar with gap where "Area Market" widget would appear — currently nothing between Quick Actions and end of page]`

**Proposed fix**: Add `AreaMarketWidget` component to listing detail sidebar. See Sprint 11 PR-11.5–11.6 for full spec.

---

### UX-06 — Locality discovery requires opening a popover

**Severity**: Medium — discoverability gap
**File**: `src/pages/Index.tsx`, `src/components/map/MapFilters.tsx`

**Finding**:
To filter by locality, a user must:
1. Open the filters panel (on mobile: tap "Filters" button, then navigate the sheet)
2. Find the Locality section
3. Click the "Select localities" dropdown
4. Search or scroll to find the locality
5. Click to select

For the most common use case ("show me listings in Karkala"), this is 4–5 interactions. First-time users may not discover locality filtering at all.

**Design system note**: Section 15 states "Filter chips — prefer horizontal chip row over dropdown for 3–5 options." With ~6–10 localities in Udupi district, a chip overlay row on the map surface fits this rule perfectly.

**Screenshot placeholder**: `[screenshot: Map page with filter panel closed — no indication of how to find locality-specific listings visible without opening filters]`

**Proposed fix**: Add a floating horizontal chip row overlaid on the top of the map area. Show the top-6 localities by listing count (computed from already-loaded listings — no new API call). Each chip: clicking selects the locality filter AND triggers the map bounds zoom (UX-02 fix). Active chips show ×.

---

### UX-07 — Map pin click triggers both popup AND bottom card

**Severity**: Medium — cluttered on mobile
**Files**: `src/pages/Index.tsx:118-191`, `src/components/map/PropertyMap.tsx:338-353`

**Finding**:
When a map pin is clicked:
1. Leaflet opens the popup (`marker.bindPopup(createPopupContent(listing))`)
2. `onSelectListing` callback fires → shows the bottom card (Index.tsx lines 118-191)

Both show: thumbnail image, property type badge, price, locality, area/bedrooms. The bottom card additionally has "View Details" button. On desktop this is tolerable redundancy. On mobile the popup obscures the map and the card covers the bottom — the user has two things to dismiss.

The popup in `PropertyMap.tsx` does not have a "View Details" button. All navigation happens through the bottom card. The popup is informational-only.

**Proposed fix**: Remove `bindPopup` from map markers. Rely entirely on the bottom card (shown via `onSelectListing`). The bottom card already shows all the same information plus the "View Details" action. This simplifies the interaction: one click → one response.

Alternative (lighter touch): Keep popup but set `closeOnClick: false` and add a small "View Details" link inside the popup, then remove the bottom card. The popup-only model is simpler on mobile.

**Recommended**: Remove popup, keep bottom card. The bottom card is richer, follows the design system, and is the established pattern.

---

### UX-08 — "Low confidence" badge is unexplained

**Severity**: Medium — confuses users
**File**: `src/pages/ListingDetail.tsx:244-248`

**Finding**:
```tsx
{listing.confidence_score && listing.confidence_score < 70 && (
  <Badge variant="outline" className="text-yellow-600 border-yellow-400">
    Low confidence
  </Badge>
)}
```

The badge appears but there is no tooltip, no explanation, no `title` attribute. Users don't know if "Low confidence" means the price is unreliable, the AI wasn't sure about the property type, or if there's a data quality issue they should be aware of.

The badge also appears in the map popup (line 127 of `PropertyMap.tsx`) with similar inline styling.

**Proposed fix**: Add a `title` attribute to both badge usages: `title="This listing was automatically classified from a social media post. Some details may be inaccurate — please verify with the seller."` Additionally in `ListingDetail.tsx`, wrap with a `<Tooltip>` from shadcn for a better UX experience (tooltip component already available in the project).

---

### UX-09 — Insights charts show empty state with no explanation

**Severity**: Medium — paid feature appears broken
**File**: `src/pages/Insights.tsx:131-135`

**Finding**:
```tsx
} : avgPriceData.length === 0 ? (
  <div className="text-center py-8 text-muted-foreground">
    <p className="text-sm">No price data available</p>
  </div>
```

The `area_price_weekly` and `area_stats_latest` tables are empty (no population job exists yet). Users who pay for insights access see "No price data available" across all charts. There's no explanation of why, no timeline for when data will appear, and no alternative content.

For a paywalled feature, showing "no data" without explanation erodes trust.

**Screenshot placeholder**: `[screenshot: Insights page with paywalled access, showing bar chart section with only "No price data available" text in center]`

**Proposed fix**: Improve empty state with:
- Contextual icon (e.g., `ChartNoAxesColumn` or `BarChart2`)
- Copy: "Price data is being collected. Check back soon as more listings are indexed."
- If saved areas are empty: add "Try saving some areas to get personalized insights"
- This doesn't fix the missing data but sets correct expectations

---

### UX-10 — `navigate(-1)` fails on direct-URL navigation to listing

**Severity**: Low — edge case
**File**: `src/pages/ListingDetail.tsx:85,139`

**Finding**:
```tsx
<Button variant="ghost" onClick={() => navigate(-1)}>
  <ArrowLeft className="h-4 w-4 mr-2" />
  Back
</Button>
```

`navigate(-1)` goes to browser history. If the user:
- Opened the listing from a shared link (no prior history)
- Navigated via browser refresh

...the "Back" button either does nothing or exits the app entirely to the browser's previous page.

**Proposed fix**: Use `navigate('/')` as fallback when history is unavailable. Or replace label with "Back to Map" that always navigates to `/`. Given the app's structure (map-first), a "Back to Map" button is always the right destination.

---

## Summary by Category

| Category | Issues | Recommended sprint priority |
|----------|--------|---------------------------|
| Functional bugs | UX-01 (apartment filter) | P0 — fix immediately |
| Map UX | UX-02 (zoom), UX-06 (chips), UX-07 (popup+card) | P1 — Sprint 11 core |
| Listing detail UX | UX-03 (price/unit), UX-04 (CTA order), UX-08 (tooltip) | P1 — Sprint 11 polish |
| Missing features | UX-05 (market context) | P1 — Sprint 11 feature |
| Empty states | UX-09 (Insights), UX-10 (navigate) | P2 — Sprint 11 secondary |

---

## Design System Compliance Audit

| Rule | Status | Location |
|------|--------|----------|
| Four-state pattern | ⚠️ Partial — Insights empty states missing icons | `Insights.tsx` |
| Price display with `text-primary` | ✅ Correct | `ListingDetail.tsx` |
| Badge status colors | ✅ Correct | Multiple |
| Map overlays at `z-[1000]` | ✅ Correct | `Index.tsx` |
| Filter chips preferred over dropdown for 3–5 items | ❌ Popover used for localities | `MapFilters.tsx` |
| `hover:bg-secondary/50` on list rows | ✅ Correct | Various |
| `CardTitle` + icon + `CardDescription` pattern | ✅ Correct | Various |
| No arbitrary Tailwind values | ✅ No violations found | |
| Keyboard-accessible interactions | ⚠️ Map popup has no keyboard focus management | `PropertyMap.tsx` |
