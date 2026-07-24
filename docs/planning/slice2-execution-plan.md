# Slice 2 Execution Plan — State, Navigation, URL, Side-Effect Ownership

**Status:** reconstructed 2026-07-24 against current `main` (after #1993/#1994/#1995/#1996/#1998 merged). The original plan was written as an untracked local file and was never committed. It was subsequently lost during workspace cleanup. This version incorporates every decision made in that discussion. Each PR below is filed and gated individually via its own Mode-3 PLAN_REVIEW when its turn comes. Business/visual behaviour change across the whole slice: **none** (internal only). **This document itself is committed via a small planning PR before any Slice-2 implementation issue is filed.**

## Precondition — now satisfied

- ~~#1990, #1963, #1991 merged~~ ✅ **done** (PRs #1993/#1994/#1995).
- ~~#1955 merged~~ ✅ **done** (PR #1978).
- Slice 1B fast-track (#1992) ✅ **done** (PR #1996) — introduces the `eslint.config.js` warn-only import-boundary rules that PR1's lint-promotion step later flips to `error`.
- The last Slice-1A-adjacent item, the `useCityLaunchNavigation` zod-fixture fix (#1997), ✅ **done** (PR #1998). Slice 1A is closed with one documented external exception (fingerprint-gate CI enforcement deferred solely because GitHub Actions billing is blocked; the local gate is seeded and working).

**Slice 2 may begin immediately.** Per explicit instruction: Slice 2 is the critical path to #1956 and does not wait on any remaining Slice-1B cleanup (there is none outstanding) or on anything else.

## Slice 2 is the critical path to #1956

#1956 extends three things Slice 2 must finish first: the `compatibility` URL domain (for its `node=` parameter + legacy-normalisation ladder), the `MapDiscovery.tsx` context-accessor ownership model (it edits `MapDiscovery.tsx` heavily), and the Category-C camera regression tests (as its own safety net for the `CameraIntent` consolidation). **Do not combine Slice 2 with Slice 3 or Slice 4** — those remain separate, later slices with their own plans.

## Shim closeout rule (binding on every PR below)

**Must reach zero before #1956 starts:** any shim involving URL state, navigation ownership, context accessors, camera ownership, the `MapDiscovery.tsx` reconstruction shim, or any other `MapDiscovery.tsx`-resident shim (the badge/count re-export). These are exactly the surfaces #1956 will heavily modify — PR1 kills the badge shim in-PR, PR5 kills the reconstruction shim; by the time PR5 merges, this set is at zero.

**May remain temporarily, tracked, non-blocking for #1956:** purely mechanical path-relocation shims from moving `shared/map/` infrastructure (`DrawControl`, `lib/map/*` geometry) and the Discover-only `utils/*` relocations. For each, the introducing PR must:
1. Record its exact current importers and a deletion AC (grep-to-zero condition).
2. Add a rule/comment preventing new consumers from importing through the old path — a `no-restricted-imports` entry where practical, otherwise a `@deprecated` doc-comment on the old-path re-export plus a code-reviewer checklist line.
3. **Not** get its own removal issue. All such shims are swept in **one consolidated post-#1956 shim-removal issue**, filed after #1956 lands, re-verifying importer counts at that time rather than trusting this plan's snapshot.

## Verified against current `main` (not the stale roadmap snapshot)

- `src/features/discover/views/DiscoverMapCanvas.tsx:37` — `import type { DiscoverBadgeResult } from '@/pages/MapDiscovery';` — confirmed still present, still the one inverted-dependency violation.
- The real `DiscoverBadgeResult` interface already lives at `src/features/discover/presentation/discoverBadge.ts:83` (established by prior work, #1824 S9a/S11a). `MapDiscovery.tsx` currently re-exports it for back-compat.
- **Actual badge-shim importer set (verified, corrects the roadmap's stale "5 test files" estimate):** `src/features/discover/views/DiscoverMapCanvas.tsx` (prod) + `.test.tsx` (test), `src/components/discover/DiscoverMapCountBadge.tsx` (prod) + `.test.tsx` (test) — **2 production + 2 test files**, all four straightforward to repoint.
- All other counts below (9/6/3 discover-utils importers, ~100 `MapDiscovery.tsx` accessor references, exhaustive-deps line numbers) are the roadmap's last-measured figures and **must be re-verified at each PR's own PLAN_REVIEW**, not trusted from this snapshot — files may have drifted further by the time each PR starts.

---

## PR1 — Dependency direction + `shared/map/` foundations

**Goal:** eliminate the one inverted dependency (`features/* → pages/*`) and establish `shared/map/` as a real destination, so the sibling-feature and features→pages `no-restricted-imports` rules become both correct and (once safe) enforceable at `error`.

**Rollback boundary:** fully self-contained — reverting this PR restores the old import paths and the `warn`-only lint state. No other PR depends on its shims existing at any specific location (only on the two lint zones being clear of violations, which PR1 itself achieves).

**Work:**
1. Repoint `DiscoverMapCanvas.tsx:37` and `DiscoverMapCountBadge.tsx:7` from `@/pages/MapDiscovery` to `@/features/discover/presentation/discoverBadge` directly. Update the 2 corresponding test files' imports. Delete the badge/count re-export block in `MapDiscovery.tsx`. **This shim is `MapDiscovery.tsx`-resident → must reach zero here, not deferred.**
2. Establish `src/shared/map/`; relocate `DrawControl.tsx` + `lib/map/{zoomPolicy,areaClusterSplit,areaMarkerBucketing,regionCompassLayout}.ts` behind re-export shims at their old paths. **These shims may remain temporarily** per the closeout rule — record importers + deletion AC, add a `no-restricted-imports` (or deprecation-comment) guard against new old-path imports.
3. Relocate Discover-only `utils/{discoverPanelState,discoverLayerRegistry,areaNameSummary}.ts` into `features/discover/` behind shims (re-verify the 9/6/3 importer counts at this PR's PLAN_REVIEW). Same temporary-shim tracking requirement.
4. Once (1)-(3) clear every existing `no-restricted-imports` violation, promote the rule from `warn` to `error` in `eslint.config.js`.
5. **Fold in** the one Category-B exhaustive-deps site that lives in a file this PR already touches: `DrawControl.tsx:82` (opportunistic, avoids a same-file follow-on dependency with PR6).

**Files (estimated diff ~250-350 lines, mostly relocation):** `DiscoverMapCanvas.tsx` (±2 lines), `DiscoverMapCanvas.test.tsx` (±1), `DiscoverMapCountBadge.tsx` (±2), `DiscoverMapCountBadge.test.tsx` (±1), `MapDiscovery.tsx` (-badge-shim-block only, top-of-file region), new `src/shared/map/**` (4 relocated files + 4 shim stubs, ~150-200 lines total mostly unchanged code), `utils/{discoverPanelState,discoverLayerRegistry,areaNameSummary}.ts` relocations + shims (~100-150 lines), `eslint.config.js` (small diff, promoting existing `warn` strings to `error`).

**Forbidden:** `App.tsx`; `MapDiscovery.tsx` body/`urlState` reconstruction (PR4/PR5's territory); `PropertyMap.tsx`, `SchoolMarkerLayer.tsx`, `SectorOverlay.tsx`, `SchoolZoneLabelLayer.tsx`, `PopularSchool*`, `utils/discoverGroupBounds.ts` (stay shared, do not move); `utils/macroRegionResolver.ts` (#1956 deletes it, leave untouched).

**Dependencies / merge order:** first PR in the slice, no dependency on any other Slice-2 PR. **Blocks nothing structurally**, but its lint-`error` promotion is the reason `no-restricted-imports` is trustworthy for every PR after it.

**Parallel with:** nothing needs to wait for this to *start*, but PR4 needs PR1's `MapDiscovery.tsx` top-of-file cleanup done first, so in practice PR1 lands before PR4 begins.

**Tests / AC:** typecheck green; full suite green; `BoundaryDrawStep.tsx` (broker consumer of `DrawControl`) and `useZoomBand.ts` (consumer of `zoomPolicy`) still compile; `no-restricted-imports` at `error` reports zero violations; the 4 badge-consumer files (2 prod + 2 test) compile/pass against the new import path.

**Overlap risk with #1956:** low. #1956's stated scope deletes `utils/macroRegionResolver.ts` (explicitly untouched here) and edits `MapDiscovery.tsx`'s body (this PR only touches its top-of-file badge re-export region, a disjoint area). No file-level collision expected.

**Risk tier:** Low-Medium.

---

## PR2 — Extract `useDiscoverUrlState` into logical domain modules

**Goal:** decompose the 1,106-line hook body into named capability domains (`viewport`, `city`, `agricultural`, `school`, `filters`, `area`) behind an unchanged public facade, so the file becomes independently reviewable/testable per domain instead of one monolith.

**Rollback boundary:** self-contained to `useDiscoverUrlState.ts` + its test file + new domain modules. The public `[state, actions]` signature and `DiscoverContext.tsx`'s `ACTION_KEYS` exhaustiveness check are the compile-time contract that makes a partial revert safe — any consumer-visible drift fails to compile.

**Work:** extract the six domains listed above (not `compatibility` — that is PR3). The single Category-A exhaustive-deps suppression at `useDiscoverUrlState.ts:818` (viewport-region code, re-verify the exact line at PLAN_REVIEW) is fixed here, not in PR6, since this PR already rewrites that region.

**Files (estimated diff: the largest in the slice — up to ~1,100 lines moved/restructured, but the vast majority is relocation of existing logic, not new logic):** `src/hooks/useDiscoverUrlState.ts` (facade shrinks toward its composition target), new `src/features/discover/state/url/{viewport,city,agricultural,school,filters,area}.ts`, `src/hooks/__tests__/useDiscoverUrlState.test.ts` (extend only, never weaken — this is the 3,703-line test asset, the single most important regression guard in the slice).

**Forbidden:** the public export signature of `useDiscoverUrlState`; `ACTION_KEYS` in `DiscoverContext.tsx`; `utils/macroRegionResolver.ts`; any consumer's import path (facade specifier is unchanged — **no shim needed for this PR**, it's a pure internal restructure).

**Dependencies / merge order:** depends on the precondition only, not on PR1 (different files) — **may start in parallel with PR1**, though landing PR1 first is preferred (see merge-order diagram) since it's the higher-value, lower-risk change to get in early. Blocks PR3 (same file, PR3 lands directly after this).

**Parallel with:** PR1 (different files). Not parallel with PR3 (same file, strict serial). Not the *same lane* as PR4/PR5 (different file — `MapDiscovery.tsx` vs `useDiscoverUrlState.ts`), so PR2+PR3 as a pair can run concurrently with PR4+PR5 as a pair.

**Tests / AC:** the full 3,703-line `useDiscoverUrlState.test.ts` runs and stays green after this PR; `ACTION_KEYS` compile check passes; facade converges toward its composition target (~150 lines of composition, not the original 1,106).

**Overlap risk with #1956:** **the highest in the slice.** #1956 extends this exact file's `compatibility`/`area` domains with the new `node=` parameter and legacy-normalisation ladder. Getting the domain boundaries right here directly determines how clean #1956's extension is. No file-level collision (this lands and merges before #1956 starts), but a *design* mismatch would force #1956 to rework domain boundaries PR2 chose.

**Risk tier:** **Medium-High — the highest-risk PR in the slice.** If the verified diff at implementation time is genuinely too large to review as one coherent unit, split into **at most two** PRs along the natural low-coupling/high-coupling seam (`viewport+city+agricultural+school` then `filters+area`) — default to one PR unless review actually shows it's unwieldy.

---

## PR3 — Establish the `compatibility` domain (the URL public-API seam for #1956)

**Goal:** extract the existing legacy-param normalisation logic (`groupId`/`region`/`areaKey`/`scope` → canonical forms) into a named `compatibility` domain, giving #1956 a stable, well-isolated seam to plug its `node=` parameter and stale-link resolution ladder into — without adding that new parameter itself.

**Rollback boundary:** self-contained to the same file/test-asset as PR2; a pure extraction, not a behaviour change, so reverting restores the pre-extraction inline logic with zero observable difference.

**Work:** move the existing legacy-handling logic (currently embedded in the monolith, now isolated post-PR2) into `src/features/discover/state/url/compatibility.ts`. **Do not add `node=` here** — that is #1956's job; this PR's only output is a clean extraction point.

**Files (estimated diff: small, ~100-200 lines — the compatibility logic itself is a modest fraction of the original 1,106-line function):** `src/hooks/useDiscoverUrlState.ts` (compatibility region), new `src/features/discover/state/url/compatibility.ts`, `src/hooks/__tests__/useDiscoverUrlState.test.ts`.

**Forbidden:** same as PR2 — public signature, `ACTION_KEYS`, `macroRegionResolver.ts`.

**Dependencies / merge order:** depends on PR2 (same file; per the roadmap's own domain ordering, `compatibility` lands after all six other domains).

**Parallel with:** PR1 (different files). Not parallel with PR2 (dependency). Can run alongside PR4/PR5 (different file).

**Tests / AC:** same test-asset gate as PR2; additionally confirm current legacy-param behaviour is byte-for-byte unchanged (re-verify occurrence counts — `groupId`/`areaKey`/`scope` — at PLAN_REVIEW rather than trusting the roadmap's dated figures) — this is a pure extraction, not a behaviour change, and the test must prove that.

**Overlap risk with #1956:** **direct and intentional — this PR's entire purpose is to be the seam #1956 extends.** No file-level collision (PR3 merges well before #1956 starts), but the domain's exact shape is load-bearing for #1956's implementation; get code-reviewer to scrutinise this one closely.

**Risk tier:** Medium — smaller and more isolated than PR2, but correctness matters disproportionately since #1956 builds directly on top of it.

---

## PR4 — Batch-migrate `MapDiscovery.tsx` consumers to the context/accessor ownership model

**Goal:** replace the ~100 flat `urlState.x` / `urlActions.x` references in `MapDiscovery.tsx` with the appropriate `useDiscoverNav()` / `useDiscoverViewport()` / `useDiscoverShell()` accessor calls (these four-way-split accessors already exist, pre-dating this slice) — the mechanical prerequisite for deleting the reconstruction shim in PR5.

**Rollback boundary:** self-contained to `MapDiscovery.tsx`'s body. A wrong accessor mapping fails to compile (the four-context split makes this a hard, not soft, safety net), so a partial/bad migration cannot silently ship.

**Work:** batch-replace all `urlState.x`/`urlActions.x` references. **This is a navigation-ownership / context-accessor migration → must complete before #1956**, per the shim closeout rule (the shim this sets up to delete lives in `MapDiscovery.tsx`, which #1956 edits heavily).

**Files (estimated diff: large but mechanical, ~100-150 changed lines across ~100 reference sites in one file):** `src/pages/MapDiscovery.tsx` (body only — not the top-of-file region PR1 already cleared).

**Forbidden:** `DiscoverContext.tsx` (accessors already exist, no change expected here); Category-D `useMemo` sites (5 in `MapDiscovery.tsx`, deferred to Slice 3 §3.1 — do not touch); `utils/macroRegionResolver.ts`.

**Dependencies / merge order:** depends on PR1 (top-of-file badge region must already be clear). Independent of PR2/PR3 (different file). Blocks PR5 (the shim deletion needs every reference migrated first).

**Parallel with:** PR2+PR3 as a pair (different file — `MapDiscovery.tsx` vs `useDiscoverUrlState.ts`). Not parallel with PR5 (dependency).

**Tests / AC:** typecheck catches every mis-mapped accessor at compile time; full suite green; no behaviour change (this is a pure ownership-model migration, the rendered output is identical).

**Overlap risk with #1956:** **direct — #1956's stated scope edits `MapDiscovery.tsx` heavily.** This is exactly why the shim closeout rule requires this PR (and PR5) to complete before #1956 starts: #1956 must find a clean, already-migrated file, not a half-migrated one mid-flight.

**Risk tier:** Low-Medium (mechanical, but touches ~100 sites in one file). If the verified diff is unwieldy for one review pass, split into **at most two** PRs (first half / second half of the references) — default to one PR.

---

## PR5 — Remove the reconstruction shim and obsolete compatibility code

**Goal:** delete the `urlState`/`urlActions` reconstruction block in `MapDiscovery.tsx` (the shim that existed purely so pre-PR4 flat references kept compiling) plus any now-dead compatibility code it exposed. **This is where all remaining `#1956`-blocking shims reach zero.**

**Rollback boundary:** small, near-mechanical deletion diff — trivially revertible (re-adds the reconstruction block) if anything downstream turns out to still need it.

**Work:** delete the reconstruction block; delete any obsolete compatibility code it was propping up.

**Files (estimated diff: small, ~10-30 lines — a deletion, not new logic):** `src/pages/MapDiscovery.tsx` (the reconstruction block region) and any now-dead compatibility code it exposed.

**Forbidden:** everything else — this should be a near-mechanical deletion diff, not an opportunity for other cleanup.

**Dependencies / merge order:** depends on PR4 fully merged (all ~100 references migrated, verified by `grep -n "urlState\.\|urlActions\." src/pages/MapDiscovery.tsx` returning 0 *before* this PR's diff even starts, then the shim block itself removed in this PR).

**Parallel with:** nothing meaningfully — it's the last step of the PR4/PR5 pair (Lane C). Can still run concurrently with PR2/PR3 (Lane B) or PR6 (different files).

**Tests / AC:** `grep -n "urlState\.\|urlActions\." src/pages/MapDiscovery.tsx` → 0; full suite green; typecheck green.

**Overlap risk with #1956:** this PR's entire purpose is to *eliminate* the overlap risk — once it merges, `MapDiscovery.tsx` has zero shim debt for #1956 to trip over.

**Risk tier:** Low.

---

## PR6 — Batch exhaustive-deps corrections (Categories A, B, E) + camera regression tests (Category C, tests-only)

**Goal:** clear the exhaustive-deps suppressions that are safe to fix now (Categories A, B, E — 16 of the 29 total, minus the 2 already folded into PR1/PR2), and write the camera/journey regression test suite (Category C) that becomes #1956's safety net — **without touching any camera production code**, since #1956 owns that consolidation.

**Rollback boundary:** each category's fix is independently revertible (different files, no shared state); the Category-C tests are pure additions with zero production-code risk.

**Work:**
- **Category A** (5 of 6 sites — the 6th, `useDiscoverUrlState.ts:818`, already fixed in PR2; re-verify exact remaining sites/lines at this PR's PLAN_REVIEW, they may have shifted): replace mount-only suppressions with a named `useMountEffect` (or documented ref guard). New test: "runs exactly once across N re-renders with changed inputs."
- **Category B** (7 of 8 sites — the 8th, `DrawControl.tsx:82`, already fixed in PR1; `DiscoverContext.tsx`'s site is behaviour-preserving/load-bearing — convert the suppression to an explicit named pattern, do not change its behaviour): extract each trigger key as a named derived value. New test: "re-fires on key change, does not re-fire on excluded-input change."
- **Category E** (3 data-fetch sites — pin exact current lines at this PR's PLAN_REVIEW, the roadmap only gives a count): convert to React Query derived state. New test: "no refetch on unrelated re-render."
- **Category C** (camera/journey, ~7 sites across `useDiscoverCameraOrchestration.ts`, `useDiscoverJourneyTransitions.ts`, `useDiscoverBadgeAnnounce.ts`, `AreaMarkerLayer.tsx`): **tests only, zero production dependency-array edits.** New regression test: "camera issues exactly one intent per navigation; a stale debounced viewport does not override it." Reuse the #1963 Leaflet mock (`PropertyMap.jitterDiagnostic.test.tsx`'s `mapStub`) rather than forking it.

**Files (estimated diff: ~15-20 named production sites for A/B/E, each a small localized change, plus 4 new/extended test files for all four categories):** the A/B/E production sites (excluding the 2 folded into PR1/PR2) + new test files for A/B/E/C.

**Forbidden:** the 7 Category-C production files (tests only, no dependency-array edits — this is the explicit exclusion #1956 owns); `MapDiscovery.tsx` (Category D, deferred to Slice 3 §3.1, not this slice); `useDiscoverUrlState.ts:818` and `DrawControl.tsx:82` (already handled in PR2/PR1, do not re-touch).

**Dependencies / merge order:** depends on the precondition, PR1 (DrawControl already relocated, so its dep-fix landed there), PR2 (viewport Category-A site already fixed there), and #1963 already merged (Leaflet mock reuse — already satisfied, part of the precondition).

**Parallel with:** everything — PR6 touches none of PR1-PR5's files (once its two folded exceptions are accounted for). Can run concurrently with the whole PR1→PR5 chain.

**Tests / AC:** all four new regression-test sets pass; full suite green; **explicit diff check that zero Category-C production files were modified** (this is the hard boundary the PR must prove, not just claim).

**Overlap risk with #1956:** Category C is **explicitly co-owned** — this PR delivers only the regression tests; #1956 does the actual `CameraIntent` consolidation and dependency-array correction using these tests as its safety net. No file-level collision (tests-only here). Categories A/B/E have no overlap with #1956's stated scope.

**Risk tier:** Low for A/B/E; the Category-C tests are low-risk to write (pure additions) but high-stakes to get behaviourally *correct* — they must encode intended behaviour, not incidental behaviour, since #1956 will trust them as ground truth. Get this reviewed carefully.

---

## Merge order

```
PRECONDITION (satisfied): #1990, #1963, #1991, #1992, #1997 all merged. #1955 already merged.

PR1  (dependency direction + shared/map/ + util relocation + lint promotion)
  │
  ├──> PR2  (useDiscoverUrlState domain split: viewport..area)
  │       │
  │       └──> PR3  (compatibility domain — the #1956 seam)
  │
  ├──> PR4  (MapDiscovery.tsx urlState.x → context accessors)
  │       │
  │       └──> PR5  (delete reconstruction shim — ALL #1956-blocking shims reach zero here)
  │
  └──> PR6  (exhaustive-deps A/B/E + Category-C tests) — independent, can run anytime after precondition

GATE before #1956: PR1-PR6 all merged. Badge shim (PR1) and reconstruction shim (PR5) both at zero.
                    shared/map/ + discover-utils relocation shims (from PR1) may remain, tracked,
                    with deletion ACs recorded and new-consumer imports discouraged — their removal
                    becomes ONE consolidated post-#1956 issue, not filed now.
```

PR2+PR3 (Lane B, `useDiscoverUrlState.ts`) and PR4+PR5 (Lane C, `MapDiscovery.tsx`) touch different files and can run **fully concurrently** once PR1 lands (PR1 clears the file-region both lanes need clean). PR6 touches none of PR1-PR5's files and can run **anytime after the precondition**, in parallel with everything.

## Post-#1956 follow-up (not part of Slice 2, do not file now)

One consolidated issue, filed after #1956 lands: migrate any remaining consumers of the `shared/map/` and discover-utils old-path shims (introduced in PR1) to their new paths, then delete the shims. Re-verify exact importer counts at that time — do not trust this plan's snapshot, which will be stale by then.

## Open questions to resolve at each PR's own PLAN_REVIEW (not blocking this planning PR)

1. Exact current line sites for Category E (3 data-fetch effects) and the surviving Category A/B sites — pin by grep at PR6's PLAN_REVIEW, not from this document.
2. Whether PR2 or PR4 need splitting into two depends on the actual diff size at implementation time — default to one PR each, split only if review shows it's genuinely unwieldy.
3. Re-verify the 9/6/3 discover-utils importer counts (PR1) and the ~100 `MapDiscovery.tsx` reference count (PR4) at their respective PLAN_REVIEWs.
