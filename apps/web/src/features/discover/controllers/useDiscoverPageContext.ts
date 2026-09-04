import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  useDiscoverActions,
  useDiscoverNav,
  useDiscoverShell,
  useDiscoverViewport,
} from '@/features/discover/context/useDiscoverContext';
import { computeDiscoverLayer, toLayerInput } from '@/features/discover/selectors/mapLayerCategory';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

/**
 * Issue #2142 (correction pass) — the Discover page's AMBIENT CONTEXT.
 *
 * Owns exactly two kinds of thing, and deliberately nothing else:
 *
 *  (a) The providers this route is mounted under — router, auth, toast,
 *      query client, and the four DiscoverProvider facades (nav / viewport /
 *      actions / shell). These are route bootstrap, not domain state.
 *
 *  (b) The handful of PURE URL-derived facts that are page-global: each is a
 *      total function of `nav` alone, and each is consumed by three or more
 *      different capability controllers, so it belongs to no single one of
 *      them. Putting them here is what stops three controllers each deriving
 *      their own `panelContent` / `intentListingPurpose` and drifting.
 *
 * NOT A CATCH-ALL. The admission rule is narrow and testable: a value may
 * live here only if it is (i) provider access, or (ii) a pure function of
 * `nav` with no other input and more than two independent consumers. Anything
 * that reads fetched data, owns mutable state, or belongs to one capability
 * goes in that capability's controller instead. `__tests__/pageContextScope.guard.test.ts`
 * enforces the "no data-hook imports" half of that rule mechanically.
 */
export function useDiscoverPageContext() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  // Issue #1953 (build step 2) — MapDiscovery is no longer a production caller
  // of useDiscoverUrlState(); it consumes the DiscoverProvider facade instead
  // (team-lead-plan.toml decisions.D1_facade.sole_caller). Issue #2003 PR4
  // (rework) — the former flat accessor call sites below have been migrated
  // to nav / viewport / actions directly. Issue #2004 PR5 — the remaining
  // whole-object consumers (useMarkerSelection, useDiscoverPageState,
  // useDiscoverJourneyTransitions, useDiscoverCameraOrchestration,
  // toLayerInput, etc.) now each build their own `{ ...nav, viewport }
  // satisfies DiscoverUrlState` inline at the call site — there is no
  // module-level shim reconstructing the whole object; nav/viewport/actions
  // remain all sourced from the one provider-owned useDiscoverUrlState() call.
  const nav = useDiscoverNav();
  const viewport = useDiscoverViewport();
  const actions = useDiscoverActions();
  // Issue #1953 (build step 3, RH4 narrowed) — mobileView keys the
  // viewport tracker's clear-on-leave-MAP effect. Build step 4 —
  // isMobileShell/setMobileView drive the mobile List<->Map full-screen
  // overlay shell.
  const { mobileView, isMobileShell, setMobileView, isAreaSetDraftOpen } = useDiscoverShell();
  const mobileMapOpen = isMobileShell && mobileView === 'MAP';
  // A stable command, so the page shell's trigger prop does not get a fresh
  // identity every render. Presentation-only: mobileView is plain component
  // state and this never touches the URL or history (issue #2088/#1953 —
  // "Map/List is not a second navigation model").
  const openMobileMap = useCallback(() => setMobileView('MAP'), [setMobileView]);
  const isAuthenticated = !authLoading && user !== null;
  // Issue #1160 v3 Bug A1 — TanStack Query client used to read cached useSchoolById
  // result synchronously inside handleSelectSchoolById. See that callback for details.
  const queryClient = useQueryClient();

  // a3 — map container ref for MarkerPopoverCard auto-positioning (clamp-to-bounds).
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  // Issue #1745 P2 — routed through the layer-registry façade (discoverLayerRegistry.ts)
  // rather than calling derivePanelContent directly. computeDiscoverLayer delegates to
  // derivePanelContent by construction, so this is behaviour-preserving.
  const panelContent = computeDiscoverLayer(toLayerInput({ ...nav, viewport } satisfies DiscoverUrlState));

  // Issue #1494 — map URL intent ('buy'|'rent') to backend listingPurpose
  // ('sale'|'rent'). 'buy' is the default; absent/invalid intent → 'sale'.
  // Never send 'buy' to the backend. Page-global (needed by geography/
  // results/school/agri controllers too), so it lives here rather than
  // inside any one controller.
  const intentListingPurpose: string = nav.intent === 'rent' ? 'rent' : 'sale';

  // MVP2 — in the agri-first journey the school controls are not part of the flow.
  // Hide (do not disable) the "Near a school" trigger button and the NearSchoolSheet
  // mount so a user in agri-first cannot open the school sheet (which would call
  // setSchoolJourney and flip the journey to school-first). Single boolean gate.
  const isAgriJourney = nav.journey === 'agri-first';

  // Issue #1597 — early derivation of PropertyFilters from URL state, available before
  // useDiscoverPageState is called. Used by the group-results listings query so it respects
  // active discover filters (propertyTypes, price, bedrooms, etc.).
  // Mirrors the nav.filters → PropertyFilters mapping in useDiscoverPageState's useState
  // initializer. dateFrom/dateTo are ISO strings in URL state; PropertyFilters expects Date.
  // schoolLat/schoolLon/polygon are NOT included: group-results is not a school or polygon state.
  const urlDiscoverFilters: PropertyFilters = useMemo(() => {
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
  // nav.filters object identity changes on every URL change — use the individual
  // scalar fields as deps so React can skip re-derivation when nothing changed.
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

  return {
    navigate,
    authLoading,
    isAuthenticated,
    toast,
    queryClient,
    nav,
    viewport,
    actions,
    mobileView,
    isMobileShell,
    setMobileView,
    // Issue #2017 (owner-directed desktop rework) — threaded through the same
    // page-context facade as isMobileShell/mobileView above, down to
    // DiscoverRightPanel's `isAreaSetDraftOpen` prop (see that prop's own
    // doc for why it's prop-threaded rather than read via a bare
    // `useDiscoverShell()` call at the DiscoverRightPanel leaf).
    isAreaSetDraftOpen,
    mobileMapOpen,
    openMobileMap,
    mapContainerRef,
    panelContent,
    intentListingPurpose,
    isAgriJourney,
    urlDiscoverFilters,
  };
}
