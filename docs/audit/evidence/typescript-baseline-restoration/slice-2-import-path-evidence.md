# Issue #1850 — Slice 2: Stale `@/types/discover` import-path correction

Branch: `issue-1850-stale-import-path` (worktree:
`issue-1850-slice2-import-path`)

## Change

Two Discover panel files imported the `DiscoverJourney` type from a
non-existent module `@/types/discover` (TS2307). The sole canonical
definition of `DiscoverJourney` lives in `src/hooks/useDiscoverUrlState.ts`
(line 82: `export type DiscoverJourney = 'area-first' | 'school-first' |
'agri-first';`). Repointed the `import type` module specifier in both files
to the canonical module. Type-only imports — erased at build time, no
runtime behavior change.

### Pre-swap divergence check

Re-confirmed before editing: `src/hooks/useDiscoverUrlState.ts:82` still
exports exactly the 3-literal union `DiscoverJourney` type, and no second
`DiscoverJourney` definition exists anywhere else in `src/`. No divergence
found — proceeded with the blind swap as scoped.

### Files changed

1. `src/components/discover/panels/AreaGroupSelectedPanel.tsx` (line 7)
   - Before: `import type { DiscoverJourney } from '@/types/discover';`
   - After: `import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';`

2. `src/components/discover/panels/AreaGroupsLandingPanel.tsx` (lines 11-12)
   - Before:
     ```
     import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
     import type { DiscoverJourney } from '@/types/discover';
     ```
   - After (consolidated onto the existing sibling-type import line):
     ```
     import type { DiscoverIntent, DiscoverJourney } from '@/hooks/useDiscoverUrlState';
     ```

```
$ git diff --stat -- src/components/discover/panels/AreaGroupSelectedPanel.tsx src/components/discover/panels/AreaGroupsLandingPanel.tsx
src/components/discover/panels/AreaGroupSelectedPanel.tsx | 2 +-
src/components/discover/panels/AreaGroupsLandingPanel.tsx | 3 +--
2 files changed, 2 insertions(+), 3 deletions(-)
```

```diff
--- a/src/components/discover/panels/AreaGroupSelectedPanel.tsx
+++ b/src/components/discover/panels/AreaGroupSelectedPanel.tsx
@@ -4,7 +4,7 @@ import { cn } from '@/lib/utils';
 import { Button } from '@/components/ui/button';
 import type { AreaGroup } from '@/hooks/useAreaGroups';
 import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
-import type { DiscoverJourney } from '@/types/discover';
+import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';
 import { getAreaGroupContent, getLocalityDescription } from '@/lib/discoverGroupContent';
 import { ScopedSearch } from '../ScopedSearch';
 import { PanelColumn } from './_shared';

--- a/src/components/discover/panels/AreaGroupsLandingPanel.tsx
+++ b/src/components/discover/panels/AreaGroupsLandingPanel.tsx
@@ -8,8 +8,7 @@ import { AreaGroupSelectedPanel } from './AreaGroupSelectedPanel';
 import { ScopedSearch } from '../ScopedSearch';
 import type { AreaGroup } from '@/hooks/useAreaGroups';
 import type { DiscoverArea } from '@/hooks/useDiscoverAreas';
-import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
-import type { DiscoverJourney } from '@/types/discover';
+import type { DiscoverIntent, DiscoverJourney } from '@/hooks/useDiscoverUrlState';
 import {
   matchesMacroRegion,
   getGroupMacroRegionLabel,
```

## Verification: `tsc --noEmit -p tsconfig.app.json`

### Before (pre-edit baseline, captured from the unedited main-repo checkout
at the same base commit as the worktree, as an independent cross-check of
Stage A's reported 108 count)

```
$ node node_modules/.bin/tsc --noEmit -p tsconfig.app.json   # run against unedited tree
exit code: 2
$ grep -c "error TS" <log>
108
```
Included (among the 108) the two target errors:
```
src/components/discover/panels/AreaGroupSelectedPanel.tsx(7,38): error TS2307: Cannot find module '@/types/discover' or its corresponding type declarations.
src/components/discover/panels/AreaGroupsLandingPanel.tsx(12,38): error TS2307: Cannot find module '@/types/discover' or its corresponding type declarations.
```

### After (edited worktree)

```
$ env -C <worktree> node node_modules/.bin/tsc --noEmit -p tsconfig.app.json
exit code: 2
$ grep -c "error TS" <log>
106
```

Neither `AreaGroupSelectedPanel.tsx` nor `AreaGroupsLandingPanel.tsx`
appears anywhere in the after-log — both panels are now at 0 errors.

### No-regression check

Sorted set-diff of before vs. after error line lists
(`file(line,col): error TSxxxx: message`):

```
$ diff <(sort before_errors.txt) <(sort after_errors.txt)
12,13d11
< src/components/discover/panels/AreaGroupSelectedPanel.tsx(7,38): error TS2307: Cannot find module '@/types/discover' or its corresponding type declarations.
< src/components/discover/panels/AreaGroupsLandingPanel.tsx(12,38): error TS2307: Cannot find module '@/types/discover' or its corresponding type declarations.
```

Only the two removed lines differ — every other error (all 106 remaining)
is byte-identical between before and after, confirming no new error was
introduced anywhere else in the tree, and no other file's error count
shifted.

## Summary

| Metric | Before | After |
|---|---|---|
| Total `error TS` count | 108 | 106 |
| `AreaGroupSelectedPanel.tsx` errors | 1 (TS2307) | 0 |
| `AreaGroupsLandingPanel.tsx` errors | 1 (TS2307) | 0 |
| New errors introduced elsewhere | — | 0 |

Exit code both runs: `2` (tsc reports non-zero when any error exists;
expected since 106 pre-existing, out-of-scope errors remain for later
slices).
