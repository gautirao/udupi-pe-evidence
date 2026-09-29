// Issue #2658 (C4) — relocated verbatim from
// components/discover/panels/PropertyFilterGroups.tsx (no logic/markup
// change) into the buyer-filters domain, alongside the FamilyRow/
// ResidentialTypeRow/CommercialSubtypeRow/BedroomsRow/AreaSizeRow/BudgetRow/
// SelectedFilterChips sections it already composes (Issue #2658 C3), so that
// file could finally be deleted once its two production consumers
// (AreaSelectedPanel.tsx, MapFilterSheet.tsx) moved their import here.
//
// `PropertyFilterGroups` itself is deliberately presentational only (no internal hook call, no
// local state): every value and handler it renders comes in as a prop, sourced from a single
// `usePropertyFilterGroups` call (controllers/usePropertyFilterGroups.ts) the caller owns.
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPropertyTypeLabel } from '@/lib/propertyTypeConfig';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import type { CommercialSubtype } from '@/lib/listing-constants';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { COMMERCIAL_FAMILY_TOKENS } from '@/features/discover/buyer-filters/selectors/familyTokens';
import type { UsePropertyFilterGroupsResult } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { FamilyRow } from './FamilyRow';
import { ResidentialTypeRow } from './ResidentialTypeRow';
import { CommercialSubtypeRow } from './CommercialSubtypeRow';
import { BedroomsRow } from './BedroomsRow';
import { AreaSizeRow } from './AreaSizeRow';
import { BudgetRow } from './BudgetRow';
import { SelectedFilterChips } from './SelectedFilterChips';
import { CompactFilterToolbar } from './CompactFilterToolbar';

const QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'residential_plot'] as const;
export const QUICK_BEDROOMS = [2, 3] as const;

/**
 * Issue #2555 — the mock's AREA (SQ FT) presets.
 *
 * `min: undefined` is the "Any size" chip: it CLEARS the bound rather than setting a zero one, so
 * it is the absence of a narrowing rather than a fourth size. Mirrors how "All commercial" and
 * "Any price" express the same idea elsewhere in this file.
 */
export const QUICK_AREA_PRESETS: readonly { testId: string; label: string; min: number | undefined }[] = [
  { testId: 'quick-chip-area-any', label: 'Any size', min: undefined },
  { testId: 'quick-chip-area-1000', label: '1,000+ sq ft', min: 1000 },
  { testId: 'quick-chip-area-2500', label: '2,500+ sq ft', min: 2500 },
  { testId: 'quick-chip-area-5000', label: '5,000+ sq ft', min: 5000 },
];

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  villa: 'Villas',
  residential_plot: 'Plots',
};

// Issue #2658 (C3) — the {value, label} shape ResidentialTypeRow renders,
// derived once from the two constants above rather than re-typed at the
// call site.
export const RESIDENTIAL_TYPE_CHOICES = QUICK_PROPERTY_TYPES.map((value) => ({
  value,
  label: PROPERTY_TYPE_LABELS[value],
}));

/**
 * #2450's approved buyer wording for the Commercial subtype row.
 *
 * DELIBERATELY NOT `COMMERCIAL_SUBTYPE_LABELS` from propertyTypeConfig.ts, which renders SHOP as
 * "Commercial Shop" and OFFICE as "Commercial Office". `value: null` is the "All commercial" chip.
 */
export const COMMERCIAL_SUBTYPE_CHOICES: readonly {
  testId: string;
  label: string;
  value: CommercialSubtype | null;
}[] = [
  { testId: 'quick-chip-subtype-all', label: 'All commercial', value: null },
  { testId: 'quick-chip-subtype-shop', label: 'Shop', value: 'SHOP' },
  { testId: 'quick-chip-subtype-office', label: 'Office', value: 'OFFICE' },
  { testId: 'quick-chip-subtype-building', label: 'Commercial Building', value: 'BUILDING' },
  { testId: 'quick-chip-subtype-warehouse', label: 'Warehouse / Godown', value: 'WAREHOUSE' },
  { testId: 'quick-chip-subtype-land', label: 'Commercial Land', value: 'LAND' },
];

