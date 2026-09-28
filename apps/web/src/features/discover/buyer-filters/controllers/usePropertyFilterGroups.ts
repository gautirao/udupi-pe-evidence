// Issue #2628 — extracted from AreaSelectedPanel.tsx, behavior-preserving.
// Issue #2658 (C4) — relocated verbatim from
// components/discover/panels/PropertyFilterGroups.tsx (no logic change) into
// the buyer-filters domain, alongside the C1/C2 selectors/controllers it
// already delegates to, so that file could finally be deleted once its two
// production consumers (AreaSelectedPanel.tsx, MapFilterSheet.tsx) moved
// their import here.
//
// `usePropertyFilterGroups` is the SINGLE canonical implementation of the Residential/Commercial
// quick-filter derivation + handlers (family, type, subtype, bedrooms, budget, area, ready-to-move,
// and the individually-removable selected-filter chips). AreaSelectedPanel (List) and MapFilterSheet
// (#2628, Map) each call the hook exactly ONCE and pass its result into the presentational
// `PropertyFilterGroups` component (sections/PropertyFilterGroups.tsx) — calling the hook twice for
// the same filters/onFiltersChange pair would create two independent `familyOverride` states free
// to disagree (the exact "two family authorities" class #2596 fixed), so callers that also need
// `activeFamily`/`hasPropertyFilters`/`handleClearPropertyFilters` for their own UI (e.g. the
// results heading, zero-result recovery) must read them off the SAME hook call they pass down,
// never a second one.
import { useCallback, useMemo } from 'react';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { CommercialSubtype } from '@/lib/listing-constants';
import { applyAreaBound } from '@/features/discover/filters/areaBounds';
import { resolvePrimaryAreaControlLabel } from '@/features/discover/filters/primaryAreaLabels';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import {
  COMMERCIAL_FAMILY_TOKENS,
  withoutCommercialFamilyTokens,
} from '@/features/discover/buyer-filters/selectors/familyTokens';
import { hasPropertyFilters as computeHasPropertyFilters } from '@/features/discover/buyer-filters/selectors/hasPropertyFilters';
import { clearPropertyFilters as computeClearedFilters } from '@/features/discover/buyer-filters/selectors/clearPropertyFilters';
import {
  computeAllCommercialPatch,
  computeRemoveSubtypePatch,
  computeToggleSubtypePatch,
} from '@/features/discover/buyer-filters/selectors/familySwitchTransitions';
import { useBuyerFamilyController } from '@/features/discover/buyer-filters/controllers/useBuyerFamilyController';

export { withoutCommercialFamilyTokens, COMMERCIAL_FAMILY_TOKENS };

/**
 * Issue #2450 — the two TYPE families a buyer chooses between.
 *
 * Commercial rides the SUBTYPE axis alone (see `COMMERCIAL_SUBTYPE_CHOICES` in
 * sections/PropertyFilterGroups.tsx), which is why there is no
 * `QUICK_COMMERCIAL_TYPES` counterpart.
 */
export type PropertyFamily = 'residential' | 'commercial';

interface QuickBudgetBand {
  label: string;
  max: number;
}

