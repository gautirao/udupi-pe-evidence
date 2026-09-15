# Discover V2 — Visual Rules

All values below are taken directly from the exported design files. Token names reference the
ReTrends design-system CSS in the project root; component values reference the JSX in
`ui_kits/new_discover/src/`. **Do not guess or substitute values** — reference the tokens, and where a
component uses a literal, the literal is quoted here.

**Source files**

| Concern | File |
|---|---|
| Global token entry | `styles.css` → `@import` of `tokens/*.css` |
| Colour tokens | `tokens/colors.css` |
| Typography tokens | `tokens/typography.css` |
| Spacing / radii / layout | `tokens/spacing.css` |
| Elevation / motion | `tokens/elevation.css` |
| Fonts | `tokens/fonts.css` |
| Shell (control bar, mode selector, rows) | `src/NDPanel.jsx` |
| Map + markers | `src/NDMap.jsx` |
| Cards | `src/components/cards.jsx` |
| Shared primitives (filters, radius, distance) | `src/components/shared.jsx` |
| Orchestrator (layout, breakpoints) | `src/NewDiscover.jsx` |
| Local overrides / popup styles | `index.html` `<style>` block |

---

## 1. Tokens

### Colours (`tokens/colors.css`)

**Brand primitives**

| Token | Value | Role |
|---|---|---|
| `--navy-900` | `#0E1626` | deepest ink; headings / CTA bands |
| `--navy-800` | `#1B2A45` | **primary** brand ink-navy; selected markers |
| `--navy-700` | `#26395B` | primary hover |
| `--navy-600` | `#34496E` | |
| `--navy-100` | `#E9ECF2` | navy tint surface |
| `--copper-600` | `#934B2D` | accent hover / pressed |
| `--copper-500` | `#B05C3A` | **accent** (Areas mode) |
| `--copper-400` | `#C2734F` | |
| `--copper-100` | `#F2E8E1` | accent tint |
| `--gold-600` / `--gold-100` | `#8A6A22` / `#F4EEDD` | Commercial property-type identity |

**Neutrals**

| Token | Value |
|---|---|
| `--canvas-100` | `#F6F5F2` (app background) |
| `--canvas-200` | `#EEEDE9` |
| `--stone-300` | `#E6E5E0` (muted surface) |
| `--stone-400` | `#D7D6D0` (hairline on canvas) |
| `--paper` | `#FFFFFF` (cards) |

**Text / greys** — `--grey-900 #111827` (strong), `--grey-700 #374151` (body), `--grey-500 #6B7280`
(muted), `--grey-400 #9CA3AF`, `--grey-300 #D1D5DB`, `--grey-200 #E5E7EB`, `--grey-100 #F3F4F6`,
`--grey-50 #F9FAFB`.

**Semantic hues** — `--evergreen-600 #1F7A5C` (verified / Agricultural), `--evergreen-50 #E8F2EE`,
`--ochre-600 #A9741C`, `--ochre-50 #F6EFDE`, `--brick-600 #B23A2E`, `--brick-50 #F6E9E7`.

**Semantic aliases (reference these, not primitives):**

- Surfaces: `--background: var(--canvas-100)`, `--surface-card: var(--paper)`,
  `--surface-muted: var(--stone-300)`, `--surface-subtle: var(--canvas-200)`,
  `--surface-navy: var(--navy-800)`.
- Text: `--text-strong: var(--grey-900)`, `--text-body: var(--grey-700)`,
  `--text-muted: var(--grey-500)`, `--text-on-navy: #FFFFFF`.
- Actions: `--primary: var(--navy-800)`, `--primary-hover: var(--navy-700)`,
  `--accent: var(--copper-500)`, `--accent-hover: var(--copper-600)`,
  `--accent-tint: var(--copper-100)`.
- Lines/inputs: `--border: rgba(17,24,39,0.09)`, `--border-strong: rgba(17,24,39,0.15)`,
  `--input-bg: #F1F0EC`, `--ring: var(--navy-800)`.
- Trust tiers: verified `--trust-verified-fg #1F7A5C` / `--trust-verified-bg #E8F2EE`;
  trusted `--trust-trusted-fg var(--navy-700)` / `--trust-trusted-bg var(--navy-100)`;
  listed `--trust-listed-fg var(--grey-600)` / `--trust-listed-bg var(--grey-100)`.

### Journey / mode accent colours

The mode drives one accent throughout its screens (`src/NDPanel.jsx` `MODE_TINT` / `MODE_BG`, mirrored
in map + cards):

| Mode | Accent | Tint background | Where |
|---|---|---|---|
| **Areas** | `var(--accent)` = copper `#B05C3A` | `var(--accent-tint)` `#F2E8E1` | default; copper CTAs, area markers |
| **Schools** | `var(--plum-600)` `#5E5286` | `var(--plum-tint)` `#F1EDF7` | plum school markers, school rows/filters |
| **Agricultural** | `var(--evergreen-600)` `#1F7A5C` | `var(--evergreen-50)` `#E8F2EE` | evergreen corridors, sector, parcels |

> **Plum + evergreen literals** are defined locally in `index.html`'s `<style>` `:root` block, since
> they are Discover-specific extensions of the base palette:
> `--plum-600 #5E5286`, `--plum-500 #7E6BA8`, `--plum-100 #DED7EC`, `--plum-tint #F1EDF7`,
> `--evergreen-100 #CFE6D9`, `--evergreen-700 #1F694A`. The map uses two additional evergreen
> literals for filled shapes: corridor `#1F7A5C`/selected `#154834`, sector fill `#2E9B74`.

### Typography (`tokens/typography.css`)

- **Families:** `--font-sans: "Plus Jakarta Sans", …` (UI + body); `--font-serif: "Fraunces", …`
  (panel headings only); `--font-mono: "Geist Mono", …` (prices, counts, metrics).
- **Weights:** 400 / 500 / 600 / 700 / 800 (`--fw-regular … --fw-extra`).
- **Scale (rem @ 16px):** `--text-xs .75/12`, `--text-sm .875/14`, `--text-base 1/16`,
  `--text-lg 1.125/18`, `--text-xl 1.25/20`, `--text-2xl 1.5/24`, `--text-3xl 1.875/30`,
  `--text-4xl 2.25/36`, `--text-5xl 3/48`, `--text-6xl 3.75/60`.
