import { RoleAwareHeader } from '@/components/layout/AppLayout';
import { usePreviewCityIdentity } from '@/features/discover/state/usePreviewCityIdentity';

/**
 * Public-facing marketing header for the consumer Discover experience (Issue #1588 / #1646).
 * Delegates to RoleAwareHeader so all routes share the unified role-aware navigation zones.
 *
 * Issue #2166 — this header is also what renders inside an admin city-launch
 * revision preview (CityLaunchPreview -> MapDiscovery -> ... -> here), which
 * carries no `city=` URL param. usePreviewCityIdentity resolves the
 * previewed city's slug in that case so the nav links stay scoped to it
 * instead of RoleAwareHeader's own DEFAULT_CITY fallback. It is a no-op for
 * every live/public render of this header.
 *
 * While the previewed city's slug is still resolving (or fails to resolve —
 * see PR #2168 review), the public discovery nav links are suppressed
 * entirely rather than falling back to RoleAwareHeader's live-mode default,
 * which would silently re-leak `city=bangalore` into a preview session.
 */
export function PublicHeader() {
  const { citySlug, isUnresolvedPreview } = usePreviewCityIdentity();
  return (
    <RoleAwareHeader selectedCity={citySlug} suppressPublicDiscoveryNav={isUnresolvedPreview} />
  );
}


