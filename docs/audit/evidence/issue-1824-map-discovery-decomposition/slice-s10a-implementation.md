# Slice S10a — useDiscoverBadgeAnnounce hook (aria-live cluster)

## What moved

Verbatim lift of the AC11 debounced result-count announcement cluster from
`src/pages/MapDiscovery.tsx` (original L1265-1285) into a new flat hook:
`src/features/discover/presentation/useDiscoverBadgeAnnounce.ts`.

Moved declarations (byte-for-byte except one param rename):
- `const [announcedBadgeText, setAnnouncedBadgeText] = useState('');`
- `const badgeAnnounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);`
- The debounced `useEffect` (loading guard, clearTimeout+setTimeout(…, 500)
  debounce, `!discoverBadge.visible ? '' : formatDiscoverBadgeCopy(...)` branch,
  `setAnnouncedBadgeText`, cleanup return, `eslint-disable-next-line
  react-hooks/exhaustive-deps`, and the dep array).

**Only permitted change**: `urlState.q` → `urlStateQ` at both the
`searchQuery` read (inside `formatDiscoverBadgeCopy`'s opts) and the dep-array
entry. No other line in the guard/debounce/branch/scopeLabel
ladder/noun-branch/cleanup was touched.

The L1260-1264 explanatory AC11 comment was left in place on the page
(not moved into the hook), since the plan allowed either; keeping it in
place avoids disturbing the page's comment history around the call site,
and a short pointer comment was added instead (`Issue #1824 Slice S10a —
the debounced state/effect body extracted to useDiscoverBadgeAnnounce`).

## Hook signature

```ts
export interface UseDiscoverBadgeAnnounceParams {
  discoverBadge: DiscoverBadgeResult;
  selectedArea: AreaPoint | null;
  focusedGroup: AreaGroup | null;
  city: string;
  urlStateQ: string | undefined;
}

export function useDiscoverBadgeAnnounce(params: UseDiscoverBadgeAnnounceParams): string
```

Imports `formatDiscoverBadgeCopy` and `DiscoverBadgeResult` directly from
`@/features/discover/presentation/discoverBadge` (not via the MapDiscovery.tsx
re-export shim), and `CITY_CONFIG` directly from `@/lib/localityUtils`. `useState`/
`useRef`/`useEffect` from `react`. `AreaPoint` from
`@/components/map/AreaMarkerLayer`, `AreaGroup` from `@/hooks/useAreaGroups`
(same source modules the page itself imports these types from).

## Page rewire

`MapDiscovery.tsx`:
- Removed original L1265-1285 (three declarations).
- Replaced with:
  ```ts
  const announcedBadgeText = useDiscoverBadgeAnnounce({
    discoverBadge,
    selectedArea,
    focusedGroup,
    city,
    urlStateQ: urlState.q,
  });
  ```
  placed at the same location (after `areaResultSummaryText`, before the S7
  camera-orchestration comment).
- Added `import { useDiscoverBadgeAnnounce } from
  '@/features/discover/presentation/useDiscoverBadgeAnnounce';` near the other
  S9/S9b presentation-hook imports.
- The aria-live div (`data-testid="discover-badge-announce"`) is unchanged and
  still reads `{announcedBadgeText}`.
- `discoverBadge`, `focusedGroup`, `areaResultSummaryText`, and the S8
  fork-guard consts were NOT touched — all left page-local, exactly as
  instructed.
- `CITY_CONFIG`, `formatDiscoverBadgeCopy`, and `useRef`/`useState` remain
  imported/used elsewhere in the page (verified via search before removing
  anything) — no import was removed.

## Verification (cwd = worktree; commands run via `env -C <worktree-path>` after
discovering `cd &&` chaining is blocked and plain `cd` does not persist
between tool calls in this environment)

