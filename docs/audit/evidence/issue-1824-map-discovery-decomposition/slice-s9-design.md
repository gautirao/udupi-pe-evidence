# Issue #1824 — Slice S9 Design (helper-band relocation + presenter hook → SPLIT S9a/S9b)

Phase 0.7 for S9. Baseline `origin/main @ 77b76119` (S1-S8 merged; MapDiscovery.tsx = 3342). Read-only: explorer-planner inventory + architect design (line numbers verified against the file; import-graph via jCodemunch find_importers/find_references). No production code changed.

## Headline — SPLIT S9 into S9a → S9b

The Main Agent framed S9 as one slice (helpers + presenter hook). The architect recommends **splitting**, ordered helpers-first:
- **S9a (this packet):** relocate the ~608-LOC exported-pure-helpers band (L83-690) into `src/features/discover/presentation/` + a re-export shim in MapDiscovery.tsx. Near-mechanical, byte-for-byte, **Low/Med risk**. 3342 → ~2750.
- **S9b (next slice):** extract the ~520-LOC presentation-model derivations (overviewAreas, discoverBadge, areaResultSummaryText, segment builders, count memos) into a presenter hook `useDiscoverMapPresentation`. Behaviour-sensitive, **High risk**. ~2750 → ~2270.

**Why split:** divergent risk tiers (a mechanical move vs a behaviour-sensitive derivation extraction with the overviewAreas 6-branch monster + the Critical discoverBadge); combining forces the whole PR to High and couples rollback. And S9b's hook CALLS the relocated helpers, so helpers-first gives it a stable canonical module.

**<800 is NOT reached by S9.** post-S9a ~2750; post-S9b ~2270; then S10 (event handlers/effects → useDiscoverMapHandlers) + S11 (JSX return → sub-view components) to reach <800. Flagged so 3342→<800 isn't assumed to close at S9.

## OQ1 — RE-EXPORT SHIM (decisive)

Do tests/components import the helpers from `@/pages/MapDiscovery`? **YES, and the importer list is PROVABLY non-exhaustive:** a `search_text` for `from '@/pages/MapDiscovery'` did NOT surface `src/components/discover/DiscoverMapCountBadge.tsx` even though its L7 type-imports `DiscoverBadgeResult` from there. So "update-all-imports" would risk a build break from a missed importer.

**Decision:** move the helpers to the new module AND keep a **re-export shim** in MapDiscovery.tsx (`export { … } from '<new module>'; export type { … } from '<new module>';`). Every importer — the 3-4 unit tests + DiscoverMapCountBadge + any unchecked ones — resolves UNCHANGED; the importer count becomes irrelevant; and it matches the pattern already in this file (`isNew` re-export L79-80). Dropping the shim + repointing importers (build-verified) is a DEFERRED cleanup slice, not S9a.

## S9a scope

- Move the 10 exported functions (deriveDiscoverBadge L198-358 ~160LOC; formatDiscoverBadgeCopy L365-394; deriveSchoolFirstLanding/Zone/AreaSchoolCount; deriveShowSchoolMarkers; deriveSchoolRadiusPillNoun; applyAnonPropertyFilters L540-611; deriveAnonSchoolRadiusMarkers; hasActiveAnonPropertyFilter) + 7 exported types (DiscoverBadgeInput/State/Result, SchoolFirst*CountInput, ShowSchoolMarkersInput) + internal rupeesToPaise, BYTE-FOR-BYTE, into `src/features/discover/presentation/` (3 files: discoverBadge.ts / schoolFirstCounts.ts / anonPropertyFilters.ts — or a single barrel; either fine).
- Add the re-export shim barrel in MapDiscovery.tsx. `isNew` (L80) stays (already a re-export of @/lib/isNew).
- NO derivation/hook/JSX (S9b/S10/S11). NO importer repointing (deferred). NO test edits.

## Importer set (architect-verified, but the SHIM makes exhaustiveness moot)

- `MapDiscovery.school-pill.test.tsx` — deriveShowSchoolMarkers, deriveSchoolFirstLanding/Zone/AreaSchoolCount, deriveSchoolRadiusPillNoun, deriveDiscoverBadge.
- `MapDiscovery.issue1152.test.ts` + `MapDiscovery.issue1175.test.ts` — deriveDiscoverBadge, formatDiscoverBadgeCopy (+ type DiscoverBadgeInput).
- `MapDiscovery.anon-school-radius.test.ts` + `MapDiscovery.test.tsx` — applyAnonPropertyFilters, deriveAnonSchoolRadiusMarkers, hasActiveAnonPropertyFilter.
- `src/components/discover/DiscoverMapCountBadge.tsx` L7 — `type DiscoverBadgeResult` (the search-missed production importer; tsc is its gate).

## Behaviour-preservation / risk

- Byte-for-byte function bodies + type definitions; no signature/logic edit. deriveDiscoverBadge (badge-truthfulness #1152/#1175) is the highest-care body.
- The moved-but-unchanged unit tests ARE the equivalence proof (resolve to the same functions via the shim). tsc/build is the authoritative no-broken-importer gate (a missed importer fails the build).
- Risk: **Low/Med.** No live 7A (pure relocation; unit + mount + tsc/build proof). Standard code-reviewer sufficient (opus optional given the badge-truthfulness helper).

## Regression test map (no new tests)

- deriveDiscoverBadge/formatDiscoverBadgeCopy → issue1152 + issue1175 (green UNCHANGED via shim).
- school-count derivers → school-pill (green UNCHANGED).
- anon filters → anon-school-radius + MapDiscovery.test.tsx (green UNCHANGED).
- DiscoverBadgeResult type → DiscoverMapCountBadge tsc resolves (the search-missed importer).
- end-to-end → the full MapDiscovery mount suite green UNCHANGED.

## S9b preview (next slice, NOT this packet)

`useDiscoverMapPresentation` (src/features/discover/presentation/), FLAT return, wide typed inject. Moves (dependency-ordered): focusedGroup/focusedGroupAreas → cityTotal/groupListingsCount → schoolListings/count memos → discoverBadge → areaResultSummaryText (single copy-fork source) → overviewAreas (236 LOC, HIGHEST risk, #1655/#1745/#1815) → segment builders/regionOverview*. Imports the relocated helpers from the new module. __debug/aria-live/mapBbox/handlers/JSX stay in the page. High risk.

## Open questions (for PLAN_REVIEW)

1. OQ-SPLIT: ratify S9a/S9b (this packet = S9a only).
2. OQ-MODULE: 3-file split vs single barrel — non-blocking.
3. OQ-<800: S9 lands ~2270; S10 (handlers) + S11 (JSX) needed to reach <800 — confirm.
