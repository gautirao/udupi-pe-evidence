# Discover Map — Area-Marker UX for large groups

Companion to `MAP_MARKER_UX.md`. This **supersedes and expands** the `area-areas` layer in
that spec (§2 "area marker", §3 dense rules) for the case where a selected group / corridor / zone
contains many areas. It is a **UX spec + acceptance criteria — no production code.**

**Stress case:** `scope=north · groupId=thanisandra-hennur-belt` — 29 areas, 181 properties. The
panel lists all 29 (sorted by property count); the map currently plots all 29 tailed labels at
once, so they overlap into an unreadable pile *before* the user ever reaches listing-level clustering.

**Governing principle.** Area markers are a **navigation aid for spatial orientation**, not an
inventory. The **right panel is the complete, authoritative list of areas** — always. The map's job
is to show a *legible, spatially representative* subset and make every other area reachable (via
panel row, area cluster, hover, or search). The map never has to show all areas; the panel never
hides any.

---

## 1. Area-marker degradation model

| Band | Initial map markers | Labels | Grouping / clusters | Low-count areas | Panel |
|---|---|---|---|---|---|
| **1–8 areas** | All areas, full labeled pins | Always on | None | Own labeled pin | Full list (source of truth) |
| **9–15 areas** | All areas rendered | Top ~6–8 by rank labeled; rest are compact count-dots, **label on hover/focus** | None (all individually pickable) | Count-dot, hover reveals label | Full list |
| **16–30 areas** | ~10–12 **representative** labeled pins (spatially spread, §3) | Representatives + selected + searched only | Remaining nearby areas fold into **area clusters** ("+N areas") | Inside an area cluster, or a faint dot at the map edge | Full list + "Showing X of N areas on map — all listed here" note |
| **30+ areas** | One representative per sector/grid cell (§3), hard cap ~12 labeled | Representatives + selected + searched only | Area clusters everywhere else; optional "Zoom in to reveal more areas" hint | Always inside an area cluster; reachable by zoom or panel | Full list, paginated if long |

Rules that hold across every band:
- The **panel always lists 100% of areas** with their real counts. Degradation is map-only.
- Nothing is *permanently* hidden: a demoted area is always reachable via (a) its panel row, (b) hover from the panel, (c) an area cluster on the map, or (d) search.
- Counts and coordinates stay backend-owned; the map never sums or fabricates counts to decide grouping (grouping is spatial + rank, using counts the backend already returned for the visible areas).

## 2. Area-marker prioritisation (ranking)

Each area gets a rank score used to decide *which get labeled representatives* and *which fold into clusters*. The score blends, in priority order:

1. **Forced-always** (rank overrides everything): the **selected** area, any **search match**, and the **hovered / panel-focused** area are always a full labeled pin, pulled out of any cluster.
2. **Property count** — primary relevance signal (higher = more likely to be a representative).
3. **Spatial coverage** — a per-cell / per-sector guarantee (§3) so representatives span the group's extent instead of bunching.
4. **Centrality** — ties broken toward areas nearer the group centroid (more recognisable anchors).
5. **Panel viewport** — areas whose panel rows are currently on-screen get a soft emphasis boost (ties §6).

**Explicit anti-pattern:** never pick "top N by count" globally. In this belt the four highest-count
areas (Thanisandra 46, Jakkur 16, R.K. Hegde Nagar 13, Sahakara Nagar 9) sit in the same core — top-N
would put every label in one corner. Spatial coverage (§3) must gate count.

## 3. Spatial spreading strategy

**Preferred: pixel-grid bucketing with a ranked representative per cell + overflow area-clusters.**

1. Overlay a coarse grid on the current viewport, cell ≈ **100–120 px** (wider than a label, so one label per cell = collision-free by construction).
2. In each occupied cell, the **highest-ranked area becomes the labeled representative pin**.
3. Other areas in the same cell become that cell's **area cluster** ("+N areas"); a cell with a lone extra area may instead show a hover-only dot.
4. Apply a **global cap** (~10–12 labeled pins). If occupied cells exceed the cap, keep the best-ranked representatives **but guarantee ≥1 representative per quadrant/sector** of the group bounds, so edges are never dropped in favour of a dense core.
5. Recompute buckets on **zoom only** (pan-invariant, like listing clusters) — so panning and hovering never reshuffle markers.

**Why this over the alternatives:**
- *Top count per grid cell* is exactly this — it's the core of the approach.
- *Collision-aware label nudging alone* repositions clutter but doesn't reduce it, and nudged tails point at the wrong coordinate (privacy + accuracy issue). Rejected as the primary mechanism.
- *One per quadrant/sector* is too coarse for irregular belt shapes; used only as the **coverage guarantee** layered on top of the grid.
- *Representative per pixel neighbourhood* = the grid, but grid cells are deterministic and stable across renders (neighbourhood greedy grouping can flicker). Grid preferred for stability.

