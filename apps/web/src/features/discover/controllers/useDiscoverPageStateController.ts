import { useDiscoverPageState } from '@/hooks/useDiscoverPageState';
import { resolveEffectiveSelectedArea } from '@/features/discover/selectors/effectiveArea';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { DiscoverUrlState, DiscoverUrlActions } from '@/hooks/useDiscoverUrlState';
import type { DiscoverPanelContent } from '@/features/discover/selectors/panelContent';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { PropertyListing, PropertyImage } from '@/hooks/usePropertyListings';

export interface UseDiscoverPageStateControllerParams {
  urlState: DiscoverUrlState;
  urlActions: DiscoverUrlActions;
  /** Issue #1956 PR-4 (Option C) — the canonical AREA-leaf bridge input. */
  nodeAreaPoint: AreaPoint | null;
  /** Pure URL-derived panel routing from the page context. */
  panelContent: DiscoverPanelContent;
  /** Issue #1374 — an agri polygon selection overrides the routed panel. */
  selectedMarkerListing: (PropertyListing & { images?: PropertyImage[] }) | null;
  /**
   * Issue #2419 (PR-1) — forwarded to `useDiscoverPageState`, which refuses an
   * anonymous POLYGON commit before any validation request. Optional so
   * fixtures that predate it keep compiling; see that hook's param doc for why
   * only an explicit `false` blocks and why optional is safe here.
   */
  isAuthenticated?: boolean;
  /**
   * Issue #2419 (PR-1) — whether auth is still resolving. Needed because
   * `isAuthenticated` is derived upstream as "not loading AND user present",
   * so it reads `false` during the load window for a shopper who IS signed in.
   * This controller turns that pair into the tri-state the gate wants; the
   * composition cannot, because it is composition-only and its structural
   * guard forbids derivations.
   */
  authLoading?: boolean;
}

/**
 * Issue #2142 (correction pass) — the Discover page's CORE URL-BACKED STATE.
 *
 * Wraps `useDiscoverPageState` (filters / selectedArea / panToArea / mapZoom /
 * mapReady / city / school selection / paging / the tick refs) and adds the
 * three derivations that are meaningless without it and were previously
 * stranded on the page beside it.
 *
 * SOLE OWNER of the legacy-vs-canonical AREA BRIDGE (`effectiveSelectedArea`,
 * issue #1956 PR-4 / issue #2083). That bug class recurred four times because
 * the raw legacy value and the bridged value were trivially confusable by
 * name. The rule, unchanged and now enforced by having exactly one producer:
 *
 *   ANY consumer that needs "the area the user currently has selected, however
 *   they got there" — badge/count copy, area-scoped links, area-scoped filters
 *   — MUST read `effectiveSelectedArea`, never `legacySelectedArea`.
 *   `legacySelectedArea` is correct ONLY for a branch that is provably
 *   legacy-areaKey-only (e.g. gated on journey === 'agri-first' /
 *   'school-first', journeys the canonical node hierarchy never touches).
 *
 * Both values are returned, under those two deliberately non-confusable names,
 * so every downstream consumer must make a DELIBERATE choice rather than
 * grabbing the wrong one by habit.
 */
export function useDiscoverPageStateController({
  urlState,
  urlActions,
  nodeAreaPoint,
  panelContent,
  selectedMarkerListing,
  isAuthenticated,
  authLoading,
}: UseDiscoverPageStateControllerParams) {
  // `selectedArea` is renamed OUT of the spread on purpose: this controller
  // must not re-expose the confusable raw name at all (issue #2083 cycle 4,
  // 4th recurrence of the bug class). Downstream can only reach it as
  // `legacySelectedArea`.
  const { selectedArea: legacySelectedArea, ...pageState } = useDiscoverPageState({
    urlState,
    urlActions,
    // Issue #2419 (PR-1) — `undefined` while auth is still resolving, so the
    // signed-in gate never refuses a shopper who is in fact signed in and
    // merely mid-load. Only an explicit `false` blocks.
    isAuthenticated: authLoading ? undefined : isAuthenticated,
  });

  // Issue #1956 PR-4 (Option C) — bridges nodeAreaPoint into every existing
  // selectedArea-driven gate/consumer. Falls back to the legacy
  // areaKey-driven `selectedArea` FIRST, so nothing changes for any
  // pre-existing journey; `nodeAreaPoint` is only non-null while the
  // canonical `node=` journey is active and resolved to an AREA leaf, so the
  // two sources can never both be non-null for the same render (the legacy
  // journeys never set nav.node, and the node journey never sets nav.areaKey
  // — see [scope.three_areakeys]).
  // Issue #2083 (code-review Finding 1) — extracted to the exported, pure
  // `resolveEffectiveSelectedArea` so the badge-bridge regression test can
  // exercise this REAL production expression instead of re-deriving
  // `selectedArea ?? nodeAreaPoint` by hand.
  const effectiveSelectedArea = resolveEffectiveSelectedArea(legacySelectedArea, nodeAreaPoint);

  const isCityValid = pageState.city in CITY_CONFIG;

  // Issue #1374 — override panelContent to 'agri-detail' while an agri polygon is
  // selected. Confined to 'agri-selected' (not 'agri-landing') so a stale
  // selectedMarkerListing from a previous area visit cannot drive the detail panel
  // over the landing screen. URL state (areaKey/journey) is intentionally NOT cleared.
  const resolvedPanelContent: DiscoverPanelContent =
    selectedMarkerListing != null && panelContent === 'agri-selected'
      ? 'agri-detail'
      : panelContent;

  return {
    ...pageState,
    /**
     * The RAW legacy areaKey-driven selection. Correct only for provably
     * legacy-only branches — see this file's doc comment.
     */
    legacySelectedArea,
    effectiveSelectedArea,
    isCityValid,
    resolvedPanelContent,
  };
}
