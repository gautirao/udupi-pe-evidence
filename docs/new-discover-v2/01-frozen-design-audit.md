# 01 — Frozen Design Audit (Discover V2 export)

**Source of this document:** specialist audit agent, read-only, live-browser-verified.
**Design location:** `docs/design/retrends-design-system/ui_kits/new_discover/`
**Render method that worked:** `python3 -m http.server 8791` from
`docs/design/retrends-design-system/` root, then navigate to
`http://localhost:8791/ui_kits/new_discover/index.html`. **`file://` does not work** — Babel's
in-browser `.jsx` XHR loads CORS-fail on `file://`. No console errors once served over HTTP.

## Phase 1 — Manifest structural validation

1. **Unique ids — CONFIRMED.** 20 states, 0 duplicates. (Note: the task brief said "22 states" —
   actual is **20** states plus a separate 7-entry `undesignedStates` list. Use 20 going forward.)
2. **`nextStateIds` integrity — CONFIRMED.** 0 dangling references — every `nextStateIds` entry
   resolves to a real state id.
3. **`designFile` paths — CONFIRMED.** All 20 states point at the single existing `index.html`
   (this is a single-page app; states are reached by hash/interaction, not separate files).
4. **Canonical component vocabulary vs. source — MISSING (the one hard defect).** VISUAL_RULES.md
   documents 29 `data-design-component` names as "stable attributes added to the export"
   (VISUAL_RULES.md:141), and the manifest states `data-design-screen` on the app root equals the
   state id (manifest line 8). **Neither attribute exists anywhere in the src JSX, and the live
   DOM confirms zero instances of both** (`document.querySelectorAll('[data-design-component]')`
   and `[data-design-screen]` both return empty at every state tested). This was verified twice:
   once by static source read, once at runtime in the browser.
   - **Impact:** any future automated tooling intended to visually verify parity against this
     export (e.g. a Playwright script that asserts on `data-design-component="mode-selector"`)
     **cannot work as documented**. Real, working runtime hooks that do exist: `data-nd-card`,
     `data-nd-area`, `role="tab"` / `role="tablist"`, and CSS classes `nd-nav*` / `dp-pop*`.
   - **Recommendation:** either (a) instrument the actual production V2 components with
     equivalent `data-testid`s during implementation (cheap, and this repo already uses
     `data-testid` conventions — see `data-testid="property-marker"`,
     `data-testid="trust-badge"` in production code), or (b) do not attempt design-export-bound
     visual automation at all and rely on the manual/E2E verification plan in
     [04-testing-quality-gates.md](04-testing-quality-gates.md).