Net: even spatial coverage (grid + quadrant guarantee), relevance-respecting (rank within cell),
collision-free (one label per cell), stable (deterministic, zoom-only recompute).

## 4. Area clusters (navigation clusters — NOT listing clusters)

Area clusters **exist** at the 16–30 and 30+ bands. They must read as *"more areas to choose from
here,"* never as *"N listings here."*

| | Listing cluster (existing) | **Area cluster (new)** |
|---|---|---|
| Shape | Filled solid disc (navy / evergreen) | **Soft outline chip** (paper fill, navy border) |
| Glyph | none | small **areas** glyph (stacked map-pins / layers) |
| Label | `19 homes` · "Zoom to open" | **`+4 areas`** (or `Thanisandra +4 areas` with the dominant name) |
| Count shown | property count | **area count** (never a property sum — that would imply inventory) |
| On click | fly into bounds → reveal listing pins | **fly into bounds → split into individual area pins**; if already at max zoom and still overlapping, **expand inline** into a small stacked chooser AND filter/scroll the panel to those areas + highlight them |
| Meaning | inventory density | navigation grouping |

The visual and label distinction is mandatory so users never confuse "choose an area" with "browse
listings." Clicking an area cluster **never drills to listings** — it only helps pick an area.

## 5. Labels & collision behaviour

- **Always full label:** representatives (per band), the **selected** area, **search matches**, and the **hovered / focused** area.
- **Hidden until interaction:** non-representative low-count areas render as a small count-dot; **hover/focus reveals the full label** (and a popup on click).
- **Short labels:** where space is tight, drop redundant suffixes (`Layout`, `Nagar`, `Village`, `Kempapura`) or truncate with ellipsis; **selected and searched areas always show the full untruncated name**.
- **No overlaps by construction:** grid bucketing means at most one persistent label per cell. A transient hover label that would overlap a fixed one gets top z-index while the neighbour dims briefly.
- **Accessibility:** area markers are focusable in **panel order**; focus shows the full label + popup; Enter selects; ←/→ move between visible markers. Areas with no visible marker remain fully operable from the keyboard-navigable panel, so keyboard users never lose a path.

## 6. Panel ↔ map coordination

- **Hover a panel card →** its marker emphasises: a hidden dot promotes to a full label; if the area is inside a cluster, the **cluster chip highlights** and a transient label for that area pops. **No camera move.**
- **Click a panel card body (select) →** `panInside` to the marker (move only if off-screen) + open the area popup/infographic. **Click "View properties" →** drill to `area-listings` for that area (existing behaviour) — this works **directly from the panel row**, even for areas with no visible marker.
- **Click a map area marker →** highlight + scroll the matching panel card into view (existing pattern).
- **Scroll the panel →** softly emphasise the markers for rows in the panel viewport (debounced); **never moves the camera**.
- **"Show on map" affordance** on low-count / demoted area cards → `panInside` + temporarily promote that area to a full labeled pin + popup (needed because it may be inside a cluster or a hover-only dot).

## 7. Search behaviour

- Typing filters the **panel live** (source of truth). Matching areas are **promoted to full labeled pins**, pulled out of any cluster; non-matches **fade to faint dots** (kept for orientation, not removed).
- **Camera does not move on keystroke.** Marker promotion is **debounced (~200 ms)** so it doesn't thrash while typing.
- Camera moves **only on submit / result select** — `panInside` to the chosen area + open its popup/infographic.
- A match that is a hidden 1-property area is promoted and revealed like any other match.

## 8. Camera behaviour for dense area groups

- **Fit group bounds once**, on entering `area-areas` (a level change), with the constant padding from the base spec. 
- **Preserve zoom** on hover, panel scroll, and search typing — no move.
- **`panInside` (not `flyTo`)** when selecting an area from the panel or a search result — moves only if the target is off-screen.
- **Zoom into sub-cluster bounds** when an area cluster is clicked (progressive reveal, maxZoom cap).
- **Opening a hidden / low-priority area from the panel:** `panInside` + promote marker + popup; only *zoom* if the area is currently inside a cluster (zoom to split it out), otherwise just pan.
- All camera moves gated on the **level/selection key** (as in the listing model) so hover, scroll, and typing can never move the camera → no jitter.

## 9. Large-dataset stress tests (graceful degradation)

