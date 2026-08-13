/**
 * Issue #2142 Commit 2 — thin re-export, NOT a physical relocation.
 *
 * `derivePanelContent`/`DiscoverPanelContent` already live at
 * `src/features/discover/utils/discoverPanelState.ts`, a shared module with
 * 6 other existing importers (right-panel routing tests, marker-popover
 * gating tests, `discoverLayerRegistry.ts` itself) beyond MapDiscovery.tsx.
 * Same rationale as `selectors/badgeCopy.ts`: physically moving it would
 * mean repointing every one of those importers, which is outside this
 * commit's allowed_files/blast-radius. Ownership of the actual logic stays
 * at `utils/discoverPanelState.ts`.
 */
export {
  derivePanelContent,
  type DiscoverPanelContent,
} from '@/features/discover/utils/discoverPanelState';
