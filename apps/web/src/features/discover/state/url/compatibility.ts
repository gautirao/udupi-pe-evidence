/**
 * Compatibility URL domain — Issue #2001/#2002 Slice 2 PR3.
 *
 * Owns the deprecated/legacy read-write compatibility seams that were
 * previously scattered across city.ts (`scope`) and agricultural.ts
 * (`selectedGroup` / `selectRegionalGroup`): the residential `scope` axis
 * read (#1745 P2) and the legacy `group=DIRECTION:BAND` read + writer
 * (#1409, superseded by region/maxKm — see agricultural.ts for the OD-1
 * cold-load migration effect, which stays co-located there since it shares
 * coldLoadDoneRef with the #1445 canonicalisation effect). This module does
 * NOT own the OD-1 migration effects, `rawGroupLegacy`/`hasLegacyGroupParam`,
 * or `setScope` — those remain in agricultural.ts / city.ts respectively.
 *
 * DELIBERATE SCOPE, corrected post-PR3-review: this hook does NOT own
 * `areaKey`, `groupId`, or `region` — those are canonical, actively-used
 * selection state and remain owned by their proper domains (area.ts for
 * areaKey/groupId, agricultural.ts for region). They are NOT legacy/compat
 * concerns and were never moved here, despite earlier issue/plan text
 * describing this domain's scope loosely as "groupId/region/areaKey/scope".
 * A future compatibility resolver (Issue #1956, adding `node=`) reads
 * areaKey/groupId/region directly from their canonical domains as its
 * legacy-compat INPUTS and normalises them to `node=` — it must not assume
 * useCompatibilityUrlDomain already returns them, since it does not.
 *
 * #1956 will plug the `node=` compat read into this domain as well, for the
 * fields this domain actually owns (selectedGroup, scope) plus its own new
 * canonical-field reads.
 *
 * See useDiscoverUrlState.ts's module doc for the full param contract.
 */
import { useCallback } from 'react';
import { isValidScope } from '@/hooks/discoverUrlNormalize';
import type { UrlDomainCtx, UrlDomainModule } from './_shared';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

type CompatState = Pick<DiscoverUrlState, 'selectedGroup' | 'scope'>;
type CompatActions = Pick<DiscoverUrlActions, 'selectRegionalGroup'>;

export function useCompatibilityUrlDomain(
  ctx: UrlDomainCtx,
): UrlDomainModule<CompatState, CompatActions> {
  const { urlParams, setUrlParams } = ctx;

  // Issue #1745 P2 — residential scope axis. Distinct from `region` (agri-only
  // corridor direction, agricultural.ts); validated against isValidScope.
  const rawScope = urlParams.get('scope');
  const scope: string | null = rawScope && isValidScope(rawScope) ? rawScope : null;

  const GROUP_REGEX = /^(N|NE|E|SE|S|SW|W|NW):(0_10|10_25|25_50|50_up)$/;

  // Synchronous-read: derive selectedGroup from the legacy `group` param for
  // backward-compat with discoverPanelState and any existing panels. Reads
  // the `group` param independently of agricultural.ts's rawGroupLegacy
  // (which still feeds the OD-1/#1445 cold-load state machine there).
  const rawGroupLegacy = urlParams.get('group');
  const selectedGroup =
    rawGroupLegacy && GROUP_REGEX.test(rawGroupLegacy)
      ? {
          directionKey: rawGroupLegacy.split(':')[0],
          distanceBandKey: rawGroupLegacy.split(':')[1],
        }
      : null;

  /**
   * @deprecated Use setRegion + setMaxKm instead (Issue #1429 corridor-first model).
   * Writes the legacy `group=DIRECTION:BAND` param.
   */
  const selectRegionalGroup = useCallback(
    (group: { directionKey: string; distanceBandKey: string } | null) => {
      setUrlParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (group) {
            next.set('group', `${group.directionKey}:${group.distanceBandKey}`);
          } else {
            next.delete('group');
          }
          // Do NOT delete areaKey — B2 allows group selection independently of area selection.
          return next;
        },
        { replace: false }, // PUSH — group selection is a navigational choice
      );
    },
    [setUrlParams],
  );

  return {
    state: { selectedGroup, scope },
    actions: { selectRegionalGroup },
  };
}
