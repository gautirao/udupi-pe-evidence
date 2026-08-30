import { DEFAULT_CITY } from '@/lib/localityUtils';
import { hasLegacyAreaContext } from '@/features/discover/navigation/legacyAreaContextGuard';
import { useDiscoverAreaNavigationPathResolver } from '@/features/discover/navigation/useDiscoverAreaNavigationPath';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { DiscoverActionsContextValue, DiscoverNavContextValue } from '@/features/discover/context/types';
import type { useDiscoverPageContext } from '@/features/discover/controllers/useDiscoverPageContext';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

export interface UseDiscoverJourneySwitchControllerParams {
  /** Whole nav context object — mirrors the other controllers on this page. */
  nav: DiscoverNavContextValue;
  /** The URL-write facade (useDiscoverActions()); the SAME reference every other writer uses. */
  actions: DiscoverActionsContextValue;
  /**
   * The ACTIVE canonical journey result — i.e. `activeAreasNavigationJourney`
   * from `useDiscoverOverviewNavigationController`, the same object the panel
   * surface renders from, so the resolved node this handler reads can never be
   * a second, independently-fetched copy.
   */
  areasNavigationJourney: UseAreasNavigationJourneyResult;
  /**
   * `useDiscoverPageContext()`'s toast. Taken as a param rather than a second
   * `useToast()` call so this page keeps exactly ONE toast-hook instance (the
   * ambient-context adapter's), per the controller-layering rule.
   */
  toast: ReturnType<typeof useDiscoverPageContext>['toast'];
}

export interface UseDiscoverJourneySwitchControllerResult {
  handleSelectJourney: (journey: DiscoverJourney) => void;
  /**
   * Issue #2213 — resolves a group MEMBER area's legacy `areaKey` to a real
   * canonical node through the SAME sanctioned `.../navigation-path` resolver
   * `handleSelectJourney` already uses for its own areaKey conversion seam
   * (#1956 PR 6 `[rulings.oq_a_v2]`), then enters the canonical journey at
   * that node — never a client-fabricated `node=`. Powers
   * `AreaGroupFocusPanel`'s member-area rows; the ONE additional caller of
   * `resolveAreaNavigationPath`, sharing its in-flight guard with
   * `handleSelectJourney` (the two actions are mutually exclusive from the
   * user's perspective, so sharing the guard is correct, not a compromise).
   */
  selectGroupMemberArea: (areaKey: string) => void;
  /** True while `selectGroupMemberArea` (or `handleSelectJourney`'s own conversion) is in flight. */
  isResolvingGroupMemberArea: boolean;
}

/**
 * Issue #2142 SOLID follow-up (commit 2) — `handleSelectJourney` moved VERBATIM
 * out of `surfaces/DiscoverPanelSurface.tsx`.
 *
 * WHY IT MOVED. It is a product rule, not presentation: it resolves a legacy
 * `areaKey` to a canonical node through a react-query mutation, branches on
 * `hasLegacyAreaContext`, and raises a destructive toast on an unresolved key.
 * Living in the surface layer, it also forced that surface to value-import
 * `useDiscoverAreaNavigationPath` and `use-toast` directly. Both imports are
 * gone from the surface as a result; the branch logic below is unchanged.
 *
 * OWNS the conversion seam introduced by Issue #1956 PR 6 ([rulings.oq_a_v2]).
 * The doc comment on `handleSelectJourney` below is the original, moved with it.
 */
