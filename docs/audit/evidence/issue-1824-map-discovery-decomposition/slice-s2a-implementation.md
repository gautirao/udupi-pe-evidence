# Slice S2a implementation note — prefersReducedMotion extraction

## Files created
- `src/features/discover/state/useReducedMotion.ts` — read-only environment-flag
  hook. Returns a plain `boolean` (not a `ControllerResult` view/commands shape —
  there is nothing to mutate from the consumer side). Logic moved verbatim from
  MapDiscovery.tsx: SSR guard
  (`typeof window === 'undefined' || typeof window.matchMedia !== 'function'`),
  `useState(false)` initial value synced by the effect via
  `setPrefersReducedMotion(mql.matches)` (not read synchronously at declaration
  time — preserves the original's exact initial-render behaviour), `change`
  listener via `addEventListener`, and `removeEventListener` cleanup on unmount.
  The hook returns `mql.matches` **directly** — never negated. (RegionGuidanceCard
  applies its own `!prefersReducedMotion`; an inverted hook would silently break
  reduced-motion behaviour — confirmed non-inverted by both the direct return-value
  test and by the passing RegionGuidanceCard.test.tsx suite.)
- `src/features/discover/state/useReducedMotion.test.tsx` — 5 tests: returns
  `true` when `matchMedia().matches === true`, returns `false` when `false`
  (locks the non-inverted direction both ways), the `change` listener updates the
  returned value when fired, the listener is removed on unmount (asserts the
  `removeEventListener` spy is called with the same listener reference that was
  registered), and an SSR-guard case (`window.matchMedia` undefined does not throw).

## Files modified
- `src/pages/MapDiscovery.tsx` — replaced the inline `useState` declaration +
  matchMedia `useEffect` (~12 lines incl. doc comment) with a single
  `const prefersReducedMotion = useReducedMotion();` call, plus one new import
  line. Line count: 4219 → 4210 (net -9).

## Usage-site finding
A full-file search for `prefersReducedMotion|setPrefersReducedMotion` in
MapDiscovery.tsx before any edit returned 5 matches: the removed declaration
(1243) and its two `setPrefersReducedMotion` calls (1247, 1248), plus **two**
read sites — `RegionGuidanceCard` at L3652 (as specified in the task) and a
second, previously unlisted read site at L4016 (`prefersReducedMotion={prefersReducedMotion}`
threaded into the panel/`GuidedEntryPanel` region-guidance prop block). Both
read sites needed no code change because the extracted variable keeps the same
name. Post-edit search confirms no dangling `setPrefersReducedMotion` references
remain anywhere in the file — the setter is fully encapsulated inside the new hook.

## Validation
- `tsc --noEmit -p tsconfig.app.json`: exit 2, but identical to the pre-existing
  226-error baseline (verified line-by-line: no error citing `MapDiscovery.tsx`
  or `useReducedMotion.*` in the final run — one transient error in the new test
  file's `@ts-expect-error` directive was fixed before this reading).
- `vitest run src/features/discover/state/useReducedMotion.test.tsx`: exit 0,
  5/5 passed.
- `vitest run src/components/map/__tests__/RegionGuidanceCard.test.tsx`: exit 0,
  12/12 passed (consumer unchanged and green).
- `eslint` on touched files: 0 errors; MapDiscovery.tsx's pre-existing 16
  warnings (react-refresh/only-export-components, unused eslint-disable) are
  unrelated to this change; 0 new warnings from the new hook/test files.
- `npm run build`: exit 0.

## Boundary confirmation
`src/components/map/RegionGuidanceCard.tsx` and `src/index.css` were not opened
for editing and are absent from `git status --porcelain` — byte-identical to
d0994a2f.
