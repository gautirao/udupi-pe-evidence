// Issue #2729 V1 fix — extracted OUT of `PropertyFilterGroups.tsx`, which is deliberately
// presentational-only (its own doc comment: "no internal hook call, no local state" — shared by
// AreaSelectedPanel AND MapFilterSheet). The compact toolbar's overflow collapse genuinely needs
// a `ResizeObserver` + local state, which would have broken that invariant for BOTH consumers —
// even though MapFilterSheet never uses `layout="compact"`. This component owns that state
// itself; `PropertyFilterGroups` stays hook-free and simply delegates to it.
//
// Issue #2762 PR-B — this is now a THIN By-area ADAPTER over the generic `CompactFilterBar`
// (render-slot pill groups), extracted so Near-a-school/Agricultural can reuse the same shared
// component with their own filter definitions instead of separate large filter panels. Every
// pill's markup/handlers/testids below are UNCHANGED from before this extraction — only their
// collapse/placement mechanics moved into `CompactFilterBar` + `resolveCompactFilterBarCollapse`.
// Regression gate: `PropertyFilterGroups.compactPills.test.tsx` must pass UNMODIFIED.
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { UsePropertyFilterGroupsResult } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import {
  QUICK_AREA_PRESETS,
  QUICK_BEDROOMS,
  RESIDENTIAL_TYPE_CHOICES,
  COMMERCIAL_SUBTYPE_CHOICES,
  PROPERTY_TYPE_LABELS,
} from './PropertyFilterGroups';
import { FamilyRow } from './FamilyRow';
import { ResidentialTypeRow } from './ResidentialTypeRow';
import { CommercialSubtypeRow } from './CommercialSubtypeRow';
import { BedroomsRow } from './BedroomsRow';
import { AreaSizeRow } from './AreaSizeRow';
import { BudgetRow } from './BudgetRow';
import { CompactFilterBar, type FilterBarGroup, type FilterBarOverflowItem } from './CompactFilterBar';

export interface CompactFilterToolbarProps extends UsePropertyFilterGroupsResult {
  filters: PropertyFilters;
  isCommercialSubtypeSupported?: boolean;
  isReadyToMoveSupported?: boolean;
  /** Built once by the caller (`PropertyFilterGroups`) — identical in both layouts. */
  selectedChipsNode: ReactNode;
}

/**
 * Issue #2729 V1 fix — real-browser measurement (Playwright, exact 1366×768 and 1440×900) found
 * the deterministic "always show all 5 pills" toolbar clipped "More filters" to "More" at the
 * panel's right edge in every Residential state (scrollWidth 664 vs clientWidth 618 at 1366;
 * 1417 vs 1408 at 1440) — Commercial (no BHK pill) happened not to clip, but nothing guaranteed
 * that at other widths/labels. This component now measures its own available width via
 * `ResizeObserver` and collapses lower-priority groups into "More filters" only as far as
 * needed: Area first, then BHK. Family, Type/Subtype and Budget NEVER collapse — the issue's
 * explicit rule — and "More filters" is always last, always fully visible, with its badge
 * counting every collapsed group that has an active value (plus the possession toggle, as
 * before).
 */