export function useDiscoverJourneySwitchController({
  nav,
  actions,
  areasNavigationJourney,
  toast,
}: UseDiscoverJourneySwitchControllerParams): UseDiscoverJourneySwitchControllerResult {
  // Issue #1956 PR 6 rework ([rulings.oq_a_v2]) — the areaKey -> node
  // conversion seam. Only ONE caller: `handleSelectJourney` below.
  const resolveAreaNavigationPath = useDiscoverAreaNavigationPathResolver();

  /**
   * The single production write path a JourneySwitcher click funnels through
   * (previously a bare `(j) => urlActions.setJourney(j)`).
   *
   * For every journey other than `area-first`, and for `area-first` with no
   * legacy `groupId`/`areaKey` context, this is behaviourally IDENTICAL to the
   * old one-liner — a plain `setJourney` PUSH.
   *
   * When switching TO `area-first` with legacy context present, this
   * converts FIRST and writes the URL exactly ONCE (via `enterAreasJourney`,
   * the existing atomic journey+node writer), per [rulings.oq_a_v2]:
   *   - `areaKey` present: resolve it through the sanctioned
   *     `.../navigation-path` server endpoint (never a client-constructed
   *     node key), then enter the canonical journey AT THAT NODE. The
   *     `groupId`/`areaKey` params are cleared as part of that SAME write
   *     (see `enterAreasJourney`'s PR-6 addition in `state/url/navigation.ts`).
   *     No premature `setJourney` — the URL is untouched, so the current
   *     (surviving) `AreaSelectedPanel` legacy render stays up throughout the
   *     round trip, with no flash of a wrong intermediate surface.
   *   - Unresolved/stale `areaKey` (404): retain the current legacy state —
   *     no navigation at all, so nothing is silently dropped — and surface an
   *     honest toast rather than a silent no-op.
   *   - `groupId` only (no `areaKey`): [orchestrator_judgement_groupid_only]
   *     — there is no resolved AREA to preserve and no `groupId` -> node
   *     resolution path exists, so this mounts canonical at the city root
   *     directly (no network round trip needed).
   */
  const handleSelectJourney = (journey: DiscoverJourney) => {
    const resolvedNode = areasNavigationJourney.node;
    if (
      journey === 'school-first' &&
      nav.journey === 'area-first' &&
      !hasLegacyAreaContext(nav) &&
      resolvedNode?.nodeType === 'AREA' &&
      resolvedNode.areaKey
    ) {
      // Server-owned identity only — never parse/derive from the URL's
      // node= encoding (#2124 ownership rule). The canonical resolved node
      // is the sole source for an AREA leaf's areaKey.
      actions.enterSchoolsJourneyAtArea(resolvedNode.areaKey);
      return;
    }

    if (journey !== 'area-first' || !hasLegacyAreaContext(nav)) {
      actions.setJourney(journey);
      return;
    }
    if (nav.areaKey) {
      if (resolveAreaNavigationPath.isPending) {
        // A conversion is already in flight for this same click intent —
        // never fire a second concurrent request/history write.
        return;
      }
      resolveAreaNavigationPath.mutate(
        { city: nav.city || DEFAULT_CITY, areaKey: nav.areaKey },
        {
          onSuccess: (path) => {
            actions.enterAreasJourney(path.nodeKey);
          },
          onError: () => {
            toast({
              variant: 'destructive',
              title: "Couldn't switch to area view",
              description: 'This area link looks out of date. Staying on your current view.',
            });
          },
        },
      );
      return;
    }
    // groupId-only, no areaKey.
    actions.enterAreasJourney(null);
  };

  /**
   * Issue #2213 — see the result interface doc. Deliberately does NOT reuse
   * `handleSelectJourney` itself (that function's branches are keyed off the
   * CURRENT `nav.journey`/`nav.areaKey`, not an arbitrary caller-supplied
   * areaKey) — this is the same underlying resolve-then-enter sequence, over
   * an explicit parameter instead of URL state.
   */
  const selectGroupMemberArea = (areaKey: string) => {
    if (resolveAreaNavigationPath.isPending) return;
    resolveAreaNavigationPath.mutate(
      { city: nav.city || DEFAULT_CITY, areaKey },
      {
        onSuccess: (path) => {
          actions.enterAreasJourney(path.nodeKey);
        },
        onError: () => {
          toast({
            variant: 'destructive',
            title: "Couldn't open this area",
            description: 'This area link looks out of date. Staying on the group view.',
          });
        },
      },
    );
  };

  return {
    handleSelectJourney,
    selectGroupMemberArea,
    isResolvingGroupMemberArea: resolveAreaNavigationPath.isPending,
  };
}
