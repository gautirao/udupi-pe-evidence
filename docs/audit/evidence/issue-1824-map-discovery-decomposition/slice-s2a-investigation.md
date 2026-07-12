# Issue #1824 — Slice S2a Investigation (prefersReducedMotion extraction)

Phase 0.7 re-entry after S1 merged (PR #1841 → d0994a2f). Read-only investigation (explorer-planner) against current `origin/main @ d0994a2f` (includes S1's useDiscoverInteractionState + the unrelated #1838 EditListing merge). Fresh branch: `issue-1824-s2a-reduced-motion`.

## Current-main facts (re-verified line numbers, post-S1 + #1838)

| Item | Location | Detail |
|---|---|---|
| State declaration | `src/pages/MapDiscovery.tsx:1243` | `const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);` |
| Setter effect | `src/pages/MapDiscovery.tsx:1244-1251` | SSR-guarded (`typeof window`) matchMedia `(prefers-reduced-motion: reduce)` listener; `addEventListener`/`removeEventListener` cleanup; empty `[]` deps; **NO eslint-disable** |
| Only read site | `src/pages/MapDiscovery.tsx:3652` | `prefersReducedMotion={prefersReducedMotion}` prop → `RegionGuidanceCard` |
| Consumer | `src/components/map/RegionGuidanceCard.tsx:52` | `const nudge = pulseEligible && !prefersReducedMotion;` — gates nudge animation classes (L84 `dp-cue-arrow--nudge-y`, L90 `--nudge-x`) |
| CSS fallback | `src/index.css:377-387` | `@media (prefers-reduced-motion: reduce)` disables the same animations — JS detection mirrors this |

## Existing-hook check
No `useReducedMotion` / `usePrefersReducedMotion` / matchMedia-reduced-motion hook exists anywhere in `src/hooks`, `src/lib`, `src/utils`, `src/features`. **S2a creates the first.**

## Coupling verdict — Very Low risk
`prefersReducedMotion` is a pure read-only media-query boolean: written only by its own effect (never elsewhere), consumed by a single prop, no memoization/callback-stability trap (it's a scalar boolean, not an object/function — so the S1 commands-object-churn class of regression cannot occur here). Zero coupling to URL / server-query / camera-intent / marker-selection state. A mechanical lift-and-shift.

## Design decision — return a plain boolean, NOT ControllerResult
S1's `ControllerResult<view, commands>` shape exists for stateful controllers with mutation commands. `prefersReducedMotion` has **no commands** (read-only environment flag). Forcing ControllerResult here would be over-engineering. The hook returns `boolean`:
```ts
export function useReducedMotion(): boolean;
```
This is a single-responsibility hook, not a utils dumping ground (satisfies the programme ADR).

## Location
`src/features/discover/state/useReducedMotion.ts` — consistent with S1's established convention location and keeps allowed_file_globs identical/tight. (It is a generic-enough primitive that a future refactor could promote it to `src/hooks/`; out of scope for this behaviour-preserving slice.)

## Test coverage
No `RegionGuidanceCard.test.tsx` exists. S2a adds a focused hook unit test (mock `matchMedia`; assert initial value, listener attach/detach, and BOTH reduce=true and reduce=false states). Existing MapDiscovery/discover suite provides regression coverage for the consumer wiring.

## Phase 7A proposal
Propose **7A = SKIP** for S2a, classified as behaviour-preserving refactor with an unchanged thin user-visible surface: the only user-visible effect (reduced-motion nudge-animation suppression in RegionGuidanceCard) is identical before/after — same boolean, same single consumer, same `!prefersReducedMotion` gating. No regression class analogous to S1's commands-churn exists (scalar boolean). Covered by the hook unit test (both media states) + existing suite. Also, the Chrome browser-automation permission gate remains unresolved, so a live 7A would again be BLOCKED. PLAN_REVIEW to validate this classification. (a11y note: the hook test MUST assert both reduce=true and reduce=false so an inverted-flag regression is caught without a browser.)
