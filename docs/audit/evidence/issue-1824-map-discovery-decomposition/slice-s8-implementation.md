# Issue #1824 — Slice S8 Implementation Note (presentation extraction → 5 pure components)

Stage B execution record. Branch `issue-1824-s8-presentation-extraction` off `origin/main @ 53cbe38f`. HIGH risk by surface (render-identical presentation extraction). Companion: `slice-s8-design.md`.

## What shipped

- 5 NEW pure presentation components under `src/components/discover/**` (plain function components, no hooks/state/data-fetch, no React.memo, everything by prop):
  - `DiscoverMapContextOverlay.tsx` — breadcrumb/indicator 4-way router.
  - `DiscoverMapLegend.tsx` — SchoolRadiusLegend chrome + 7-variant legend router (called twice — see DEV-2).
  - `DiscoverMapCountBadge.tsx` — drill-down pill + landing pill (the copy-fork component).
  - `DiscoverMapMarkerPopover.tsx` — MarkerPopoverCard wrapper.
  - `DiscoverMapStatusHints.tsx` — loader overlay + school-radius hint (called twice — DEV-2; error card stays inline — DEV-1).
  - `DiscoverMapCountBadge.test.tsx` — the AC8 copy-fork test.
- `src/pages/MapDiscovery.tsx`: 3561 → 3342 (−219). The 5 regions rewired to the new components; `groupSelectedBadgeCopy`/`fallbackBadgeCopy`/`schoolRadiusPillNoun`/`hasActiveAnonFilter` hoisted from inline-JSX to plain page consts (same logic, NOT new memos/hooks) to pass as props. All derivations/effects/__debug/aria-live/popover-gate/helper-band UNCHANGED in the page.

## FLAG-B decision = (b2)

DiscoverMapCountBadge never imports `formatDiscoverBadgeCopy`. The page precomputes the group/fallback copy strings and passes them as props; the area-selected branch renders the injected `areaResultSummaryText` VERBATIM. This avoids a `MapDiscovery ↔ DiscoverMapCountBadge` runtime circular import (only a type-only `DiscoverBadgeResult` import remains, compile-erased) and makes the AC8 test trivial (no spy needed — the component has no runtime helper import to spy on; the distinct-sentinel + negative-containment assertion is the whole gate).

## AC4 copy-fork — structurally foreclosed

`areaResultSummaryText` is computed ONCE (MapDiscovery.tsx L1805 useMemo) and passed to BOTH DiscoverMapCountBadge (L3019) AND DiscoverRightPanel (L3109). Same reference → the map badge and the AreaSelectedPanel stat cannot diverge (opus code-reviewer verified). The AC8 test renders the area-selected state with a DISTINCT sentinel `SENTINEL_AREA_SUMMARY_9137` (+ a distinct would-be-recomputed string in the unused group/fallback props) and asserts the DOM text equals the sentinel + does NOT contain the recomputed string — non-vacuous.

## Deviations (documented; opus code-reviewer APPROVED both)

- **DEV-1 (render-identity-driven):** the error-card overlay stays INLINE in the page — it is the false branch of the `<PropertyMap>` ternary (PropertyMap.tsx forbidden/must-stay); splitting the ternary across the component boundary risked DOM-order drift. DiscoverMapStatusHints got the loader + hint only (~15 LOC error card stays).
- **DEV-2 (render-identity-driven, AC10-compelled):** DiscoverMapLegend and DiscoverMapStatusHints are EACH called TWICE — their two sub-regions sit at different tree positions with page-owned siblings (CitySelect, RegionGuidanceCard, the error ternary) between them; a single consolidated call would REORDER those unmoved siblings, violating AC10 (sibling order). The two-call split is the only render-identity-preserving option (code-reviewer git-show verified consolidation would reorder).
- **LINE VARIANCE (AC9):** net −219 (3561→3342), BELOW the ~−300/−340 projection. Shortfall = DEV-1 (error card ~15) + DEV-2's duplicated call-site wiring + rationale comments. Same class as S7's AC8 line variance — the extraction is complete + render-identical; only the magnitude projection missed. Surfaced for WORKDONE_REVIEW adjudication. Roadmap impact: S8 lands ~3342 (vs the ~3220 projection); S9/S10 targets shift slightly but the roadmap holds.

## AC10 — per-region DOM-structure diff (opus code-reviewer, 5 PASS lines)

Each component returns a Fragment wrapping the pre-existing absolute-positioned wrapper div(s); NO added wrapper element; parent child-tag sequence + count identical pre/post; sibling positions preserved. ContextOverlay / Legend(×2) / CountBadge / MarkerPopover / StatusHints(×2) all PASS.

## Validation evidence (commands + exit codes)

| Check | Command | Exit | Result |
|---|---|---|---|
| tsc (branch vs /tmp 53cbe38f baseline) | `npx tsc -p tsconfig.app.json --noEmit` | 2 (both) | error set **byte-identical** → zero net-new (60 pre-existing errors, all unrelated files) |
| AC8 copy-fork test | `npx vitest run …/DiscoverMapCountBadge.test.tsx` | 0 | **2/2 PASS** (verbatim title + sentinel + non-vacuous) |
| Full MapDiscovery mount suite (30 files) | `npx vitest run src/pages/__tests__/MapDiscovery` | (1 pre-existing 1ms-timestamp flake in unedited anon-school-radius; isolated rerun 21/21) | all S8-relevant green; **mount files UNEDITED** (git diff --stat 53cbe38f empty); all 8 regression guards present + green |
| Broader discover batch | `npx vitest run src/components/discover src/features/discover/state` | 0 | 65 files / **1068 PASS**, 3 skipped |
| Lint | `npx eslint <7 touched files>` | 0 | 0 errors, 15 warns == baseline; no suppression change |
| Build | `env -C <worktree> npm run build` | **0** | built |

- code-reviewer: **opus / frontend, APPROVE** (0 must-fix). Render-identity byte-for-byte; AC4 structurally foreclosed; hoisted consts same-logic; 5 AC10 PASS lines; purity confirmed; DEV-1/DEV-2 both APPROVED.

## Phase 7A

REQUIRED MANUAL :5174 visual spot-check (NOT full scripted Playwright), run by the Main Agent AFTER this candidate: 6 numbered steps incl. step 3 = the badge-vs-panel side-by-side text comparison in the area-first selected-area state (both strings recorded verbatim, confirmed identical). JSDOM can't catch absolute-positioning/z-index/paint-order; the 26/27 mount suite is the primary AUTOMATED gate.

## Programme roadmap (carried)

S8 lands ~3342. Remaining to <800: S9 (helper-band relocation + derivation presenter hook), S10 (prop-bag + composed façade), S11 polish. #1864 stays a separate issue.
