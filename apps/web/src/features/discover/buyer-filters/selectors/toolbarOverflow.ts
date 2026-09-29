/**
 * Issue #2729 V1 fix — deterministic, testable width estimate for a compact filter pill's
 * rendered width, used to decide overflow collapse without needing off-screen measurement
 * clones (which would require a two-pass render). ~6.5px/character at the pill's 12px/semibold
 * type, plus a fixed allowance for the pill's own padding (12px each side), the chevron icon
 * (14px) and its gap (4px) and the 1px border on each side. This is an ESTIMATE, not a
 * pixel-exact measurement — but it is a function of the pill's ACTUAL label text, so a longer
 * active-state label (e.g. "2, 3 BHK" vs "Any BHK") is correctly treated as wider, which is the
 * property that actually matters for deciding what to collapse.
 */
export function estimatePillWidth(label: string): number {
  const CHAR_WIDTH = 6.5;
  const CHROME = 12 * 2 + 14 + 4 + 2;
  return Math.round(label.length * CHAR_WIDTH + CHROME);
}

/** Estimated width of the "More filters" trigger itself (label + icon + optional badge). */
export const MORE_FILTERS_TRIGGER_WIDTH = 130;

export interface ToolbarOverflowInput {
  /** The toolbar row's own available width in px, from a `ResizeObserver` on its container.
   * `null` means "not measured yet" (or `ResizeObserver` unavailable in this environment) —
   * treated as "everything fits", matching this codebase's existing
   * `typeof ResizeObserver === 'undefined'` no-op convention elsewhere. */
  availableWidth: number | null;
  /** `null` when the Family pill doesn't exist (residential capability off). */
  familyLabel: string | null;
  typeLabel: string;
  /** `null` when the BHK pill doesn't exist at all for this family/subtype (Commercial, Plot). */
  bhkLabel: string | null;
  budgetLabel: string;
  areaLabel: string;
  /** Gap (px) between adjacent pills, as rendered (`gap-1.5` = 6px). */
  gap?: number;
  moreFiltersWidth?: number;
}

export interface ToolbarOverflowResult {
  collapseArea: boolean;
  collapseBhk: boolean;
}

/**
 * Issue #2729 V1 fix — the toolbar clipped "More filters" to "More" at its right edge at both
 * 1366×768 and 1440×900 (real-browser measurement: scrollWidth 664 vs clientWidth 618 at 1366).
 * Family, Type/Subtype and Budget NEVER collapse (the issue's explicit rule — "Family, Type and
 * Budget stay inline"); Area collapses FIRST (lowest priority), then BHK, only as far as needed
 * to fit `availableWidth`, with "More filters" always reserved space and always last.
 */
export function resolveToolbarCollapse(input: ToolbarOverflowInput): ToolbarOverflowResult {
  const {
    availableWidth,
    familyLabel,
    typeLabel,
    bhkLabel,
    budgetLabel,
    areaLabel,
    gap = 6,
    moreFiltersWidth = MORE_FILTERS_TRIGGER_WIDTH,
  } = input;

  if (availableWidth == null) return { collapseArea: false, collapseBhk: false };

  const alwaysInlineLabels = [familyLabel, typeLabel, budgetLabel].filter((l): l is string => l != null);
  const alwaysInlineWidth = alwaysInlineLabels.reduce((sum, l) => sum + estimatePillWidth(l), 0);
  const bhkWidth = bhkLabel != null ? estimatePillWidth(bhkLabel) : 0;
  const areaWidth = estimatePillWidth(areaLabel);

  const totalWidth = (includeBhk: boolean, includeArea: boolean) => {
    const pillCount =
      alwaysInlineLabels.length + (includeBhk && bhkLabel != null ? 1 : 0) + (includeArea ? 1 : 0) + 1; // +1 = More filters trigger
    const gapsWidth = gap * Math.max(0, pillCount - 1);
    return (
      alwaysInlineWidth +
      (includeBhk && bhkLabel != null ? bhkWidth : 0) +
      (includeArea ? areaWidth : 0) +
      moreFiltersWidth +
      gapsWidth
    );
  };

  if (totalWidth(true, true) <= availableWidth) return { collapseArea: false, collapseBhk: false };
  if (totalWidth(true, false) <= availableWidth) return { collapseArea: true, collapseBhk: false };
  return { collapseArea: true, collapseBhk: true };
}
