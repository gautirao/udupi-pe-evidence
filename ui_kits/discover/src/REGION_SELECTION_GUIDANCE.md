# Region selection guidance — Discover map ↔ panel alignment

**Issue:** #1808 — `bug(discover): align region map clicks with right-panel journey level`
**Type:** UX design pass (design only — no production code, no backend/data/taxonomy changes)
**Design surface:** ReTrends Discover portal (`ui_kits/discover` prototype)
**Prototype of record:** `ui_kits/discover/index.html` — region-overview guidance is wired into the `region-hotspots` layer only, gated so no other state regresses.

> Repo mapping: in the ReTrends monorepo this file lives at
> `docs/design/retrends-design-system/ui_kits/discover/src/REGION_SELECTION_GUIDANCE.md`
> and the screenshots at `docs/design/retrends-design-system/ui_kits/discover/screenshots/`.
> In this design-system project they live at `ui_kits/discover/src/` and `ui_kits/discover/screenshots/`.

---

## 1. Problem statement

The agreed product model for a macro-region click is **select, don't enter**:

| State key | After a region click |
|---|---|
| `scope` | `east` |
| `journey` | `null` |
| `groupId` | `null` |
| `areaKey` / `areaId` | `null` |
| `schoolId` | `null` |

Clicking **East Bangalore** on the map should scope to East and show a **region overview / top-area preview** — it must **not** auto-enter the area journey. The panel immediately follows and shows the East region overview, where the user chooses *how* to continue (by area, near a school, all listings, or the separate agri journey).

The UX risk: a user looking at the **left** (map) may not realise the next action is on the **right** (panel). After clicking East they see only a handful of top-area markers and may conclude **the map is broken or incomplete** — when in fact it is deliberately showing a curated preview and the real choice lives in the panel.

We need **map-side guidance** and **panel attention** that make the hand-off obvious, work for every region, never look like an error, and disappear once the user has moved deeper.

In this prototype the region-overview state is the **`region-hotspots`** layer (scope set, `journey === null`). The area journey (`journey = "area"`, `groupId = null`) is the **`area-groups`** layer — group/corridor pills on both map and panel.

---

## 2. Final recommended UX

Four coordinated, low-weight elements — all copper-accented so the map and panel read as one system:

1. **Map guidance card** (`region-hotspots` only) — a small paper card, top-right on desktop / top-of-map on mobile. States the selected region, that the map is a *top-areas preview*, and points the user to the panel with a directional arrow. Dismissible, never blocks the map centre.
2. **Region-aware map legend** — the vague `Top areas` becomes **"{Region} overview"** with a second line **"Top areas only · not all areas"**, so the preview is never mistaken for the full area list.
3. **Panel attention highlight** — a one-shot copper ring pulse around the *"Continue in {Region}"* journey-card group, plus a mirrored `aria-live` helper line. Fires only after a **map/panel** region pick, never on deep-link load or page refresh; respects `prefers-reduced-motion`; never steals focus.
4. **Map→panel transition cue** — the directional arrow on the map card (**→** desktop, **↓** mobile) + the shared copper accent (map card right-border ↔ panel ring) + the panel helper mirroring the map message. See §6 for why this beats a drawn connector.

### Screenshots
| # | File | Shows |
|---|---|---|
| 1 | `rg-01-city-landing.png` | City landing before selection — region bubbles + journey CTAs |
| 2 | `rg-02-east-map-click.png` | East selected after map click (desktop) — map fit to East, top-area pin, guidance card, legend |
| 3 | `rg-03-map-card-closeup.png` | Map guidance card close-up |
| 4 | `rg-04-panel-highlight.png` | Right-panel journey-card highlight (copper ring + helper line) |
| 5 | `rg-05-east-area-journey.png` | East + area journey after "Search by area" — guidance gone, map & panel at the same group level |
| 6 | `rg-06-mobile-east-guidance.png` | Mobile East selected — guidance card points **down** to the sheet |
| 7 | `rg-07-mobile-area-journey.png` | Mobile after choosing a journey — guidance cleared |

---

## 3. Desktop behaviour

**Start — city landing** (`region-bubbles`): map shows macro-region bubbles; panel shows the city hero + journey choices + region list. No region guidance.

