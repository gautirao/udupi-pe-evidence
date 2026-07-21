# PR-B — Guided map picker: implementation note

> **Scope guardrail:** everything in this PR lives inside the Claude Design prototype kit
> (`ui_kits/discover/`). The deterministic belt listings are **mock fixture data in
> `src/data.js` only** — no app code, backend data, API, OpenSearch index, DB, or
> `_ds_bundle.js` was touched. In production, counts stay backend/API-owned; the mock
> generator exists so demo counts are derived from real records instead of fabricated
> at render time. Coordinate privacy (approx points + clusters), saved homes, and
> trust-badge behaviour are unchanged.

Implements the guided-picker affordances + the `AREA_MARKER_UX.md` degradation model
in the Unified Discover Portal (`index.html` + `src/`). Companion to `MAP_MARKER_UX.md`.

## What changed

**Data (`data.js`)**
- `north-growth` group is now the **Thanisandra–Hennur Belt**: 29 areas · 181 properties
  (the spec's stress case). 27 new belt localities added; listings for them are
  **generated deterministically** so every count on a marker or panel row is still
  derived from real `listings` records — nothing fabricated at render time.

**Map (`PortalMap.jsx`)**
- **First-time hint** — "Tap map markers to explore" chip under the breadcrumb; dismissible
  (×), auto-dismisses on first marker tap, remembered via `localStorage("dp_map_hint_v1")`.
  While active, `body[data-dp-hint]` turns on a soft pulse halo (region bubbles, group/zone
  pills) and a "Tap to explore" caption under region bubbles.
- **Clickable-marker affordance** — every navigation marker is `.dp-nav` (cursor +
  hover-scale via CSS, no re-render) and carries an action chevron `›`. Hotspot pins read
  "Hebbal · 46 properties ›"; listing clusters read "N homes · **Tap to zoom in**".
- **Area-marker degradation** (`mountAreas`, used by `area-areas` and `school-areas`):
  ≤8 areas → all labeled pins · 9–15 → top-8 labeled + count-dots · 16+ → grid-bucketed
  (label-shaped ~170×64 px cells) representative pins, cap 12 with a per-quadrant coverage
  guarantee, followed by a **collision pass** on projected label rects (rank order, selected
  area first — losers demote into their cell's chip/dot, so no two persistent labels overlap
  at any zoom; label rects are left-anchored to match the divIcon rendering).
  Non-representatives fold into **navigation area clusters** — dashed paper chips
  ("+N areas · Tap to expand", area count never a property sum) visually distinct from the
  solid listing-cluster discs; overlapping chips merge, and chips are nudged (8-direction
  candidate search, in-bounds) clear of kept labels. Chip click flies into the member bounds
  to split it. Buckets recompute on **zoom only** (pan-invariant, popup-safe), with a
  zoom-guarded `moveend` safety net for flights whose zoomend lands mid-rebuild.
- **Hover/focus coordination** — panel-row hover promotes the marker (dot → full pin;
  clustered → chip highlights with the area's name); map-marker hover outlines the panel
  row. Neither moves the camera. "Show on map" promotes a demoted area with a transient
  labeled pin + `panInside` (never `flyTo`).
- **Region hotspots** — top area per *group* (spatial diversity), so the dense belt can't
  claim all four hotspot pins.
- Legend gains the "+N areas · tap to expand" key on area levels; map re-sizes itself via
  `ResizeObserver` (mobile sheet).

**Panel (`DiscoverPanel.jsx`, `DiscoverPortal.jsx`)**
- Guidance line at picker levels: *"Tap a marker on the map or choose from the list below."*
  At listing levels: *"Tap markers to preview, or choose from the list."*
- `area-areas` / `school-areas`: full list (sorted by count) is always rendered — the panel
  is the source of truth. When the map demotes areas, the guide line appends
  *"Showing X of N areas on the map — all N are listed below."* and demoted rows get a
  **Show on map** button.
- **Mobile (≤760 px)** — map stacks on top (44%), panel becomes a bottom sheet (rounded top,
  drag handle, shadow); legend hides; hint chip stays inside the map area.

## Gap-fix pass (review round 2)

1. **Map/panel scope alignment** — `area-areas` renders only `areas.filter(group === groupId)`;
   belt evidence: 4 labeled + 3 dots + (+13, +10) chips = 29 markers-worth, matching the
   panel's 29 rows exactly. No wider-Bangalore markers. → `screenshots/01-prb-belt.png`
2. **No duplicate semantics** — every area appears exactly once (rep label XOR dot XOR
   inside a chip; enforced by `repSet`). Chips are **neutral**: "+N nearby areas", never
   named after an area; panel-hover shows "Includes ‹name›" as a transient caption only.
3. **No empty-map cluster clicks** — chip members are real in-scope areas that re-render
   after the fly (re-bucketed at the new zoom); if `getBoundsZoom` shows the camera can't
   get closer, the chip doesn't fly at all — it highlights + scrolls the member rows in
   the panel instead. → `screenshots/02-prb-belt.png` (+13 → +3/+11/+8 split)
4. **Marker popup** — browser-verified: cluster → zoom → price-pin click opens the
   infographic popup (image, tier, price, facts, ‹ n/total ›, Show in list) and sets the
   active card. → `screenshots/03-prb-listing-popup.png`
5. **Group-scoped school search** — search scopes to the narrowest active context
   (group > zone > region > city) over school name OR area name; when the narrow scope
   has no matches it auto-widens one level **with an explicit label** ("· outside
   Thanisandra–Hennur Belt"), never past the current city's dataset.
   → `screenshots/02-prb-school-search.png` ("hebbal" inside the belt returns Hebbal
   schools, labeled as outside the group)
6. **Direct access** — the scoped search (Area/School toggle) now also renders on the
   city landing; an area result jumps straight to `area-listings`, a school result
   straight to `school-homes`. → `screenshots/01/02-prb-direct-access.png`,
   `screenshots/02-prb-school-jump.png`
7. **Placement correctness** (found while gathering evidence) — area markers/chips are now
   fixed-width blocks centered on their anchor (deterministic rects), chips pick the
   zero-overlap candidate or the minimum-overlap one, and area layers re-place on
   `moveend` (they have no popups; leaf listing layers stay zoom-only so popups survive
   pans).

## Acceptance checklist

**Guided affordances**
- [x] First-time hint shows once, dismissible, remembered in localStorage; auto-dismisses on first marker tap.
- [x] Navigation markers show pointer cursor + hover scale + `›` chevron; pulse halo only while hint is active; reduced-motion disables pulse.
- [x] Panel copy at picker levels / listing levels matches the agreed strings.

**Thanisandra–Hennur Belt (29 areas · 181 properties)**
- [x] Map shows a capped set of labeled representative pins spanning the belt (grid + quadrant guarantee + collision pass — count adapts to map size), never all 29 labels and never overlapping ones.
- [x] Leftover areas fold into dashed "+N areas" navigation chips (area count, never property sums) or hover-promotable count-dots.
- [x] Chip click zooms to split into individual pins; zoom recomputes buckets, pan does not.
- [x] Panel lists all 29 sorted by count, with "Showing X of 29 areas on the map — all 29 are listed below."
- [x] Demoted rows expose "Show on map" → promote + panInside + tap-through to listings.

**Coordination**
- [x] Panel hover ⇒ marker/chip emphasis, no camera move; map hover ⇒ panel row outline.
- [x] Selected area is always a full labeled pin (pulled out of any cluster).

**School-first (Hebbal)**
- [x] School pins carry the tap chevron; scoped Area/School search shows a no-results state; radius ring + clustered homes + empty state unchanged.

**Regression**
- [x] Listing clusters, popups, ‹ › stepping, agri layers, deep links, camera-key jitter guards untouched.
- [x] All counts remain derived from `listings` (see generator note in `data.js`).
