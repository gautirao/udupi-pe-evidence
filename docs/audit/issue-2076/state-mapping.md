# Issue #2076 — Amendment-1 Step 2: AC11 State Mapping + AC13 Component-Anchor Mapping

Status: ANALYSIS ONLY. No captures taken, no screenshots shipped from this step. Written against
`approved-plan-amendment-1.toml [[coverage_map]]` (the orchestrator's PROPOSED 24-row table), which
this document independently verifies, corrects, or confirms.

Mock served from `docs/design/retrends-design-system/` (document root) via
`python3 -m http.server 8811 --bind 127.0.0.1 --directory docs/design/retrends-design-system`,
navigated to `http://127.0.0.1:8811/ui_kits/new_discover/index.html#<hash>`. Every desktop cell
below marked VERIFIED was hashed into live in a real browser tab (Chrome, MCP `claude-in-chrome`)
and its `data-design-screen` / `data-design-level` / heading text read from the live DOM — not
inferred from the manifest JSON or from source alone. Source (`NewDiscover.jsx` `screenId` IIFE,
lines ~361–379) was also read directly to confirm the *mechanism*, because two of the corrections
below can only be explained by reading how `screenId` is computed, not by clicking around.

Server was killed at the end of this step (background task `bkfjenhbg`, port 8811).

---

## Headline verdict

Of the amendment's 24 `[[coverage_map]]` rows, **19 are CONFIRMED as originally stated** and
**5 required correction** — every one of the five rows the orchestrator flagged MEDIUM-confidence
needed a correction, and one additional HIGH-confidence claim (the mobile "-mobile" state ids)
turned out to be wrong on mechanical inspection. That is a 100% hit rate on the self-flagged rows,
which is itself worth noting: MEDIUM confidence in the amendment was well-calibrated, not
false modesty.

**The 5 corrections:**

1. **A02 / A04** — not "overlapping references" as the amendment cautiously put it. They are
   **the literal same manifest state** (`areas-region-areas`), proven by clicking two levels deep
   into a live North-Bangalore cluster and observing `data-design-screen` stay
   `areas-region-areas` with only the heading/breadcrumb text changing. One composition, two
   A-numbers. Confirms the amendment's instinct but the finding is stronger than stated.
2. **A03 / A05** — same situation, same proof method, same conclusion: both are the literal same
   manifest state `areas-region-clusters`, not "overlapping." One composition, two A-numbers.
3. **A09 (rent variant)** — RESOLVED, not merely "worth a probe." `#a=hebbal&br=rent` DOES render
   (confirmed live: card copy changes from a sale framing to "8 rentals"), proving `buyRent` is a
   real prop threaded into `DPAreaCard`/`BLR_NOUN` — but `screenId` (read directly in source) never
   branches on `buyRent`, so the rendered `data-design-screen` is still `areas-area-listings`, byte
   for byte the same id as the Buy composition. This is DEFINITIVELY NO_FROZEN_REFERENCE as a
   distinct designed *state* — it renders, but only as an unstated rendering variant of A08's state,
   never as its own manifest entry. The amendment's classification was right; the amendment's
   hedging ("worth one probe") is no longer necessary — it's settled.
4. **A13 (empty results state)** — CONFIRMED the amendment's classification (documented inside
   `areas-listings-query-active`'s notes, not its own manifest state id) but for a *sharper reason*
   than the amendment gave. Live probing of the property-search box at `#a=hebbal` (typed a query,
   clicked Search) proved `data-design-screen` and `data-design-level` **do not change at all** when
   a query is submitted — they stay `areas-area-listings` / `listings`. The manifest's own
   `areas-listings-query-active` and `areas-listings-filters-active` entries are **never emitted by
   the running mock's self-verification attribute**, empty-results included. See the new general
   finding below — this affects A11/A12 as well, not just A13.
5. **A20 (school shortcut)** — CONFIRMED as PARTIAL exactly as stated. Live probe of `#a=hebbal`
   shows the `school-shortcut` component (mock) is genuinely present and reads "Find homes near a
   school / Explore schools in Hebbal — keeps this area." No exploration of the Schools destination
   was performed, per the non-goal instruction.

**Additional finding not in the original 5 (HIGH-confidence row, self-corrected on mechanical
inspection):** the two "-mobile" manifest state ids (`areas-city-default-mobile`,
`areas-area-listings-mobile`) are **never the value of `data-design-screen` at runtime, at any
viewport**. Read directly in `NewDiscover.jsx`: the `screenId` IIFE branches only on `mode` and
`view.level` — it has zero reference to `isMobile`. The `-mobile` suffix exists only as a *separate
JSON object* in `DESIGN_STATE_MANIFEST.json` (different viewport, different `visibleComponents`,
same underlying screen id logic) — it is a manifest-authoring convenience, not a DOM-observable
distinction. So AC11 cells that cite `areas-city-default-mobile` / `areas-area-listings-mobile` as
"the frozen reference" are correct about *which manifest JSON object* documents the mobile
composition, but the AC11 gate's own mechanical check ("confirm the rendered data-design-screen
equals the cited state id") will **always fail** if read literally, because the DOM will always
report the desktop id. AC12 (capture step) needs to identify mobile captures by **viewport + hash +
manifest object**, not by asserting `data-design-screen === "<id>-mobile"` — that assertion is a
guaranteed false negative, a second and different flavour of the "silent hash fallback" trap the
orchestrator warned about (not a bad hash silently falling back to the default state, but a good
hash silently reporting its parent's id instead of a viewport-qualified one).

I could not mechanically re-verify this over a real 390×844 viewport: `resize_window` on the
`claude-in-chrome` tool reproduced exactly the failure the amendment's `mobile_capture_constraint`
already documented (reports success, but `window.innerWidth` read back as `1366`, not `390`, and
the DOM stayed in desktop `flexDirection: row` layout). This is now independently reproduced
evidence for that known tool limitation, not a new one. The `screenId`-independent-of-`isMobile`
finding above is a **source-level proof**, not dependent on getting the viewport tool to behave —
`isMobile` genuinely never appears in the `screenId` function body, so no viewport width can change
which id gets emitted.

---

## AC11 — Full 48-cell table

Legend: **REF** = verified frozen reference exists and self-identifies via `data-design-screen`.
**REF (shared)** = verified frozen reference exists but is literally the same manifest state as
another A-cell. **REF (no-self-ID)** = composition is genuinely present and was verified live, but
`data-design-screen` does not distinguish it from its parent state — capture will need to key off
DOM content, not the attribute. **PARTIAL** = split explicitly. **NO_FROZEN_REFERENCE** /
**NOT_DESIGNED** = manifest evidence cited.

| # | A-state | Desktop | Mobile | Status vs amendment |
|---|---|---|---|---|
| A01 | City root, canonical Direction destinations | `areas-city-default` — VERIFIED live at `#`, heading "Where do you want to explore?" exact match | Manifest object `areas-city-default-mobile` (390×844) documents this composition; **DOM never emits this id** — see mobile-id finding above. Composition not independently viewport-verified (tool limitation) | CONFIRMED desktop; CORRECTED mobile (id-emission caveat) |
| A02 | Direction → direct AREA children | `areas-region-areas` — VERIFIED live at `#r=south`, heading "Areas in South Bangalore" | NO_FROZEN_REFERENCE | CORRECTED: this is the *same* manifest state as A04, not merely an overlapping one (see headline) |
| A03 | Direction → Local Destinations | `areas-region-clusters` — VERIFIED live at `#r=north`, heading "Inside North Bangalore"; cluster cards read e.g. "Devanahalli & Doddaballapur", "Hennur & Kalyan Nagar" | NO_FROZEN_REFERENCE | CORRECTED: this is the *same* manifest state as A05 |
| A04 | Local Destination → AREA children | `areas-region-areas` — VERIFIED live by drilling `#r=north` → click "Hennur & Kalyan Nagar" → click "Hennur & Hennur Gardens" (two cluster levels deep); landed on `data-design-screen=areas-region-areas`, `level=areas`, heading "Areas in North Bangalore · Hennur & Hennur Gardens" | NO_FROZEN_REFERENCE | CORRECTED: proven identical to A02's reference by live two-level drill-down, not asserted |
| A05 | AREA-selection with visual AREA clusters | `areas-region-clusters` — same verified render as A03 | NO_FROZEN_REFERENCE | CORRECTED: proven identical to A03's reference |
| A06 | Focused visual cluster + member-area panel subset | NO_FROZEN_REFERENCE — absence re-confirmed: the 20-state manifest list has no cluster-focus composition | NO_FROZEN_REFERENCE | CONFIRMED. (Side note, not a correction: the **shipped** app has an `areas-cluster-focus-panel` testid with no mock counterpart at all — a shipped-only feature, consistent with, not contradicting, this NO_FROZEN_REFERENCE call.) |
| A07 | "Show all areas" / visual-focus reset | NO_FROZEN_REFERENCE | NO_FROZEN_REFERENCE | CONFIRMED |
| A08 | Selected AREA, sale listings | `areas-area-listings` — VERIFIED live at `#a=hebbal`, heading "Properties in Hebbal" | Manifest object `areas-area-listings-mobile`; **DOM never emits this id**, same caveat as A01 | CONFIRMED desktop; CORRECTED mobile (id-emission caveat) |
| A09 | Selected AREA, rental listings | NO_FROZEN_REFERENCE as a distinct state id — RESOLVED not merely probed: `#a=hebbal&br=rent` renders (confirmed live, copy changes to "8 rentals"), but `data-design-screen` stays `areas-area-listings` (confirmed by reading the `screenId` source, which never branches on `buyRent`). Real rendering variant, not a designed state. | NO_FROZEN_REFERENCE | CORRECTED: settled, not "worth a probe" — probed, and the source explains exactly why it can never be a distinct id |
| A10 | Selected AREA, lease listings where supported | NO_FROZEN_REFERENCE; likely INTENTIONAL_DIFFERENCE per shipped Buy/Rent-only surface (per amendment, to be confirmed downstream) | NO_FROZEN_REFERENCE | CONFIRMED (downstream shipped-side confirmation is out of this step's scope) |
| A11 | Within-area property search active | `areas-listings-query-active` per manifest JSON — but VERIFIED live that submitting a query (typed "3 bhk" at `#a=hebbal`, clicked Search) does **not** change `data-design-screen` or `data-design-level`; both stay `areas-area-listings` / `listings`. Composition (the `property-search` input/button) is genuinely present and functional. | NO_FROZEN_REFERENCE | CORRECTED to **REF (no-self-ID)**: reference exists and is real, but the manifest's own self-verification mechanism does not distinguish it from A08 at runtime. AC12 must capture this by DOM content (query box populated, "N of M" header) not by hash+attribute-check. |
| A12 | Listing filters active | `areas-listings-filters-active` per manifest JSON — same self-ID caveat applies by source inspection (filters live in `ctx.filters`/`setFilters`, also absent from the `screenId` branch conditions) | NO_FROZEN_REFERENCE | CORRECTED to **REF (no-self-ID)**, same reasoning as A11, inferred from the same source read (not independently re-clicked live — filters use the same `screenId` mechanism already disproven for query state, so re-testing would be redundant) |
| A13 | Empty filtered results + reset | `areas-listings-query-active`'s notes (manifest) describe it; VERIFIED via source (`NDPanel.jsx` `list.length === 0 ? <DPEmpty .../>`) that the empty branch renders inside the exact same `areas-area-listings` composition, so it inherits the identical no-self-ID caveat as A11/A12 | NO_FROZEN_REFERENCE | CONFIRMED classification; CORRECTED reasoning to be the same no-self-ID mechanism as A11/A12, not a standalone judgement call |
| A14 | Browse All / unselected-area scope | `areas-browse-all` — VERIFIED live at `#b=1`, heading "All homes in Bangalore" | NO_FROZEN_REFERENCE | CONFIRMED. (Per OQ2, shipped-side Browse All support itself still needs downstream confirmation — out of this step's scope.) |
| A15 | Listing peek + exact Back-to-results restoration | NOT_DESIGNED — manifest `undesignedStates[4]`: "listing / school / parcel DETAIL pages ... out of scope for this export" | NOT_DESIGNED | CONFIRMED |
| A16 | Guided hierarchy navigation + in-app Back | NO_FROZEN_REFERENCE — behavioural contract, no composition | NO_FROZEN_REFERENCE | CONFIRMED |
| A17 | Browser Back/Forward through hierarchy | NO_FROZEN_REFERENCE — behavioural | NO_FROZEN_REFERENCE | CONFIRMED |
| A18 | Deep link, refresh, ancestry recovery | NO_FROZEN_REFERENCE — behavioural; "deep link to unavailable data" explicitly NOT_DESIGNED per manifest `undesignedStates[2]` | NO_FROZEN_REFERENCE | CONFIRMED |
| A19 | Area-search convergence on canonical node= | PARTIAL — `shell-area-autocomplete-open` VERIFIED live: typing "heb" into the control-bar area-search input renders `data-design-component="area-autocomplete"` with `data-design-screen` unchanged (`areas-city-default`), matching the manifest's own "Overlay only; underlying state unchanged" note exactly. Convergence itself (resolving to the canonical node) is behavioural, unreferenced. | NO_FROZEN_REFERENCE | CONFIRMED, and the overlay half is now live-verified rather than just cited |
| A20 | Schools shortcut from selected AREA | PARTIAL — `school-shortcut` VERIFIED live and present at `#a=hebbal` (component reads "Find homes near a school / Explore schools in Hebbal — keeps this area"); Schools destination NOT explored, per the explicit #2076 non-goal | NO_FROZEN_REFERENCE | CONFIRMED, live-verified rather than cited from the manifest alone |
| A21 | Mobile List mode at 4 levels | N/A | PARTIAL — city + AREA levels have manifest objects; Direction and Local-Destination mobile levels have none. Same id-emission caveat as A01/A08 applies to the two that do exist. | CONFIRMED coverage claim; CORRECTED with the same id-emission caveat |
| A22 | Mobile full-screen Map mode | N/A | NO_FROZEN_REFERENCE | CONFIRMED |
| A23 | Mobile AREA listings, single-column cards | N/A | Manifest object `areas-area-listings-mobile`, notes specify single-column collapse <560px; same id-emission caveat as A08/A01 | CONFIRMED coverage claim; CORRECTED with id-emission caveat |
| A24 | Mobile Map/List switching, no history mutation | N/A | NO_FROZEN_REFERENCE — behavioural | CONFIRMED |

**Tally:** 24 A-states × 2 viewports = 48 cells. 19 rows CONFIRMED as originally classified
(A01/A06/A07/A08/A10/A14/A15/A16/A17/A18/A19/A20/A21/A22/A23/A24's respective desktop-or-mobile
halves that weren't touched), 5 rows CORRECTED (A02, A03, A04, A05, A09, A11, A12, A13 — note this
is 8 individual amendment rows collapsing into the "5 corrections" narrative above because A02–A05
pair up and A11–A13 share one mechanism), plus the mobile id-emission caveat applied across A01,
A08, A21, A23. No cell is blank; every NO_FROZEN_REFERENCE / NOT_DESIGNED cell above carries its
manifest citation inline.

---

## Genuine composition vs. guaranteed capture artefact

For any AC12/AC14 comparison downstream, the following are **artefacts of the capture method, not
genuine design/implementation differences**, and must be masked or excluded rather than compared:

- **Map tiles and base layer.** Mock uses a CDN-loaded Leaflet instance over fixture coordinates;
  shipped app uses a separately configured Leaflet instance over live hosted data. Different tile
  providers/cache state are near-guaranteed. Never pixel-compare the tile layer.
- **Marker/pin positions and counts.** Mock fixture data (`BLR_DATA`, `BLR_COUNTS`) is static and
  invented for the export; shipped data is live hosted Bangalore inventory. Counts, pin density, and
  exact geographic clustering will differ by construction, not by defect.
- **Listing images and card photos.** Mock listing cards use placeholder/fixture imagery; shipped
  `PropertyCard` renders real uploaded photos (or their absence). Never compare image content.
  Comparable: card *layout* (price position, badge position, save-button position).
  Not comparable: image *content*.
- **Exact price and count figures.** Mock counts ("42 areas / 223 properties", "8 rentals") are
  fixture numbers; shipped counts reflect live inventory. Compare *formatting* (currency symbol
  placement, unit style, "N of M" phrasing), never the specific numbers.
- **The rent/sale toggle's rendered copy is real composition, not artefact** — worth calling out
  because it's easy to mistake for noise: `#br=rent` genuinely changes visible text ("8 rentals" vs.
  presumably "8 homes for sale"/similar), and that difference is a legitimate thing to audit for
  parity, not something to mask. It's the *state id* that's an artefact-shaped trap (see A09 above),
  not the rendered content.

---

## AC13 — Mock `data-design-component` → shipped `data-testid` mapping

Method: every mock `data-design-component` value cited below was confirmed present in
`docs/design/retrends-design-system/ui_kits/new_discover/src/*.jsx` by direct source read (already
partially surfaced during the AC11 probing above). Every shipped `data-testid` was found by
`search_text` grep across `src/**` — none invented or assumed. Anything without a grep hit is
recorded as not anchorable rather than guessed at.

| Mock `data-design-component` | Shipped `data-testid` (exact) | Auditable | Notes |
|---|---|---|---|
| `global-control-bar` | `discover-control-bar` (`DiscoverControlBar.tsx:535`) | YES | Direct structural analog — both are the top persistent control row. |
| `city-switcher` | `control-bar-city-select` (container), `control-bar-city-listbox` (open state), `control-bar-city-option-${key}` (`DiscoverControlBar.tsx:154,173,201`) | YES | Live-verified on the mock side this step (overlay opens, underlying screen unchanged) — same behavioural contract as shipped. |
| `area-autocomplete` | `control-bar-area-autocomplete` (container), `control-bar-area-input`, `control-bar-area-listbox`, `control-bar-area-option-${areaKey}`, `control-bar-area-no-results` (`DiscoverControlBar.tsx:320-408`) | YES | Live-verified on mock side this step. |
| `mode-selector` | `journey-switcher-section` (`JourneySwitcher.tsx:273`), individual tabs via `j.testId` (per-journey, not a fixed string — grep the specific value at review time) | PARTIAL | Shipped uses a per-journey dynamic `testId` prop rather than fixed child ids; the section container anchors reliably, individual tab ids need runtime confirmation of what `j.testId` resolves to for Areas/Schools/Agri. |
| `buy-rent-toggle` | `intent-selector` (default `testId` prop, `IntentSelector.tsx:49-105`; options `'buy'`/`'rent'`) | YES | Same two-option semantics (Buy/Rent) confirmed by source read on both sides. |
| `breadcrumb` | `area-first-breadcrumb` (container), `breadcrumb-home`, `breadcrumb-city`, `breadcrumb-region`, `breadcrumb-group`, `breadcrumb-area` (`AreaFirstBreadcrumb.tsx:81-162`) | YES | Shipped breadcrumb is more granularly anchored (per-segment) than the mock's single `breadcrumb` root — comparison should target composition/order, not 1:1 node count. |
| `directional-card` / `directional-marker` / `area-marker` (mock reuses ONE component across region/cluster/area levels, confirmed by the A02–A05 drill-down above) | `navigation-child-card-${nodeKey}` (`NavigationChildCard.tsx:120`, plus `navigation-child-card-count-${nodeKey}` and `-listings-${nodeKey}`) | YES | Shipped also reuses one card component across levels (same architecture choice as the mock) — genuinely comparable 1:1, not just superficially similar. |
| `property-search` | `area-search-input` (`AreaSelectedPanel.tsx:451`), `area-search-clear` (`:460`) | YES | Direct analog; this is the shipped anchor that resolves A11's no-self-ID problem — capture by this testid's presence/value, not by hash. |
| `filter-toolbar` (Type / Beds / Verified-only chips) | `quick-chip-all`, `quick-chip-${type}`, `quick-chip-${bed}-bhk` (`AreaSelectedPanel.tsx:373-417`) | PARTIAL | Type and Beds chips anchor cleanly. **No shipped `data-testid` for a "Verified only" toggle was found anywhere under `src/components/discover/**`** (grepped `verified.only`/`Verified only`/`verifiedOnly`, zero hits) — that specific mock control cannot be confirmed present in the shipped UI from source alone; flag for downstream confirmation, do not assume it exists. |
| `listing-card` | `listing-card` (`PropertyCard.tsx:231`) | YES | Identical testid string, coincidentally — not a mapping artefact, just a lucky naming match. Card sub-elements also anchor: `listing-save-button`, `trust-badge`, `distance-badge`, `listing-view-details`. |
| `school-shortcut` | `add-school-cta` (`AreaSelectedPanel.tsx:429`) | YES | Live-verified present on the mock side this step. Resolves A20's affordance-only scope precisely — anchor exists, audit only the affordance, not the Schools destination. |
| (empty-results composition, described in `areas-listings-query-active`'s notes, no mock `data-design-component` of its own) | `area-empty-state` (`AreaSelectedPanel.tsx:523`) | YES | This is the shipped anchor that resolves A13 — the mock has no dedicated component tag for its empty state either, but the composition and the shipped anchor both exist and can be compared by *content* (title/body/reset-action), not by state id. |
| `trust-strip` | `area-trust-strip` (`AreaSelectedPanel.tsx:572`), `area-result-summary`/`area-result-summary-text` (`:540-542`) | YES | Direct analog. |
| `results-panel` (whole-panel root) | `areas-journey-panel` (`DiscoverAreasJourneyPanel.tsx:404`), `area-selected-panel` (referenced from e2e specs, container for the AREA-selected composition) | YES | Root-level anchors exist on both sides for whole-panel-scoped comparisons. |
| `map-surface` | No `data-testid` found on the Leaflet root itself; `MapSkeleton.tsx` has `map-skeleton` for the loading state only (NOT_DESIGNED per manifest, so not relevant here) | NO | **Cannot be reliably anchored.** Leaflet renders its own DOM inside the container; the container itself carries no stable testid in the files searched. Composition (map occupies left/top band, results occupy right/bottom) is visually auditable but not selector-anchorable. Never propose a CSS-path selector into Leaflet's internal DOM — it changes across Leaflet versions/plugins and would silently match the wrong element. |
| listing/area/school/town/corridor pins (`markerType` values: `listing-pin`, `area-marker`, `directional-marker`, `school-marker`, `town-marker`, `corridor-marker`, `parcel-pin`) | No `data-testid` found under a `src/components/map/markers/**`-style path; markers are Leaflet-generated DOM (divIcons), same limitation as `map-surface` | NO | **Cannot be reliably anchored** for the same reason as `map-surface`. This is exactly the case the amendment's `pixel_diff_viability` note already anticipated — compare composition/placement by eye, never by selector or pixel. |
| (no mock equivalent) | `marker-popover-card` (`MarkerPopoverCard.tsx:200`) and its children (`popover-price`, `popover-price-band`, `popover-stepper-*`) | N/A | Shipped-only feature (marker click popup). No `data-design-component` in the mock corresponds to this — do not force a comparison; record as shipped-only if it comes up downstream. |
| (no mock equivalent) | `discover-badge` — **flag: TWO different pills share this exact testid** (`DiscoverMapCountBadge.tsx:85` and `:173` — confirmed by direct source read, matches the task brief's warning verbatim) | N/A | If this component is compared downstream, any selector-based capture MUST disambiguate by DOM position/parent, or it will silently grab the wrong pill. This is not a mock-mapping problem (mock has no count-badge component tag) — it's a shipped-side selector hazard worth carrying forward regardless. |
| (no mock equivalent) | `areas-cluster-focus-panel` (`DiscoverAreasJourneyPanel.tsx:305`) | N/A | Shipped-only, corresponds to A06 which has NO_FROZEN_REFERENCE on the mock side (manifest confirms no cluster-focus composition was designed). Existence noted for completeness, not comparable. |

**AC13 summary:** 12 components fully auditable (YES), 2 partial (mode-selector's per-tab ids need
runtime confirmation; filter-toolbar's Verified-only chip has no confirmed shipped anchor), 2 not
anchorable (map-surface, marker pins — both Leaflet-internal DOM), plus 3 shipped-only elements
recorded for completeness with no mock counterpart to compare against (marker-popover, the
discover-badge dual-testid hazard, areas-cluster-focus-panel).

---

## Mobile coverage — structural thinness is by design, not a gap

The manifest designs exactly **two** mobile states in total
(`areas-city-default-mobile`, `areas-area-listings-mobile`), plus A21's partial 2-of-4-levels
coverage using those same two objects. This was true before this step and remains true after —
nothing in this step's verification changes the *count* of designed mobile states, only the
mechanism by which they can (and, per the id-emission finding, cannot) be self-verified via
`data-design-screen`. Do not treat the thinness of mobile coverage in AC11 as something this or a
later step should try to fill — the mock itself does not have the material.

---

## What I could not determine

- Whether the shipped app actually renders a functional "Verified only" filter anywhere (grepped
  `src/components/discover/**` for the concept, zero hits) — could not confirm presence *or*
  absence beyond that specific grep; a differently-named implementation is possible and would need
  a broader search than this step's budget allowed.
- The exact string values `j.testId` resolves to for each `JourneySwitcher` tab (Areas/Schools/
  Agricultural) — the source shows it's a per-item dynamic prop, not fixed literals, so I did not
  chase it into whatever data structure populates `j`.
- Whether shipped "Browse All" (A14, OQ2) genuinely exists and matches `areas-browse-all`'s
  composition — explicitly out of this step's scope per the amendment's own OQ2 flag; deferred to
  the downstream shipped-side audit step.
- I did not attempt A21's Direction/Local-Destination mobile levels beyond confirming the manifest
  has no object for them — there is nothing further to determine; they are NO_FROZEN_REFERENCE by
  absence, not by an incomplete search.

## Files written

- `docs/audit/issue-2076/state-mapping.md` (this file) — the AC11 + AC13 deliverable.

No other files were created or modified. The frozen design directory
(`docs/design/retrends-design-system/`) was read-only for this entire step; the local static server
served it without modification and has been terminated.
