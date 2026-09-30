// Issue #2762 PR-B — School's compact-FilterBar adapter. Architect decision: School's filters run
// on the EXACT SAME PropertyFilters data model as By-area (both MapFilters and
// usePropertyFilterGroups read/write the same state), so this builds School's compact row the
// SAME WAY By-area's is built — from usePropertyFilterGroups directly — rather than wrapping the
// older, more deeply-shared MapFilters UI component (which stays completely untouched; its own
// "seller type / listing status / date range" sections keep rendering inside the existing
// SchoolFiltersSheet, now presented as "More filters" alongside this new row, per the architect's
// control-placement split: property type/bedrooms/price/area/ready-to-move -> compact row here;
// seller type/back-on-market/new-to-market/RERA/date range -> stay in SchoolFiltersSheet).
//
// `usePropertyFilterGroups` MUST be called exactly ONCE per panel (see that hook's own header,
// lines 9-18: two calls create two independent `familyOverride` states free to disagree) — this
// hook takes an ALREADY-CALLED `UsePropertyFilterGroupsResult` as input, it does not call the
// underlying hook itself, so a panel that needs the result for its own UI too passes the SAME
// instance through rather than this hook creating a second one.
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UsePropertyFilterGroupsResult } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import {
  QUICK_AREA_PRESETS,
  QUICK_BEDROOMS,
  RESIDENTIAL_TYPE_CHOICES,
  COMMERCIAL_SUBTYPE_CHOICES,
  PROPERTY_TYPE_LABELS,
} from '@/features/discover/buyer-filters/sections/PropertyFilterGroups';
import { FamilyRow } from '@/features/discover/buyer-filters/sections/FamilyRow';
import { ResidentialTypeRow } from '@/features/discover/buyer-filters/sections/ResidentialTypeRow';
import { CommercialSubtypeRow } from '@/features/discover/buyer-filters/sections/CommercialSubtypeRow';
import { BedroomsRow } from '@/features/discover/buyer-filters/sections/BedroomsRow';
import { AreaSizeRow } from '@/features/discover/buyer-filters/sections/AreaSizeRow';
import { BudgetRow } from '@/features/discover/buyer-filters/sections/BudgetRow';
import type {
  FilterBarGroup,
  FilterBarOverflowItem,
} from '@/features/discover/buyer-filters/sections/CompactFilterBar';

export interface UseSchoolFilterBarGroupsParams {
  /** The SAME already-computed `usePropertyFilterGroups` result the panel uses for its own UI —
   * never a second call to that hook. */
  groups: UsePropertyFilterGroupsResult;
  isCommercialSubtypeSupported?: boolean;
  isReadyToMoveSupported?: boolean;
}

export interface SchoolFilterBarGroups {
  groups: FilterBarGroup[];
  overflowOnly: FilterBarOverflowItem[];
}

/**
 * Builds the same render-slot group shape CompactFilterToolbar/CompactFilterBar already consume
 * (family/type-or-subtype, bedrooms, budget, area — pinned except bedrooms/area, which collapse
 * Area-first-then-BHK exactly like By-area) plus a ready-to-move overflow item — mirroring
 * CompactFilterToolbar.tsx's own group-building body (kept in sync by hand, not shared code,
 * since the two components are extracted from different source files and this avoids re-touching
 * the already regression-verified By-area adapter).
 */
