# Issue #1808 — ready-to-paste comment

> Paste the block below into issue #1808.

---

**Design pass complete — region selection guidance (map ↔ panel alignment)**

Design only; no production code, backend, taxonomy, or `_ds_bundle.js` changes. PR #1807's camera-owner and marker-scope fixes are preserved.

### Design decision
A macro-region click **selects, does not enter**: `scope=<region>, journey=null` (all narrower ids null). The map shows a **top-areas preview** and the panel immediately shows the region overview where the user chooses how to continue. To fix the "did the map break / is this everything?" confusion we add four coordinated, copper-accented, low-weight elements:

1. **Map guidance card** (region-overview layer only) — top-right on desktop, top-of-map on mobile. *"Region selected · {Region} · Showing top areas only — a preview, not the full list · Choose how to continue on the right →"*. Dismissible, never blocks the map centre, never an error state.
2. **Region-aware legend** — `Top areas` → **"{Region} overview"** + **"Top areas only · not all areas"** so the preview is never read as the full area list.
3. **Panel attention** — one-shot copper ring on the *"Continue in {Region}"* journey cards + an `aria-live` helper line. Fires only after a **map/panel** pick (never on deep-link/refresh), respects `prefers-reduced-motion`, never steals focus.
4. **Map→panel cue** — directional arrow (→ desktop / ↓ mobile) + shared copper accent threading the map card to the panel ring + mirrored panel copy. We rejected a drawn connector line (fragile across breakpoints, collapses on mobile).

Guidance clears on: journey chosen · region cleared · group/area/school/listing selected · Start over · dismiss. Region-agnostic (verified North/South/East/West). No Central-Bangalore change. Dismissal is local UI state only — no persistence, no backend.

### Screenshots produced
1. City landing before selection
2. East selected after map click (desktop) — fit-to-East, top-area preview, guidance card, legend
3. Map guidance card close-up
4. Right-panel journey-card highlight (ring + helper line)
5. East + area journey after "Search by area" — guidance gone, map & panel at the same group level
6. Mobile East selected — card points down to the sheet
7. Mobile after choosing a journey — guidance cleared

### Implementation guidance (full spec: `REGION_SELECTION_GUIDANCE.md`)
- **State:** URL stays the source of truth (`scope`/`journey`). Add one transient, non-URL **selection-source** signal (`'map' | 'panel' | 'deeplink'`) + a nonce to arm the one-shot pulse. Pulse only when `source !== 'deeplink'`; card + legend show for all sources.
- **Likely files:** `MapDiscovery.tsx` (compose visibility off URL state), `PropertyMap.tsx` (card + legend overlay), `GuidedEntryPanel.tsx` / `AreaGroupsLandingPanel.tsx` (helper line + ring), `useDiscoverUrlState.ts` (expose the source signal), `discoverLayerRegistry.ts` / legend component (region-aware label). Reference only — not edited in this pass.
- **CSS:** `.dp-attn-target` + `.dp-attn-on` (copper `dpRing`, two cycles ~3.2 s), arrow nudge `dpNudge`/`dpNudgeY`, `prefers-reduced-motion` → static ring, no motion.
- **A11y:** `aria-live="polite"` helper, `role="note"` card, no auto focus move, static reduced-motion fallback, keyboard path region → search → journey cards → top areas.

### Acceptance criteria
- [ ] Region map click → `scope=<region>, journey=null`; does not enter the area journey.
- [ ] Map fits region bounds once; shows top-area preview (not group/corridor pills).
- [ ] Legend = "{Region} overview" + "Top areas only · not all areas".
- [ ] Guidance card: region + "top areas only" + directional continue cue; dismissible; not an error; never blocks map centre.
- [ ] Panel follows immediately with the region overview + journey choices.
- [ ] Journey cards pulse once after a map/panel pick; none on deep-link/refresh; static under reduced-motion; focus never moves.
- [ ] Guidance clears on journey choice / region clear / narrower selection / Start over / dismiss.
- [ ] Mobile: card points down, attention in the sheet; no full rewrite.
- [ ] Region-agnostic; no backend/data/taxonomy/Central-Bangalore changes.

### Browser verification
Start app → Discover → click East → assert `scope=east`, `journey` unset → map fits East + top-area markers → card + legend + panel overview + subtle highlight → click "Search by area" → `scope=east&journey=area-first`, map & panel both at group level → repeat North/South → check mobile width. Also: deep-link `?region=east` shows card/legend but **no** pulse; reduced-motion shows a static ring.
