/**
 * useDiscoverAreaNavigationPath — Issue #1956 PR 6 (rework, [rulings.oq_a_v2]).
 *
 * Thin client caller for
 * `GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path`
 * (`NavigationController#getAreaPath`) — the SAME cached graph the rest of the
 * canonical navigation surface reads, so this convergence path can never
 * disagree with guided-navigation ancestry for a given revision.
 *
 * ── WHY THIS EXISTS ──
 * [implementation_reuse_seams] in the approved PR-6 rework handoff identified
 * this endpoint as the sanctioned resolution path, but the client wrapper the
 * delivery plan assumed already existed (this file) was never built. This is
 * that missing thin caller — reuse of an existing SERVER contract, not new
 * backend surface, and not the broader `#2059` producer-convergence work
 * (that issue owns migrating `AreaCtaBlock`/`AreaGuide`/`AreaGuideHero`; this
 * hook has exactly one caller — the in-app JourneySwitcher conversion seam in
 * `DiscoverRightPanelContainer.tsx`).
 *
 * ── THE FRONTEND NEVER CONSTRUCTS NODE KEYS ──
 * The resolved `nodeKey` comes back verbatim from the server. This module
 * never concatenates a `d:`/`c:`/`a:` prefix onto an `areaKey` — hardcoding
 * that formula client-side is the guessed-template antipattern that produced
 * the `macroRegionResolver` problem (see `types.ts`'s and `navigation.ts`'s
 * own module docs for the fuller history).
 *
 * ── MUTATION, NOT QUERY ──
 * This is triggered by a single in-app user action (a JourneySwitcher click),
 * not rendered reactively off the URL — `useMutation` gives the caller an
 * imperative, awaitable trigger (`mutateAsync`/`mutate` with `onSuccess`/
 * `onError` callbacks) to sequence "resolve, THEN write the URL once" without
 * a separate `useEffect` watching query state.
 */
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { NavigationPathResponse } from './types';

export interface ResolveAreaNavigationPathParams {
  city: string;
  areaKey: string;
}

export function useDiscoverAreaNavigationPathResolver() {
  return useMutation<NavigationPathResponse, ApiError, ResolveAreaNavigationPathParams>({
    mutationFn: async ({ city, areaKey }) => {
      const path = `/api/discover/cities/${encodeURIComponent(city)}/areas/${encodeURIComponent(areaKey)}/navigation-path`;
      return api.get<NavigationPathResponse>(path);
    },
  });
}
