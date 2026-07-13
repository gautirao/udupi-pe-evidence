# Slice 5 — TS2556 spread-mock fix (issue #1850)

## Result

- `tsc --noEmit -p tsconfig.app.json` total errors: **80 → 60**
- TS2556 ("A spread argument must either have a tuple type or be passed to a rest parameter"): **20 → 0**
- No other error codes changed; the remaining 60 errors are pre-existing and out of scope for this slice.

## Fix pattern

Each flagged mock-factory spread wrapper of the shape:

```ts
someHook: (...args: unknown[]) => mockX(...args)
```

was changed to:

```ts
someHook: (...args: Parameters<typeof mockX>) => mockX(...args)
```

`mockX` in every case is a `vi.hoisted(() => vi.fn(...))` handle, whose type is
`Mock<T>` from `@vitest/spy` (`interface Mock<T extends Procedure> { (...args: Parameters<T>): ReturnType<T>; ... }`).
`Parameters<typeof mockX>` resolves through that call signature to a concrete
tuple (e.g. `[]` for a zero-arg auth mock), which satisfies TS2556's tuple
requirement.

## Sites fixed (20 total, 17 files)

| File | Line | Callee |
|---|---|---|
| src/components/discover/__tests__/SchoolsInAreaPanel.issue1067.test.tsx | 38 | mockUseAuth |
| src/pages/__tests__/Index.invalidCity.test.tsx | 45 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1064.test.tsx | 31 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1067.test.tsx | 32 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1069.test.tsx | 31 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1178.test.tsx | 29 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1186.test.tsx | 33 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1370.test.tsx | 30 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1745-batchB-overviewClick.test.tsx | 44 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1745-batchB-overviewClick.test.tsx | 171 | mockUseAreaGroups |
| src/pages/__tests__/MapDiscovery.issue1798.markerPopup.test.tsx | 45 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1798.test.tsx | 27 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1808.regionGuidance.test.tsx | 39 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1808.regionGuidance.test.tsx | 183 | mockUseAreaGroups |
| src/pages/__tests__/MapDiscovery.issue1815.r3b.test.tsx | 45 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1815.test.tsx | 52 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.issue1821.test.tsx | 89 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.school-deep-link.test.tsx | 37 | mockUseAuth |
| src/pages/__tests__/MapDiscovery.school-deep-link.test.tsx | 46 | mockUseSchoolById |
| src/pages/__tests__/MapDiscovery.startOver-chip.test.tsx | 30 | mockUseAuth |

All line numbers above match the baseline (no drift found while editing).

## Representative before/after hunk

`src/pages/__tests__/Index.invalidCity.test.tsx`, lines 44-46:

Before:
```ts
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));
```

After:
```ts
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (...args: Parameters<typeof mockUseAuth>) => mockUseAuth(...args),
}));
```

## Verification note

An earlier `tsc` run in this session appeared to still show 20 TS2556 errors
at the original line/column positions. This was a stale-file artifact: the
output had been redirected to a shared `/tmp/tsc-slice5-after.txt` path that
was NOT scoped to this session and still held content from an earlier
attempt. Re-running `tsc` fresh (new output path, after deleting the stale
file) confirmed 60 total errors / 0 TS2556, matching the edits actually
present in the working tree. The final evidence file
`tsc-slice5-after.txt` in this directory is that fresh, verified run.