export function CompactFilterToolbar({
  isCommercialSubtypeSupported = false,
  isReadyToMoveSupported = true,
  activeFamily,
  activePropertyTypes,
  activeBedrooms,
  activeCommercialSubtypes,
  allTypesActive,
  activePriceMax,
  activeReadyToMove,
  showSubtypeRow,
  showBedroomsRow,
  activeBudgetBands,
  areaControl,
  areaControlLabel,
  activeAreaMin,
  budgetIntent,
  possessionLabel,
  handleTogglePropertyType,
  handleSelectAllTypes,
  handleToggleBedroom,
  handleSelectBudget,
  handleToggleReadyToMove,
  handleSelectFamily,
  handleToggleSubtype,
  handleSelectArea,
  selectedChipsNode,
}: CompactFilterToolbarProps) {
  const bhkLabel =
    activeBedrooms.size === 0 ? 'Any BHK' : `${Array.from(activeBedrooms).sort((a, b) => a - b).join(', ')} BHK`;

  const areaPresetLabel = QUICK_AREA_PRESETS.find((p) => p.min === activeAreaMin)?.label;
  const areaPillLabel = activeAreaMin == null ? `Any ${areaControlLabel.toLowerCase()}` : (areaPresetLabel ?? areaControlLabel);

  const budgetPillLabel =
    activePriceMax == null
      ? budgetIntent === 'rent'
        ? 'Any rent'
        : 'Any price'
      : (activeBudgetBands.find((b) => b.max === activePriceMax)?.label ??
        `≤ ₹${activePriceMax.toLocaleString('en-IN')}${budgetIntent === 'rent' ? '/month' : ''}`);

  const typeLabel = allTypesActive
    ? 'All types'
    : activePropertyTypes.size === 1
      ? (PROPERTY_TYPE_LABELS[Array.from(activePropertyTypes)[0]] ?? 'Type')
      : `${activePropertyTypes.size} types`;

  const subtypeLabel =
    activeCommercialSubtypes.size === 0
      ? 'All commercial'
      : activeCommercialSubtypes.size === 1
        ? (COMMERCIAL_SUBTYPE_CHOICES.find((c) => c.value === Array.from(activeCommercialSubtypes)[0])?.label ??
          'Subtype')
        : `${activeCommercialSubtypes.size} types`;

  const familyLabel = isCommercialSubtypeSupported ? (activeFamily === 'commercial' ? 'Commercial' : 'Residential') : null;

  // Issue #2762 PR-B — render-slot groups, IN THE SAME ORDER the original JSX rendered them
  // (Family, Type/Subtype, BHK, Budget, Area), so `CompactFilterBar`'s generic collapse/overflow
  // ordering reproduces the original component's DOM and "More filters" content order exactly.
  // `collapsePriority`: Area=1 (collapses first), BHK=2 (collapses second) — matches
  // `resolveToolbarCollapse`'s hard-coded "Area first, then BHK" rule byte-for-byte (see
  // `resolveCompactFilterBarCollapse`'s own doc comment for the equivalence proof). Family/Type/
  // Subtype/Budget omit `collapsePriority` entirely — PINNED, never collapse, exactly as before.
  const groups: FilterBarGroup[] = [];

  if (familyLabel) {
    groups.push({
      id: 'family',
      label: familyLabel,
      isActive: true,
      variant: 'filled',
      testId: 'filter-pill-family',
      renderPopover: () => (
        // R3 — `possession={null}`: the toggle lives in "More filters" now, never embedded
        // here, so there is exactly one rendered instance of it in compact mode.
        <FamilyRow activeFamily={activeFamily} onSelectFamily={handleSelectFamily} possession={null} />
      ),
    });
  }

  if (!showSubtypeRow) {
    groups.push({
      id: 'type',
      label: typeLabel,
      isActive: !allTypesActive,
      testId: 'filter-pill-type',
      renderPopover: () => (
        <ResidentialTypeRow
          types={RESIDENTIAL_TYPE_CHOICES}
          activeTypes={activePropertyTypes}
          allTypesActive={allTypesActive}
          onSelectAllTypes={handleSelectAllTypes}
          onToggleType={handleTogglePropertyType}
        />
      ),
    });
  } else {
    groups.push({
      id: 'subtype',
      label: subtypeLabel,
      isActive: activeCommercialSubtypes.size > 0,
      testId: 'filter-pill-subtype',
      renderPopover: () => (
        <CommercialSubtypeRow
          choices={COMMERCIAL_SUBTYPE_CHOICES}
          activeSubtypes={activeCommercialSubtypes}
          onToggleSubtype={handleToggleSubtype}
        />
      ),
    });
  }

  if (showBedroomsRow) {
    groups.push({
      id: 'bhk',
      label: bhkLabel,
      isActive: activeBedrooms.size > 0,
      testId: 'filter-pill-bhk',
      collapsePriority: 2,
      renderPopover: () => (
        <BedroomsRow bedroomOptions={QUICK_BEDROOMS} activeBedrooms={activeBedrooms} onToggleBedroom={handleToggleBedroom} />
      ),
    });
  }

  groups.push({
    id: 'budget',
    label: budgetPillLabel,
    isActive: activePriceMax != null,
    testId: 'filter-pill-budget',
    renderPopover: () => (
      <BudgetRow
        label={budgetIntent === 'rent' ? 'Monthly rent' : 'Budget'}
        bands={activeBudgetBands}
        activePriceMax={activePriceMax}
        onSelectBudget={handleSelectBudget}
      />
    ),
  });

  groups.push({
    id: 'area',
    label: areaPillLabel,
    isActive: activeAreaMin != null,
    testId: 'filter-pill-area',
    collapsePriority: 1,
    renderPopover: () => (
      <AreaSizeRow
        label={areaControlLabel}
        disclosure={areaControl.disclosure}
        presets={QUICK_AREA_PRESETS}
        activeAreaMin={activeAreaMin}
        onSelectArea={handleSelectArea}
      />
    ),
  });

  // Issue #2729 R3 fix — the possession toggle is the ONE "Only show" control production has,
  // and it ALWAYS lives in "More filters" (never embedded in the Family pill) — never rendered
  // as its own inline pill, so it belongs in `overflowOnly`, not `groups`.
  const overflowOnly: FilterBarOverflowItem[] = isReadyToMoveSupported
    ? [
        {
          id: 'ready-to-move',
          isActive: activeReadyToMove,
          render: () => (
            <button
              type="button"
              onClick={handleToggleReadyToMove}
              aria-pressed={activeReadyToMove}
              data-testid="filter-toolbar-ready-to-move-toggle"
              className={cn(
                'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs font-medium',
                activeReadyToMove ? 'border-copper bg-copper-tint text-copper' : 'border-border text-foreground',
              )}
            >
              {possessionLabel}
              {activeReadyToMove && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ),
        },
      ]
    : [];

  return <CompactFilterBar accent="areas" groups={groups} overflowOnly={overflowOnly} selectedChipsNode={selectedChipsNode} />;
}
