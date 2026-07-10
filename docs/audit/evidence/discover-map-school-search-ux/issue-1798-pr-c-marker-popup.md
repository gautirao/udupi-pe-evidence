# Issue #1798 PR-C — restore listing marker info popup

Branch: `fix/1798-marker-popup` (based on latest `origin/main`, includes #1804)

## Scope (user-narrowed from original issue text)

The original #1798 marker-popup ask requested popups for both area and listing
markers. During planning the user explicitly narrowed scope:

- **Listing/property marker popups: IN scope** — restore/fix the existing
  `MarkerPopoverCard`.
- **Area marker popups: OUT of scope** — area markers must keep navigating
  immediately on click, exactly as shipped by #1801–#1803. No popup for area,
  cluster, or count markers.

## Root cause

`MarkerPopoverCard` already existed and was already wired for *some*
listing-marker states. Its render-eligibility gate (`isMarkerPopoverEligible`
in `src/pages/MapDiscovery.tsx`) required `urlState.journey === 'area-first'`
plus specific `panelContent` values — strictly narrower than the
click-**capture** gate (`handleMarkerClickWithPosition` /
`handleSelectMarkerListing`'s `setSelectedListing` branch) that already fires
in more states (e.g. journeyless area-selected) and drives the existing
right-panel scroll+highlight (#1547). That drift meant a listing marker click
could already scroll+highlight the matching right-panel card, yet the popup
itself would silently never render — the reported "popup missing" bug.

## Fix

Unified the render gate to reuse the exact same boolean expression as the
capture gate:

```ts
const isMarkerPopoverEligible =
  urlState.journey !== 'agri-first' &&
  urlState.areaKey != null &&
  (urlState.schoolId == null || urlState.journey === 'area-first');
```

Render and capture eligibility can no longer drift apart. Area/cluster/count
marker clicks are structurally unaffected — they never populate
`markerPixelPos`, so the render site's `markerPixelPos != null` conjunction
still keeps them popup-free regardless of this predicate.

## Before/after

- **Before**: listing marker click in a journeyless area-selected state (or
  any non-`area-first` state permitted by the capture gate) scrolled +
  highlighted the matching right-panel card, but no popup appeared.
- **After**: the same click also opens `MarkerPopoverCard` near the marker,
  with the same fields already shown by the right-panel card (price, title,
  property type, locality, image), plus a "View details" CTA.

## Manual browser verification

Dev server: `npm run dev -- --port 5174` on branch `fix/1798-marker-popup`.
(Note: an unrelated stale dev-server process from a different worktree —
`issue-1745-batch-b` — was found already listening on port 5183 from a prior
session; it was left untouched and NOT used for this verification. All
evidence below is from the correct branch on port 5174, confirmed via
`git branch --show-current` before and during testing.)

1. **Listing marker popup, journeyless area-selected state**
   (`/discover?city=bangalore&areaKey=IN%7CKA%7CBengaluru%7CHebbal&lat=13.045&lon=77.6&zoom=14`,
   no `journey` param): clicked the "₹6.75 Cr" listing marker near Hebbal.
   `MarkerPopoverCard` rendered immediately with property image, "₹6.75 Cr",
   "3 BHK Apartment in Hebbal", "Apartment" badge, "Hebbal" locality, and a
   "View details" button. **MANUAL_PASS.**

2. **Right-panel scroll+highlight preserved**: the same click's matching
   right-panel card ("₹6.75 Cr · 3 BHK Apartment in Hebbal") showed the
   existing copper/orange selection border — confirming the pre-existing
   #1547 scroll+highlight behavior is unchanged by this fix. **MANUAL_PASS.**

3. **Background click dismisses popup**: clicking an empty map area (no
   marker) closed the popover and cleared the right-panel highlight; the URL's
   `listing=` param was removed. **MANUAL_PASS.**

4. **Area marker click still navigates immediately, no popup** (North Growth
   group level, `/discover?city=bangalore&scope=north&groupId=north-growth`):
   clicked the "Hebbal · 4 properties" area marker. The map camera fit/panned
   per existing #1801–#1803 camera-intent behavior, the URL gained
   `areaKey=...`, and the app drilled straight into "Properties in Hebbal" —
   at no point did any popup appear. **MANUAL_PASS.**

5. **Note on a pre-existing, unrelated crash found during verification**:
   navigating to a journeyless URL with BOTH `scope` and `groupId` params set
   simultaneously alongside `areaKey`
   (`?city=bangalore&scope=north&groupId=north-growth&areaKey=...`, no
   `journey`) triggers `ReferenceError: prettifyZoneSlug is not defined` in
   `src/components/discover/DiscoverRightPanel.tsx` (an app-crashing error,
   caught by the top-level `ErrorBoundary`). Confirmed via `git status` that
   `DiscoverRightPanel.tsx` is **not modified by this PR** — this is a
   pre-existing bug on `origin/main`, unrelated to the marker-popup fix, and
   only reachable via this specific unusual URL combination (both `scope` and
   `groupId` set without a `journey`) that isn't reachable through normal
   in-app navigation. Not fixed here — out of scope for this PR. Flagging for
   a separate follow-up issue.

## Out of scope confirmation

- No changes to `AreaMarkerLayer.tsx`, `handleOverviewAreaClick`,
  `handleAreaClick`, or `onAreaCameraIntent`/camera-intent wiring.
- No changes to school-first/add-school logic (#1804).
- No changes to breadcrumbs, clustering, backend/API, or the listing-detail
  page.
- No fabricated data — `MarkerPopoverCard` renders only fields already present
  on `PropertyListingWithImages`.
