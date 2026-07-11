# Discover Map — Marker & Camera UX

Progressive-disclosure interaction model for the ONE Discover map. This documents the
model implemented in `src/PortalMap.jsx` (+ `DiscoverPortal.jsx`, `DiscoverPanel.jsx`).
It is an interaction spec, not a marker/count source — **all counts, coordinates, schools
and distances stay backend-owned** (see Constraints).

---

## 1. Map states by journey level

| Level | Layer id | What the map shows | Camera |
|---|---|---|---|
| City landing | `region-bubbles` | 5 region count-bubbles (N/S/E/W/Central) | Fit city (fixed zoom) |
| Region / scope selected | `region-hotspots` | Top ~4 area pins in the region | Fit region bounds, maxZoom 12 |
| Corridor / group selected | `area-groups` → `area-areas` | Group pills → area pins inside the group | Fit region (groups) → fit group bounds z14 |
| Area selected | `area-listings` | **Clustered** listing markers | Fit area bounds z15 |
| School zone → area → school | `school-zones` → `school-areas` → `school-schools` | Zone pills → area pins → school pins | Fit zone z13 → area z15 |
| School selected | `school-homes` | Radius ring + fixed school pin + **clustered** home markers | Fit radius-ring bounds |
| Listing / parcel selected | (within leaf layers) | Focused marker + infographic popup | **No camera move** — `panInside` only |
| Agri corridor → cluster → parcel | `agri-corridors` → `agri-clusters` → `agri-parcels` | Direction bubbles → town discs (+ wedge) → **clustered** parcels | Fit wedge / town bounds |

**North example:** North → `region-hotspots` (top areas: Hebbal, Yelahanka, Jakkur, Thanisandra) →
`area-groups` pills incl. **north-growth** → `area-areas` (Thanisandra + Hennur) → **Hebbal** `area-listings`.

## 2. Marker strategy per level

- **Region marker** — dark count-bubble, region short name + homes count. Selected = darker + scaled.
- **Corridor / group marker** — pill with icon + name + count. School journey uses the plum school glyph.
- **Area marker** — tailed pin, name + count, copper (area journey) / plum (school journey). Selected fills navy. **For groups with many areas (16+), the `area-areas` layer degrades per [`AREA_MARKER_UX.md`](./AREA_MARKER_UX.md) — capped representative pins + navigation "area clusters", not all areas at once.**
- **School marker** — tailed pin with mortarboard + school name; selected fills plum.
- **Listing / home marker** — compact price pin (mono). Focused = copper fill, white ring, scaled, raised z-index.
- **Parcel marker** — evergreen acreage pin.
- **Cluster marker** — count disc sized by member count, captioned *"Zoom to open"*. One per pixel-neighbourhood.

## 3. Dense-marker rules

- **Cluster when** leaf markers (listings / homes / parcels) fall within **46 px** of each other at the live zoom. Greedy pixel grouping → one disc per neighbourhood.
- **De-emphasise low signal** — navigation levels cap what's drawn: `region-hotspots` shows only the top ~4 areas, never every area.
- **Reveal individual markers** progressively: tapping a cluster flies into its bounds (maxZoom 17); the zoom change re-clusters, splitting it into smaller clusters / individual pins. Never dumps all pins at once.
- **Re-cluster on zoom only** — pixel proximity is pan-invariant, so panning (and popup auto-pan) never rebuilds markers (this is also what keeps open popups alive).

## 4. Viewport & camera behaviour

- **Fit bounds** on every *level* change (region / group / area / zone / school / corridor / cluster) using the entity's stored bounds.
- **Preserve zoom** when only the focused listing changes — use `panInside` (moves only if the marker is off-screen), never `flyTo`.
- **Padding** is constant: `paddingTopLeft [82,82]`, `paddingBottomRight [70,96]` (extra bottom clears the summary pill, extra left clears the legend).
- **Avoid jitter** — camera moves are gated on a `cameraKey` (level + selection + radius/band). Marker rebuilds are gated on a `buildKey` (cameraKey + result-set ids). Focus/hover changes are in *neither* key, so they never rebuild markers or move the camera. Filter changes rebuild markers but do **not** re-fit.
- **Smooth transitions** — all moves use `flyTo`/`flyToBounds` with `duration 0.85`, `easeLinearity 0.22` (cluster zoom-in uses 0.7).

## 5. Marker click behaviour

- **Navigation markers** (region / group / area / zone / school / corridor / cluster-town) → drill one level down.
- **Leaf markers** (listing / home / parcel) → **both**: (a) open an infographic **popup** (image, trust tier, price, type, beds/baths/sqft or acres/soil/water), and (b) set the focused listing → the right-panel card gets a copper outline and the panel scrolls it into view.
- **Selected state** — focused marker fills the accent colour, gains a white ring, scales up, raised above siblings.
- **Marker-to-marker** — the popup carries `‹ n / total ›` to step through the on-map markers without closing it or losing context (`panInside` + re-open popup). *Show in list* re-highlights the panel card.
- **Cluster click** → zoom into bounds (progressive reveal), no popup.

## 6. School search / add-school behaviour

- School results surface as plum school pins at the `school-schools` level (schools in the selected area) and as the anchor pin at `school-homes`.
- Area-specific school search is the scoped search box (Area / School toggle) — results are filtered to the current region scope and drill straight to the school or its area.
- **No schools found** → the panel shows an empty state ("No schools mapped here yet") with a back-to-areas action; the map simply shows no school pins (no fabricated markers).

## 7. Design constraints (honoured)

- Counts, coordinates, schools and distances are **backend-owned** — every count is derived from the real records; nothing is fabricated.
- **Coordinate privacy** — markers use approximate area/locality points and clustered discs; no exact private pins are exposed, and clusters hide individual coordinates until the user zooms in.
- Area-first, school-first and agri-first journeys share ONE shell and ONE map; agri keeps its own evergreen layers and never mixes with residential/school markers.
- Generic map clutter avoided via clustering, capped navigation markers, and constant padding. ReTrends tokens (navy/copper/plum/evergreen, radius, shadow, mono) used throughout.

## 8. Acceptance checklist (for Claude Code)

- [ ] City landing shows exactly the 5 region bubbles; counts match `BLR_COUNTS.homesRegion`.
- [ ] Selecting North fits North bounds smoothly (no snap), shows ≤4 top-area pins.
- [ ] `area-groups` in North shows group pills (incl. north-growth) without the camera jumping on hover.
- [ ] Opening **Hebbal** / All-listings clusters dense homes; no more than a handful of markers visible at the fitted zoom.
- [ ] Tapping a cluster flies into its bounds and reveals smaller clusters / individual pins (progressive, one level at a time).
- [ ] Clicking a home/parcel pin opens an infographic popup **and** highlights + scrolls the matching panel card.
- [ ] Popup `‹ / ›` steps between on-map markers without closing the popup or re-fitting the camera.
- [ ] Hovering a panel card highlights its map pin (and vice-versa) with **no** camera movement.
- [ ] Changing filters updates markers but does **not** re-fit the camera.
- [ ] Panning does not rebuild markers or close an open popup; only zoom re-clusters.
- [ ] `school-homes` draws the radius ring, the anchor school pin, and clustered homes; empty radius shows the panel empty state, no fabricated pins.
- [ ] Agri corridors/clusters/parcels never render residential markers, and vice-versa.
- [ ] Deep links (`?region=…&journey=…&areaId=…&schoolId=…&radiusKm=…`) restore the correct level, markers and camera.
- [ ] No console errors; reduced-motion users still get functional (if less animated) camera moves.