export interface PropertyFilterGroupsProps extends UsePropertyFilterGroupsResult {
  filters: PropertyFilters;
  isCommercialSubtypeSupported?: boolean;
  isReadyToMoveSupported?: boolean;
  /**
   * Issue #2729 §4 — 'stacked' (default, unchanged) is the vertical quick-filter card every
   * existing consumer (MapFilterSheet, and any caller that omits this prop) keeps rendering
   * byte-for-byte. 'compact' is the NEW single-row desktop toolbar (AreaSelectedPanel only,
   * gated ≥1366 by the caller) — same state/handlers, same sub-row components
   * (FamilyRow/ResidentialTypeRow/CommercialSubtypeRow/BedroomsRow/AreaSizeRow/BudgetRow, all
   * UNMODIFIED), just a different PLACEMENT: EVERY group is its own compact pill that opens a
   * Popover containing the existing row (D3 fix — an earlier revision rendered the full stacked
   * rows inline, which measured 123px/3 lines in the real browser, not one row). This is a
   * deterministic priority split, not a measured/ResizeObserver overflow collapse — DoD
   * explicitly allows either ("measured overflow collapse is optional").
   */
  layout?: 'stacked' | 'compact';
}

/**
 * Issue #2729 §4 — one compact filter-group pill (Family/Type/Subtype/BHK/Budget/Area), each
 * opening a `Popover` containing the group's existing, unmodified row component — the SAME
 * pattern "More filters" already used, just applied per-group instead of only to the overflow.
 * Built on the repo's `Popover` primitive (Radix), which supplies `aria-haspopup`/`aria-expanded`
 * on the trigger and Escape/outside-click dismissal + focus-restore for free.
 */
