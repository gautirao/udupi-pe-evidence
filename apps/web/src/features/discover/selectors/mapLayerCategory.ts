/**
 * Issue #2142 Commit 2 — thin re-export, NOT a physical relocation.
 *
 * `computeDiscoverLayer`/`toLayerInput`/`selectDiscoverMapLayer` and the
 * group-resolution helpers already live at
 * `src/features/discover/utils/discoverLayerRegistry.ts`, a shared module
 * with other existing importers (`useDiscoverJourneyPredicates.ts`, several
 * test files) beyond MapDiscovery.tsx. Same rationale as
 * `selectors/badgeCopy.ts`/`selectors/panelContent.ts`: physically moving
 * it would mean repointing every one of those importers, which is outside
 * this commit's allowed_files/blast-radius. Ownership of the actual logic
 * stays at `utils/discoverLayerRegistry.ts`.
 *
 * Re-exported from the CANONICAL path, not the `@/utils/discoverLayerRegistry`
 * shim MapDiscovery.tsx previously imported from — that shim is marked
 * `@deprecated` ("this back-compat shim is removed in the consolidated
 * post-#1956 shim-sweep issue"). Since this file is a fresh import site
 * anyway, pointing it straight at the canonical module is a zero-risk,
 * zero-behavior-change cleanup, not a new decision — no reason to add a new
 * consumer of a module the codebase already marked for deletion.
 */
export {
  computeDiscoverLayer,
  toLayerInput,
  selectDiscoverMapLayer,
  resolveActiveDiscoverGroup,
  type DiscoverMapLayerKind,
} from '@/features/discover/utils/discoverLayerRegistry';
