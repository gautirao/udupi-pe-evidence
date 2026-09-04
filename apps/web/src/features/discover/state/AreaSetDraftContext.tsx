import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDiscoverNav } from '@/features/discover/context/useDiscoverContext';
import {
  useAreaSetDraft,
  type AreaSetDraftView,
  type AreaSetDraftCommands,
} from '@/features/discover/state/useAreaSetDraft';
import {
  useNearbyAreaCandidates,
  type NearbyAreaCandidatesResponse,
} from '@/hooks/useNearbyAreaCandidates';
import { PropertyFilters } from '@/hooks/usePropertyListings';
import { DEFAULT_CITY } from '@/lib/localityUtils';

/**
 * Issue #2017 — shared AREA_SET draft + nearby-candidate state, extracted out
 * of AreaSetChips.tsx so DiscoverMapCanvas (for its planned marker-callout
 * wiring — areaSetCandidateKeys/onAreaSetCandidateSelect) can read the SAME
 * draft/candidate state that drives the chip strip, instead of calling
 * useAreaSetDraft/useNearbyAreaCandidates a second time and risking a
 * desynchronized second instance. This is a pure "move the hook calls behind
 * a context" refactor — AreaSetChips.tsx's own rendered output/behavior is
 * unchanged; see AreaSetDraftContextValue below for exactly what it consumes.
 */
export interface AreaSetDraftContextValue {
  view: AreaSetDraftView;
  commands: AreaSetDraftCommands;
  /** Active discover filters, in the shape passed to useNearbyAreaCandidates. Also used by AreaSetChips for its hasActiveFilters empty-state copy. */
  nearbyFilters: PropertyFilters;
  data: NearbyAreaCandidatesResponse | undefined;
  isLoading: boolean;
}

const AreaSetDraftContext = createContext<AreaSetDraftContextValue | null>(null);

export interface AreaSetDraftProviderProps {
  children: ReactNode;
}

export function AreaSetDraftProvider({ children }: AreaSetDraftProviderProps) {
  const nav = useDiscoverNav();
  const { view: draftView, commands } = useAreaSetDraft(nav.resultScope?.active ?? null);

  // Code-review Finding 2 (PR #2424) — active discover filters, derived from
  // nav.filters (URL state) into the PropertyFilters shape the backend query
  // param serializer (buildDiscoverSearchParams) expects. Copied verbatim
  // from AreaSetChips.tsx's own derivation (see that file's history) — kept
  // here now that it feeds useNearbyAreaCandidates from this provider.
  const nearbyFilters: PropertyFilters = useMemo(() => {
    const f = nav.filters;
    return {
      propertyTypes: f.propertyTypes as PropertyFilters['propertyTypes'],
      bedrooms: f.bedrooms,
      priceMin: f.priceMin,
      priceMax: f.priceMax,
      sellerTypes: f.sellerTypes,
      boardFilters: f.boardFilters,
      categoryFilters: f.categoryFilters,
      backOnMarket: f.backOnMarket,
      newToMarket: f.newToMarket,
      reraRegistered: f.reraRegistered,
      readyToMove: f.readyToMove,
      dateFrom: f.dateFrom ? new Date(f.dateFrom) : undefined,
      dateTo: f.dateTo ? new Date(f.dateTo) : undefined,
    };
    // nav.filters object identity changes on every URL change — use the
    // individual scalar fields as deps so React can skip re-derivation when
    // nothing changed. Mirrors useDiscoverPageContext.ts's urlDiscoverFilters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nav.filters.propertyTypes,
    nav.filters.bedrooms,
    nav.filters.priceMin,
    nav.filters.priceMax,
    nav.filters.sellerTypes,
    nav.filters.boardFilters,
    nav.filters.categoryFilters,
    nav.filters.backOnMarket,
    nav.filters.newToMarket,
    nav.filters.reraRegistered,
    nav.filters.readyToMove,
    nav.filters.dateFrom,
    nav.filters.dateTo,
  ]);

  // Node-only URL (no `city=` param) leaves nav.city === '', which would
  // silently disable this fetch — fall back to the established
  // `nav.city || DEFAULT_CITY` idiom.
  const { data, isLoading } = useNearbyAreaCandidates(
    nav.city || DEFAULT_CITY,
    draftView.draftAreaKeys,
    nearbyFilters,
  );

  const value = useMemo<AreaSetDraftContextValue>(
    () => ({ view: draftView, commands, nearbyFilters, data, isLoading }),
    [draftView, commands, nearbyFilters, data, isLoading],
  );

  return <AreaSetDraftContext.Provider value={value}>{children}</AreaSetDraftContext.Provider>;
}

/** Throws a clear error when called outside <AreaSetDraftProvider> — mirrors DiscoverContext.tsx's useRequiredDiscoverContext pattern, with its own message (that helper hardcodes "DiscoverProvider"). */
export function useAreaSetDraftContext(): AreaSetDraftContextValue {
  const value = useContext(AreaSetDraftContext);
  if (value === null) {
    throw new Error('useAreaSetDraftContext must be used within a <AreaSetDraftProvider>');
  }
  return value;
}
