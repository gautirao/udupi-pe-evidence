/**
 * Issue #1793 PR-C — carries the "THIS scope's own query has settled" signal to ListingsBody
 * without widening AreaSelectedPanel, which sits between the surface that resolves the result
 * source and ListingsBody and forwards only a fixed prop set (it is outside this slice's file
 * boundary). A plain React context is the least invasive seam that does not misuse an existing prop.
 *
 * `undefined` (no provider mounted) means "the caller does not supply the signal"; ListingsBody then
 * falls back to its legacy `!isFetching` gate, so every surface that does not provide it behaves
 * exactly as before.
 *
 * The value is `settled` from the area-leaf result resolver: loaded, not failed, and NOT a
 * keepPreviousData placeholder. It is intentionally not `!isFetching` — a same-key background
 * refetch (window focus, stale refetch) is a settled result and must not unmount a form that the
 * buyer is filling in.
 */
import { createContext, useContext } from 'react';

export const RequestCardSettledContext = createContext<boolean | undefined>(undefined);

export function useRequestCardSettled(): boolean | undefined {
  return useContext(RequestCardSettledContext);
}
