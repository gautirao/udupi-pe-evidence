/**
 * Issue #1793 PR-C — carries the "THIS scope's own query has settled" signal to ListingsBody
 * without widening AreaSelectedPanel, which sits between the surface that resolves the result
 * source and ListingsBody and forwards only a fixed prop set (it is outside this slice's file
 * boundary). A plain React context is the least invasive seam that does not misuse an existing prop.
 *
 * `undefined` (no provider mounted) means "the caller does not supply the signal"; ListingsBody then
 * FAILS CLOSED (the card is never shown), so a surface that cannot vouch for its own query never
 * shows the card. Providers: AreaLeafListingsSurface (resolver `settled`), the legacy `?areaKey=`
 * AreaJourneyPanel route (`resolveAreaSelectedResults().settled`, #2795) and NodeListingsSurface
 * "Browse all" (#2795).
 *
 * The value is "the active scope's own query": loaded, not failed, and NOT a keepPreviousData
 * placeholder. It is intentionally not `!isFetching` — a same-key background refetch (window focus,
 * stale refetch) is a settled result and must not unmount a form that the buyer is filling in.
 */
import { createContext, useContext } from 'react';

export const RequestCardSettledContext = createContext<boolean | undefined>(undefined);

export function useRequestCardSettled(): boolean | undefined {
  return useContext(RequestCardSettledContext);
}

/**
 * Issue #2795 — true when the surface's scope is a NAVIGATION NODE (region / group / cluster "Browse
 * all"), not a real area. A node key (e.g. `d:north`) is not an `area_key`, so the request card must
 * not submit it as one: ListingsBody sends `areaKey: null` (the label still names the node), exactly
 * as it already does for a multi-area set. Default false = a real area key.
 */
export const RequestCardNodeScopeContext = createContext<boolean>(false);

export function useRequestCardNodeScope(): boolean {
  return useContext(RequestCardNodeScopeContext);
}