export function FilterPill({
  label,
  isActive,
  /**
   * Issue #2729 R4 fix — 'tinted' (default) is the accent-tint/border-only active state every
   * OTHER pill uses; 'filled' is the mock's solid-accent/white-text style, reserved for the
   * Family pill (its value is never "unset" — Residential/Commercial is always a real choice,
   * unlike the other pills' "Any …" idle state, so the mock gives it the stronger treatment).
   */
  variant = 'tinted',
  testId,
  children,
}: {
  label: string;
  isActive?: boolean;
  variant?: 'tinted' | 'filled';
  testId: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={cn(
            'inline-flex h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors',
            isActive && variant === 'filled'
              ? 'border-copper bg-copper text-copper-foreground hover:bg-copper-hover'
              : isActive
                ? 'border-copper bg-copper-tint text-copper'
                : 'border-border text-foreground hover:border-border-strong',
          )}
        >
          <span className="max-w-[110px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px]" data-testid={`${testId}-popover`}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Presentational only — extracted verbatim from AreaSelectedPanel.tsx (Issue #2628). Every value
 * below is a prop (sourced from a single `usePropertyFilterGroups` call the caller owns), so this
 * component holds no state of its own and calls no hook. AreaSelectedPanel (List) and MapFilterSheet
 * (Map, #2628) both render it fed by their own `usePropertyFilterGroups` call.
 */
export function PropertyFilterGroups(props: PropertyFilterGroupsProps) {
  const {
    filters,
    isCommercialSubtypeSupported = false,
    isReadyToMoveSupported = true,
    layout = 'stacked',
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
    handleRemoveSubtype,
    handleRemovePropertyType,
    handleRemoveBudget,
    handleRemoveArea,
    handleRemoveBedroom,
    handleRemoveReadyToMove,
  } = props;

  // Issue #2729 §4 — the selected-chip list is IDENTICAL in both layouts (built once, reused by
  // both branches below) — "active filter count/selection remains visible" holds regardless of
  // which groups are inline vs under More filters, and there is exactly one chip-removal surface,
  // never two.
  const selectedChipsNode = (() => {
    const selectedChips: {
      key: string;
      label: string;
      testId: string;
      onRemove: () => void;
    }[] = [];

    const propertyTypeChips = filters.propertyTypes ?? [];
    const isDerivedCommercialFamilySelection =
      (filters.commercialSubtypes?.length ?? 0) === 0 &&
      propertyTypeChips.length === COMMERCIAL_FAMILY_TOKENS.length &&
      COMMERCIAL_FAMILY_TOKENS.every((token) => propertyTypeChips.includes(token));

    if (!isDerivedCommercialFamilySelection) {
      propertyTypeChips.forEach((type) => {
        selectedChips.push({
          key: `type-${type}`,
          label: getPropertyTypeLabel(type),
          testId: `selected-chip-type-${type}`,
          onRemove: () => handleRemovePropertyType(type),
        });
      });
    }

    if (isCommercialSubtypeSupported) {
      (filters.commercialSubtypes ?? []).forEach((subtype) => {
        selectedChips.push({
          key: `subtype-${subtype}`,
          label: COMMERCIAL_SUBTYPE_CHOICES.find((c) => c.value === subtype)?.label ?? subtype,
          testId: `selected-chip-subtype-${subtype}`,
          onRemove: () => handleRemoveSubtype(subtype),
        });
      });
    }

    if (shouldSubmitBedrooms(filters)) {
      (filters.bedrooms ?? []).forEach((bed) => {
        selectedChips.push({
          key: `bedrooms-${bed}`,
          label: `${bed} BHK`,
          testId: `selected-chip-bedrooms-${bed}`,
          onRemove: () => handleRemoveBedroom(bed),
        });
      });
    }

    if (filters.readyToMove && isReadyToMoveSupported) {
      selectedChips.push({
        key: 'ready-to-move',
        label: possessionLabel,
        testId: 'selected-chip-ready-to-move',
        onRemove: handleRemoveReadyToMove,
      });
    }

    if (activePriceMax != null) {
      selectedChips.push({
        key: 'budget',
        label:
          activeBudgetBands.find((b) => b.max === activePriceMax)?.label ??
          `≤ ₹${activePriceMax.toLocaleString('en-IN')}${budgetIntent === 'rent' ? '/month' : ''}`,
        testId: 'selected-chip-budget',
        onRemove: handleRemoveBudget,
      });
    }

    if (activeAreaMin != null || filters.areaMaxSqft != null) {
      const fmt = (n: number) => n.toLocaleString('en-IN');
      const range =
        activeAreaMin != null && filters.areaMaxSqft != null
          ? `${fmt(activeAreaMin)} – ${fmt(filters.areaMaxSqft)} sq ft`
          : activeAreaMin != null
            ? `${fmt(activeAreaMin)}+ sq ft`
            : `Up to ${fmt(filters.areaMaxSqft!)} sq ft`;
      selectedChips.push({
        key: 'area',
        label:
          areaControl.disclosure != null
            ? `${areaControl.shortLabel}: ${range} — ${areaControl.disclosure}`
            : `${areaControl.shortLabel}: ${range}`,
        testId: 'selected-chip-area',
        onRemove: handleRemoveArea,
      });
    }

    return <SelectedFilterChips chips={selectedChips} />;
  })();

  if (layout === 'compact') {
    // Issue #2729 §4/V1 — the compact toolbar's overflow collapse needs a `ResizeObserver` +
    // local state, which would break THIS component's own documented "no internal hook call, no
    // local state" contract (shared by AreaSelectedPanel AND MapFilterSheet). Extracted to
    // `CompactFilterToolbar`, which owns that state itself; this component stays hook-free and
    // just delegates, passing through every prop unchanged plus the already-built chip list.
    return <CompactFilterToolbar {...props} selectedChipsNode={selectedChipsNode} />;
  }

  return (
    <>
      {/* Quick filter block — property type + bedrooms directly on clean canvas background. */}
      <div className="border-b border-border px-4 py-1.5">
        <div className="space-y-1 flex flex-col gap-[11px] md:gap-[5px]" data-design-component="filter-toolbar">
            {/* Issue #2450 — TYPE family. Rendered ONLY when the calling surface can actually
                consume a Commercial subtype: while the capability is off the owner ruling is that
                today's buyer surface is preserved unchanged, so there is no family row at all
                rather than a one-option Residential selector.

                Issue #2555 mock parity — the approved design puts the label INLINE at the left of
                its own chips ("TYPE  Residential Commercial") rather than stacked above them, and
                trails the possession chip on the right of the same row. The label is "TYPE", the
                approved wording, not the "Property family" this previously read. */}
            {isCommercialSubtypeSupported && (
              <FamilyRow
                activeFamily={activeFamily}
                onSelectFamily={handleSelectFamily}
                possession={{
                  label: possessionLabel,
                  isSupported: isReadyToMoveSupported,
                  isActive: activeReadyToMove,
                  onToggle: handleToggleReadyToMove,
                }}
              />
            )}

            {!showSubtypeRow && (
              <ResidentialTypeRow
                types={RESIDENTIAL_TYPE_CHOICES}
                activeTypes={activePropertyTypes}
                allTypesActive={allTypesActive}
                onSelectAllTypes={handleSelectAllTypes}
                onToggleType={handleTogglePropertyType}
                // Issue #2555 — the possession chip moved to the TYPE row's trailing edge to
                // match the approved mock; see FamilyRow's note. While the capability is OFF
                // there is no separate TYPE/family row, so it is re-rendered here instead —
                // today's buyer surface must keep the control it has. While the capability is
                // ON, FamilyRow already renders it once — omitting the prop here (rather than
                // rendering it a second time) is what this extraction was for.
                possession={
                  isCommercialSubtypeSupported
                    ? undefined
                    : {
                        label: possessionLabel,
                        isSupported: isReadyToMoveSupported,
                        isActive: activeReadyToMove,
                        onToggle: handleToggleReadyToMove,
                      }
                }
              />
            )}

            {/* Commercial subtype row — family-local, so it appears only while Commercial is the
                active family and never alongside the Residential type chips. The second half of
                that sentence is enforced by the `!showSubtypeRow` guard on those chips above, on
                this same condition; an earlier revision asserted it in prose while the two rows
                rendered in the same block, which is how the contradictory selection stayed
                reachable. */}
            {showSubtypeRow && (
              <CommercialSubtypeRow
                choices={COMMERCIAL_SUBTYPE_CHOICES}
                activeSubtypes={activeCommercialSubtypes}
                onToggleSubtype={handleToggleSubtype}
              />
            )}

            {/* Separator between TYPE / subtype block and attribute groups */}
            <div className="my-[3px] hidden h-px bg-border md:block" data-testid="filter-divider" />

            {/* Issue #2555 / #2459 AC2 — Bedrooms is RESIDENTIAL-ONLY. A commercial row carries
                `bedrooms` NULL, so this control could only ever narrow the results to nothing; the
                approved Commercial mock has no Bedrooms row for that reason. The submit half of
                the same rule lives in `bedroomApplicability.ts`, which states that visibility is
                #2450's question — this is that half.

                The buyer's bedroom VALUE is deliberately not cleared when it is hidden: it stays in
                filter state and re-applies on the way back to Residential, exactly as that module's
                "suppression is about submission, not about the buyer's state" note requires. */}
            {showBedroomsRow && (
              <BedroomsRow
                bedroomOptions={QUICK_BEDROOMS}
                activeBedrooms={activeBedrooms}
                onToggleBedroom={handleToggleBedroom}
              />
            )}

            {/* Issue #2555 — AREA (SQ FT) presets. Each writes `areaMinSqft` through #2459's own
                `applyAreaBound`, the same writer the numeric AreaRangeFilter uses, and the label
                comes from #2459's resolver. Issue #2459 D1, the LABEL half of "meaning DISCLOSED
                in label and chip". */}
            <AreaSizeRow
              label={areaControlLabel}
              disclosure={areaControl.disclosure}
              presets={QUICK_AREA_PRESETS}
              activeAreaMin={activeAreaMin}
              onSelectArea={handleSelectArea}
            />

            {/* Issue #2555 item 3 — purpose- and family-aware bands; see QUICK_BUDGET_BANDS. */}
            <BudgetRow
              label={budgetIntent === 'rent' ? 'Monthly rent' : 'Budget'}
              bands={activeBudgetBands}
              activePriceMax={activePriceMax}
              onSelectBudget={handleSelectBudget}
            />

            {/* ── Issue #2555 item 2 — individually removable selected-filter chips ──────────
                #2450: "Use selected-filter chips that can be removed individually", and for mobile
                "selected filters can be removed."

                DISTINCT FROM THE CONTROLS ABOVE. Re-clicking an active control toggles it off,
                which is per-control toggling; and `handleClearPropertyFilters` is a family-local
                RESET. Neither is per-value removal, which is what this row provides.

                DISTINCT FROM `activeContextChips` TOO: that prop is an opaque caller-supplied
                ReactNode rendered near the header, with nothing the panel can attach a removal
                affordance to. This row is panel-owned, so it can. */}
            {(() => {
              const selectedChips: {
                key: string;
                label: string;
                testId: string;
                onRemove: () => void;
              }[] = [];

              // Issue #2572 — the four Commercial FAMILY TOKENS are a DERIVED expression of
              // "Commercial, no subtype yet", not four buyer selections, so they do not render as
              // four individually removable chips.
              const propertyTypeChips = filters.propertyTypes ?? [];
              const isDerivedCommercialFamilySelection =
                (filters.commercialSubtypes?.length ?? 0) === 0 &&
                propertyTypeChips.length === COMMERCIAL_FAMILY_TOKENS.length &&
                COMMERCIAL_FAMILY_TOKENS.every((token) => propertyTypeChips.includes(token));

              if (!isDerivedCommercialFamilySelection) {
                propertyTypeChips.forEach((type) => {
                  selectedChips.push({
                    key: `type-${type}`,
                    // #2430's shared authority, NOT this file's private map: that one covers only
                    // apartment/villa/land, so a Commercial family token from a URL rendered as the
                    // raw stored string.
                    label: getPropertyTypeLabel(type),
                    testId: `selected-chip-type-${type}`,
                    onRemove: () => handleRemovePropertyType(type),
                  });
                });
              }

              // Subtype chips are CAPABILITY-GATED (review finding). Rendering them while the flag
              // is off would put a working Commercial subtype control on the surface the owner
              // ruled must carry none.
              if (isCommercialSubtypeSupported) {
                (filters.commercialSubtypes ?? []).forEach((subtype) => {
                  selectedChips.push({
                    key: `subtype-${subtype}`,
                    label:
                      COMMERCIAL_SUBTYPE_CHOICES.find((c) => c.value === subtype)?.label ?? subtype,
                    testId: `selected-chip-subtype-${subtype}`,
                    onRemove: () => handleRemoveSubtype(subtype),
                  });
                });
              }

              // Issue #2555 item 2 — Bedrooms, gated on `shouldSubmitBedrooms` and deliberately NOT
              // on `showBedroomsRow`. Those answer two different questions: the ROW's visibility is
              // #2450's question, while the CHIP must track whether the value is actually
              // SUBMITTED (#2459 AC2's half).
              if (shouldSubmitBedrooms(filters)) {
                (filters.bedrooms ?? []).forEach((bed) => {
                  selectedChips.push({
                    key: `bedrooms-${bed}`,
                    label: `${bed} BHK`,
                    testId: `selected-chip-bedrooms-${bed}`,
                    onRemove: () => handleRemoveBedroom(bed),
                  });
                });
              }

              // Gated on the capability for the same honesty reason the chip itself is.
              if (filters.readyToMove && isReadyToMoveSupported) {
                selectedChips.push({
                  key: 'ready-to-move',
                  label: possessionLabel,
                  testId: 'selected-chip-ready-to-move',
                  onRemove: handleRemoveReadyToMove,
                });
              }

              if (activePriceMax != null) {
                selectedChips.push({
                  key: 'budget',
                  // Prefer the band's own approved wording so the chip and the control agree; fall
                  // back to a formatted value for a priceMax that arrived from a URL rather than
                  // from one of this family/intent's bands. THE FALLBACK CARRIES `/month` UNDER
                  // RENT (review finding).
                  label:
                    activeBudgetBands.find((b) => b.max === activePriceMax)?.label ??
                    `≤ ₹${activePriceMax.toLocaleString('en-IN')}${
                      budgetIntent === 'rent' ? '/month' : ''
                    }`,
                  testId: 'selected-chip-budget',
                  onRemove: handleRemoveBudget,
                });
              }

              if (activeAreaMin != null || filters.areaMaxSqft != null) {
                const fmt = (n: number) => n.toLocaleString('en-IN');
                const range =
                  activeAreaMin != null && filters.areaMaxSqft != null
                    ? `${fmt(activeAreaMin)} – ${fmt(filters.areaMaxSqft)} sq ft`
                    : activeAreaMin != null
                      ? `${fmt(activeAreaMin)}+ sq ft`
                      : `Up to ${fmt(filters.areaMaxSqft!)} sq ft`;
                // Issue #2459 D1, the CHIP half — the meaning travels with the value.
                selectedChips.push({
                  key: 'area',
                  label:
                    areaControl.disclosure != null
                      ? `${areaControl.shortLabel}: ${range} — ${areaControl.disclosure}`
                      : `${areaControl.shortLabel}: ${range}`,
                  testId: 'selected-chip-area',
                  onRemove: handleRemoveArea,
                });
              }

              // Nothing selected renders NO row at all, rather than an empty bordered strip —
              // chips for filters nobody applied would misreport the state of the search.
              // Rendering itself lives in SelectedFilterChips (Issue #2658 C3); this IIFE's
              // job is purely building the chip list above.
              return <SelectedFilterChips chips={selectedChips} />;
            })()}
        </div>
      </div>
    </>
  );
}
