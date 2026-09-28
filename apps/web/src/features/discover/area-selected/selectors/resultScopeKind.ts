/**
 * Issue #2658 (C2) — pure extraction of AreaSelectedPanel's `resultScopeKind`
 * derivation (Issue #2018 slice 3).
 *
 * Precedence is VIEWPORT, then POLYGON, then AREA. `isViewportScope` is a
 * plain prop (independent of the committed `resultScope` URL state) and
 * wins outright: POLYGON is read from the committed scope only when the
 * caller has NOT already said this is a viewport render.
 */
export type ResultScopeKind = 'AREA' | 'POLYGON' | 'VIEWPORT';

export const resolveResultScopeKind = (
  isViewportScope: boolean,
  activeScopeKind: string | null | undefined,
): ResultScopeKind => {
  if (isViewportScope) return 'VIEWPORT';
  if (activeScopeKind === 'POLYGON') return 'POLYGON';
  return 'AREA';
};
