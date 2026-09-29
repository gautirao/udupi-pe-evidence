// Issue #2729 V1 fix — extracted OUT of `PropertyFilterGroups.tsx`, which is deliberately
// presentational-only (its own doc comment: "no internal hook call, no local state" — shared by
// AreaSelectedPanel AND MapFilterSheet). The compact toolbar's overflow collapse genuinely needs
// a `ResizeObserver` + local state, which would have broken that invariant for BOTH consumers —
// even though MapFilterSheet never uses `layout="compact"`. This component owns that state
// itself; `PropertyFilterGroups` stays hook-free and simply delegates to it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { UsePropertyFilterGroupsResult } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  FilterPill,
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
import { resolveToolbarCollapse } from '@/features/discover/buyer-filters/selectors/toolbarOverflow';

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
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !toolbarRef.current) return;
    const el = toolbarRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setAvailableWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const typeOrSubtypeLabel = showSubtypeRow ? subtypeLabel : typeLabel;

  const { collapseArea, collapseBhk } = resolveToolbarCollapse({
    availableWidth,
    familyLabel,
    typeLabel: typeOrSubtypeLabel,
    bhkLabel: showBedroomsRow ? bhkLabel : null,
    budgetLabel: budgetPillLabel,
    areaLabel: areaPillLabel,
  });

  const showBhkInline = showBedroomsRow && !collapseBhk;
  const showAreaInline = !collapseArea;

  // Issue #2729 R3 fix — the possession toggle is the ONE "Only show" control production has,
  // and it ALWAYS lives in "More filters" now (never embedded in the Family pill). V1 fix adds:
  // "More filters" is ALSO present whenever something has been collapsed into it.
  const hasMoreFilters = isReadyToMoveSupported || collapseArea || (showBedroomsRow && collapseBhk);
  const moreFiltersActiveCount =
    (activeReadyToMove && isReadyToMoveSupported ? 1 : 0) +
    (collapseArea && activeAreaMin != null ? 1 : 0) +
    (showBedroomsRow && collapseBhk && activeBedrooms.size > 0 ? 1 : 0);

  return (
    <div className="border-b border-border px-4 py-1" data-design-component="filter-toolbar-compact">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Property filters"
        className="flex flex-nowrap items-center gap-1.5 overflow-hidden"
      >
        {familyLabel && (
          <FilterPill label={familyLabel} isActive variant="filled" testId="filter-pill-family">
            {/* R3 — `possession={null}`: the toggle lives in "More filters" now, never embedded
                here, so there is exactly one rendered instance of it in compact mode. */}
            <FamilyRow activeFamily={activeFamily} onSelectFamily={handleSelectFamily} possession={null} />
          </FilterPill>
        )}

        {!showSubtypeRow && (
          <FilterPill label={typeLabel} isActive={!allTypesActive} testId="filter-pill-type">
            <ResidentialTypeRow
              types={RESIDENTIAL_TYPE_CHOICES}
              activeTypes={activePropertyTypes}
              allTypesActive={allTypesActive}
              onSelectAllTypes={handleSelectAllTypes}
              onToggleType={handleTogglePropertyType}
            />
          </FilterPill>
        )}
        {showSubtypeRow && (
          <FilterPill label={subtypeLabel} isActive={activeCommercialSubtypes.size > 0} testId="filter-pill-subtype">
            <CommercialSubtypeRow
              choices={COMMERCIAL_SUBTYPE_CHOICES}
              activeSubtypes={activeCommercialSubtypes}
              onToggleSubtype={handleToggleSubtype}
            />
          </FilterPill>
        )}

        {showBhkInline && (
          <FilterPill label={bhkLabel} isActive={activeBedrooms.size > 0} testId="filter-pill-bhk">
            <BedroomsRow bedroomOptions={QUICK_BEDROOMS} activeBedrooms={activeBedrooms} onToggleBedroom={handleToggleBedroom} />
          </FilterPill>
        )}

        <FilterPill label={budgetPillLabel} isActive={activePriceMax != null} testId="filter-pill-budget">
          <BudgetRow
            label={budgetIntent === 'rent' ? 'Monthly rent' : 'Budget'}
            bands={activeBudgetBands}
            activePriceMax={activePriceMax}
            onSelectBudget={handleSelectBudget}
          />
        </FilterPill>

        {showAreaInline && (
          <FilterPill label={areaPillLabel} isActive={activeAreaMin != null} testId="filter-pill-area">
            <AreaSizeRow
              label={areaControlLabel}
              disclosure={areaControl.disclosure}
              presets={QUICK_AREA_PRESETS}
              activeAreaMin={activeAreaMin}
              onSelectArea={handleSelectArea}
            />
          </FilterPill>
        )}

        {/* Issue #2729 §4/R3/V1 — "More filters" never renders empty (present whenever a
            possession toggle is supported OR something has been collapsed into it), and is
            always the LAST item in the row, fully visible — the collapse logic above exists
            precisely so this trigger itself never gets clipped. */}
        {hasMoreFilters && (
          <div className="ml-auto shrink-0">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="filter-toolbar-more-filters-trigger"
                  className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  More filters
                  {moreFiltersActiveCount > 0 && (
                    <span
                      data-testid="filter-toolbar-more-filters-count"
                      className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background"
                    >
                      {moreFiltersActiveCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[260px] space-y-3" data-testid="filter-toolbar-more-filters-popover">
                {/* V1 — collapsed groups render here with their EXISTING, unmodified row
                    component and the SAME handler — a placement change only, identical to how
                    the Family/Type/BHK/Budget/Area pills already work. */}
                {showBedroomsRow && collapseBhk && (
                  <BedroomsRow
                    bedroomOptions={QUICK_BEDROOMS}
                    activeBedrooms={activeBedrooms}
                    onToggleBedroom={handleToggleBedroom}
                  />
                )}
                {collapseArea && (
                  <AreaSizeRow
                    label={areaControlLabel}
                    disclosure={areaControl.disclosure}
                    presets={QUICK_AREA_PRESETS}
                    activeAreaMin={activeAreaMin}
                    onSelectArea={handleSelectArea}
                  />
                )}
                {isReadyToMoveSupported && (
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
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
      {selectedChipsNode}
    </div>
  );
}