1. **`npx tsc -p tsconfig.app.json --noEmit`** — exit code 2 (project has
   pre-existing errors unrelated to this slice). **30 errors in 9 files**,
   identical file list/messages before (`git stash`) and after this change:
   `DiscoverRightPanel.agri.ac11.test.tsx`, `AreaSelectedPanel.tsx`,
   `PropertyMap.agri.test.tsx`, `useDuplicateManagement.ts`,
   `usePropertyListings.ts`, `useSimilarListings.ts`, `discoverMappers.ts`,
   `admin/Listings.tsx`. **Zero net-new errors; zero errors in any touched
   file** (`MapDiscovery.tsx`, `useDiscoverBadgeAnnounce.ts`,
   `useDiscoverBadgeAnnounce.test.ts` do not appear in the error list).

2. **`npx vitest run src/features/discover/presentation/useDiscoverBadgeAnnounce.test.ts`**
   — exit 0. **9 tests, 9 passed** (initial empty string; area-scoped "homes"
   copy; group-scoped "properties" copy; city-label fallback; raw-slug
   fallback when CITY_CONFIG has no entry; loading guard holds the previous
   value; `!visible` settles to `''`; debounce coalesces two rapid input
   changes into exactly one final value; unmount clears the pending timer
   with no act()/state-after-unmount warnings).

3. **`npm run build`** — exit 0 (Vite production build succeeded, no
   TypeScript/build errors).
   **`npx eslint src/pages/MapDiscovery.tsx
   src/features/discover/presentation/useDiscoverBadgeAnnounce.ts
   src/features/discover/presentation/useDiscoverBadgeAnnounce.test.ts`** —
   **0 errors**, 15 warnings total. Confirmed via `git stash`/`stash pop`
   diffing that `MapDiscovery.tsx` alone (pre-change) already produced the
   same 15 warnings, including an "Unused eslint-disable directive
   (react-hooks/exhaustive-deps)" warning at the *original* L1284 (the same
   disable, now relocated to the new hook file, line 57, producing the
   identical warning there instead) — i.e. this is pre-existing lint noise
   that traveled with the effect, not a new warning introduced by this slice.
   No other eslint-disable was added.

4. **`git diff --stat ed0def53 -- '**/*.test.ts' '**/*.test.tsx'`** — empty
   output. No existing test file was modified (the new
   `useDiscoverBadgeAnnounce.test.ts` is untracked/new, not an edit to an
   existing file).

## Per-line verbatim confirmation

Comparing the moved block (original MapDiscovery.tsx L1265-1285) against the
new hook body:
- L1265 `useState('')` → identical.
- L1266 `useRef<ReturnType<typeof setTimeout> | null>(null)` → identical.
- L1268 `if (discoverBadge.loading) return;` → identical (guard, comment
  identical).
- L1269 `if (badgeAnnounceTimer.current) clearTimeout(...)` → identical.
- L1270 `setTimeout(() => {`, 500ms → identical.
- L1271-1272 `!discoverBadge.visible ? '' :` → identical.
- L1273-1278 `formatDiscoverBadgeCopy(discoverBadge, { scopeLabel:
  selectedArea?.areaLabel ?? focusedGroup?.name ?? (CITY_CONFIG[city]?.label
  ?? city), noun: selectedArea ? 'homes' : 'properties', searchQuery:
  urlState.q })` → identical **except** `urlState.q` → `urlStateQ` (the one
  permitted rename).
- L1279 `setAnnouncedBadgeText(text);` → identical.
- L1281-1283 cleanup `return () => { if (badgeAnnounceTimer.current)
  clearTimeout(...) };` → identical.
- L1284 `// eslint-disable-next-line react-hooks/exhaustive-deps` → identical.
- L1285 dep array `[discoverBadge, selectedArea, focusedGroup, city,
  urlState.q]` → identical **except** `urlState.q` → `urlStateQ` (the one
  permitted rename).

No branch reordering, no dep-array reordering, no other body change.

## No stop conditions triggered

- The cluster moved cleanly with only the `urlState.q` → `urlStateQ` rename
  — no functional change required.
- No input is defined after the original L1265 in a way that would create a
  TDZ issue — `discoverBadge`, `selectedArea`, `focusedGroup`, `city`,
  `urlState.q` are all defined earlier in the component body.
- No existing test needed an edit.
- No badge fork-guard const (S8, L1854-1868 in the original) was read by
  this cluster — out of scope, untouched.
