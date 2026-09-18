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
import { useCallback, useState } from 'react';
import type { AreaSetAddResult } from '@/features/discover/state/useAreaSetDraft';

export interface DraftAreaStats {
  eligibleListingCount: number;
  schoolCount: number;
}

export interface AreaSetDraftCommandsWithCandidate extends AreaSetDraftCommands {
  addCandidate(candidate: { areaKey: string; eligibleListingCount: number; schoolCount: number }): AreaSetAddResult;
}

export interface AreaSetDraftContextValue {
  view: AreaSetDraftView;
  commands: AreaSetDraftCommandsWithCandidate;
  draftMemberStatsByAreaKey: Record<string, DraftAreaStats>;
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
  const { view: draftView, commands: baseCommands } = useAreaSetDraft(nav.resultScope?.active ?? null);

  const [draftMemberStatsByAreaKey, setDraftMemberStatsByAreaKey] = useState<Record<string, DraftAreaStats>>({});

  const addCandidate = useCallback(
    (candidate: { areaKey: string; eligibleListingCount: number; schoolCount: number }): AreaSetAddResult => {
      const result = baseCommands.add(candidate.areaKey);
      if (result === 'added') {
        setDraftMemberStatsByAreaKey((prev) => ({
          ...prev,
          [candidate.areaKey]: {
            eligibleListingCount: candidate.eligibleListingCount,
            schoolCount: candidate.schoolCount,
          },
        }));
      }
      return result;
    },
    [baseCommands],
  );

  const add = useCallback(
    (areaKey: string): AreaSetAddResult => {
      return baseCommands.add(areaKey);
    },
    [baseCommands],
  );

  const remove = useCallback(
    (areaKey: string) => {
      baseCommands.remove(areaKey);
      setDraftMemberStatsByAreaKey((prev) => {
        if (!(areaKey in prev)) return prev;
        const next = { ...prev };
        delete next[areaKey];
        return next;
      });
    },
    [baseCommands],
  );

  const clear = useCallback(() => {
    baseCommands.clear();
    setDraftMemberStatsByAreaKey({});
  }, [baseCommands]);

  const resetToCommitted = useCallback(() => {
    baseCommands.resetToCommitted();
    setDraftMemberStatsByAreaKey({});
  }, [baseCommands]);

  const commands = useMemo<AreaSetDraftCommandsWithCandidate>(
    () => ({
      ...baseCommands,
      add,
      addCandidate,
      remove,
      clear,
      resetToCommitted,
    }),
    [baseCommands, add, addCandidate, remove, clear, resetToCommitted],
  );

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

  // Issue #2456 — the same intent → listingPurpose mapping the listings query
  // uses (useDiscoverPageContext's intentListingPurpose: 'buy'/absent → 'sale',
  // 'rent' → 'rent'; never send 'buy'). Duplicated here rather than read via
  // useDiscoverPageContext because this provider sits above that facade; it
  // is a total function of nav.intent, so the two cannot drift.
  const listingPurpose = nav.intent === 'rent' ? 'rent' : 'sale';

  // Node-only URL (no `city=` param) leaves nav.city === '', which would
  // silently disable this fetch — fall back to the established
  // `nav.city || DEFAULT_CITY` idiom.
  const { data, isLoading } = useNearbyAreaCandidates(
    nav.city || DEFAULT_CITY,
    draftView.draftAreaKeys,
    nearbyFilters,
    { listingPurpose },
  );

  const value = useMemo<AreaSetDraftContextValue>(
    () => ({ view: draftView, commands, draftMemberStatsByAreaKey, nearbyFilters, data, isLoading }),
    [draftView, commands, draftMemberStatsByAreaKey, nearbyFilters, data, isLoading],
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