- **Line-heights:** tight 1.15, snug 1.3, normal 1.5, relaxed 1.65.
- **Letter-spacing:** `--tracking-tight -0.02em`, `--tracking-caps 0.08em` (uppercase eyebrows/labels).
- Fonts loaded from Google Fonts in `tokens/fonts.css`.

### Spacing, radii, layout (`tokens/spacing.css`)

- **Spacing (4px grid):** `--space-1 4` … `--space-2 8`, `--space-3 12`, `--space-4 16`,
  `--space-5 20`, `--space-6 24`, `--space-8 32`, `--space-10 40`, `--space-12 48`, `--space-16 64`,
  `--space-24 96`.
- **Radii:** `--radius-xs 4`, `--radius-sm 6`, `--radius-md 8` (default control),
  `--radius-lg 12` (cards), `--radius-xl 16` (feature), `--radius-2xl 24`, `--radius-full 9999`.
- **Control heights:** `--control-sm 32`, `--control-md 36`, `--control-lg 40`.
- **Layout:** `--container-max 1280`, `--gutter 1.5rem`, `--header-h 64`.

### Elevation & motion (`tokens/elevation.css`)

- **Shadows:** `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl` (soft,
  low-contrast, tuned for white cards on warm canvas). Exact:
  `--shadow-md: 0 4px 10px rgba(17,24,39,.07), 0 2px 4px rgba(17,24,39,.05)`;
  `--shadow-lg: 0 12px 28px rgba(17,24,39,.10), 0 4px 10px rgba(17,24,39,.05)`.
- **Focus ring:** `--ring-width 3px`, `--ring-color rgba(28,43,74,0.35)`.
- **Motion:** `--ease-standard cubic-bezier(.4,0,.2,1)`, `--ease-out cubic-bezier(.16,1,.3,1)`;
  `--dur-fast 120ms`, `--dur-normal 200ms`, `--dur-slow 320ms`.

### Breakpoints (from component media queries)

| Breakpoint | Effect | Where |
|---|---|---|
| `≤ 820px` | map/panel switch from side-by-side to stacked sheet | `src/NewDiscover.jsx` `matchMedia("(max-width: 820px)")` |
| `≤ 760px` | compass legend hidden | `index.html` `@media (max-width:760px) .nd-legend` |
| `< 560px` | listing/parcel grid → single column | `src/NDPanel.jsx` `ListingGrid` |
| map width `< 560px` | map instruction card hidden | `src/NDMap.jsx` `mapW >= 560` |

---

## 2. Component rules

Selectors below refer to the stable `data-design-component` attributes added to the export.

### Canonical component vocabulary

These are the **only** approved `data-design-component` names. Every manifest component uses a name
from this list, and every name here is documented below and appears in at least one manifest state.

| Name | Where authored |
|---|---|
| `map-surface` | `src/NewDiscover.jsx` (map column) |
| `results-panel` | `src/NewDiscover.jsx` (panel column) |
| `global-control-bar` | `src/NDPanel.jsx` |
| `city-switcher` | `src/NDPanel.jsx` |
| `buy-rent-toggle` | `src/NDPanel.jsx` |
| `area-autocomplete` | `src/NDPanel.jsx` |
| `mode-selector` | `src/NDPanel.jsx` |
| `metadata-strip` | `src/NDPanel.jsx` |
| `directional-card` | `src/NDPanel.jsx` (panel nav row) |
| `school-shortcut` | `src/NDPanel.jsx` |
| `property-search` | `src/NDPanel.jsx` |
| `filter-toolbar` | `src/NDPanel.jsx` |
| `school-filters` | `src/NDPanel.jsx` |
| `school-result` | `src/NDPanel.jsx` |
| `agricultural-origin` | `src/NDPanel.jsx` |
| `agricultural-search` | `src/NDPanel.jsx` |
| `town-row` | `src/NDPanel.jsx` |
| `trust-strip` | `src/NDPanel.jsx` |
| `radius-selector` | `src/components/shared.jsx` |
| `distance-selector` | `src/components/shared.jsx` |
| `listing-card` | `src/components/cards.jsx` |
| `parcel-card` | `src/components/cards.jsx` |
| `directional-marker` | `src/NDMap.jsx` (region + cluster map card) |
| `area-marker` | `src/NDMap.jsx` |
| `school-marker` | `src/NDMap.jsx` |
| `corridor-marker` | `src/NDMap.jsx` |
| `town-marker` | `src/NDMap.jsx` |
| `breadcrumb` | `src/NDMap.jsx` (map overlay) |
| `agricultural-sector` | `src/NDMap.jsx` (sector legend + `drawSector` overlay) |

> `mapIntent.markerType` values in the manifest (`listing-pin`, `parcel-pin`, `school-radius`) are
> **descriptive**, not component identifiers — the dense leaf pins carry no `data-design-component`;
> they are covered under §4 Map rules.

### Layout regions — `data-design-component="map-surface"` / `"results-panel"` (`src/NewDiscover.jsx`)
- **map-surface** — the map column. Desktop: `flex 0 0 52%`, `border-right 1px var(--border)`.
  Mobile (≤ 820px): top band `flex 0 0 42%`, `min-height 260px`, `border-bottom 1px var(--border)`.
- **results-panel** — the panel column, `flex 1`, `background var(--background)`, a fixed control
  header + a scrolling body. Mobile: rounded top (`16px 16px 0 0`), `-14px` overlap and elevation so
  it reads as a sheet above the map. Both regions are present in every state.

### Global control bar — `data-design-component="global-control-bar"`
- One horizontal bar: `border 1px var(--border)`, `border-radius var(--radius-md)`,
  `background var(--surface-card)`, `box-shadow var(--shadow-xs)`, `min-height 44px`, `flex-wrap`.
- Contains three seamless segments separated by `border-right 1px var(--border)`:
  **city-switcher**, **buy-rent-toggle**, **area-autocomplete**.

