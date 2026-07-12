# Issue #1824 — Slice S2b Investigation (region-guide transient state)

Phase 0.7 re-entry after S2a merged (PR #1842 → a68dbb27). Read-only investigation (explorer-planner) against `origin/main @ a68dbb27` (includes merged S1 useDiscoverInteractionState + S2a useReducedMotion). Fresh branch: `issue-1824-s2b-region-guide` in worktree `.../issue-1824-map-discovery-decomposition`.

## Current-main facts (re-verified line numbers, post-S1 + S2a)

| Item | Location | Detail |
|---|---|---|
| `regionSelectSource` | MapDiscovery.tsx:1229 | `useState<'map'\|'panel'\|'deeplink'>('deeplink')` — fresh load never pulses |
| `regionSelectNonce` | MapDiscovery.tsx:1230 | `useState(0)` — increments per selection; used as RegionGuidanceCard React key to force remount/anim reset |
| `regionGuideDismissed` | MapDiscovery.tsx:1233 | `useState(false)` — per-selection dismissal flag |
| `armRegionSelect` (atomic) | MapDiscovery.tsx:1234-1238 | `useCallback((source:'map'\|'panel')=>{ setRegionSelectSource(source); setRegionSelectNonce(n=>n+1); setRegionGuideDismissed(false); }, [])` — sets all 3 atomically |

### Write sites
- `armRegionSelect('map')` — L3087, inside `handleOverviewAreaClick` (macro-region bubble click on map).
- `armRegionSelect('panel')` — L4008, `onRegionSelectFromPanel={() => armRegionSelect('panel')}` (panel region-card selection).
- `setRegionGuideDismissed(true)` — L3644, RegionGuidanceCard `onDismiss`.

### Read / derived sites (all in MapDiscovery.tsx; derivations STAY in the page)
- `regionGuideVisible` L3187 = `isRegionOverview && !regionGuideDismissed` (gates card + legend + ring).
- `regionGuideRingActive` L3188 = `regionGuideVisible && regionSelectSource !== 'deeplink'` (pulse only on map/panel clicks, never cold-load deep-link).
- `<RegionGuidanceCard key={regionSelectNonce} … />` L3639 (remount → animation reset).
- Props to DiscoverRightPanel: `regionGuideRingActive` L4004, `regionGuideNonce={regionSelectNonce}` L4006, `onRegionSelectFromPanel={() => armRegionSelect('panel')}` L4008.

`isRegionOverview` (external, URL/scope-derived) is an input to the derivations — so `regionGuideVisible`/`regionGuideRingActive` derivations must REMAIN in the page (they mix hook state + external state). The hook owns only the 3 raw vars + the two commands.

## Consumer + UI surface (drives the 7A decision)
Consumer: `src/components/map/RegionGuidanceCard.tsx` (rendered L3637-3646 under `regionGuideVisible && resolvedRegionLabel`) — a dismissible guide card: header "Region selected" + name, body copy, dismiss (X) → `setRegionGuideDismissed(true)`, footer with an arrow that **animates/nudges** when `pulseEligible (=regionGuideRingActive) && !prefersReducedMotion`. The panel also shows a ring/helper + aria-live annotation keyed on the nonce. Purely presentational (no URL writes), but genuinely **interactive/animated**.

## Existing shared hook
None. S2b creates the first region-guide hook. Convention location (S1/S2a): `src/features/discover/state/`.

## Cohesion + coupling verdict — Low risk, but WITH commands
Cohesive, tightly-bound cluster; zero coupling to URL/query/camera/marker-selection (verified: no effect/memo reading these also touches those). **Atomic multi-field transition** via `armRegionSelect` (source+nonce+dismiss together). This is exactly the case the S1 ADR flagged as warranting a small commands API — UNLIKE S2a's read-only boolean.

## Hook shape decision — ControllerResult<view, commands> (consistent with S1)
```ts
interface RegionGuideView { regionSelectSource: 'map'|'panel'|'deeplink'; regionSelectNonce: number; regionGuideDismissed: boolean; }
interface RegionGuideCommands { armRegionSelect(source: 'map'|'panel'): void; dismissRegionGuide(): void; }
export function useRegionGuideState(): ControllerResult<RegionGuideView, RegionGuideCommands>;
```
- Internals: 3 useState + the atomic `armRegionSelect` (useCallback) + `dismissRegionGuide` (= setRegionGuideDismissed(true), useCallback).
- **CARRY FORWARD THE S1 LESSON:** the returned `commands` object MUST be `useMemo`-stabilised (keyed on the two useCallback-stable commands) so no consumer that depends on `commands` identity re-renders; command callbacks must be useCallback-stable. `armRegionSelect` is currently `useCallback([])` and is passed to the panel (via an inline arrow today) — preserve its stability.
- Reuse the `ControllerResult` type from S1's useDiscoverInteractionState if exported; otherwise define locally.

## 7A applicability — APPLIES (NOT skip-eligible)
Unlike S2a's thin unchanged boolean, region-guide drives real interactive/animated UI (pulse nudge, animated arrow, panel ring, dismiss, nonce-remount) — analogous to S1's hover cluster, which WAS 7A-worthy. Therefore propose **7A = REQUIRED**, NOT skip. HOWEVER: the Chrome browser-automation permission gate remains unresolved (S1 + S2a both could not run live 7A), so a live 7A run will again be BLOCKED and will need the same user-override-on-automated-evidence-strength decision as S1. Strong automated fallback exists: `src/pages/__tests__/MapDiscovery.issue1808.regionGuidance.test.tsx` renders the REAL MapDiscovery tree (real useDiscoverUrlState) and exercises the actual behaviour — deep-link → card visible + NO ring, map bubble click → card + ring, dismiss clears card/legend/ring, choosing a journey clears guidance — i.e. behaviour-level coverage, not just the hook in isolation. Plus new hook unit tests for the atomic transition + nonce increment + dismiss. PLAN_REVIEW to confirm the 7A classification.

## Test coverage
`src/pages/__tests__/MapDiscovery.issue1808.regionGuidance.test.tsx` (confirmed) — the integration guard above; must remain green unmodified (behaviour-preserving). New hook unit tests to be added.
