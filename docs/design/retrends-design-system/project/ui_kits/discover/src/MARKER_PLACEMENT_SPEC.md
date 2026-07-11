# Discover Map — Marker Placement Spec (declutter + leader lines)

Design spec for the guided Discover map's marker placement. Implemented in the
prototype (`src/PortalMap.jsx`); this document is the contract for production.
Companion to `AREA_MARKER_UX.md` (degradation bands) and `MAP_PANEL_ALIGNMENT.md`
(map ↔ panel journeys).

## 1. Anchor vs visible chip

Every marker has two positions:

- **True anchor** — the backend-owned lat/lon (region centre, group centre, area
  point, cluster member centroid). **Never modified.** All camera fits, radius
  math, and click semantics use the anchor.
- **Visible chip** — the label/bubble/pill the user sees. It *may* be offset in
  **screen space only** to avoid collisions. The offset is a presentation
  transform; the marker still acts on its true entity when tapped.

**Leader line rule:** if the chip's visual centre ends up ≥ 16 px from its true
anchor, draw a subtle leader (1.5 px, navy @ 38% opacity — plum on school layers)
from the chip back to the anchor, ending in a 7 px anchor dot (navy, white ring).
Below 16 px, no leader — the offset is imperceptible.

Chips are fixed-width blocks centred on their placed point, so collision rects
are exact by construction (no anchor ambiguity).

## 2. Priority order (who moves, who stays)

Placement processes markers in priority order; **higher priority is placed first
and therefore moves least** (usually not at all):

1. **Selected** (selected region / group / area)
2. **Searched** (a search match promoted to a full pin)
3. **Hovered / focused** ("Show on map" force-kept label)
4. **Higher count** (more properties/schools = more important)
5. **Representative** (grid-cell winners in dense groups)
6. **Normal**
7. **Demoted / low-count** (dots, cluster members)

## 3. Per-layer placement model

**City landing (region bubbles).** Directional declutter: each bubble may shift
only along its compass meaning — North up, South down, East right, West left;
Central holds the centre (highest fixed priority after a selected region).
Bubbles step 14 px along their direction until no pair of 104 px discs overlaps
(8 px gap). Offset bubbles get a leader + anchor dot, so "North is up" stays
true *and* geographically honest.

**Region/group overview (pills).** Pills placed by priority (selected → count);
a colliding pill shifts away from the collider in 14 px steps (max 26). Selected
pill stays prominent: highest priority (never moves), darker fill, raised
z-index. Offset pills carry leaders.

**Dense area group (Thanisandra–Hennur Belt).** Per `AREA_MARKER_UX.md`:
grid-bucketed representative pins (cap 12; 8 on maps < 520 px wide) + a
label-rect collision pass (losers demote to dot/chip — labels never overlap).
Neutral "+N nearby areas" chips are placed at their member centroid, then moved
to the **zero-overlap candidate** among 15 deterministic offsets (or the
minimum-overlap one if the map is genuinely full); offset chips always show a
leader + anchor dot at the true centroid. Chips whose footprints overlap merge.
Representative pins are never offset — they sit on their true area point.

**Listing clusters (inventory).** Discs stay ON their member centroids (inventory
must read geographically). Instead of offsetting, discs whose circles would
overlap **merge** into one bigger cluster (radius grows with count). The
"Tap to zoom in" caption renders only on the **largest** cluster in view; other
discs show it on hover — no caption wallpaper.

## 4. Collision rules

- Rects: label ≈ `8·chars + 64 × 44 px` (bottom-anchored at the pin tip);
  chip ≈ `176 × 64 px` (centre-anchored); bubbles/pills per §3. All centred on
  the placed point — deterministic because chips are fixed-width blocks.
- No two persistent labels may overlap at the settled camera (8 px minimum gap
  for moved chips, 4 px for label-vs-label keeps).
- Transient hover promotions render above neighbours (z-index), never re-place
  anything.
- Wide marker boxes are `pointer-events: none`; only the visible chip is
  interactive — offsetting never steals map drags or clicks meant for
  neighbours, and the click always acts on the chip's own entity.

## 5. Stability / jitter rules

- Placement is **deterministic**: same viewport + same marker set → same layout.
- Recompute **only** on: level change, zoom end, marker dataset change, resize,
  and (navigation layers only — they hold no popups) settled move end.
  Leaf/listing layers re-cluster on zoom only, so pans never close an open popup.
- **Hover never re-places anything** — panel hover swaps one marker's icon in
  place; map hover is pure CSS scale.
- Camera moves stay gated on the level/selection key (base spec) — placement
  changes never move the camera.

## 6. Mobile

- Map stacks above the panel bottom-sheet (`?mobile=1` forces it in the
  prototype); Leaflet re-fits via ResizeObserver.
- Label cap tightens to ~8 representatives when the map is < 520 px wide;
  everything else folds into chips/dots sooner.
- Tap = hover-equivalent (tap a dot → promoted label; tap a chip → split or
  panel highlight). Hit targets ≥ 44 px (chips/pills/bubbles all exceed this).
- Legend hides on small screens; breadcrumb and summary pill remain.

## 7. Constraints honoured

- Coordinates and counts stay backend-owned; offsets are screen-space only and
  never persisted. No exact private pins — leaf markers stay clustered until
  zoom; coordinate privacy unchanged. Area clusters = navigation (area counts);
  listing clusters = inventory (home counts); never mixed. ReTrends tokens only.

## 8. Placement acceptance checklist

- [ ] City landing: no two region bubbles overlap; N/S/E/W/C directional meaning
      preserved; offset bubbles show leader + anchor dot. (`screenshots/guide-01-city-declutter.png`)
- [ ] Group overview: no pill overlap; selected pill prominent and un-moved;
      leaders on offset pills. (`screenshots/guide-02-group-overview.png`)
- [ ] Belt: no pin/chip overlap at any zoom; offset chips carry leaders back to
      their true centroid. (`screenshots/01-guide-03-belt.png`, `02-guide-03-belt.png`)
- [ ] Listing clusters: overlapping discs merge; caption only on largest/hovered
      cluster. (`screenshots/guide-05-area-listings.png`)
- [ ] Same viewport + dataset always yields the same layout; hover moves nothing;
      pans don't close popups.
- [ ] Every tap acts on the correct entity regardless of visual offset.