### City switcher — `data-design-component="city-switcher"`
- Button: `padding 0 13px`, gap 8px, `map-pin` icon in `var(--accent)`, city name 14px/700, chevron.
- Hover/open background `var(--surface-subtle)`; left radius only (`var(--radius-md) 0 0 …`).
- Dropdown: `role="listbox"`, width 230px, `var(--surface-card)`, `--radius-lg`, `--shadow-lg`;
  live city row highlighted `var(--accent-tint)` + check; disabled cities show "Soon".

### Buy/Rent toggle — `data-design-component="buy-rent-toggle"`
- Two pill buttons, `padding 6px 13px`, 12.5px/600. Selected: `background var(--navy-800)`, `#fff`.
  Unselected: transparent, `var(--text-muted)`.

### Autocomplete — `data-design-component="area-autocomplete"`
- Input: flexible tail (`flex 1 1 210px`, min 150px), `min-height 42px`, leading search icon
  (accent when open), clear "×" chip when text present.
- Dropdown: `role="listbox"`, `--radius-lg`, `--shadow-lg`, max-height 340px; up to **6** results.
- Each option: 32px mode-tinted icon tile, area name 14px/700, "`region · city`" 12px muted, and a
  mode-specific action label ("Open area" / "View schools" / "Use as origin") + arrow.
- Highlighted option (keyboard/hover): `background var(--surface-subtle)`; `aria-selected`.
- Empty: "No area matches ‘…’" (+ " with schools" in Schools mode).

### Mode cards / selector — `data-design-component="mode-selector"` (grid of `role="tab"` cards)
- `role="tablist"`, `grid-template-columns repeat(3, 1fr)`, gap 8px.
- Card: `padding 10px 11px`, `--radius-lg`, `border 1.5px`. Selected: `1.5px solid <tint>` +
  `background <MODE_BG>` + **check badge** top-right (18px circle, tint bg, white check).
- Icon tile 28px `--radius-md` (tint bg + white icon when selected, else subtle bg + tint icon).
- Title 13.5px/700; "Rec" pill on Areas; sub-label 11px muted. Focus: `2px solid <tint>` outline.

### Metadata strip — `data-design-component="metadata-strip"`
- Row of capability cues on `MODE_BG[mode]`, `padding 7px 11px`, `--radius-md`; items 11.5px/600 with
  a 13px tinted icon, separated by 3px dots. Content changes per mode.

### Map action-marker system — Explore / Zoom in / View homes (`src/ExpMap.jsx`)

Three visually related but immediately distinguishable markers, all built on **one connected,
VERTICAL shell**: an identity section (rounded top) stacked directly above an attached, full-width
action footer (rounded bottom) — no gap between them — a single shared shadow/border/radius around
both, and one centred downward tail. The whole marker is one `role="button"` — never a detached
action pill, never a footer-only click target, never a horizontal split-capsule. Full spec + every
state: `marker-action-system.html`.

**The three constructions never rely on colour alone to differ:**

| Marker | Identity section | Action footer | Behaviour |
|---|---|---|---|
| **Explore** | solid navy `--navy-800`, white text, up to 2 representative names + live count + context pill | **solid** accent (copper/plum), white text/icon/chevron | Real Direction / Local Destination. Updates `node=`, breadcrumb, pans/fits children. |
| **Zoom in** | light tint (copper-100 / plum-tint), navy text, same content shape as Explore | white, accent-coloured text/icon/chevron | 2+ destinations temporarily combined because every marker can't fit. Only pans/zooms — never touches `node=` or breadcrumb. |
| **View homes / View schools** | white, navy text, thin border; pin/cap icon + area name, then the exact listing/school count as a **hero metric**, then the other count as a secondary line when known | **solid** navy or plum, white text/icon/chevron | One real AREA leaf. Opens listings/schools for that area directly — never a further zoom. |

Explore and View-homes are deliberately inverse constructions of each other (dark-body/solid-footer
vs white-body/solid-footer) so that even colour-blind users can tell "enters a hub" from "opens a
leaf" by which section is dark. Zoom in is the only marker with a light body **and** a light footer,
reading as the lowest-commitment action of the three. All three stack identity-over-footer — the
count for View homes/schools always lives in the identity section as a hero metric, **never** folded
into the footer's action label (the footer always reads exactly "View homes" / "View schools").

Implemented as one reusable shell function, `navMarkerHTML(actionKind, o)` (`actionKind: "explore" |
"zoom"`), consumed by three thin call-site wrappers — `destCardHTML` (real single destination),
`regionalClusterCardHTML` (local combined destination), `clusterChipHTML` (dense visual-area
cluster) — plus a separate `areaPinHTML` for the terminal AREA leaf (`data-action-kind="view-homes"`).
`areaPinHTML` is a distinct function only because its content shape differs (icon+name, then a hero
count, then an optional secondary count) — its outer geometry (vertical stack, shared shell, centred
tail, fixed width) matches `navMarkerHTML` exactly.

**Dimensions** — Explore / Zoom: width scales with inventory, `132–170px` (single real destination)
or `150–206px` (combined/cluster); `border-radius: var(--radius-lg)` (12px); footer
`padding: 7px 10px`; tail `6px/6px/7px` (l/r/top border-widths). View homes / View schools: **fixed
172px** width (same as the other two in `marker-action-system.html`), `border-radius: var(--radius-lg)`;
identity `padding: 10px 13px 9px`; footer `padding: 9px 13px`; tail `6px/6px/7px`. All: shell
`box-shadow: var(--shadow-md)` default / `var(--shadow-lg)` hover/selected; border `1.5px`.

**Typography** — identity name `12.5px/700` (Explore/Zoom) or `13.5px/800` (View homes/schools), all
three clamp to 2 lines; hero count `20–31px/800` mono for Explore/Zoom, `22px/800` mono for View
homes/schools; unit label `9.5px/700` uppercase, `.05em` tracking (View homes/schools: "LISTING(S)"
or "SCHOOL(S)"); secondary count line (View homes/schools only) `11px/600`, muted, plain text — no
pill; context pill (Explore/Zoom only) `10px/600`; footer label `11.5–12.5px/700`; chevron
`13–14px/700`.

