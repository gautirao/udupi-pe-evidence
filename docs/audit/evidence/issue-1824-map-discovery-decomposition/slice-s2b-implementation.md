# Slice S2b implementation note — region-guide transient cluster extraction

- Issue: #1824 (MapDiscovery.tsx decomposition)
- Branch: `issue-1824-s2b-region-guide`
- Base commit: `a68dbb27` (post-S2a)

## What moved

Extracted the region-guide transient cluster out of `src/pages/MapDiscovery.tsx`
into `src/features/discover/state/useRegionGuideState.ts`:

- `regionSelectSource` (`useState<'map' | 'panel' | 'deeplink'>('deeplink')`)
- `regionSelectNonce` (`useState(0)`)
- `regionGuideDismissed` (`useState(false)`)
- the atomic `armRegionSelect(source)` callback — sets source, increments
  the nonce via the functional updater `n => n + 1`, and clears dismissal,
  all in one `useCallback([])` body (semantics preserved byte-for-byte).
- a new `dismissRegionGuide()` command (`() => setRegionGuideDismissed(true)`)
  replacing the old inline `onDismiss={() => setRegionGuideDismissed(true)}`.

## Hook shape

Reused the existing `ControllerResult<TView, TCommands>` generic exported by
`src/features/discover/state/useDiscoverInteractionState.ts` (Slice S1) rather
than redefining it — no new generic utils file created.

```ts
export function useRegionGuideState(): ControllerResult<RegionGuideView, RegionGuideCommands>
```

`view = { regionSelectSource, regionSelectNonce, regionGuideDismissed }`.
`commands = { armRegionSelect, dismissRegionGuide }`, wrapped in
`useMemo(() => ({ armRegionSelect, dismissRegionGuide }), [armRegionSelect, dismissRegionGuide])`
so the returned commands object is referentially stable across re-renders and
across state-changing actions — carrying forward the S1 lesson (code-reviewer
flagged an unmemoised commands object as a churn regression in S1).

## What stayed in the page (by design)

`regionGuideVisible` (`isRegionOverview && !regionGuideDismissed`) and
`regionGuideRingActive` (`regionGuideVisible && regionSelectSource !== 'deeplink'`)
remain in `MapDiscovery.tsx` because they read the external `isRegionOverview`
value, which is not part of this state cluster.

## Rewire sites (MapDiscovery.tsx, post-edit line numbers)

- L1225-1227: `const { view: regionGuideView, commands: regionGuideCommands } = useRegionGuideState();`
  then local destructure `{ regionSelectSource, regionSelectNonce, regionGuideDismissed }`
  from `regionGuideView` and `{ armRegionSelect, dismissRegionGuide }` from
  `regionGuideCommands` — kept existing read-site expressions
  (`regionGuideDismissed`, `regionSelectSource`, `regionSelectNonce`,
  `armRegionSelect(...)`) textually unchanged.
- L3076: `armRegionSelect('map')` (map click handler) — unchanged call site,
  now resolves to the destructured hook command.
- L3084: `useCallback` deps array still lists `armRegionSelect` (now the
  hook's stable command reference).
- L3176: `regionGuideVisible = isRegionOverview && !regionGuideDismissed`.
- L3177: `regionGuideRingActive = regionGuideVisible && regionSelectSource !== 'deeplink'`.
- L3631: `key={regionSelectNonce}` on `<RegionGuidanceCard>`.
- L3633: `onDismiss={dismissRegionGuide}` (was
  `onDismiss={() => setRegionGuideDismissed(true)}`).
- L3993: `regionGuideRingActive={regionGuideRingActive}` (panel prop, derivation
  untouched).
- L3995: `regionGuideNonce={regionSelectNonce}` (panel prop).
- L3997: `onRegionSelectFromPanel={() => armRegionSelect('panel')}`.

Confirmed via full-file text search: no remaining reference to
`setRegionSelectSource`, `setRegionSelectNonce`, `setRegionGuideDismissed`, or
an inline `armRegionSelect` definition anywhere in `MapDiscovery.tsx`.

## Boundaries respected

- `src/components/map/RegionGuidanceCard.tsx` — untouched (its
  `onDismiss: () => void` prop type is unchanged; passing `dismissRegionGuide`
  directly, instead of a wrapping arrow, is safe since the component invokes
  it via `onClick={onDismiss}` with no arguments).
- `DiscoverRightPanel` — untouched.
- No URL/query/camera/marker-selection code touched.
- No new dependency added; no eslint-disable suppressions added or removed.

## Line count

`src/pages/MapDiscovery.tsx`: `git diff --stat` reports
`1 file changed, 7 insertions(+), 18 deletions(-)` (net −11 lines) against
base `a68dbb27`.

## Validation

1. `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` → exit 2 (pre-existing
   baseline failure set only). Manually reviewed all ~121 reported errors —
   none cite `MapDiscovery.tsx` (non-test) or `useRegionGuideState.*`. Same
   baseline shape as documented for prior slices (S1/S2a).
2. `npx vitest run src/features/discover/state/useRegionGuideState.test.tsx`
   → `PASS (7) FAIL (0)`, exit 0.
3. `npx vitest run src/pages/__tests__/MapDiscovery.issue1808.regionGuidance.test.tsx`
   → `PASS (7) FAIL (0)`, exit 0 (integration guard, file unmodified).
4. `npx eslint src/pages/MapDiscovery.tsx src/features/discover/state/useRegionGuideState.ts src/features/discover/state/useRegionGuideState.test.tsx`
   → `0 errors, 16 warnings` (all `react-refresh/only-export-components` on
   `MapDiscovery.tsx`). Verified via `git stash`/`stash pop` that the
   unmodified base file also reports `0 errors, 16 warnings` — no new
   warnings introduced, suppression count unchanged (0 before/after).
5. `npm run build` → `vite build` succeeded, exit 0.

Did not run the full single-process vitest suite (documented OOM risk).
