# Issue #1824 — Slice S8 Design (presentation extraction → thin composition root, step 1)

Phase 0.7 for S8 (HIGH risk BY SURFACE, not logic novelty). Baseline `origin/main @ 53cbe38f` (S1-S7 merged). Read-only: explorer-planner inventory + architect design (line numbers verified against the 3561-line post-S7 file). No production code changed.

## Headline — the S8/S9/S10 split (answers the Main Agent's open question)

After S1-S7 extracted the state/logic, the 3561-line page = ~613 LOC exported pure helpers (L82-694) + ~1000 LOC hook composition + ~900 LOC residual derivation memos/effects + ~815 LOC render tree. **S8 = pure-JSX presentation extraction ONLY; it lands ~3220 (−340), NOT <800.** Reaching <800 is a **3-slice minimum (S8→S9→S10), plan for S11.**

Roadmap (per-slice cut lines + LOC projection):
- **S8 (this slice):** render-tree LEAVES → pure components under `src/components/discover/**` (badge pills, 7-way legend router, breadcrumb/indicator router, marker-popover wrapper, status hints). Cut band ~L2757-2771 + L2900-3308. 3561 → ~3220.
- **S9:** (a) relocate the 613-LOC exported-helpers band (L82-694) to a module; (b) extract the presentation-model DERIVATIONS (overviewAreas ~236 LOC L2247-2483, breadcrumb-segment builders, discoverBadge memo, areaResultSummaryText, school-first count memos) into a presenter hook `useDiscoverMapPresentation`. ~3220 → ~2170.
- **S10:** thin the PropertyMap (~126) + DiscoverRightPanel (~225, ~90 props) prop-assembly into presenter hooks + collapse the ~1000-LOC hook-composition band behind a composed façade. ~2170 → ~900-1100.
- **S11:** residual effect relocation + final trim to <800.

**Why presentation-first (S8) then logic (S9):** the JSX leaves have the smallest behaviour-coupling; extracting them first de-risks the higher-coupling S9/S10; the extracted components' prop contracts DEFINE the seam S9's presenter hook targets; and the 26/27 full-page-mount tests give an immediate render-identical gate before any derivation logic moves.

## S8 scope — 5 new PURE presentation components (src/components/discover/**)

1. **DiscoverMapContextOverlay** — breadcrumb/indicator router (L2900-2953, 54 LOC): the 4-way switch over already-built segment arrays. Extract the SWITCHER (leaves already components). Segment BUILDERS stay in page (→S9).
2. **DiscoverMapLegend** — 7-variant legend router (L2999-3086, 88 LOC) + absorb SchoolRadiusLegend chrome (L2957-2963). Extract the SWITCHER. MapMarkerLegend keeps `listings={areaMarkerListings}`.
3. **DiscoverMapCountBadge** — drill-down pill (L3100-3211, 112) + landing pill (L3213-3229, 17). Biggest win. **COPY-FORK CONSTRAINT: receives areaResultSummaryText + discoverBadge by prop; renders the area-first-selected-area branch's copy VERBATIM from areaResultSummaryText; NO 2nd formatDiscoverBadgeCopy for that scope.**
4. **DiscoverMapMarkerPopover** — popover wrapper (L3275-3308, 34): thin wrapper over MarkerPopoverCard. Eligibility gate + markerPopoverStepper derivation STAY in page.
5. **DiscoverMapStatusHints** — school-radius hint (L3231-3251, 21) + loader/error overlays (L2757-2771, 15). Lowest priority; trim-to-S9 acceptable if entangled.

All PURE (props-only, no hooks/state/data-fetch), plain function components (NO React.memo), extracted as fragments (move the existing absolute wrapper divs, add none), testids/roles/sibling-order/z-index/keys preserved.

**NOT in S8:** activeContextChips callback wiring (page-owned handlers → S9/S10); PropertyMap/DiscoverRightPanel/other already-wired children (prop-bag thinning → S10); ALL derivations/effects/__debug/aria-live; the 613-LOC helper band (→S9); **#1864** (out of scope — see below).

## Behaviour-preservation (render-output-identical)

- **window.__debug.mapState effect (L1889-1920):** STAYS in page, byte-identical (S7 AC4 E2E contract).
- **Shared badge-copy contract:** areaResultSummaryText (L1808-1818) computed ONCE, consumed by the map badge branch (L3150) AND the DiscoverRightPanel `areaResultSummaryText` prop (L3328 → AreaSelectedPanel stat). DiscoverMapCountBadge must render it verbatim — the single highest-risk fork point.
- **aria-live announce:** state + debounced effect (L1827-1845) stay page-owned; the sr-only `discover-badge-announce` div may move as a prop or stay a page sibling (testid unchanged).
- **Marker-popover eligibility gate (L2567-2570) + render conjunction (L3286-3288):** derivation stays in page; the component only receives booleans (render gate must equal the click-capture gate, #1798).
- testids/roles preserved (leaves already emit them); no React.memo; fragments not wrapper divs; sibling order + z-[1000] stacking preserved.

## #1864 — OUT OF SCOPE for S8

MapDiscovery's onBack wiring (L3332: school-first→journeyView.schoolFirstOnBack, else→handleAreaFirstBack) is already CORRECT. The #1864 defect (SchoolGroupAreasPanel Back hardcoded to onClearGroup) lives INSIDE DiscoverRightPanel.tsx — a forbidden file, and a behaviour CHANGE. Folding a functional fix into a render-identical extraction breaks the single-purpose discipline + the mount-test gate. Stays a separate issue.

## Risk / tests / 7A

- **Risk: HIGH by surface** (9-branch badge + copy-fork + 7-variant legend + 4-way breadcrumb + 26/27 mount + __debug/aria-live) — not by logic novelty. Don't drop to Med.
- **Tests:** the 26/27 full-page-mount suite IS the render-identity gate (unchanged). Regression map has verbatim titles (issue1798.markerPopup TC1-TC6, issue1808.regionGuidance 5 cases, issue1655 T5-T7, issue1460.truncation AC1/AC2, school-pill 4 cases, issue1152/1175, startOver-chip). **ONE new test only:** DiscoverMapCountBadge copy-fork props test (area-selected branch renders areaResultSummaryText verbatim). No other snapshots (mount suite is stronger).
- **7A:** mount suite = primary AUTOMATED gate; JSDOM can't catch absolute-positioning/z-index/paint-order, so a targeted MANUAL :5174 spot-check across 4 states (guided-entry landing, area-first selected-area incl. badge-vs-panel copy parity, school-first zone, region-overview) — MANUAL_PASS. Full scripted Playwright is overkill. Use :5174 + cd into the worktree.
- tsc baseline @53cbe38f: `npx tsc -p tsconfig.app.json --noEmit`. S8 target 3561 → ~3220.

## Open questions (for PLAN_REVIEW)

1. OQ-PROG (programme): is <800 a HARD 'done' criterion (needs the higher-risk S10b composed-façade collapse) or is a thin ~900-1100-line root acceptable? Determines whether S10b is required.
2. OQ1 (deferred to S9): do tests import helpers from '@/pages/MapDiscovery' beyond the isNew re-export (L83)? S9's helper move must handle those.
3. OQ2 (S8 sizing): DiscoverMapStatusHints 4-vs-5 — trim to S9 if entangled (default: include).