**Colours (exact)** — navy `--navy-800 #1B2A45`; copper accent `--copper-500 #B05C3A` (footer/tail),
`--copper-600 #934B2D` (Zoom footer text), `--copper-100 #F2E8E1` (Zoom body tint / hover footer
tint); plum accent `--plum-600 #5E5286` (footer/tail/text), `--plum-tint #F1EDF7` (Zoom body tint /
hover footer tint). Explore border `rgba(27,42,69,.24)` (`.4` selected); Zoom border = solid accent
`1.5px`; View-homes border `rgba(27,42,69,.28)` (`.5` selected) / View-schools `rgba(94,82,134,.32)`.

**Icons** — Explore: compass (circle + solid needle wedge), always white-on-accent. Zoom in:
magnifier with a `+`, accent-on-white. View homes: the same location-pin glyph used elsewhere in the
product, navy-on-white in the identity section, plus a house glyph, white-on-navy, in the footer.
View schools: graduation cap, plum-on-white in the identity section and white-on-plum in the footer.

**Interaction states** (never colour-only — always paired with a lift, scale, or ring):
- **Hover**: `translateY(-2px)` + deeper shadow on the shell; footer darkens via
  `filter: brightness(1.1–1.15)` on solid footers (Explore, View homes/schools) or tints toward the
  body colour on white footers (Zoom in, `--copper-100` / `--plum-tint`).
- **Pressed** (`:active`): shell `scale(0.97)`, fast `80ms` transition.
- **Keyboard focus** (`:focus-visible`): `0 0 0 3px <accent>` ring + `var(--shadow-lg)` — accent is
  copper/plum for Explore & Zoom, navy/plum for View homes/schools. Outline suppressed on the raw
  element so only the shell ring shows.
- **Selected**: all three get a persistent `2px solid` outline in their own colour (Explore/Zoom:
  accent; View homes/schools: navy/plum) plus `shadow-lg` — never just a colour swap.
- **Zero-listing** (Explore/Zoom only): hides the hero count row and shows a pill reading "No matches
  with current filters" instead of a live number — geography never disappears when filters exclude
  it. Not applicable to View homes/schools: an area with zero matching listings is never surfaced as
  a leaf marker in the first place.
- **Zero schools** (View homes/schools): the secondary count line reads "0 schools" / "0 listings"
  explicitly whenever the server has confirmed the count is zero — the line is omitted only when the
  count is genuinely unknown, never to hide a zero.

