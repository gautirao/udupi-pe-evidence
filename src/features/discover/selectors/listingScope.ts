/**
 * Issue #2142 Commit 2 — thin re-export, NOT a physical relocation.
 *
 * `resolveScope`/`ResolvedScope`/`ScopeNamespaces` already live at
 * `src/features/discover/presentation/resolveScope.ts`, a shared module
 * with 7 other existing importers (DiscoverRightPanel.tsx,
 * DiscoverRightPanelContainer.tsx, useDiscoverMapPresentation.ts,
 * useDiscoverCameraOrchestration.ts, and their tests) beyond
 * MapDiscovery.tsx. Same rationale as the other three re-exported
 * selectors in this directory: physically moving it would mean repointing
 * every one of those importers, which is outside this commit's
 * allowed_files/blast-radius. Ownership of the actual logic stays at
 * `presentation/resolveScope.ts`.
 */
export {
  resolveScope,
  type ResolvedScope,
  type ScopeNamespaces,
} from '@/features/discover/presentation/resolveScope';