5. **`undesignedStates` (verbatim from the manifest — these are real build gaps, not omissions in
   this audit):**
   - `NOT_DESIGNED`: loading / skeleton states for any journey.
   - `NOT_DESIGNED`: hard-error screens (network / server failure).
   - `NOT_DESIGNED`: deep link to unavailable data (suggested intent: fall back to nearest valid
     ancestor level — not confirmed as a product decision).
   - `NOT_DESIGNED`: map-tile failure while panel data is available (panel should stay usable).
   - `NOT_DESIGNED`: listing / school / parcel **detail pages** (cards link to "View
     details"/"View parcel" but the detail view itself is out of scope for this export).
   - `NOT_DESIGNED`: switching to a second live city (only Bangalore is designed; Mumbai/Pune/
     Hyderabad are disabled "Soon" placeholders).
   - `NOT_DESIGNED` (data-dependent): a Schools directional-cluster level — the code path exists
     in the export but is not reachable with the current mock data (no Schools region is dense
     enough to trigger it).

## Phase 2 — Live browser walkthrough (all confirmed in-browser; exact hashes used)

- **`areas-city-default`** (`#`): "Where do you want to explore?" — **all 5 directional regions
  including Central rendered** (North 203 properties/+32 areas, Central "Indiranagar ·
  Koramangala" 6, West "Malleshwaram · Rajajinagar" 4, East "Whitefield · Marathahalli" 5, South
  "Jayanagar · JP Nagar" 5). Mode-selector is `role="tablist"`; Areas tab has
  `aria-selected="true"` **with a check-badge SVG** + a "Rec" pill. Breadcrumb: "Bangalore".
  Summary strip: 223 properties.
- **`areas-region-clusters`** (`#r=north`): "Inside North Bangalore" — **4 clusters, each labelled
  by real representative area names** (e.g. "Thanisandra & R.K. Hegde Nagar", never a compass
  word), rendered as navy directional-marker cards positioned by bearing.
- **Recursion confirmed** (`#r=north&p=S`): clicking a cluster deepens to a further "SUB-REGION"
  with 5 more clusters — the directional clustering is genuinely recursive in the export, not a
  single fixed level.
- **Shallow sub-path** (`#r=north&p=SE`): a 2-area cluster drops straight to area-marker pills
  ("2 areas") — confirms the "skip the cluster when it isn't needed" rule operates at every
  depth, not just at the top region level.
- **`areas-area-listings`** (`#…&a=horamavu`): full breadcrumb, 7 homes; **school-shortcut**
  ("keeps this area"), **property-search**, **filter-toolbar** (Type / Beds / Verified-only),
  **listing-card** grid (Verified / Trusted / New badges, save heart), **listing-pin** price
  pills on the map.
- **Schools retains the selected area** (`#m=schools&r=north&p=SE&a=horamavu`): heading
  "SCHOOLS · YOUR AREA IS KEPT" / "Schools in Horamavu"; area has 0 schools, so the **designed
  "No schools match" empty state** renders, and homes in the area still render beneath it.
- **Autocomplete is mode-aware**: typing "Hebbal" while in Schools mode surfaces
  "Hebbal · North · Bangalore · **View schools →**" (the action label changes per mode, per
  DESIGN_INTENT.md §7).
- **`schools-area-schools`** (`#…&a=hebbal`): 3 schools; **school-filters** (Board:
  CBSE/International; Level chips), **school-result** rows, plum **school-marker** pills.
- **`schools-homes-near`** (`#…&s=s-vidyaniketan&rad=5`, the exact manifest example hash):
  **dashed plum radius circle** on the map; **radius-selector** with live cumulative counts
  (3 km → 13 homes, 5 km → 83 homes selected, 10 km → 204 homes); plum distance-chip badges on
  distance-sorted listing cards.
- **`agri-area-origin`** (`#m=agri&ao=hebbal`): breadcrumb reads "**Origin: Hebbal**" — never
  "inside Hebbal" — confirming DESIGN_INTENT.md §5's non-containment rule is actually implemented
  in the export, not just documented. Heading: "Agricultural land around Hebbal". An
  **agricultural-origin** bar shows "Search origin: Hebbal" + a "Use Bangalore centre" reset
  action. Four evergreen corridor-marker cards render with **direction/distance recomputed
  relative to Hebbal**, not the city centre.
- **`agri-corridor-towns`** (`#…&c=n-doddaballapur`): translucent evergreen **agricultural-sector**
  wedge + cumulative **distance arcs** at 10/25/50/100 km from the "Origin · Hebbal" pin, with a
  legend card explaining the sector is a search scope, not a boundary. **Distance-selector counts
  are genuinely cumulative** (Within 10 km → 0, Up to 25 km → 2, Up to 50 km → 4, Up to 100 km →
  6) with the caption "Includes properties at closer distances too." Town rows + green
  town-marker discs render beneath.
- **`agri-town-parcels`** (`#…&cl=t-yelahanka-rural`): agri filters (size / price / soil / road /
  water), **parcel-card** grid, green parcel-pin discs on the map.
- **Shallow region contrast** (direct `#r=south`): "Areas in South Bangalore" — 2 areas, straight
  to area-marker pills, **no cluster level at all** — a clean contrast against North's 4-cluster
  deep path, in the same running app.
- **Mobile (resized to ≤820px)**: confirmed at the DOM level — `flex-direction: column`, map
  `flex-basis: 42%` / `min-height: 260px`, panel `border-top-radius: 16px` /
  `margin-top: -14px`, and a grab handle element is present. Desktop DOM (row layout, map
  `flex-basis: 52%`) also confirmed at the ≥820px breakpoint.
- Direct-hash deep-linking works for every state tested. **No console errors observed at any
  point** in the walkthrough.

## Phase 3 — Guides vs. rendered reality (spot-checks)

1. Mode selector is `role="tablist"` of `role="tab"` cards — **CONFIRMED** in the live DOM.
2. Selected mode card carries an explicit check badge (not colour alone) — **CONFIRMED**: the
   selected tab in all 3 modes shows a check SVG, matching the a11y intent in DESIGN_INTENT.md
   §14.
3. Breadcrumb shows only levels that actually exist — **CONFIRMED**: it grows step-by-step
   (City → region → cluster → area → school as each level is chosen) and the shallow South path
   correctly shows only City → South (no empty cluster crumb).
4. **Directional-marker width scaling — CONFIRMED with a nuance.** VISUAL_RULES.md §228's stated
   formula ("130 + weight*40 → 130–170px") is only the base `dirCard` fallback
   (`src/NDMap.jsx` — not independently re-verified line-by-line here). The actual rendered
   compass placement overrides this with a panel-responsive `clamp(112, 168, …)`
   (`NDMap.jsx:351,365` per source read), so rendered widths are closer to 112–168px, not a fixed
   130–170px range. This is a minor documentation-vs-code discrepancy inside the design export
   itself (not a production-vs-design gap) — worth a note for whoever builds the production
   equivalent, but not a blocking issue.
5. Distance bands are genuinely cumulative — **CONFIRMED** both by live counts (0 ⊂ 2 ⊂ 4 ⊂ 6) and
   by the caption text.
6. Desktop 52%/48% map/panel split — **CONFIRMED** in the DOM.
7. **Central region is a real part of the design, not a documentation artifact** — confirmed it
   renders as the 5th compass card in the live app (`data.js:90` per source read). This matters
   because **production currently seeds only East/North/South/West with no Centre bucket**
   (see [02-production-baseline-audit.md](02-production-baseline-audit.md) §Backend). The Centre
   region is a genuine design-vs-production gap to resolve, not a design ambiguity.

### Minor / unresolved items

- **Cosmetic inconsistency:** `index.html:1` declares `@dsCard viewport="1440x860"` while the
  manifest's `viewportDefaults.desktop` is `1366×768`. Harmless — the app is responsive and both
  viewports render correctly — but worth fixing in the export metadata if it's ever re-exported.
- **Unresolved:** `src/components/shared.jsx:86` exports a navy `HeaderBand` component, while
  VISUAL_RULES.md §5/§339 explicitly reject hero bands on results screens ("no oversized
  landing-page hero"). Every results screen actually rendered during the walkthrough used a
  compact serif header, not this hero band, so it *appears* to be dead code or reserved for a
  non-results context (e.g. the city-level landing) — but this was not fully traced end-to-end
  (would require reading `NDPanel.jsx` in full). Worth a 10-minute targeted check before
  production build starts, to make sure nothing in the production port accidentally wires a hero
  band into a results screen.

## Bottom line

The manifest is structurally sound and every behavioural claim spot-checked was confirmed running
in the actual exported app — this export can be trusted as the visual/behavioural source of
truth. The one real defect is the missing `data-design-component`/`data-design-screen`
instrumentation (do not rely on it for automated tooling). The seven `undesignedStates` are
explicit, product-owner-facing gaps that must be resolved by a decision, not invented during
implementation.