- **12 areas, evenly spread** → 9–15 band: all rendered; ~8 labeled (spread means few collisions), rest hover-label; no clusters. Clean.
- **30 areas, tightly clustered** → 16–30 band: grid yields ~10 representatives + a few "+N areas" clusters over the core; clicking a cluster zooms and it splits cleanly (they separate at higher zoom).
- **40 areas, dense core + low-count edges** → core collapses into 2–3 area clusters; the **quadrant coverage guarantee** ensures each low-count edge area still gets a representative pin, so edges aren't lost to the core's high counts.
- **100 areas, large city region** → 30+ band: one representative per sector + area clusters, "Zoom in to reveal more areas" hint; panel paginates (the live app already shows `1/26 · 1,275 listings` pagination). Map stays legible at every zoom.
- **Many panel rows, little map space** → map cap holds (~12 labels); panel scroll drives emphasis; no attempt to mirror every row on the map.
- **Search a 1-property area** → promoted to a full labeled pin + popup regardless of rank.
- **Select a low-count area hidden from the initial map** → "Show on map" / card-select does `panInside` (+ zoom-to-split if clustered), promotes it, opens popup — the panel row is a first-class entry point that never depends on finding the marker first.

## 10. Concrete recommendation — Thanisandra–Hennur Belt (29 areas · 181 properties)

Initial map should show:
- **~10–12 representative labeled area pins**, chosen by the grid + quadrant guarantee so they **span the belt**, not just the core — e.g. **Thanisandra (46)**, **Jakkur (16)**, **R.K. Hegde Nagar (13)**, **Sahakara Nagar (9)** as high-count anchors, plus spatially distinct reps such as **Hennur**, **Kalyan Nagar**, **HBR Layout**, **Cooke Town / Frazer Town** (south edge), **Dodda Gubbi / Chikkagubbi Village** (north edge), **Vignana Kendra**. Exact set is backend-count-driven within each grid cell — not hard-coded.
- **2–4 area clusters** ("+N areas") absorbing the tight knot of 1–2-property areas around the core (Nagavara, Ganganagar, Bileshivale, Kaval Bairasandra, Amani Byrathikhane, etc.). These are **navigation chips**, not listing discs.
- **Labels:** representatives + selected + searched full; everything else dot + hover-label.
- **Right panel:** unchanged — header `29 areas · 181 properties`, the full sorted list, and the `View all 181 properties across Thanisandra–Hennur Belt` escape hatch. Add one line under the header: **"Showing 12 of 29 areas on the map — all 29 are listed below."**
- **Clicking "View properties" on a low-count area (e.g. Nagavara · 1 property):** drills straight to `area-listings` for Nagavara from the panel row — camera `panInside`/zooms to it and opens the marker popup. The user never has to locate it on the crowded map first.

## 11. Acceptance checklist (implementation-ready)

**Area-marker density**
- [ ] 1–8 areas: all shown as full labeled pins, no clusters.
- [ ] 9–15: all rendered; only top ~6–8 labeled; rest are hover-label dots.
- [ ] 16–30: ≤12 labeled representatives + area clusters; verified on Thanisandra–Hennur Belt.
- [ ] 30+: one representative per sector/cell, hard label cap, "zoom in" hint, no overlap at any zoom.

**Label collision**
- [ ] No two persistent labels overlap at the initial fitted zoom (grid guarantees one label/cell).
- [ ] Selected and searched areas always show full, untruncated labels.
- [ ] Hover/focus label always renders above neighbours; neighbour dims, never double-draws.

**Hidden / low-priority areas**
- [ ] Every area is reachable via panel row, hover, area cluster, or search — none permanently hidden.
- [ ] "Show on map" reveals a demoted area (promote + panInside + popup).

**Panel hover/click coordination**
- [ ] Panel hover emphasises the marker (or its cluster) with no camera move.
- [ ] Panel card select pans (panInside) + opens popup; "View properties" drills to listings from the row.
- [ ] Map marker click scrolls + highlights the panel card.
- [ ] Panel scroll softly emphasises in-viewport markers, debounced, no camera move.

**Search promotion**
- [ ] Matches promote to full labeled pins and leave clusters; non-matches fade, not removed.
- [ ] Camera moves only on submit/select; marker promotion debounced; no jump per keystroke.

**Camera stability**
- [ ] Group bounds fit once on level entry; hover/scroll/type never move the camera.
- [ ] Area-cluster click zooms to split; panel-opened areas panInside (zoom only if clustered).

**Mobile**
- [ ] Map/panel stack (or sheet) on small screens; label cap tightens (~6–8); tap = hover-equivalent (tap dot → label+popup); clusters remain tap-to-split; hit targets ≥ 44 px.

**Regression — journeys**
- [ ] Area-first: `area-areas` behaves per this spec; listing-level clustering unchanged.
- [ ] School-first: `school-areas` reuses the same degradation model with the plum accent; school pins and radius unaffected.
- [ ] Agri-first: `agri-clusters` (towns) unaffected; residential area logic never leaks into agri layers and vice-versa.

**Constraints (must all hold)**
- [ ] Counts & coordinates backend-owned; no fabricated areas/counts; no fetch-all-counts workaround.
- [ ] Coordinate privacy preserved (approx points + clusters; no exact private pins).
- [ ] Marker popup behaviour preserved; right panel remains the complete source of truth.
- [ ] ReTrends tokens only (navy / copper / plum / evergreen, radius, shadow, mono).