export function useSchoolFilterBarGroups({
  groups: g,
  isCommercialSubtypeSupported = false,
  isReadyToMoveSupported = true,
}: UseSchoolFilterBarGroupsParams): SchoolFilterBarGroups {
  const bhkLabel =
    g.activeBedrooms.size === 0 ? 'Any BHK' : `${Array.from(g.activeBedrooms).sort((a, b) => a - b).join(', ')} BHK`;

  const areaPresetLabel = QUICK_AREA_PRESETS.find((p) => p.min === g.activeAreaMin)?.label;
  const areaPillLabel =
    g.activeAreaMin == null ? `Any ${g.areaControlLabel.toLowerCase()}` : (areaPresetLabel ?? g.areaControlLabel);

  const budgetPillLabel =
    g.activePriceMax == null
      ? g.budgetIntent === 'rent'
        ? 'Any rent'
        : 'Any price'
      : (g.activeBudgetBands.find((b) => b.max === g.activePriceMax)?.label ??
        `≤ ₹${g.activePriceMax.toLocaleString('en-IN')}${g.budgetIntent === 'rent' ? '/month' : ''}`);

  const typeLabel = g.allTypesActive
    ? 'All types'
    : g.activePropertyTypes.size === 1
      ? (PROPERTY_TYPE_LABELS[Array.from(g.activePropertyTypes)[0]] ?? 'Type')
      : `${g.activePropertyTypes.size} types`;

  const subtypeLabel =
    g.activeCommercialSubtypes.size === 0
      ? 'All commercial'
      : g.activeCommercialSubtypes.size === 1
        ? (COMMERCIAL_SUBTYPE_CHOICES.find((c) => c.value === Array.from(g.activeCommercialSubtypes)[0])?.label ??
          'Subtype')
        : `${g.activeCommercialSubtypes.size} types`;

  const familyLabel = isCommercialSubtypeSupported ? (g.activeFamily === 'commercial' ? 'Commercial' : 'Residential') : null;

  const barGroups: FilterBarGroup[] = [];

  if (familyLabel) {
    barGroups.push({
      id: 'family',
      label: familyLabel,
      isActive: true,
      variant: 'filled',
      testId: 'school-filter-pill-family',
      renderPopover: (): ReactNode => (
        <FamilyRow activeFamily={g.activeFamily} onSelectFamily={g.handleSelectFamily} possession={null} />
      ),
    });
  }

  if (!g.showSubtypeRow) {
    barGroups.push({
      id: 'type',
      label: typeLabel,
      isActive: !g.allTypesActive,
      testId: 'school-filter-pill-type',
      renderPopover: (): ReactNode => (
        <ResidentialTypeRow
          types={RESIDENTIAL_TYPE_CHOICES}
          activeTypes={g.activePropertyTypes}
          allTypesActive={g.allTypesActive}
          onSelectAllTypes={g.handleSelectAllTypes}
          onToggleType={g.handleTogglePropertyType}
        />
      ),
    });
  } else {
    barGroups.push({
      id: 'subtype',
      label: subtypeLabel,
      isActive: g.activeCommercialSubtypes.size > 0,
      testId: 'school-filter-pill-subtype',
      renderPopover: (): ReactNode => (
        <CommercialSubtypeRow
          choices={COMMERCIAL_SUBTYPE_CHOICES}
          activeSubtypes={g.activeCommercialSubtypes}
          onToggleSubtype={g.handleToggleSubtype}
        />
      ),
    });
  }

  if (g.showBedroomsRow) {
    barGroups.push({
      id: 'bhk',
      label: bhkLabel,
      isActive: g.activeBedrooms.size > 0,
      testId: 'school-filter-pill-bhk',
      collapsePriority: 2,
      renderPopover: (): ReactNode => (
        <BedroomsRow bedroomOptions={QUICK_BEDROOMS} activeBedrooms={g.activeBedrooms} onToggleBedroom={g.handleToggleBedroom} />
      ),
    });
  }

  barGroups.push({
    id: 'budget',
    label: budgetPillLabel,
    isActive: g.activePriceMax != null,
    testId: 'school-filter-pill-budget',
    renderPopover: (): ReactNode => (
      <BudgetRow
        label={g.budgetIntent === 'rent' ? 'Monthly rent' : 'Budget'}
        bands={g.activeBudgetBands}
        activePriceMax={g.activePriceMax}
        onSelectBudget={g.handleSelectBudget}
      />
    ),
  });

  barGroups.push({
    id: 'area',
    label: areaPillLabel,
    isActive: g.activeAreaMin != null,
    testId: 'school-filter-pill-area',
    collapsePriority: 1,
    renderPopover: (): ReactNode => (
      <AreaSizeRow
        label={g.areaControlLabel}
        disclosure={g.areaControl.disclosure}
        presets={QUICK_AREA_PRESETS}
        activeAreaMin={g.activeAreaMin}
        onSelectArea={g.handleSelectArea}
      />
    ),
  });

  const overflowOnly: FilterBarOverflowItem[] = isReadyToMoveSupported
    ? [
        {
          id: 'ready-to-move',
          isActive: g.activeReadyToMove,
          render: (): ReactNode => (
            <button
              type="button"
              onClick={g.handleToggleReadyToMove}
              aria-pressed={g.activeReadyToMove}
              data-testid="school-filter-toolbar-ready-to-move-toggle"
              className={cn(
                'flex w-full items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs font-medium',
                g.activeReadyToMove ? 'border-copper bg-copper-tint text-copper' : 'border-border text-foreground',
              )}
            >
              {g.possessionLabel}
              {g.activeReadyToMove && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ),
        },
      ]
    : [];

  return { groups: barGroups, overflowOnly };
}
