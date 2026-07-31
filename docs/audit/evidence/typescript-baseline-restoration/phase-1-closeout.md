# Issue #1850 — TypeScript baseline restoration: Phase 1 closeout

**Status as of 2026-07-13: Phase 1 complete. Programme paused by explicit user decision — not closed, not abandoned.**

## Result

| | Before | After |
|---|---|---|
| `tsc --noEmit -p tsconfig.app.json` errors | 121 | **30** |
| Affected files | ~45 | (see remaining-30 breakdown below) |

Verified fresh on current `main` @ `802bc95b` (post #1859 merge): `node node_modules/.bin/tsc --noEmit -p tsconfig.app.json` → exit 2, 30 error lines. No undocumented regressions.

## What Phase 1 covered

- **Slices 1–6** (PRs #1853, #1855, #1858, #1862, #1866, #1869): React-Query v5 mock typing, stale import paths, test-environment typing, Supabase-generated column drift, localized production/test typing fixes. 121 → 44.
- **Issue #1859** (PR #1872, spun out of Slice 3 rather than papered over with a cast): the architect-gated `PropertyType` product-type defect — two silently-diverged type definitions unified to one, DB-superset widened correctly (agricultural_land/villa/residential_plot/other), 5 exhaustive `Record<PropertyType>` maps corrected. 44 → **30**.

This was the major architect-gated family in the original 121-error inventory. Its resolution is the natural boundary for this phase.

## What's left (30 errors, all previously documented, all out of the approved Slice 1–6 / #1859 scope)

Per `.claude/handoffs/issue-1859/team-lead-plan.toml [tsc_impact].errors_that_DO_NOT_resolve` and `.claude/handoffs/issue-1850/team-lead-execution-log.md` (Slice 6 closeout):

1. **String-looseness** (e.g. `AreaSelectedPanel.tsx` and related discover-panel typing) — DB-column-typed-as-`string` vs narrower literal unions.
2. **Fixture-shape (`TS2740`)** — pre-existing incomplete test fixtures (e.g. `PropertyMap.agri.test.tsx`), not a product defect.
3. **Reverse-enum-narrowing** — consumers narrowing a wide DB-column type back down without a runtime guard (e.g. `useDuplicateManagement.ts`, remnants in `usePropertyListings.ts`).
4. **Issue #1870** — `Listings.tsx:409/422` (`seller_type` literal union narrower than the DB column). Explicitly deferred during #1850 Slice 6 to avoid crossing into the (at the time) #1859-gated `usePropertyListings.ts`. Tracked as its own issue; not folded back into this count implicitly — verify overlap with the 30 before scoping further work.

None of these were part of any approved Slice 1–6 or #1859 plan. They were classified and explicitly carried forward, not silently dropped.

## Decision: pause here

Per explicit user instruction (2026-07-13): do not open a new catch-all cleanup slice against the remaining 30. Any further #1850 work must first regroup these 30 into coherent, independently reviewable clusters with clear product-defect-vs-typing-only boundaries, then go through PLAN_REVIEW as a fresh slice — the same discipline applied to Slices 1–6 and #1859.

Issue #1850 stays open as the umbrella tracker for that future work. Issue #1870 stays tracked separately and is not to be absorbed into a future #1850 slice without its own scoping pass.
