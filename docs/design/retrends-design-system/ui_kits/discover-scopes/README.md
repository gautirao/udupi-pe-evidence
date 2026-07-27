# Discover — Result Scopes and Multi-Area Search

Design mocks for **#2020**, built as an extension of the approved Discover kit in
`ui_kits/discover/`. Nothing in that kit was edited: the shell, left-map /
right-panel composition, mobile list-first structure, typography, cards, filter
controls, map controls, spacing, listing cards and breadcrumb treatment are
reused, and every previous page remains available for before/after review.

```
index.html          → state index, visual grammar, mapping table, open questions (@dsCard)
state.html          → state player · ?state=<id>&device=desktop|mobile
src/scope-data.js   → canonical areas, counts, school fixtures, listing generator
src/states-a.js     → Groups A (result-scope foundation), B (multi-area editing), G (map ↔ panel)
src/states-b.js     → Groups C (committed), D (schools), E (zero-result recovery), F (alerts)
src/ScopeBits.jsx   → scope chips, scope bar, callouts, map overlays
src/ScopeMap.jsx    → Leaflet layer + the four marker families
src/ScopePanel.jsx  → block renderer (every state is an ordered list of blocks)
src/ScopeApp.jsx    → device frames (1366×768 / 390×844) + annotation rail
```

Open `index.html` and click through, or deep-link a state:
`state.html?state=E3&device=mobile`.

