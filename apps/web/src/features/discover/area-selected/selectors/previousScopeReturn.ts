/**
 * Issue #2658 (C2) — pure extraction of AreaSelectedPanel's `returnLabel`
 * derivation (Issue #2478 step 1, mirroring ActiveScopeChip).
 *
 * Three label shapes:
 * - AREA_SET, exactly 1 resolved previous area: "Return to {areaLabel}".
 * - AREA_SET, 2+ resolved previous areas: "Return to {a}, {b}, ...".
 * - AREA_SET with NO resolved areas (names not loaded), POLYGON, or any
 *   other kind: falls back to a generic label — "Return to previous search
 *   area" for POLYGON specifically, "Return to previous area" otherwise.
 *
 * Returns `null` when there is no previous scope at all (nothing to return
 * to).
 */
export type PreviousResultScope = { kind: string } | null | undefined;

export const resolveReturnLabel = (
  previousResultScope: PreviousResultScope,
  previousAreaLabels: readonly string[],
): string | null => {
  if (!previousResultScope) return null;
  if (previousResultScope.kind === 'AREA_SET') {
    if (previousAreaLabels.length === 1) {
      return `Return to ${previousAreaLabels[0]}`;
    }
    if (previousAreaLabels.length > 1) {
      return `Return to ${previousAreaLabels.join(', ')}`;
    }
    return 'Return to previous area';
  }
  if (previousResultScope.kind === 'POLYGON') {
    return 'Return to previous search area';
  }
  return 'Return to previous area';
};