**Content rules**
- Explore/Zoom show up to 2 representative names + a live count + a context pill ("N areas with
  matches" / "N destinations"). View homes/schools show **only** the area name, the hero count, and
  the secondary count (when known) — never "areas with matches", "destinations", or "+N nearby
  areas" on a single-AREA marker.
- Singular/plural nouns always resolve from the live count: "1 listing" / "126 listings",
  "1 school" / "9 schools", "1 LISTING" / "42 LISTINGS" (hero), "0 schools" (secondary, shown
  explicitly when known).
- Action copy is always exactly "Explore", "Zoom in", "View homes", or "View schools" — a fixed
  label per behaviour, never carrying the count and never reused across a different semantic (e.g.
  "Zoom in" never appears on a marker that changes `node=`; "View homes" never becomes "View 26
  homes").

**Areas vs Schools palette mapping** — the identity colour for Explore/Zoom stays navy regardless of
journey (a Direction/Local Destination is geography, not journey-specific); only the **accent**
role — the thing that carries the action — swaps `copper → plum` and the Zoom tint swaps
`copper-100 → plum-tint`. View homes/schools swaps its entire solid-footer role the same way
(`navy-800 → plum-600`), since that footer *is* the journey-specific action. No green is ever used
here — green stays reserved for Agricultural.

### One filter group per row

The filter toolbar is a stack of labelled **groups**, desktop-only layout: a fixed 96px
label column on the left, then the group's chips wrapping freely in the remaining width
(`EPGroup`). A group heading therefore always owns the chips beside it, and no heading is
ever pushed into another group's leftover horizontal space. Groups, in order:
`TYPE` (family + `Ready to move`/`Ready to occupy` + `Broker identity verified`),
`<FAMILY> TYPE`, then one group per attribute that applies — a hairline separates the
two blocks. Units live on the chips (`600+ sq ft`), so headings stay short
(`CARPET AREA`, `PLOT SIZE`, `BUILT-UP AREA`, `AREA`, `BUDGET`). Long headings
(`HOME CARPET AREA`) wrap inside the label column without changing row height.
On **mobile** (390px) the same groups are re-laid-out rather than compressed: the label
sits **on top of** its own chips (it can never scroll away from them or read as
belonging to the next group), chips **wrap** onto as many rows as they need at a
**44px** tap height, and nothing scrolls sideways. Because six full-height groups plus
results do not fit 390 × 844, the two decisions that change which inventory you are
looking at — `TYPE` and `<FAMILY> TYPE` — stay open, and the refinements
(`ONLY SHOW`, bedrooms/area, budget, reset) sit behind one **More filters**
disclosure carrying a count of how many are set. Collapsed is the default even with
refinements active: what is applied is already stated by the active-filter chips under
the result heading, so nothing is hidden. The mobile filter block rides at the top of
the scrolling results body — every group is reachable by the scroll a phone user
already makes, while the search, breadcrumb and List/Map stay pinned above it.
Contextual visibility is identical to desktop: plots show `PLOT SIZE` and never
bedrooms or carpet area.

### Commercial attribute filters, terminology and trust

Commercial carries **both** an area filter and a budget filter, each as its own labelled
filter group (`commercial-area-group`, `budget-group`). Both are independent of each other,
of the subtype selection and of the geographic scope; `Clear commercial types` touches
neither, and **`Reset commercial filters`** is the one action that drops subtypes, area,
budget and the broker-check chip together.

**Area** — one field (`comArea`), but the LABEL follows the selected subtype, because the
same number means a different thing per subtype:

| Selection | Label |
|-----------|-------|
| All Commercial · multiple subtypes · unknown subtype | `AREA (SQ FT)` |
| Shop · Office · Commercial Building | `BUILT-UP AREA (SQ FT)` |
| Warehouse / Godown | `WAREHOUSE AREA (SQ FT)` |
| Commercial Land | `PLOT SIZE (SQ FT)` |

Thresholds `Any size · 1,000+ · 2,500+ · 5,000+ sq ft` — illustrative.

**Budget** — own field (`comMaxPrice`), own ladder, own per-family memory, and it never
reuses purchase bands in a rental state:

- Buy: `Any price · ≤ ₹1 Cr · ≤ ₹2.5 Cr · ≤ ₹5 Cr`
- Rent / Lease: `Any rent · ≤ ₹50K / month · ≤ ₹1L / month · ≤ ₹2L / month` — the unit is
  spelled out, and the label reads `Monthly rent`.

**Rent / Lease.** Commercial stock carries `For Sale`, `For Rent` and `For Lease`. The
existing two-value intent model is unchanged; in Commercial the Rent option is *labelled*
`Rent / Lease`. **IMPLEMENTATION NOTE:** that label is presentation only — Lease must map
to the transaction value the record already carries and must never be inferred from other
fields. Cards, popovers and details always show the listing's own precise purpose.

**Card hierarchy** (at most two primary facts): price treatment → subtype → deal type →
title → coarsened location → area + one subtype fact → save and View details. Titles read
`Shop in Indiranagar`, `Commercial land in Hebbal` — the area appears in the fact row, so
the title never repeats it.

**Imagery** is per subtype: retail frontage, office floor, whole building, loading/storage,
and for Commercial Land a **cleared, kerbed development plot — never green farmland**,
which would read as Agricultural. No image implies zoning, ownership or approval status.

**Trust language states only what is actually checked.** The tiers render as
`Broker identity verified` / `Listing details reviewed` / `Broker-submitted listing`, each
with a plain-language note, and the detail carries a `trust-scope` block spelling out that
ownership, approvals, zoning and legal status are **not** checked. The filter chip reads
`Broker identity verified`, not “Verified only”. Signing in reveals the figures the broker
supplied — it never makes a listing more verified.

**Terminology.** Inside Commercial: *commercial property / properties*, *commercial
listing / listings*, *Ready to occupy*. Never *home*, *homes for sale/rent* or *Ready to
move*. Counts are singular-aware via `nounsOf().count(n)` — `1 commercial listing`,
`2 commercial listings`. Subtype labels keep their exact spacing: `Commercial Land`,
`Commercial Building`.

**Zero results keeps the buyer inside Commercial**, in this order: drop the subtype → show
all Commercial types → widen the budget → widen the area → `Show all Commercial in these
areas` (always available when anything is narrowed) → create an alert. Leaving Commercial
appears last, under its own `Or leave Commercial` heading. Nearby-area suggestions are
**not** offered in Commercial (they change the geography), nothing widens itself, and every
count shown is a real count of real fixtures. `Simulate a backend failure` has been removed
from the product frame.

### Context-sensitive attribute filters

Beneath family and subtype sits one attribute row, holding only refinements that apply to what is
selected. Each control keeps its **own field**, so no selection is ever reinterpreted as another:

| Selected state               | Attribute row                              | Fields |
|------------------------------|--------------------------------------------|--------|
| Residential — Apartment / Villa / House | `BEDS` + `CARPET AREA (SQ FT)` + `BUDGET` | `beds`, `carpetArea`, `maxPrice` |
| Residential — Plots           | `PLOT SIZE (SQ FT)` + `BUDGET` — **never bedrooms** | `plotArea`, `maxPrice` |
| Residential — All residential | `HOME BEDROOMS` + `HOME CARPET AREA` + `PLOT SIZE` + `BUDGET` | all, each scoped by label |
| Commercial — any subtype      | `BUDGET` — **never bedrooms**               | `comMaxPrice` |

- **One source for scoping.** `EXP.showsHomes(f)` and `EXP.showsPlots(f)` decide which controls apply,
  and the filter row, the selected-filter chips, `filterLabels` and the zero-result widenings all read
  those two predicates. `passes` keys off the per-listing kind, so any site that re-derived the test
  locally could report a narrower search than the one applied — which is exactly how plot size once
  became applied-but-unreported in the mixed state. Note plots are sale-only stock, so a Rent search
  never offers or reports plot size.
- **Area is available to every Residential subtype** — what changes is the unit, not
  its presence: `CARPET AREA (SQ FT)` for dwellings, `PLOT SIZE (SQ FT)` for plots.
  They are separate fields (`carpetArea`, `plotArea`) and never stand in for each other.
- **`PLOT SIZE (SQ FT)`** replaces `BEDS` in the same position, same chip style:
  `Any size` · `600+ sq ft` · `1,200+ sq ft` · `2,400+ sq ft`. Carpet area runs its own
  ladder (`600+` · `1,000+` · `1,500+ sq ft`) because the two measure different things.
  Both are illustrative thresholds, with `sq ft` visible on every non-default choice.
  Switching between plots and dwellings restores each selection exactly as it was.
- **No bedrooms for a plot, anywhere:** not in filters, selected-filter chips, cards, map peek,
  detail summary or mobile. A plot card reads land area and `Land`; the detail reads
  `N sq.ft plot · Land · Ready to register`. "0 BHK" can no longer appear.
- **`All residential` covers dwellings and plots together**, so the controls are labelled
  `HOME BEDROOMS`, `HOME CARPET AREA` and `PLOT SIZE`, and each filters **only its own inventory** — a
  bedroom or carpet-area selection no longer silently removes every plot from the results, which
  those labels would otherwise misstate.
- **Commercial keeps `BUDGET`** as its own labelled group, with its own ladder (illustrative, not from verified
  listings): Buy `Any price` · `≤ ₹1 Cr` · `≤ ₹2.5 Cr` · `≤ ₹5 Cr`; Rent `Any rent` · `≤ ₹75k/mo` ·
  `≤ ₹1.5L/mo` · `≤ ₹3L/mo`. The label switches between `Budget` and `Monthly rent` with Buy/Rent.
- **Commercial budget is independent** of Commercial subtype selection and of the Residential budget:
  it survives adding, removing and clearing subtype chips, and each family restores its own last
  budget on return. `Clear commercial types` never touches it; **`Reset commercial filters`** is the
  one explicit action that clears subtypes, budget and the verified chip together.
- Bedrooms are **never** offered under Commercial.

### Result language

Nouns follow the family and subtype — `EXP.nounsOf(filters)` is the single source, so no surface can
drift. Commercial never borrows a residential noun, and a plot is never called a home:

| State | Count noun | Heading | Deal phrasing |
|-------|-----------|---------|---------------|
| Residential dwelling | `listings` / `rentals` | `Properties in X` | `homes for sale` / `homes to rent` |
| Residential — Plots | `plots` | `Plots in X` | `plots for sale` |
| Commercial | `commercial listings` | `Commercial properties in X` | `commercial properties for sale` / `… to rent` |

The map cluster caption follows the same rule: `homes` → `plots` → `listings`.

### Property family and subtype — two separate concepts

The top-level `TYPE` control holds the **property family** and nothing else:

```
TYPE                 Residential | Commercial
RESIDENTIAL TYPE     All residential · Apartments · Villas · Plots        (single-select)
COMMERCIAL TYPE      All commercial · Shop · Office · Commercial Building
                     · Warehouse / Godown · Commercial Land               (multi-select)
```

- **A family is not a subtype.** `Residential` and `Commercial` are families; `Villas` and `Shop`
  are subtypes. The two never share a row, and no family ever appears in a subtype row.
- **Subtype state is scoped to its family** and lives in its own field — `filters.ptype` for
  Residential, `filters.comSubs` for Commercial. Because they are different fields, **each family's
  last selection is retained independently**: pick Villas, switch to Commercial, pick Shop + Office,
  switch back — Villas is exactly as you left it, and returning to Commercial restores Shop + Office.
  A Residential subtype is never reinterpreted as a Commercial one, or the reverse.
- **`All residential` and `All commercial` are family-local states** — no subtype narrowing inside
  that family. Clearing subtypes returns to the family-wide state; it never leaves the family.
- **Separate, unambiguous clear actions:** `Clear residential types` / `Clear commercial types`.
  Neither clears the family, the geography, the search query, the journey or unrelated filters.
- **Beds and budget are family-local** to Residential; Commercial has its own budget field and is
  never offered bedrooms. See *Context-sensitive attribute filters* above.
- **Changing family or subtype changes only** result membership, count, cards, markers, popovers and
  subtype-specific detail. It never touches journey, city, search input, canonical hierarchy,
  breadcrumb, selected areas or polygon, result-scope mode, map camera or bounds, List/Map mode,
  Buy/Rent, or unrelated filters.
- **Agricultural is a Discover journey, not a family.** So is Schools. Neither appears in `TYPE`, and
  no agricultural classification appears in a Residential or Commercial subtype row.

On mobile the family selector stays put at the top of the filter block with its subtype row directly
below; both scroll sideways rather than wrapping, so the first result stays above the fold and neither
row obscures the search input or the List/Map control.

### Commercial identity (a property family) — `data-design-component="property-family-row"` / `"residential-subtype-row"` / `"commercial-subtype-row"` / `"commercial-detail"` / `"commercial-summary"` / `"price-gate"` / `"broker-disclosure"` / `"contact-block"` (`src/exp-commercial.js`)

Commercial is **additive**: it adds records to the one catalogue and one option to the top-level
family control. It adds **no** journey, hierarchy, component, screen or map behaviour. Every
pre-Commercial count is unchanged — a Commercial record fails `passes` unless `filters.family` is
`Commercial`, and `EXP.residentialCount` (not `listings.length`) feeds the existing cues.

- **Buyer-facing labels (the only strings that render):** Shop · Office · Commercial Building ·
  Warehouse / Godown · Commercial Land. Missing, legacy or unrecognised subtype values render as
  **`Commercial`**. `Other`, raw enum values and inferred subtypes never appear.
- **Progressive disclosure:** exactly one subtype row is shown at a time, and it always belongs to the
  selected family. Choosing `Residential` restores the pre-Commercial experience — no Commercial
  control occupies space, no placeholder is reserved.
- **Identity colour:** `--gold-600 #8A6A22`, tint `--gold-100` — the one brand hue Discover had not
  claimed (Areas copper, Schools plum, Agricultural evergreen). **Subtype is carried by the label**,
  never by hue, so Shop and Office stay distinguishable in greyscale.
- **Marker:** the existing `pricePinHTML` leaf pin with one branch — Commercial carries the **subtype
  label instead of a price**, so nothing price-gated reaches the map. Footprint, tail, selected
  treatment, clustering, collision handling and camera behaviour are untouched; only the cluster
  caption reads “listings”.
- **Card:** the existing `listing-card`, three content slots swapped — price line → price treatment,
  type badge → subtype label, bed/bath/size row → **at most two** subtype facts (Shop: area + floor or
  hub · Office: area + floor or seats · Building: area + floors · Warehouse: area + clear height ·
  Land: area + frontage or zoning).
- **Price treatment** — exactly three: anonymous band (mono + `PRICE BAND` caps), anonymous gate
  (`price-gate`: lock glyph + “Sign in to view price”), authenticated exact figure. Location is
  coarsened when anonymous, street-level when signed in. Signing in reveals data; it never verifies.
- **Detail:** the existing detail view, made subtype-aware. Absent fields are omitted outright — never
  a placeholder, never a dash. Broker-entered claims (ownership, zoning, income, yield, occupancy,
  suitability) live only inside `broker-disclosure`, an `--ochre-50` block headed “Broker-provided
  information”. No guaranteed ROI, rent, footfall, verified approvals or verified ownership anywhere.
- **Deal types** Sale / Rent / Lease are per-listing labels; the Buy/Rent toggle is unchanged, and
  Lease listings surface under Rent.

Non-regression states are the **Preserved behaviour** scenarios in the review strip; the
**Before / after** band pairs the same scope with and without Commercial. The approved pre-Commercial
shell is preserved byte-for-byte in `experience-discover-v2-frozen.html`.

### Directional marker (map) — `data-design-component="directional-marker"` (`src/NDMap.jsx` `dirCard`)
- A region/cluster **card**, not a pin. Width scales with inventory: `130 + weight*40` → **130–170px**.
  `padding 9px 15px 10px`, `--radius-lg`, background navy (`--navy-800`/`--navy-900` selected;
  central uses `--navy-700`), border `rgba(255,255,255,0.42–0.95)`, `--shadow-lg`.
- Content: optional "Central" eyebrow (concentric-ring glyph), representative names 12.5px/700 white,
  **count as hero** in mono `22–31px/800`, unit label ("homes"/"schools"), and a `+N areas` pill when
  more members exist.
- Hover/selected: brighter border, `--shadow-lg`, `scale(1.06)`; a "Tap to explore ›" caption fades
  in below (accent-coloured). Selected marker also scales.
- Positioned by **compass bearing** around the map centre, not exact centroid (see §5 Map rules).

### Local-cluster marker — superseded, see §Map action-marker system
- A generated local-cluster node (`kind:"local"`) is a temporary grouping, so it renders as the
  **"Zoom in"** variant (light cream/lavender body, white footer) via `regionalClusterCardHTML` →
  `navMarkerHTML("zoom", …)` — not the dark `directional-marker` treatment (that treatment is now
  reserved for real single Direction destinations, i.e. "Explore"). Still positioned by bearing,
  still no separate one-line "cluster pill" (§7 rejected pattern).

### Area marker (map) — `data-design-component="area-marker"` (`areaPinHTML`) — superseded, see §Map action-marker system
- Leaf-level "View homes", one **connected vertical card** (`am-leaf am-leaf-home`), same family as
  Explore/Zoom — never a horizontal split-capsule: **white** identity section (location-pin icon +
  navy area name, clamped to 2 lines; exact listing count as a mono hero metric with a "LISTING(S)"
  unit label; the area's exact school count as a plain secondary line, or "0 schools" when the known
  count is zero, omitted only when genuinely unavailable) stacked above a **solid navy** action
  footer (house icon + "View homes" + chevron, all white — the count never appears in this label).
  Fixed **172px** width, `--radius-lg` shell, single shared border/shadow, centred downward navy
  tail. One `role="button"`; activating it opens listings for that area directly, **never** a
  further zoom.
- States: hover/selected lift `translateY(-2px)` + deeper shadow, the solid footer darkens via
  `filter: brightness(1.15)` on hover (never a light-tint swap, since the footer is already solid),
  `:active` scale-down, `focus-visible` 3px navy ring, `selected` adds a persistent 2px navy outline.
- Draft candidate areas render as a dashed label (`area-candidate-label`), never this card.

### School marker (map) — `data-design-component="school-marker"` (`schoolPinHTML`)
- Individual school point pin — separate pill+tail family (not the 3-marker system), plum-accented
  graduation-cap glyph. Selected `--plum-600` + white. Distinct from the schools-journey **area**
  marker below.

### Schools-journey area marker (map) — `data-design-component="area-marker"` (`areaPinHTML`, `schoolsMode`) — superseded, see §Map action-marker system
- "View schools" — same `am-leaf am-leaf-school` vertical construction as the homes leaf, plum-mapped:
  white identity section (graduation-cap icon + navy area name, clamped to 2 lines; exact school
  count as the mono hero metric; exact listing count as the secondary line, or "0 listings" when
  known-zero) stacked above a **solid plum** action footer ("View schools", white, + white chevron —
  never a count in the label). Fixed 172px width, same shell/shadow/tail as the homes leaf; hover
  darkens the solid footer via `brightness(1.15)`; `focus-visible` 3px plum ring; `selected` adds a
  persistent 2px plum outline.

### Panel navigation row (directional card) — `data-design-component="directional-card"` (`DirNavCard`)
- Single-line clickable row. `padding 12px 14px`, `--radius-lg`, `border 1px var(--border)`
  (→ `--border-strong` on emphasis), `--shadow-xs` (→ `--shadow-md` + `translateY(-1px)` on hover).
- 38px icon tile (navy-100 → navy-800 on hover), title 15.5px/700 (nowrap), count in mono 16px + unit,
  representative names line (up to 4, `+N areas`) clamped to 2 lines, chevron.
- **Whole row is `role="button"`** with `aria-label`; hover/focus sync to the marker;
  focus/`hover-from-map` outline `2px solid <accent>`.
- Area rows (`data-nd-area`) and school rows (`school-result`) and town rows (`town-row`) follow the
  same 60–82px single-line row grammar, tinted per mode.

### Breadcrumb — `data-design-component="breadcrumb"` (map overlay)
- Pill over map top-left: `padding 9px 14px`, `--radius-full`, `--paper`, `--shadow-md`, `--border`,
  13.5px/600. Segments joined by chevrons; last segment coloured (`--text-strong` at city level, else
  the mode crumb colour); overflow ellipsis, `max-width calc(100% - 36px)`.

### Property search — `data-design-component="property-search"` (`PropSearch`)
- Row: search input (leading icon, clear chip) + a `--navy-800` "Search" button. Placeholder scopes
  to the current area ("Search within <Area> properties…"). **Distinct from the global autocomplete.**

### Filter toolbar — `data-design-component="filter-toolbar"` (`ListingToolbar`)
- Compact chips, not a tall form: **Type** row (All/Apartments/Villas/Plots) + **Beds** row
  (Any/1/2/3+) + a right-aligned **"Verified only"** chip (evergreen when on).
- `FChip`: `padding 6px 12px`, `--radius-full`, 12.5px/600; on = accent bg + white.

### Schools shortcut — `data-design-component="school-shortcut"` (`SchoolsShortcut`)
- Full-width plum affordance on the **Areas** area-results page that switches to Schools mode while
  keeping the current area. `padding 10px 13px`, `--radius-md`, `background var(--plum-tint)`,
  `border 1px var(--plum-200)` (→ `--plum-500` on hover). 32px plum icon tile, title
  "Find homes near a school" 13.5px/700, sub "Explore schools in <area> — keeps this area", arrow.

### Listing card — `data-design-component="listing-card"` (`ListingCard`)
- `--surface-card`, `--radius-lg`, `--shadow-sm` (→ `--shadow-lg` + `translateY(-2px)` hover).
- Image 168px with trust badge (top-left), save heart (top-right), and either a distance chip
  (plum, school journey) or a "New" tag (bottom-left). Body: price mono 19px/600 + type badge, title
  14.5px/600, locality row, beds/baths/sqft row, full-width "View details" outline button.
- Grid: `repeat(2, minmax(0,1fr))`, gap 16px; single column `< 560px`.

### School controls — `data-design-component="school-filters"` (`SchoolFilters`) + `radius-selector` (`Radius`)
- School filters: name search + **Board** chips (CBSE/ICSE/State/International, only those present) +
  **Level** chips (Primary/Secondary/Higher Secondary), plum accent.
- Radius selector: three equal buttons **3 / 5 / 10 km**, each showing the live home count; selected
  `--plum-tint` + `--plum-500` border. A dashed plum radius circle is drawn on the map.

### School result — `data-design-component="school-result"` (`SchoolRow`)
- Single-line row, 36px plum icon tile, school name 14px/700 (ellipsis), board + levels meta,
  "View homes →" affordance; plum hover border + outline sync.

### Agricultural origin control — `data-design-component="agricultural-origin"`
- Inline evergreen bar: `target` icon + "Search origin: **<name>**" + a "Change"/"Use <city> centre"
  action. `background var(--evergreen-50)`, `border 1px var(--evergreen-100)`, `--radius-md`.

### Distance selector — `data-design-component="distance-selector"` (`DistanceChips`)
- Evergreen chips **Within 10 / Up to 25 / 50 / 100 km**, each with a live count; selected
  `--evergreen-600` + white + check. Caption: "Includes properties at closer distances too."

### Directional sector — `data-design-component="agricultural-sector"` (`drawSector` + legend)
- A translucent evergreen **wedge** from the origin toward the corridor's real bearing (`half` ≈ 33°),
  with a muted full-extent wedge (fill 0.04, dashed) and an **active wedge** to the selected distance
  (stroke `#1F7A5C` 1.6px @ .85, fill `#2E9B74` @ 0.12). Cumulative **distance arcs** at 10/25/50/100
  km; the active band is emphasised (2.2px), others dashed and faded. Small `N km` labels ride the
  wedge's leading edge. A legend card explains "Search sector — direction & distance from <origin>".
  **Non-interactive; a scope overlay, never a boundary.**

### Town row — `data-design-component="town-row"` (`TownRow`)
- Single-line evergreen row: 36px tile, town name + "· N km" (origin-relative distance), parcel count
  (mono) + acreage, blurb (ellipsis), chevron. Map counterpart = `town-marker` disc (44/52px gradient
  circle with count + name-count caption).

### Parcel card — `data-design-component="parcel-card"` (`ParcelCard`)
- Like the listing card but evergreen: image 150px with trust badge + acreage chip
  (`rgba(31,105,74,.92)`), price mono 18px + crop badge, title, a 2-col detail grid
  (distance · water · road · soil · survey), full-width "View parcel" button.

### Trust strip — `data-design-component="trust-strip"` (`TrustStrip`)
- Reassurance band below city-level region cards: `--trust-verified-bg` + `--evergreen-100` border,
  34px evergreen shield circle, "Every listing is verified…" copy 12.5px.

---

## 3. Density rules

The first screen must feel like a compact control surface, not a marketing page:

- **All five urban directions (N/E/S/W/Central) are visible in a laptop viewport** at the Areas city
  overview — as compass markers on the map and as rows in the panel — without scrolling the map.
- **All four agricultural directions are visible without unnecessary scrolling** at the Agricultural
  overview.
- **Results pages expose the first property or parcel row high in the viewport** — compact headers
  (21–24px serif), compact toolbars (chip rows), no hero band.
- **Compactness must not reduce readability or interaction target sizes** — control bar min-height
  44px; rows 60–82px; chips ≥ 30px tall; body text ≥ 11.5px, counts in mono for legibility.

---

## 4. Map rules

Document these map layers separately (all in `src/NDMap.jsx`):

- **Structured compass-style city/region markers** — `directional-marker` cards laid out by bearing
  around the map centre (North top, East right, South bottom, West left, Central middle). Card width
  encodes relative inventory. This is an *orientation canvas*, not exact pins.
- **Local-cluster markers** — the "Zoom in" variant of the action-marker system (§ above), generated
  per sub-group, still compass-positioned relative to the parent. Visually lighter than a real
  `directional-marker`/"Explore" card on purpose — it is a temporary grouping, not a hierarchy node.
- **Real positions** — area (`area-marker`), school (`school-marker`), town (`town-marker`),
  listing/parcel pins sit on **real coordinates**; the camera fits real bounds (`fitBounds` per view).
- **Agricultural sector colours & opacity** — wedge stroke `#1F7A5C`; active fill `#2E9B74` @ 0.12;
  muted context wedge fill @ 0.04 (dashed); arcs `#1F7A5C` with active 0.9 / inactive 0.22–0.4.
- **Distance arcs** — cumulative bands at 10/25/50/100 km; the active band is the heaviest stroke.
- **Origin marker** — evergreen `#154834` concentric-ring pin labelled "Origin · <name>",
  non-interactive.
- **Marker / panel linked states** — hover, focus and selection toggle the `.nd-nav-on` class and
  z-index on the matching marker; the class is toggled (never the marker recreated) so sync is smooth.
- **Basemap** — CARTO Voyager raster tiles; nav levels fade/desaturate the tile pane
  (`.nd-navmode`) so the markers read as the primary layer.

---

## 5. Visual anti-patterns (avoid)

- **Copying production colours** — use the ReTrends tokens above, not the current app's palette.
- **Oversized landing-page heroes on results screens** — results are compact workspaces.
- **Repeated City or Buy/Rent controls** — they live once, in the control bar.
- **Narrow one-line city-cluster pills** — clusters use the full directional card treatment, not a
  thin pill.
- **Invented corridor names** — always use representative real area/town names.
- **Excessive white space** — keep the compact density described in §3.
- **Excessive card footer rows** — nav cards are single-line; result cards have one action.
- **Selection represented only by colour** — always pair colour with a shape/check/scale change.
- **Map overlays that obscure geographic context** — the sector and tints stay translucent; the
  basemap must remain readable.
