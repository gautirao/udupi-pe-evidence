import {
  DiscoverActionsContext,
  DiscoverNavContext,
  DiscoverShellContext,
  DiscoverViewportContext,
  useRequiredDiscoverContext,
} from './DiscoverContext';
import type { DiscoverViewport } from '@/hooks/useDiscoverUrlState';
import type {
  DiscoverActionsContextValue,
  DiscoverNavContextValue,
  DiscoverShellContextValue,
} from './types';

/**
 * Public facade API — EXACTLY four hooks, no mega-hook. A combined
 * `useDiscoverContext()` returning all four slices would let a consumer
 * subscribe to everything at once and reintroduce the very re-render storm
 * this facade exists to prevent (team-lead-plan.toml decisions.D1_facade.public_api).
 */

/** The full DiscoverUrlActions surface. Identity NEVER changes across renders. */
export function useDiscoverActions(): DiscoverActionsContextValue {
  return useRequiredDiscoverContext(DiscoverActionsContext, 'useDiscoverActions');
}

/** Canonical URL-derived nav state (city, areaKey, journey, filters, etc.) — everything except viewport. */
export function useDiscoverNav(): DiscoverNavContextValue {
  return useRequiredDiscoverContext(DiscoverNavContext, 'useDiscoverNav');
}

/** The current map viewport ({lat, lon, zoom}) only. Null when no viewport is in the URL. */
export function useDiscoverViewport(): DiscoverViewport | null {
  return useRequiredDiscoverContext(DiscoverViewportContext, 'useDiscoverViewport').viewport;
}

/** mobileView / setMobileView / isMobileShell — the mobile Map-List shell contract. */
export function useDiscoverShell(): DiscoverShellContextValue {
  return useRequiredDiscoverContext(DiscoverShellContext, 'useDiscoverShell');
}