**User clicks East Bangalore on the map:**
1. State → `scope=east, journey=null` (all narrower ids null). URL: `?region=east`.
2. Map fits East bounds **once** (camera moves only on the scope change, not on hover).
3. Map layer → **region overview**: top-area preview markers (top area per group, spatially diverse — max ~4), not group/corridor pills.
4. Legend → **"East overview"** + **"Top areas only · not all areas"**.
5. **Map guidance card** appears top-right: *Region selected · East Bangalore · Showing top areas only — a preview, not the full list · Choose how to continue on the right →*.
6. Panel → **East region overview**: header band, scoped search, `aria-live` helper, and the *"Continue in East Bangalore"* journey cards.
7. Panel journey-card group receives a **one-shot copper ring pulse** (~3.2 s, two 1.5 s cycles).

**User picks a journey (e.g. "Search by area"):**
- State → `scope=east, journey=area` (`?region=east&journey=area`).
- Map guidance card + region legend note **disappear**; legend → "Area groups".
- Map shows **East group/corridor pills**; panel shows **East group/corridor cards**. Map and panel now show the **same level** — the original bug is resolved.

---

## 4. Mobile behaviour

No right-side panel — map is on top, panel is a bottom sheet. **This is not a mobile rewrite; only the guidance copy direction and the attention location change.**

- The map guidance card spans the **top of the map**, full width, and points **down** (**↓**) with copy **"Choose how to search below ↓"**.
- The panel attention (ring + helper line) appears in the **bottom sheet**, same as desktop.
- After a map-originated region pick, the sheet may **snap up to reveal the journey choices** (snap to the journey-card detent, not full-screen) so the "choose how to search" step is visible without a manual drag. Snap is a nudge, not a takeover — the user can drag it back down. If snap is not implemented in phase 1, the down-arrow + helper line already carry the hand-off.
- After a journey is chosen, guidance clears exactly as on desktop.

---

## 5. State & timing rules

**Appears when** (region overview, i.e. `scope` set & `journey === null`):
- ✅ User selects a region **from the map** → card + legend + **pulse**.
- ✅ User selects a region **from a panel region card** → card + legend + **pulse** (the map still shows a preview, so the "top areas only" note still helps).
- ✅ **Deep link** to `?region=<r>` with no journey → card + legend, **no pulse** (motion must not fire on page load).

**Disappears when:**
- User chooses a journey (`journey` becomes non-null) — layer leaves region overview.
- User clears the region / "Change region" (`scope → null`).
- User selects a group / area / school / listing (narrows past overview).
- User clicks **Start over**.
- User **dismisses** the card (× ).

**Frequency & dismissal:**
- The pulse is **one-shot per selection event**, keyed by a nonce (`regionGuide.n`) so each *fresh* region pick re-fires it — but a re-render, hover, or scroll never re-fires it.
- The card is **dismissible**; dismissal is **local UI state only** (no persistence, no backend) and resets on the next region selection so discoverability is never permanently lost.
- Nothing here writes to storage. (The separate first-time "Tap map markers to explore" hint keeps its existing `localStorage` behaviour and is **suppressed while the region card is showing** so the two never stack.)

---

## 6. Map → panel transition cue — decision

**Options considered:** (a) a small directional arrow on the map card; (b) a "Continue on the right →" link; (c) a panel section title mirroring the map message; (d) a drawn connector line between the map card and the panel journey cards.

**Chosen: a + b + c combined, plus a shared copper accent — not d.**
- The **arrow** (→ / ↓) gives an unmistakable direction that flips correctly between desktop and mobile with one boolean.
- The **"Choose how to continue on the right/below"** link is explicit and screen-reader-friendly.
- The **panel helper mirrors the map** copy, so wherever the eye lands the message is consistent.
- A **shared copper accent** — the map card's right border and the panel's ring — visually threads the two panes together **without** drawing anything across the map/panel gutter.
- **Rejected (d):** a literal connector line spanning the map→panel boundary is fragile across breakpoints, collapses entirely on mobile (stacked layout), and fights the map's own overlays. The color-thread + directional arrow achieves the "connected" feel at a fraction of the risk.

