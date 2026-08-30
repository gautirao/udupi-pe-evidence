import { useCityLaunchList } from '@/hooks/useCityLaunch';
import { useDiscoverSource } from '@/features/discover/state/DiscoverDataSourceContext';

export interface PreviewCityIdentity {
  /** The previewed city's slug, once resolved. Always undefined in live mode. */
  citySlug: string | undefined;
  /**
   * True only in preview mode while `citySlug` is not yet resolved — pending
   * lookup, a failed request, or the previewed cityId missing from the
   * city-launch list. Callers MUST fail closed on this (no navigation
   * scoped to a live-mode default) rather than treat an undefined
   * `citySlug` as "no override" the way they would in live mode.
   */
  isUnresolvedPreview: boolean;
}

/**
 * Issue #2166 — resolves the citySlug of the city currently being previewed
 * via an admin city-launch revision preview (DiscoverDataSourceProvider
 * mode:'preview'). In live mode returns `{citySlug: undefined,
 * isUnresolvedPreview: false}` (the default/majority case, no request
 * fired) — callers fall back to their own live-mode default exactly as
 * before this hook existed. In preview mode, `isUnresolvedPreview` stays
 * true (and `citySlug` undefined) through the pending/error/no-match
 * window, precisely so callers can fail closed instead of leaking the
 * live-mode default city (see PR #2168 review — a bare `undefined`
 * `citySlug` alone doesn't distinguish "live mode, no override needed"
 * from "preview mode, override not resolved yet").
 */
export function usePreviewCityIdentity(): PreviewCityIdentity {
  const source = useDiscoverSource();
  const cityList = useCityLaunchList({ enabled: source.mode === 'preview' });

  if (source.mode !== 'preview') {
    return { citySlug: undefined, isUnresolvedPreview: false };
  }
  const citySlug = cityList.data?.find((city) => city.cityId === source.cityId)?.citySlug;
  return { citySlug, isUnresolvedPreview: citySlug === undefined };
}