/**
 * Issue #2555 item 3 — PURPOSE-AWARE, FAMILY-LOCAL budget bands.
 *
 * #2450: "Buy uses total purchase-price bands. Rent/Lease uses monthly bands with `/month`.
 * Budget state is independent per family/intent." The previous single `QUICK_BUDGETS` list was
 * max-only with NO intent branch and no family branch, so a Commercial shopper and a renter were
 * both offered residential purchase-price ceilings.
 *
 * WHY THE TABLE IS KEYED BY FAMILY AND NOT ONLY BY INTENT. The owner mock's Buy row
 * (≤ ₹1 Cr / ≤ ₹2.5 Cr / ≤ ₹5 Cr) is the COMMERCIAL state. Applying it globally would replace the
 * Residential bands, which are separately approved under #2023 and pinned by
 * `AreaSelectedPanel.test.tsx`. Keying by family satisfies the mock, #2450's "independent per
 * family/intent" sentence, and the existing suite at the same time, instead of trading one against
 * another.
 *
 * RENT/LEASE IS ONE INTENT, NOT TWO — the #2458 decision this issue is required to follow.
 * `LEASE` is not persistable (`chk_listing_purpose` admits only 'sale'/'rent') and zero LEASE rows
 * exist or can be created, so the ruling is: the LABEL reads "Rent / Lease", `rent` remains the
 * SOLE query value, and no third purpose is invented. That is why the key below is the existing
 * `DiscoverIntent` ('buy' | 'rent') and nothing new was coined for it.
 *
 * THE RENT THRESHOLDS ARE RATIFIED, NOT PROVISIONAL. Owner decision `5662756143` (D2) adopts the
 * exact bands below as the MVP production contract: Residential ≤ ₹15,000 / ₹30,000 / ₹50,000 and
 * Commercial ≤ ₹50,000 / ₹1,00,000 / ₹2,50,000 per month.
 *
 * ⚠ DO NOT REINTRODUCE "PROVISIONAL" OR "PLACEHOLDER" WORDING HERE. The ruling is explicit:
 * "source/PR wording must stop calling these bands provisional/placeholders or saying they still
 * await an owner ruling."
 *
 * THIS TABLE IS THE SINGLE AUTHORITATIVE LOCATION for every band, so calibration is a value edit
 * here and touches no interaction logic: the controls read `QUICK_BUDGET_BANDS[family][intent]`,
 * the selected-filter chip resolves its label from that same array, and no other module in the app
 * carries a copy of these numbers.
 *
 * LEASE presents exactly as Rent — same monthly bands, same `/month` suffix — per the #2458
 * decision above. There is no third pricing model.
 *
 * The BUY bands reach the same settled status by a different route: Residential is #2023's approved
 * set, Commercial is the owner-approved mock's (≤ ₹1 Cr / ≤ ₹2.5 Cr / ≤ ₹5 Cr).
 *
 * A max-only band in every cell: the "Any price" chip clears priceMin/priceMax entirely, because
 * this card has no min-price control.
 */
export const QUICK_BUDGET_BANDS: Record<
  'residential' | 'commercial',
  Record<'buy' | 'rent', readonly QuickBudgetBand[]>
> = {
  residential: {
    // Issue #2023's approved bands — deliberately unchanged.
    buy: [
      { label: '≤ ₹50L', max: 5_000_000 },
      { label: '≤ ₹80L', max: 8_000_000 },
      { label: '≤ ₹1.2Cr', max: 12_000_000 },
    ],
    rent: [
      { label: '≤ ₹15,000/month', max: 15_000 },
      { label: '≤ ₹30,000/month', max: 30_000 },
      { label: '≤ ₹50,000/month', max: 50_000 },
    ],
  },
  commercial: {
    // The owner-approved mock's Buy row.
    buy: [
      { label: '≤ ₹1 Cr', max: 10_000_000 },
      { label: '≤ ₹2.5 Cr', max: 25_000_000 },
      { label: '≤ ₹5 Cr', max: 50_000_000 },
    ],
    rent: [
      { label: '≤ ₹50,000/month', max: 50_000 },
      { label: '≤ ₹1,00,000/month', max: 100_000 },
      { label: '≤ ₹2,50,000/month', max: 250_000 },
    ],
  },
};

export interface UsePropertyFilterGroupsArgs {
  filters: PropertyFilters;
  onFiltersChange?: (next: PropertyFilters) => void;
  intent?: DiscoverIntent;
  isReadyToMoveSupported?: boolean;
  isCommercialSubtypeSupported?: boolean;
}

/**
 * Extracted verbatim from `AreaSelectedPanel.tsx` (Issue #2628) — every derived value, handler,
 * ref and effect the quick-filter card needs, mechanically relocated with no logic change. See the
 * file header for why this must be called exactly once per (filters, onFiltersChange) pair.
 */