> **Source note.** The GitHub issue bodies (#2020 and #2014–#2021) could not be
> read directly from this environment — the available GitHub tooling reads repo
> files, not issues. The mocks were built from the written brief plus the repo's
> own contracts (`docs/new-discover-v2/`, `docs/runbooks/areas-navigation-…`,
> which confirm the recursive-node model, the `node=` URL parameter and the
> 1366×768 / 390×844 visual baselines). Anything below marked **open** should be
> checked against the live issue text.

---

## Core product model

Four concepts, four different shapes. None of them borrows another's vocabulary.

| Concept | Rendered as | Never |
|---|---|---|
| **Canonical navigation context** | Plain text with chevrons — `Bangalore › North Bangalore › Hebbal · Yelahanka › Hebbal` | Bordered, filled, or removable |
| **Active result scope** | Square-cornered bordered chips with a scope glyph and a `×`; exactly one kind at a time | Combined with another scope kind, or shown as a breadcrumb |
| **Property filters** | Mono pills in a row labelled *Filters* | Changed by a scope change, or relaxed without an explicit action |
| **Map presentation focus** | Camera state — cluster zoom, chip focus, pan | Folded into the result scope |

### Marker families

Distinguished by silhouette, glyph, label and action — never by colour alone.

| Family | Shape | Glyph | Action label | Behaviour |
|---|---|---|---|---|
| Hierarchy destination | Solid navy rounded card | Layers | `Explore ›` | Canonical navigation; changes breadcrumb and node state |
| Visual area cluster | Hollow **dashed** chip | Magnifier-plus | `Tap to zoom` | Zooms / reveals members; changes neither breadcrumb nor scope |
| Individual area | White pill with a **pointed tail** | Map-pin | `Tap to view homes` | Selects a canonical area; joins the result scope as a chip |
| Listing price / cluster | Mono price pill · solid copper disc | Price / count | — | Unchanged property grammar |

---

## State inventory

52 states, each rendered at desktop 1366×768 and mobile 390×844.

**Group A — result-scope foundation (#2016, #2015)**
`A1` single selected area · `A2` areas → polygon confirmation · `A3` areas →
visible-map confirmation · `A4` polygon → areas confirmation · `A5` active
polygon · `A6` camera moved, results unchanged · `A7` active visible-map scope
with Return · `A8` visible-map entered from three areas · `A9` scope-change
loading · `A10` scope-change failure.

**Group B — multi-area editing (#2017)**
`B1` initial Hebbal selection with nearby suggestions · `B2` two areas ·
`B3` maximum three · `B4` fourth-area feedback · `B5` duplicate feedback ·
`B6` more nearby areas · `B7` counts loading · `B8` partial count error.

**Group C — committed multi-area results (#2017)**
`C1` three areas committed · `C2` edit and clear · `C3` focus one chip ·
`C4` non-contiguous set · `C5` focus then Fit all.

**Group D — schools in selected areas (#2017)**
`D1` school count on a suggestion · `D2` summary after committing ·
`D3` expanded list grouped by area · `D4` `0 listings · 4 schools` ·
`D5` boundary copy.

**Group E — zero-result recovery (#2018)**
`E1` zero across three areas · `E2` nearby alternatives with current-filter
counts · `E3` preview before adding · `E4` explicit add-and-search ·
`E5` filter-relaxation previews · `E6` direct canonical empty area ·
`E7` polygon zero · `E8` visible-map zero with Return · `E9` backend error with
Retry · `E10` transient failure with retained results · `E11` mobile recovery.

**Group F — saved-search alerts (#2019)**
`F1` create for selected areas · `F2` create for polygon · `F3` create for
visible map area · `F4` unsupported-filter disclosure · `F5` created ·
`F6` persistence failure · `F7` anonymous user · `F8` alert management ·
`F9` pause / resume / delete · `F10` notification deep link restored.

**Group G — map and panel synchronisation (#2014, #2015)**
`G1` same canonical destination from map and panel · `G2` visual cluster zoom ·
`G3` `5 areas in this map view` / `Show all 20 areas`.

The full **mock state → issue → acceptance criterion** table is generated in
`index.html` from the manifest, so it cannot drift from the mocks.

---

## Rules the mocks hold to

- **Moving the map is not searching.** A camera move never changes results; the
  only bridge is `Search this area`, and it announces the replacement first.
- **Draft ≠ committed.** Chips being edited are dashed and labelled *Result
  scope — draft*; results do not move until Search / Show listings.
- **Zero ≠ unknown.** A failed count reads *count unavailable*, never `0`. A
  backend error uses the error treatment and offers Retry, never suggestions.
- **Nothing broadens itself.** Every widening of geography or filters is a named
  action with the resulting count printed before it is taken.
- **Schools are informational.** Exact framing *Schools in selected areas*, with
  an explicit list of what it does not claim (D5).
- **Success means persisted.** Alert success copy appears only in F5.
- **The panel always says why its rows changed** — every state that reorders,
  subsets or empties the list carries a one-line reason above it.

---

## Back and history

| Control | Behaviour |
|---|---|
| Hierarchy Back | Goes to the canonical parent node. Does not clear the result scope. |
| Browser Back | Goes to the previous **committed** state, not the parent node. |
| Edit areas | Edits the current area set as a draft. |
| Clear selected areas | Confirmed; leaves the parent node with no result scope. |
| Return to selected areas | Restores the previously committed area set by name. |
| List / Map | Presentation only. |
| Search / Show listings | The commitment point. |
| Back to results | Returns from a property to the same scope, filters and scroll position. |

Each state's rail lists only the controls that apply to it.

---

## Unresolved design decisions

1. **Three-area maximum** — product rule or query-cost guard? B4 proposes an
   explicit swap rather than a hard stop, but does not choose which chip is
   released by default.
2. **Two count semantics** — suggestion counts (B1) are whole-area totals before
   filters; recovery counts (E2) are filter-aware. Both are labelled; unify or
   keep?
3. **“Show 95 listings” in the #2020 Group B example** — the brief shows a
   95-listing button under a single Hebbal selection. The mocks show the honest
   draft total (42) and only reach 95 once three areas are drafted. Confirm.
4. **Viewport scope lifetime** — does a committed visible-map scope survive
   hierarchy navigation, reload, or a day?
5. **Breadcrumb for non-contiguous sets** — C4 collapses to `Bangalore`; the
   alternative is keeping the last visited node.
6. **Schools from zero-listing areas** — D2 counts them; correct beside a
   property total?
7. **Frozen rectangle alerts** — F3 saves the viewport as a fixed rectangle and
   says so; resolving it to canonical areas at save time would be easier to
   describe in F8.
8. **Stale-result retention** — how old may E10's retained results be?
9. **`Search this area` before the camera moves** — disabled, or always live?
10. **Draft persistence** — a draft abandoned by navigating away is currently
    discarded.

---

## Implementation notes

- Tokens only — every colour, radius, shadow, font and duration is a CSS
  variable from `styles.css`. Plum (school journey) and ochre/brick (caution and
  error) literals match the existing Discover kit's local `:root` block.
- Components come from `_ds_bundle.js` (`Icon`, `Badge`, `TrustBadge`); nothing
  new was added to the design system.
- Map is the same Leaflet + CARTO Voyager setup as `ui_kits/discover`; markers
  are `divIcon` HTML built by `src/ScopeMap.jsx` and exported as
  `window.RSMarkerHTML` so the index page can show the same markup as specimens.
- States are pure data. Adding a state means adding one object to
  `states-a.js` / `states-b.js`; the index page and mapping table update
  themselves.
- No production React, no backend, no new API surface is implied. Counts are
  fixtures, but combined totals are always the sum of their parts.
