/**
 * Issue #2142 Commit 2 — thin re-export, NOT a physical relocation.
 *
 * `deriveDiscoverBadge`/`formatDiscoverBadgeCopy` already live at
 * `src/features/discover/presentation/discoverBadge.ts`, a shared module
 * with its own existing importers and an existing AC-BADGE-FORK-GUARD
 * import-check test (from issue #1824, PR #1891) that pins WHO is allowed
 * to import it — moving the file would mean repointing every one of those
 * importers, which is outside this commit's allowed_files/blast-radius and
 * outside issue #2142's non-goal list ("Fixing any real product bug
 * discovered during extraction (file separately)").
 *
 * This re-export exists so `MapDiscovery.tsx` (and future controllers) can
 * import the badgeCopy selector from `selectors/`, satisfying #2142's "9
 * pure selector modules colocated under selectors/" acceptance criterion in
 * intent, without touching discoverBadge.ts's other callers or weakening
 * its #1824 import guard. Ownership of the actual logic stays at
 * `presentation/discoverBadge.ts`.
 */
export {
  deriveDiscoverBadge,
  formatDiscoverBadgeCopy,
  type DiscoverBadgeInput,
  type DiscoverBadgeResult,
  type DiscoverBadgeState,
} from '@/features/discover/presentation/discoverBadge';