export function usePropertyFilterGroups({
  filters,
  onFiltersChange,
  intent = 'buy',
  isReadyToMoveSupported = true,
  isCommercialSubtypeSupported = false,
}: UsePropertyFilterGroupsArgs) {
  // Compute active property types and bedrooms from current filters
  const activePropertyTypes = useMemo(
    () => new Set(filters.propertyTypes || []),
    [filters.propertyTypes],
  );
  const activeBedrooms = useMemo(
    () => new Set(filters.bedrooms || []),
    [filters.bedrooms],
  );
  const allTypesActive = activePropertyTypes.size === 0;
  // Budget chips are single-select (max-only bands); "Any price" is active
  // when no priceMax is set.
  const activePriceMax = filters.priceMax;
  const activeReadyToMove = Boolean(filters.readyToMove);

  // Issue #2658 (C1/C2 wiring) — delegates to the pure selector in
  // features/discover/buyer-filters/selectors/hasPropertyFilters.ts, which
  // carries the full #2450/#2555/#2023-review truthiness-asymmetry
  // reasoning that used to live inline here.
  const hasPropertyFilters = computeHasPropertyFilters(filters, { isReadyToMoveSupported });

  // Toggle property type: add if not present, remove if already active
  const handleTogglePropertyType = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const current = filters.propertyTypes || [];
      const updated = activePropertyTypes.has(type)
        ? current.filter((t) => t !== type)
        : [...current, type];
      // Issue #2552 — while the capability is ON this row renders only while Residential is the
      // active family, so the click is an unambiguous Residential statement. (With the capability
      // OFF the type chips render regardless of the derived family — see the `familySubtype` arm
      // "keeps the Residential type chips on an inbound subtype URL while the capability is off" —
      // but there is no family row, so the override is unobservable and recording it is inert.)
      // Recording it matters on the DESELECT path: if
      // this empties `propertyTypes`, the filters fall silent on family again, and a stale
      // `'commercial'` override left over from an earlier click would otherwise resurrect and
      // throw the buyer into Commercial from inside the Residential row.
      setFamilyOverride('residential');
      // Issue #2555 item 1 (review finding) — TOGGLING THE LAST CHIP OFF IS A DELIBERATE CLEAR and
      // must invalidate the memory, exactly like the explicit "All" affordance does.
      residentialMemoryRef.current =
        updated.length > 0 ? (updated as PropertyFilters['propertyTypes']) : undefined;
      onFiltersChange({ ...filters, propertyTypes: updated.length > 0 ? updated : undefined });
    },
    [filters, activePropertyTypes, onFiltersChange],
  );

  // "All" chip clears the property-type selection (does not touch bedrooms/price).
  const handleSelectAllTypes = useCallback(() => {
    if (!onFiltersChange) return;
    if (allTypesActive) return; // already all
    setFamilyOverride('residential');
    residentialMemoryRef.current = undefined;
    onFiltersChange({ ...filters, propertyTypes: undefined });
  }, [filters, allTypesActive, onFiltersChange]);

  // Toggle bedroom count: add if not present, remove if already active
  const handleToggleBedroom = useCallback(
    (bed: number) => {
      if (!onFiltersChange) return;
      const current = filters.bedrooms || [];
      const updated = activeBedrooms.has(bed)
        ? current.filter((b) => b !== bed)
        : [...current, bed];
      onFiltersChange({ ...filters, bedrooms: updated.length > 0 ? updated : undefined });
    },
    [filters, activeBedrooms, onFiltersChange],
  );

  // Budget chips are single-select: picking a band replaces priceMax (and
  // clears priceMin — this card has no min control). `undefined` = "Any price".
  const handleSelectBudget = useCallback(
    (max: number | undefined) => {
      if (!onFiltersChange) return;
      onFiltersChange({ ...filters, priceMin: undefined, priceMax: max });
    },
    [filters, onFiltersChange],
  );

  // "Ready to move" is a boolean toggle chip. Issue #2023 code-review follow-up —
  // when the calling surface's listings hook can't actually filter on this
  // (isReadyToMoveSupported === false), the chip must not be toggleable at all,
  // so this bails out even if a click somehow reaches it (e.g. programmatic).
  const handleToggleReadyToMove = useCallback(() => {
    if (!onFiltersChange || !isReadyToMoveSupported) return;
    onFiltersChange({ ...filters, readyToMove: activeReadyToMove ? undefined : true });
  }, [filters, activeReadyToMove, onFiltersChange, isReadyToMoveSupported]);

  // ── Issue #2450 — Residential / Commercial family + Commercial subtype ─────────────────
  const activeCommercialSubtypes = useMemo(
    () => new Set<string>(filters.commercialSubtypes ?? []),
    [filters.commercialSubtypes],
  );

  const {
    activeFamily,
    commercialFromFilters,
    setFamilyOverride,
    residentialMemoryRef,
    commercialMemoryRef,
    commit: commitFamily,
    resetForClear: resetFamilyForClear,
  } = useBuyerFamilyController(filters, isCommercialSubtypeSupported);

  // ANON POSTURE — owner ruling on PR #2500. ANONYMOUS BUYERS BROWSE AND FILTER COMMERCIAL
  // EXACTLY AS THEY DO RESIDENTIAL. REACHABILITY IS GOVERNED BY THE CAPABILITY ALONE — see
  // `isCommercialSubtypeSupported`.
  const showSubtypeRow = isCommercialSubtypeSupported && activeFamily === 'commercial';

  const handleSelectFamily = useCallback(
    (family: PropertyFamily) => {
      const patch = commitFamily(family);
      if (patch === null || !onFiltersChange) return;
      onFiltersChange(patch);
    },
    [commitFamily, onFiltersChange],
  );

  // ONE AXIS WHILE A SUBTYPE IS HELD. A subtype selection rides `commercialSubtypes` and carries
  // no family token, because a token emitted ALONGSIDE a subtype matches zero rows and fails
  // silently for BUILDING / WAREHOUSE / LAND — see `COMMERCIAL_FAMILY_TOKENS`.
  const handleToggleSubtype = useCallback(
    (value: CommercialSubtype | null) => {
      if (!onFiltersChange || !isCommercialSubtypeSupported) return;
      setFamilyOverride('commercial');
      if (value === null) {
        // "All commercial" clears the SUBTYPE narrowing without leaving the family.
        commercialMemoryRef.current = undefined;
        onFiltersChange(computeAllCommercialPatch(filters));
        return;
      }
      const current = filters.commercialSubtypes ?? [];
      const updated = activeCommercialSubtypes.has(value)
        ? current.filter((s) => s !== value)
        : [...current, value];
      commercialMemoryRef.current = updated.length > 0 ? updated : undefined;
      onFiltersChange(computeToggleSubtypePatch(filters, value));
    },
    [filters, activeCommercialSubtypes, onFiltersChange, isCommercialSubtypeSupported],
  );

  // Clear property-type filters only; preserve school, polygon, city, date, and other active filters
  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    resetFamilyForClear();
    onFiltersChange(computeClearedFilters(filters));
  }, [filters, onFiltersChange, resetFamilyForClear]);

  // ── Issue #2555 — AREA (SQ FT) presets, on #2459's real contract ─────────────────────────
  const handleSelectArea = useCallback(
    (min: number | undefined) => {
      if (!onFiltersChange) return;
      onFiltersChange(applyAreaBound(filters, 'areaMinSqft', min));
    },
    [filters, onFiltersChange],
  );

  // ── Issue #2555 item 2 — individually removable selected-filter chips ────────────────────
  const handleRemoveSubtype = useCallback(
    (value: CommercialSubtype) => {
      if (!onFiltersChange || !isCommercialSubtypeSupported) return;
      const remaining = (filters.commercialSubtypes ?? []).filter((s) => s !== value);
      const next = remaining.length > 0 ? remaining : undefined;
      setFamilyOverride('commercial');
      commercialMemoryRef.current = next;
      onFiltersChange(computeRemoveSubtypePatch(filters, value));
    },
    [filters, onFiltersChange, isCommercialSubtypeSupported],
  );

  const handleRemovePropertyType = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const remaining = (filters.propertyTypes ?? []).filter((t) => t !== type);
      const next = remaining.length > 0 ? remaining : undefined;
      const removedFamilyToken = (COMMERCIAL_FAMILY_TOKENS as readonly string[]).includes(type);
      setFamilyOverride(removedFamilyToken ? 'commercial' : 'residential');
      residentialMemoryRef.current = withoutCommercialFamilyTokens(next);
      onFiltersChange({
        ...filters,
        propertyTypes: next ?? (removedFamilyToken ? [...COMMERCIAL_FAMILY_TOKENS] : undefined),
      });
    },
    [filters, onFiltersChange],
  );

  const handleRemoveBudget = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({ ...filters, priceMin: undefined, priceMax: undefined });
  }, [filters, onFiltersChange]);

  const handleRemoveArea = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({ ...filters, areaMinSqft: undefined, areaMaxSqft: undefined });
  }, [filters, onFiltersChange]);

  const handleRemoveBedroom = useCallback(
    (bed: number) => {
      if (!onFiltersChange) return;
      const remaining = (filters.bedrooms ?? []).filter((b) => b !== bed);
      onFiltersChange({ ...filters, bedrooms: remaining.length > 0 ? remaining : undefined });
    },
    [filters, onFiltersChange],
  );

  const handleRemoveReadyToMove = useCallback(() => {
    if (!onFiltersChange) return;
    onFiltersChange({ ...filters, readyToMove: undefined });
  }, [filters, onFiltersChange]);

  // ── Issue #2555 — derived presentation state for the approved filter card ────────────────
  const budgetIntent: 'buy' | 'rent' = intent === 'rent' ? 'rent' : 'buy';
  const activeBudgetBands = QUICK_BUDGET_BANDS[activeFamily][budgetIntent];

  const areaControl = resolvePrimaryAreaControlLabel({
    propertyTypes: filters.propertyTypes,
    commercialSubtypes: filters.commercialSubtypes,
  });
  const areaControlLabel = areaControl.label;
  const activeAreaMin = filters.areaMinSqft;

  // #2450 copy rule: "Prefer `Ready to occupy` in Commercial contexts."
  const possessionLabel = activeFamily === 'commercial' ? 'Ready to occupy' : 'Ready to move';

  // #2459 AC2 / #2596 — Bedrooms is RESIDENTIAL-ONLY and follows the SUBMITTED rule
  // (`shouldSubmitBedrooms`), not just the family half of it — see that module's header for
  // the Plot-sentence gap this closed.
  const showBedroomsRow = activeFamily !== 'commercial' && shouldSubmitBedrooms(filters);

  return {
    activeFamily,
    setFamilyOverride,
    residentialMemoryRef,
    commercialMemoryRef,
    activePropertyTypes,
    activeBedrooms,
    activeCommercialSubtypes,
    allTypesActive,
    activePriceMax,
    activeReadyToMove,
    hasPropertyFilters,
    showSubtypeRow,
    showBedroomsRow,
    activeBudgetBands,
    areaControl,
    areaControlLabel,
    activeAreaMin,
    budgetIntent,
    possessionLabel,
    commercialFromFilters,
    handleTogglePropertyType,
    handleSelectAllTypes,
    handleToggleBedroom,
    handleSelectBudget,
    handleToggleReadyToMove,
    handleSelectFamily,
    handleToggleSubtype,
    handleClearPropertyFilters,
    handleSelectArea,
    handleRemoveSubtype,
    handleRemovePropertyType,
    handleRemoveBudget,
    handleRemoveArea,
    handleRemoveBedroom,
    handleRemoveReadyToMove,
  };
}

export type UsePropertyFilterGroupsResult = ReturnType<typeof usePropertyFilterGroups>;