---

## 7. Copy strings (final)

**Map guidance card**
- Eyebrow: `Region selected`
- Title: `{Region name}` (e.g. `East Bangalore`)
- Body: `Showing top areas only — a preview, not the full list.`
- Action (desktop): `Choose how to continue on the right →`
- Action (mobile): `Choose how to search below ↓`
- Dismiss button aria-label: `Dismiss region guidance`

> **A/B/C rationale.** We tested the three supplied options. Chosen wording blends **A** (clear "selected" + "top areas only") with **B**'s reassurance that this is *not the full list* — the single most important message for the "map looks broken" risk. **C** ("start from the panel…") was folded into the panel helper line rather than the map card, because the card should stay short. All strings are **region-agnostic** — `{Region name}` is interpolated — and follow ReTrends sentence-case, no-emoji voice.

**Map legend (region overview)**
- Line 1: `{Region short} overview` (e.g. `East overview`)
- Line 2: `Top areas only · not all areas`

**Panel helper line** (`aria-live="polite"`)
- `{Region name} selected. The map shows top areas only — choose how you want to search below.`

**Panel journey section heading** (existing, kept): `Continue in {Region short} Bangalore`

---

## 8. Accessibility

- **Screen-reader announcement:** the panel helper line is wrapped in `aria-live="polite"`, so when the region overview renders it announces *"{Region} selected. The map shows top areas only — choose how you want to search below."* — no visual-only guidance.
- **Focus behaviour:** focus is **not** moved automatically. Visual attention (ring + card) draws the eye without stealing keyboard position — per the issue's explicit instruction. The map marker that was clicked keeps focus; keyboard users tab forward into the panel in DOM order (search → helper → journey cards) with no trap and no jump.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` replaces the ring pulse with a **static** 2 px copper ring and stops the arrow nudge. The guidance is fully conveyed without any motion.
- **Card semantics:** the map card is `role="note"` with `aria-labelledby` pointing at the region-name title; the dismiss control is a real `<button>` with an aria-label.
- **Keyboard path from region → journey:** region marker (Enter/Space) → panel renders → Tab reaches the scoped-search controls, then the journey-card buttons (each a native `<button>`), then the top-area list. No focus is skipped or forced.
- **Not an error:** neutral paper surface, copper accent (brand highlight, not the destructive brick), informational icon — never `role="alert"`, never red.

---

## 9. Implementation guide for #1808

> Design reference only. Do not edit production app code in this pass. This section tells Claude Code how to build and verify the change.

### Likely production files
- `src/pages/MapDiscovery.tsx` — owns the map ↔ panel composition; wire the guidance visibility off URL state here.
- `src/components/map/PropertyMap.tsx` — render the map guidance card overlay + region-aware legend for the region-overview layer.
- `src/components/discover/panels/GuidedEntryPanel.tsx` / `AreaGroupsLandingPanel.tsx` — render the panel helper line + attention ring around the journey cards.
- `src/hooks/useDiscoverUrlState.ts` — already provides `scope` / `journey`; add a transient **selection-source** signal (see below).
- `src/utils/discoverLayerRegistry.ts` — the region-overview layer already resolves to a top-area preview; only the **legend label** for that layer changes.
- Relevant map legend/overlay component — swap the static `Top areas` string for the region-aware label.

### State needed
The URL is the source of truth for *what* is shown; guidance needs one extra **transient, non-URL** signal for *how the region was reached* (to gate motion):

```ts
type RegionSelectSource = 'map' | 'panel' | 'deeplink';
// set on the region-select action; NOT persisted, NOT in the URL.
// A nonce (increment per selection) re-arms the one-shot pulse.
interface RegionGuideState { region: string; source: RegionSelectSource; nonce: number; }
```
- Region overview is active when `scope != null && journey == null` (and no groupId/areaKey/schoolId).
- Map/panel clicks set `source = 'map' | 'panel'` and bump `nonce`; a fresh load with `?region=&&!journey` sets `source = 'deeplink'`.
- The pulse fires only when `source !== 'deeplink'` and `nonce` changed. The card + legend show for all three sources.

### Copy strings
Use the exact strings in §7 (all region-interpolated).

### CSS / state classes
- `.dp-attn-target` (journey-card group) + `.dp-attn-on` (one-shot ring) driven by a `data-region-guide` / boolean, timed off ~3.2 s.
- Keyframes: `dpRing` (copper box-shadow, two cycles); arrow nudge `dpNudge` (→) / `dpNudgeY` (↓).
- `@media (prefers-reduced-motion: reduce)` → static ring, no arrow motion.
- Legend: region-overview layer renders `{regionShort} overview` + muted sub-line; all other layers unchanged.

### Reduced-motion notes
Every animation has a static fallback; guidance meaning is never motion-dependent. Verify with DevTools "Emulate prefers-reduced-motion".

### Desktop behaviour
Card top-right; arrow →; ring around the journey-card group. Card never overlaps the map centre or the zoom/summary controls.

### Mobile behaviour
Card top-of-map, full width; arrow ↓; copy "Choose how to search below". Attention ring in the bottom sheet; optional snap-to-journey detent. No layout rewrite.

### Tests to add
- `scope=east, journey=null` (map click) → guidance card visible, legend = "East overview", panel helper present, ring class applied once.
- `source=deeplink` (`?region=east`) → card + legend visible, **ring not applied** (no motion on load).
- Choosing a journey → `journey != null`, card + region legend note removed, map & panel both at group level.
- Clearing region / Start over / selecting group|area|school|listing → guidance removed.
- Dismiss → card hidden; next region selection → card returns.
- `prefers-reduced-motion` → no pulse animation; static ring present.
- Repeat region-overview assertions for `north` and `south` (region-agnostic copy).
- No `localStorage`/backend writes from guidance; focus does not move on region select.

### Browser verification steps (see also §10 checklist)
Start the app, open Discover, click East, assert URL/state and both layers, then repeat for North/South and at mobile width.

### Screenshots to capture
Reproduce the seven in §2 for the production build: city landing, East desktop, map-card close-up, panel highlight, East area journey, mobile East, mobile after journey.

---

## 10. Browser verification checklist

1. Start the app locally.
2. Open Discover city landing.
3. Click **East Bangalore** on the map.
4. Verify URL/state is `scope=east` and `journey` is **not** set (`groupId`/`areaKey`/`schoolId` all null).
5. Verify the map **fits East bounds** (once).
6. Verify the map shows **region overview / top-area markers**, not group/corridor pills.
7. Verify the map guidance card says: selected region + **top areas only** + **continue on the right**.
8. Verify the right panel shows the **East overview**.
9. Verify the journey-card area receives a **subtle attention highlight** (copper ring; static under reduced-motion).
10. Click **Search by area in East Bangalore**.
11. Verify URL/state becomes `scope=east&journey=area-first` (this prototype: `journey=area`).
12. Verify the map now shows **East group/corridor pills**.
13. Verify the panel now shows **East group/corridor cards**.
14. Verify map and panel show the **same level**.
15. Repeat 3–14 for **North** and **South**.
16. Check **mobile width**: card points down, guidance appears in the sheet, and clears after a journey is chosen.

Extra: deep-link `?region=east` directly → card + legend present, **no** pulse. Toggle `prefers-reduced-motion` → static ring, no motion. Confirm focus does not jump on region select.

---

## 11. Acceptance criteria

- [ ] A macro-region map click sets `scope=<region>, journey=null` and does **not** enter the area journey.
- [ ] Map fits region bounds once and shows the top-area preview layer.
- [ ] Map legend reads "{Region} overview" + "Top areas only · not all areas".
- [ ] Map guidance card shows selected region + "top areas only" + directional continue cue; dismissible; never an error state; never blocks map centre.
- [ ] Panel follows immediately with the region overview and journey choices.
- [ ] Journey cards get a one-shot copper ring after a map/panel pick; none on deep-link/refresh; static under reduced-motion; focus never moves.
- [ ] Guidance clears on journey choice / region clear / narrower selection / start over / dismiss.
- [ ] Mobile: card points down, attention in the sheet; no full rewrite.
- [ ] Behaviour is region-agnostic (North/South/East/West verified) and adds no backend/data/taxonomy/Central-Bangalore changes.
