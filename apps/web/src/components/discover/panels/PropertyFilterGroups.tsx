// Issue #2628 — extracted from AreaSelectedPanel.tsx, behavior-preserving.
//
// `usePropertyFilterGroups` is the SINGLE canonical implementation of the Residential/Commercial
// quick-filter derivation + handlers (family, type, subtype, bedrooms, budget, area, ready-to-move,
// and the individually-removable selected-filter chips). AreaSelectedPanel (List) and MapFilterSheet
// (#2628, Map) each call the hook exactly ONCE and pass its result into the presentational
// `PropertyFilterGroups` component below — calling the hook twice for the same filters/onFiltersChange
// pair would create two independent `familyOverride` states free to disagree (the exact "two family
// authorities" class #2596 fixed), so callers that also need `activeFamily`/`hasPropertyFilters`/
// `handleClearPropertyFilters` for their own UI (e.g. the results heading, zero-result recovery) must
// read them off the SAME hook call they pass down, never a second one.
//
// `PropertyFilterGroups` itself is deliberately presentational only (no internal hook call, no local
// state): every value and handler it renders comes in as a prop, so the JSX below is unchanged from
// its original AreaSelectedPanel.tsx form beyond the file boundary.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import type { DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import type { CommercialSubtype } from '@/lib/listing-constants';
import { applyAreaBound } from '@/features/discover/filters/areaBounds';
import { resolvePrimaryAreaControlLabel } from '@/features/discover/filters/primaryAreaLabels';
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
import { getPropertyTypeLabel } from '@/lib/propertyTypeConfig';

const QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'residential_plot'] as const;
const QUICK_BEDROOMS = [2, 3] as const;

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
 * await an owner ruling." TWO earlier revisions of this paragraph did exactly that — the first
 * because the ruling had not yet landed (true when written), the second because it misread the
 * ruling and recorded the bands as approved-BUT-provisional. Both erred in the direction that
 * matters: they described a settled product contract as unsettled.
 *
 * THEY ARE STILL NOT MARKET DATA, and the two statements are compatible rather than in tension.
 * #2450 requires production thresholds to be RECORDED ("The illustrative values in #2429 are not
 * market data"); the ruling adopts these as "owner-approved MVP product thresholds, not claimed
 * market data". So nothing in the product, its copy, or any downstream artefact may present them as
 * market-derived or as recommended market bands. RATIFIED answers who decided them; NOT-MARKET-DATA
 * answers how they were arrived at. Conflating the two is what produced the wrong revision above.
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
 * BUY-VS-RENT SEMANTICS ARE TESTED, as that same ruling requires. `AreaSelectedPanel.dod2555` pins
 * monthly `/month` bands under the rent intent, their ABSENCE under buy, and the same contrast in
 * both directions on the selected-Budget chip's off-band fallback label.
 *
 * A max-only band in every cell: the "Any price" chip clears priceMin/priceMax entirely, because
 * this card has no min-price control.
 */
const QUICK_BUDGET_BANDS: Record<
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

/**
 * Issue #2555 — the mock's AREA (SQ FT) presets.
 *
 * `min: undefined` is the "Any size" chip: it CLEARS the bound rather than setting a zero one, so
 * it is the absence of a narrowing rather than a fourth size. Mirrors how "All commercial" and
 * "Any price" express the same idea elsewhere in this file.
 *
 * These write `areaMinSqft` through #2459's own `applyAreaBound`, so the presets and the numeric
 * `AreaRangeFilter` cannot disagree about what a bound means.
 */
const QUICK_AREA_PRESETS: readonly { testId: string; label: string; min: number | undefined }[] = [
  { testId: 'quick-chip-area-any', label: 'Any size', min: undefined },
  { testId: 'quick-chip-area-1000', label: '1,000+ sq ft', min: 1000 },
  { testId: 'quick-chip-area-2500', label: '2,500+ sq ft', min: 2500 },
  { testId: 'quick-chip-area-5000', label: '5,000+ sq ft', min: 5000 },
];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartments',
  villa: 'Villas',
  residential_plot: 'Plots',
};

/**
 * Issue #2450 — the two TYPE families a buyer chooses between.
 *
 * `QUICK_PROPERTY_TYPES` above is the Residential family's membership; Commercial rides the
 * SUBTYPE axis alone (see `COMMERCIAL_SUBTYPE_CHOICES`), which is why there is no
 * `QUICK_COMMERCIAL_TYPES` counterpart.
 */
export type PropertyFamily = 'residential' | 'commercial';

/**
 * Stored `property_type` tokens that mean "this selection is in the Commercial family".
 *
 * Used to DERIVE which family chip reads as active from inbound URL/filter state, and — since
 * Issue #2572 — WRITTEN in one narrow case: to express "the Commercial family, no subtype yet".
 *
 * This paragraph previously read "deliberately never used to WRITE". That absolute was superseded,
 * not forgotten. The hazard it guarded is real and unchanged: emitting one of these ALONGSIDE a
 * subtype is the auto-add contradiction #2450 exists to remove (`type=commercial&subtype=WAREHOUSE`
 * asks for a set no row is in, because `commercial` rows never carry WAREHOUSE — reproduced against
 * the fixture as zero rows). That hazard requires a subtype to exist. With none held there is
 * nothing to contradict, and writing nothing at all was itself the defect: the family control
 * narrowed nothing and Residential rows stayed on screen under a Commercial selection. Every write
 * site is therefore conditional on no subtype being held, and strips these tokens when one arrives.
 * Mirrors the server's `DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE` value set.
 *
 * DRIFT WARNING (#2552). These are the same four values as the commercial members of
 * `PROPERTY_TYPES` in `lib/listing-constants.ts`. That duplication predates this file, but #2552
 * promoted this constant from READ-only (deriving which chip reads as active) to the WRITE path
 * (`withoutCommercialFamilyTokens` strips exactly these on a switch to Residential), which raises
 * the cost of the two lists drifting apart: a commercial type added there and not here would stop
 * being stripped, and the contradictory-family state this issue removes would come back.
 *
 * WHY ONLY THE RESIDENTIAL SIDE NEEDS STRIPPING (#2555). `propertyTypes` is a SHARED axis: it
 * carries both families' tokens, which is the whole reason this constant exists. `commercialSubtypes`
 * is EXCLUSIVE — a Residential value has no route into it. So the per-family memory needs a strip on
 * the residential side and provably cannot need one on the commercial side. That asymmetry is not
 * obvious from the two refs sitting side by side, and mistaking it for symmetry invites either a
 * pointless strip on the commercial side or a missing one here.
 */
// Issue #2572 — typed from `PropertyFilters['propertyTypes']` rather than `readonly string[]`.
// While these were only ever READ (membership tests), `string[]` cost nothing. #2572 made them a
// WRITTEN value, and `string[]` is not assignable to `PropertyType[]`, so every emission site
// raised TS2322/TS2345. Deriving the element type from the filter contract keeps the two in step by
// construction: a property type added or removed there cannot leave this list mistyped, and no
// `PropertyType` import is needed because `PropertyFilters` is already in scope.
export const COMMERCIAL_FAMILY_TOKENS: readonly NonNullable<PropertyFilters['propertyTypes']>[number][] = [
  'commercial',
  'commercial_building',
  'warehouse',
  'commercial_land',
];

/**
 * Issue #2552 — drops the Commercial FAMILY tokens from a property-type selection while preserving
 * every Residential one.
 *
 * Returns `undefined` rather than `[]` when nothing survives, matching how every other handler in
 * this file expresses "no property-type narrowing" (see `handleTogglePropertyType`); an empty array
 * would instead read as a narrowing to zero types.
 */
export const withoutCommercialFamilyTokens = (
  types: PropertyFilters['propertyTypes'],
): PropertyFilters['propertyTypes'] => {
  const kept = (types ?? []).filter((type) => !COMMERCIAL_FAMILY_TOKENS.includes(type));
  return kept.length > 0 ? kept : undefined;
};

/**
 * #2450's approved buyer wording for the Commercial subtype row.
 *
 * DELIBERATELY NOT `COMMERCIAL_SUBTYPE_LABELS` from propertyTypeConfig.ts, which renders SHOP as
 * "Commercial Shop" and OFFICE as "Commercial Office". That is correct on a result CARD, where a
 * bare "Shop" would read as a different property family. Inside a row already scoped to Commercial
 * the family context is established by the control itself, so #2450 specifies the shorter wording.
 * The mismatch is recorded on PR #2500 as a focused follow-up — it is not a second private label
 * map, and it does not change #2430's card labels.
 *
 * `value: null` is the "All commercial" chip: it clears the subtype narrowing WITHOUT leaving the
 * family, so it is a virtual choice rather than a sixth subtype.
 */
const COMMERCIAL_SUBTYPE_CHOICES: readonly {
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

  const hasPropertyFilters = Boolean(
    filters.propertyTypes?.length ||
      // Issue #2450 — a subtype-only selection is a REAL narrowing under the one-axis contract
      // (it rides `commercialSubtypes` and sets no `propertyTypes`), so omitting it here would
      // hide the clear affordance from the only filter the buyer has actually applied and tell
      // the empty state that nothing is narrowing when something is.
      filters.commercialSubtypes?.length ||
      filters.bedrooms?.length ||
      filters.priceMin ||
      filters.priceMax ||
      // Issue #2555 (fifth-cycle review) — the AREA axis, for exactly the reason the
      // `commercialSubtypes` note above gives. Omitting it made an area-only narrowing read as
      // "no filters active", so a buyer who clicked "5,000+ sq ft" into a zero-result state was
      // told "this is a real area with nothing listed today, NOT a filtered-out result" — a claim
      // about the marketplace contradicted by their own one click — and `onClearFilters` resolved
      // to `undefined`, withdrawing the escape hatch from the only filter they had applied.
      //
      // The omission predates this issue: an area bound could already arrive by URL or from the
      // filters sheet, and both readers ignored it. What changed is REACHABILITY — the AREA
      // presets are ungated and render on the default surface, so it went from a hand-edited URL
      // to one click on the card, which is why it is fixed here rather than left as inherited.
      filters.areaMinSqft != null ||
      filters.areaMaxSqft != null ||
      // Issue #2023 code-review follow-up — a stale/URL-carried readyToMove
      // has no effect on this surface's listings when unsupported (see
      // `isReadyToMoveSupported` JSDoc), so it must not drive "filters are
      // active" copy/empty-state messaging here either — that would tell the
      // user filters are narrowing results when none actually are.
      (isReadyToMoveSupported && filters.readyToMove)
  );

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
      //
      // The recording effect banks only NON-EMPTY selections, so an emptying emission would
      // otherwise leave the memory holding the very selection the buyer just removed: deselect
      // Apartments, switch to Commercial, switch back, and `['apartment']` returns from the dead.
      // A wrong-NARROWING bug — the buyer gets a query they explicitly cleared two clicks earlier.
      // THE ONE TYPECHECK FINGERPRINT THIS BRANCH ADDED, found by a subtraction control against the
      // clean base rather than by the branch-to-branch diff that missed it. `updated` widens to
      // `string[]` because `type` is a `string` parameter while `current` is `PropertyType[]`, so
      // banking it into this ref — typed from `PropertyFilters` — fails, even though the emission on
      // the next line fails identically at `a4648232` and is therefore not new.
      //
      // The cast is sound: every caller passes a `QUICK_PROPERTY_TYPES` member, so the value really
      // is a property-type token. The two PRE-EXISTING errors in this handler (the `Set.has(type)`
      // argument above and the emission below) are deliberately left alone — they predate this lane,
      // and silently changing a shared baseline is not this PR's business.
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
    // Issue #2552 — see `handleTogglePropertyType`. This emission ALWAYS empties `propertyTypes`,
    // so it is the most direct route back to family-silent filters, and the one that resurrected a
    // stale Commercial override most visibly.
    setFamilyOverride('residential');
    // Issue #2555 item 1 — "All" is an EXPLICIT choice to hold no type, so it becomes this
    // family's last selection. Leaving the memory intact here would resurrect a selection the
    // buyer just deliberately dropped the next time they returned to Residential.
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

  // The family is DERIVED from filter state rather than stored separately. Under the one-axis
  // contract a selection rides `commercialSubtypes` alone and sets no `propertyTypes`, so a
  // restored link carrying only `subtype=WAREHOUSE` must still read as Commercial — otherwise the
  // buyer returns to their own link and sees Residential selected while Commercial results render.
  const commercialFromFilters =
    activeCommercialSubtypes.size > 0 ||
    (filters.propertyTypes ?? []).some((t) => COMMERCIAL_FAMILY_TOKENS.includes(t));

  // A click must switch the visible family before the emitted filters round-trip back as props:
  // on the FIRST Commercial click there is no subtype yet, so derivation alone would leave the row
  // closed and the chip unpressed. `null` means "no click yet — trust the filters".
  const [familyOverride, setFamilyOverride] = useState<PropertyFamily | null>(null);

  /**
   * Issue #2555 item 1 — PER-FAMILY MEMORY.
   *
   * `familyOverride` above records WHICH family is active and never WHAT was selected inside it,
   * so switching away and back restored nothing. These hold each family's last selection so the
   * switch-back can put it back — #2450: "Restore each family's last subtype selection when
   * switching back."
   *
   * REFS, NOT STATE, DELIBERATELY. Nothing renders from these directly: they are read only inside
   * `handleSelectFamily`, at the moment of a switch. Holding them in state would schedule a render
   * per selection change that changes no output — and worse, would make the memory a second
   * renderable source of truth about what is selected, free to disagree with `filters`. The
   * displayed selection has exactly one owner (`filters`); these are a side channel consulted only
   * when that owner is about to be told to drop an axis.
   */
  const residentialMemoryRef = useRef<PropertyFilters['propertyTypes']>(undefined);
  const commercialMemoryRef = useRef<PropertyFilters['commercialSubtypes']>(undefined);

  // Issue #2552 — the override is consulted ONLY while the filters are family-SILENT.
  //
  // It previously won unconditionally (`familyOverride ?? derived`), permanently and for the life
  // of the mount, with nothing clearing it when `filters` changed underneath. That left the
  // displayed family and the emitted predicate free to disagree: the panel could read Residential
  // while the query still selected Commercial rows. A wrong-RESULTS defect, not a stale display —
  // which is why the #2552 spec asserts emitted filters rather than which chip is highlighted.
  //
  // THIS CONDITION IS ONLY HALF THE FIX, and the other half is easy to miss — exact-head review of
  // PR #2582 found it after this comment first claimed the invariant was complete. Scoping the
  // override here makes "the override cannot contradict the FILTERS" true, but the override is
  // still WRITTEN in only one place unless the Residential-row handlers also record intent. A
  // stale `'commercial'` then outlives the state that superseded it and resurrects the moment the
  // filters fall silent again — clear the type chips from inside the Residential row and the panel
  // jumps to Commercial over a predicate carrying no narrowing at all. `handleSelectAllTypes`,
  // `handleTogglePropertyType` and `handleClearPropertyFilters` close those paths; see each.
  //
  // WHY RECONCILIATION RATHER THAN AN EFFECT OR A KEY RESET. An effect keyed on `filters` would
  // also clear the override on the panel's OWN emission, slamming the subtype row shut on the very
  // first Commercial click — that emission is `propertyTypes: undefined` with no subtype yet, so
  // derivation alone yields Residential, which is the whole reason the override exists. Scoping it
  // to the ambiguous case needs no extra state, no basis-tracking and no render pass: the override
  // CANNOT contradict the filters, because it only speaks when they say nothing about family.
  // `allTypesActive` is this file's canonical reader for "no property-type narrowing"
  // (`activePropertyTypes.size === 0`, memoised above). Re-deriving it inline would be a second
  // expression of one predicate, and the two would then be free to drift.
  const familyIsUnset = activeCommercialSubtypes.size === 0 && allTypesActive;
  const activeFamily: PropertyFamily = commercialFromFilters
    ? 'commercial'
    : familyIsUnset && familyOverride !== null
      ? familyOverride
      : 'residential';

  /**
   * Issue #2555 item 1 — keep each family's memory in step with what it currently holds.
   *
   * AN EFFECT, NOT A WRITE DURING RENDER, AND NOT A WRITE INSIDE EACH HANDLER.
   *
   * The timing is the whole point. This runs AFTER the render it observes, so at the instant
   * `handleSelectFamily` fires, the ref still holds the selection as it stood BEFORE the click —
   * which is precisely the value the switch-away needs to bank. Recording inside each selection
   * handler instead would mean every future control that touches an axis has to remember to
   * record too, and the one that forgets loses the buyer's selection silently.
   *
   * WHATEVER THE ACTIVE FAMILY HOLDS IS BANKED, INCLUDING NOTHING — and the history of this line
   * is why it is written that way.
   *
   * It originally recorded only NON-EMPTY selections, reasoning that an empty axis is not worth
   * restoring and that banking `undefined` would erase the value on the very emission that clears
   * the axis for a switch. The first half was wrong and the second does not happen. A cleared axis
   * IS a selection — "I want no narrowing here" — and refusing to bank it meant every clear had to
   * be mirrored by hand in the handler that performed it. That obligation was then missed FIVE
   * times: both toggle handlers (found by review), and the zero-result relaxation's "Include every
   * property type" offer (found by the re-review, after the first fix claimed the class was
   * closed). Each miss resurrected a selection the buyer had explicitly cleared — a wrong-NARROWING
   * bug, not a lost convenience.
   *
   * WHY THE ERASURE IT FEARED CANNOT HAPPEN. On a switch to Commercial, `setFamilyOverride` and the
   * emission batch into ONE render, so by the time this effect observes anything `activeFamily` is
   * already `'commercial'` — the residential branch does not run and the banked value survives.
   * The same holds mirrored. The guard was protecting against an ordering that React's batching
   * already prevents.
   *
   * The per-handler writes are KEPT as well. They are redundant with this — they record the same
   * value — but they state the intent at the point of action, and they are what the targeted arms
   * assert. This effect is the backstop that also covers clears driven from OUTSIDE the panel (URL
   * back/forward, the `filtersContent` sheet), which no per-handler discipline can reach.
   */
  useEffect(() => {
    if (activeFamily === 'residential') {
      residentialMemoryRef.current = filters.propertyTypes;
    }
    if (activeFamily === 'commercial') {
      commercialMemoryRef.current = filters.commercialSubtypes;
    }
  }, [activeFamily, filters.propertyTypes, filters.commercialSubtypes]);

  // ANON POSTURE — owner ruling on PR #2500. This SUPERSEDES the disabled-with-explanation posture
  // this panel previously implemented, and the earlier one is described below rather than deleted
  // because what changed was the mechanism, not the taste.
  //
  // ANONYMOUS BUYERS BROWSE AND FILTER COMMERCIAL EXACTLY AS THEY DO RESIDENTIAL: they switch
  // family, pick subtypes, and see the normal anonymous teaser result set. Sign-in is required only
  // for the protected listing detail Residential already gates, which `PropertyCard` owns via
  // `isAuthenticated` further down this file. There is deliberately NO Commercial-specific auth
  // condition here — reintroducing one would be a second, divergent anon posture, which the ruling
  // forbids in those words.
  //
  // WHY THE OLD GATE WENT. It rested on the anonymous endpoint matching property type by
  // single-value equality, so that the four-value Commercial family (`commercial`,
  // `commercial_building`, `warehouse`, `commercial_land`) was inexpressible and any anon
  // Commercial control would have silently excluded three of the four. #2550 removed that
  // impossibility: `CityAreaListingsService` now normalises a multi-value property-type list
  // through a shared `appendPropertyTypeClause` emitting `IN (...)` on both the areaKeys and
  // bbox-only paths. The premise is gone, so the gate built on it is gone with it.
  //
  // REACHABILITY IS GOVERNED BY THE CAPABILITY ALONE — see `isCommercialSubtypeSupported`. It
  // still defaults FALSE, but Issue #2572 passes it at BOTH production call sites
  // (`NodeListingsSurface` and `DiscoverAreasJourneyPanel`), so this IS buyer-reachable now; the
  // preceding sentence used to end "Nothing here is buyer-reachable today" and no longer holds.
  // The #2509 precondition it waited on is met on main: the anonymous city-listings endpoint binds
  // `commercialSubtypes` and takes `propertyType` as a list, so family, subtype and multi-select
  // all reach the server rather than being silently discarded.
  const showSubtypeRow = isCommercialSubtypeSupported && activeFamily === 'commercial';

  const handleSelectFamily = useCallback(
    (family: PropertyFamily) => {
      // CAPABILITY guard only — auth is deliberately not consulted (see the anon-posture note
      // above). Mirrors `handleToggleReadyToMove`: bail out even if a click somehow reaches the
      // control while this surface cannot consume the axis, so no unconsumable request is emitted.
      //
      // Issue #2552 — this tests the CAPABILITY, not the family. It previously read
      // `family === 'commercial' && !isCommercialSubtypeSupported`, so a RESIDENTIAL chip rendered
      // while the capability was off would sail straight past it and set the override. Only the
      // row-level `isCommercialSubtypeSupported &&` gate stood between that and a live control —
      // one call away from the thing it guards, and it would fall to any future widening of that
      // gate. `handleToggleSubtype` and `handleToggleReadyToMove` both test their capability
      // unconditionally; this now matches them.
      if (!isCommercialSubtypeSupported) return;
      // Issue #2552 (review NIT) — this records the override BEFORE the `onFiltersChange` guard,
      // while the four other sites that write it record AFTER their own guard. The asymmetry is
      // deliberate rather than drift: the family chip must still respond on an UNCONTROLLED panel
      // (no `onFiltersChange`), where the filters never move and the override is the only thing
      // driving `activeFamily`. The other sites record intent that ACCOMPANIES a real filter
      // change, so recording it where nothing can change would mean nothing. Unobservable either
      // way — with no filter owner `familyIsUnset` is constant — which is why this is a documented
      // choice and not a behavioural fix.
      setFamilyOverride(family);
      if (!onFiltersChange) return;
      onFiltersChange(
        family === 'commercial'
          ? // Residential types do not survive the switch, but everything else does: Budget and
            // Bedrooms are family-independent, and silently dropping them is its own defect.
            //
            // Issue #2555 item 1 — and the Commercial side comes BACK as it was left. Emitting a
            // bare `commercialSubtypes: undefined` here is what made the round trip lossy.
            {
              ...filters,
              // Issue #2572 — the family must NARROW, not merely relabel. This emitted
              // `propertyTypes: undefined`, so with no remembered subtype the panel said
              // "Commercial" while asking the server for nothing: measured on the fixture, the chip
              // read aria-pressed=true and the list still returned 10 rows, three of them [BEDS]
              // Residential. The family tokens are the only way to say "the Commercial family, no
              // subtype yet" on the wire.
              //
              // WRITING THESE IS PERMITTED IN EXACTLY THIS SHAPE. COMMERCIAL_FAMILY_TOKENS
              // documents itself as never-written because a token emitted ALONGSIDE a subtype is
              // the #2450 contradiction — `type=commercial&subtype=WAREHOUSE` matches nothing
              // (measured: zero rows on this fixture). That hazard requires a subtype to exist;
              // where there is none there is nothing to contradict. When a remembered subtype does
              // come back the tokens stay off, so the one-axis contract is untouched.
              propertyTypes: commercialMemoryRef.current?.length
                ? undefined
                : [...COMMERCIAL_FAMILY_TOKENS],
              commercialSubtypes: commercialMemoryRef.current,
            }
          : // Issue #2552 — the mirror image, which was missing. Clearing `commercialSubtypes`
            // alone left any inbound Commercial FAMILY TOKEN (`commercial`, `warehouse`, ...) sitting
            // in `propertyTypes`, so "switch to Residential" produced a Residential-looking panel
            // over a Commercial result set. Only the family tokens are stripped: a genuine
            // Residential type the buyer still holds survives, because dropping `propertyTypes`
            // wholesale would trade one wrong-results defect for another.
            //
            // Issue #2555 item 1 — the memory is the FALLBACK, not the winner, and the order is
            // load-bearing. A surviving Residential type is the buyer's live, current selection and
            // must beat anything remembered; the memory speaks only when the strip leaves nothing,
            // which is exactly the "I was last here with Apartments" case restoration exists for.
            //
            // THE MEMORY IS STRIPPED ON READ (#2555, fourth-cycle review), and this is where the
            // guarantee lives rather than in the writers.
            //
            // `residentialMemoryRef` has six write sites and exactly one read — this one. Two
            // successive review cycles each found another writer banking a Commercial family token
            // into it (`handleRemovePropertyType`, then the relaxation wrapper), and each was fixed
            // where it was found. That is a losing pattern. Every writer carries a standing
            // obligation, a new one arrives with each feature, and the failure is silent and
            // identical each time: `withoutCommercialFamilyTokens` strips the live value, the `??`
            // falls through to a memory still holding `['warehouse']`, and the buyer who asked for
            // Residential stays in Commercial over a Commercial predicate with nothing on screen
            // explaining it.
            //
            // Stripping HERE is complete by construction: whatever any present or future writer
            // banks, a Commercial token cannot survive into a Residential emission.
            //
            // BE PRECISE ABOUT WHAT IS LOAD-BEARING TODAY, because an earlier revision of this
            // comment was not. It said the per-site filters are "kept as intent statements, not as
            // the thing making this safe", which overstates twice: `handleTogglePropertyType` has
            // no filter at all, and at this head every writer whose bank can be READ already banks
            // clean, so this strip is defence-in-depth rather than the thing currently preventing a
            // defect. (The precise form matters — a previous revision said "every REACHABLE writer
            // banks clean", which its own next sentence contradicts: `handleTogglePropertyType` IS
            // reachable and CAN bank dirty. What is true is that no reachable dirty bank can be
            // read.)
            // The unfiltered bank in `handleTogglePropertyType` is harmless in both directions, and
            // the trace is recorded so the next reader need not re-derive it: with the capability
            // ON, holding a commercial token forces `activeFamily === 'commercial'`, which opens
            // `showSubtypeRow` and HIDES the type chips, so that handler is unreachable; with the
            // capability OFF the chips do render and the bank can be poisoned, but
            // `handleSelectFamily` early-returns on `!isCommercialSubtypeSupported`, so it is never
            // read. The strip exists so that neither of those two accidents has to keep holding.
            //
            // The `??` ORDER remains load-bearing: a surviving Residential type is the buyer's
            // live, current selection and must beat anything remembered. The memory speaks only
            // when the strip leaves nothing — the "I was last here with Apartments" case that
            // restoration exists for.
            {
              ...filters,
              commercialSubtypes: undefined,
              propertyTypes:
                withoutCommercialFamilyTokens(filters.propertyTypes) ??
                withoutCommercialFamilyTokens(residentialMemoryRef.current),
            },
      );
    },
    [filters, onFiltersChange, isCommercialSubtypeSupported],
  );

  // ONE AXIS WHILE A SUBTYPE IS HELD. A subtype selection rides `commercialSubtypes` and carries
  // no family token, because a token emitted ALONGSIDE a subtype matches zero rows and fails
  // silently for BUILDING / WAREHOUSE / LAND — see `COMMERCIAL_FAMILY_TOKENS`.
  //
  // Issue #2572 superseded the absolute form of this rule, which read "no family token is ever
  // auto-added". That was true and was also the defect: with no subtype selected it left the
  // emission empty, so "Commercial" narrowed nothing and Residential rows stayed on screen. The
  // tokens ARE now written in exactly the no-subtype case, where there is nothing to contradict,
  // and stripped again the moment a subtype arrives. The invariant a reader should carry away is
  // the conditional one: tokens and a subtype never travel together.
  const handleToggleSubtype = useCallback(
    (value: CommercialSubtype | null) => {
      if (!onFiltersChange || !isCommercialSubtypeSupported) return;
      // Issue #2552 — the mirror of the Residential-row handlers, and it closes the one case they
      // cannot. This row renders only while Commercial is the active family, so any click in it is
      // an unambiguous Commercial statement; recording it is what keeps the family when the click
      // removes the only evidence OF that family.
      //
      // The shape that needs it is the canonical one. Under the one-axis contract a restored link
      // carries `commercialSubtypes` ALONE, so the family is DERIVED and the override is still
      // `null`. Clearing via "All commercial" — documented right below as clearing the narrowing
      // WITHOUT leaving the family — then emptied the last thing saying "commercial" and dropped
      // the buyer into Residential, closing the row they were working in. Recording intent here
      // makes the doc comment below true rather than aspirational.
      setFamilyOverride('commercial');
      if (value === null) {
        // "All commercial" clears the SUBTYPE narrowing without leaving the family.
        //
        // Issue #2572 — this previously said any inbound `propertyTypes` was "preserved exactly as
        // it arrived rather than rewritten", which the code below no longer does and which was the
        // defect: on the canonical one-axis link (subtype alone, no property type) preserving it
        // meant emitting nothing, so the chip read pressed over an unnarrowed list. It is rewritten
        // to the family set deliberately.
        //
        // Issue #2555 item 1 — and it is an EXPLICIT choice to hold no subtype, so it replaces
        // this family's memory. The mirror of `handleSelectAllTypes`; see the note there.
        commercialMemoryRef.current = undefined;
        // Issue #2572 — "All commercial" means the WHOLE FAMILY, not "no filter". This cleared the
        // subtype and preserved any inbound `propertyTypes` exactly as it arrived, which on the
        // canonical one-axis link (subtype alone, no property type) left NOTHING on the wire: the
        // chip read selected and the results still carried Residential rows. Emitting the family
        // tokens is what makes this branch's own promise — "clears the narrowing WITHOUT leaving
        // the family" — true of the RESULTS and not merely of the chip.
        onFiltersChange({
          ...filters,
          propertyTypes: [...COMMERCIAL_FAMILY_TOKENS],
          commercialSubtypes: undefined,
        });
        return;
      }
      const current = filters.commercialSubtypes ?? [];
      const updated = activeCommercialSubtypes.has(value)
        ? current.filter((s) => s !== value)
        : [...current, value];
      // Issue #2555 item 1 (review finding) — the mirror of the type-chip case; see
      // `handleTogglePropertyType`. Toggling the LAST subtype off empties the axis, and without
      // this the memory resurrects it on the next return to Commercial.
      commercialMemoryRef.current = updated.length > 0 ? updated : undefined;
      onFiltersChange({
        ...filters,
        // Issue #2572 — strip the family tokens the "All commercial" branch above now writes.
        // Without this, picking Shop straight after "All commercial" would emit
        // `propertyType=commercial,...` TOGETHER WITH `subtype=SHOP`. The four-token set happens to
        // still return the right rows (measured), but the single-token form of that same shape is
        // the #2450 contradiction that matches zero rows, so the invariant worth holding is the
        // simple one: while a subtype is active, no family token rides with it.
        //
        // Toggling the LAST subtype off falls to the zero-length case and restores the family
        // tokens, so clearing the final chip lands back on the whole Commercial family rather than
        // on no filter at all — which is the defect this issue exists to remove, and it would
        // otherwise reappear by the back door.
        propertyTypes:
          updated.length > 0
            ? withoutCommercialFamilyTokens(filters.propertyTypes)
            : [...COMMERCIAL_FAMILY_TOKENS],
        commercialSubtypes: updated.length > 0 ? updated : undefined,
      });
    },
    [filters, activeCommercialSubtypes, onFiltersChange, isCommercialSubtypeSupported],
  );

  // Clear property-type filters only; preserve school, polygon, city, date, and other active filters
  const handleClearPropertyFilters = useCallback(() => {
    if (!onFiltersChange) return;
    // Issue #2552 — `null`, not `'residential'`: clearing expresses no family at all, so the
    // derivation should own the answer from here. Without this, the affordance whose entire
    // promise is an unfiltered state would deposit the buyer in Commercial — it empties BOTH
    // axes, and a stale override would then be the only thing left speaking.
    setFamilyOverride(null);
    // Issue #2555 item 1 — "Clear filters" promises an unfiltered state, so BOTH families' memories
    // go with it. Keeping them would make the next family switch silently re-apply a narrowing the
    // buyer had just cleared, which is the same broken promise #2552 fixed for the family override.
    residentialMemoryRef.current = undefined;
    commercialMemoryRef.current = undefined;
    onFiltersChange({
      ...filters,
      propertyTypes: undefined,
      // Issue #2450 — enumerated explicitly like every key above. "Clear" that leaves the
      // Commercial subtype narrowing in place is a clear affordance that does not clear.
      commercialSubtypes: undefined,
      bedrooms: undefined,
      priceMin: undefined,
      priceMax: undefined,
      // Issue #2555 (fifth-cycle review) — REQUIRED, not optional, and the pairing is the point:
      // adding the area axis to `hasPropertyFilters` without adding it here would offer a "Clear
      // filters" control that leaves the area bound in place, which is precisely the defect the
      // `commercialSubtypes` note above exists to prevent. `handleRemoveArea` already clears both
      // bounds; only this family-wide reset was missing them.
      areaMinSqft: undefined,
      areaMaxSqft: undefined,
      localities: undefined,
      sellerTypes: undefined,
      backOnMarket: undefined,
      newToMarket: undefined,
      reraRegistered: undefined,
      readyToMove: undefined,
    });
  }, [filters, onFiltersChange]);

  // ── Issue #2555 — AREA (SQ FT) presets, on #2459's real contract ─────────────────────────
  //
  // Writes through `applyAreaBound`, the SAME writer the numeric `AreaRangeFilter` uses, so the
  // two controls cannot disagree about what a bound means (including its inverted-range repair).
  // `undefined` is the "Any size" chip and clears the bound rather than setting a zero one.
  const handleSelectArea = useCallback(
    (min: number | undefined) => {
      if (!onFiltersChange) return;
      // `applyAreaBound` already spreads `current`, returning the whole filter object with the
      // bound applied, so an outer `...filters` here would be dead.
      onFiltersChange(applyAreaBound(filters, 'areaMinSqft', min));
    },
    [filters, onFiltersChange],
  );

  // ── Issue #2555 item 2 — individually removable selected-filter chips ────────────────────
  //
  // #2450: "Use selected-filter chips that can be removed individually." Re-clicking an active
  // control toggles it off, which is per-control toggling, not a removable chip set — and the
  // mobile requirement ("selected filters can be removed") is about the CHIPS, which had no
  // removal affordance at all. `activeContextChips` cannot serve this: it is an opaque
  // caller-supplied ReactNode with nothing for the panel to attach removal to.
  //
  // Each handler removes exactly ONE value and leaves every other axis untouched. That is the
  // distinction from the family-local reset (`handleClearPropertyFilters`), which already existed
  // and is verified — removal is per-value, reset is per-family.
  const handleRemoveSubtype = useCallback(
    (value: CommercialSubtype) => {
      // CAPABILITY GUARD (review finding). `handleToggleSubtype` and `handleSelectFamily` both test
      // this unconditionally; without it here the chip row handed the capability-OFF surface a
      // working commercial-subtype control, on a surface the owner ruled must render none. The
      // emission relaxes rather than narrows, so this was not a wrong-results path — but a guard
      // asymmetry one call away from the gate will not survive the next widening. The chip itself
      // is also omitted while the capability is off, so no dead control renders either.
      if (!onFiltersChange || !isCommercialSubtypeSupported) return;
      const remaining = (filters.commercialSubtypes ?? []).filter((s) => s !== value);
      const next = remaining.length > 0 ? remaining : undefined;
      // Issue #2552's contract, reached through a SECOND path (review finding). Removing the last
      // subtype empties the only evidence of the family, so on the canonical restored-link shape
      // (`?subtype=SHOP` — override still `null`, family DERIVED) the filters fall silent on family
      // and the buyer is dropped into Residential, closing the subtype row under them.
      // `handleToggleSubtype` records intent for precisely this reason; this path must too. The
      // familyResync arms pin the invariant for "All commercial" and would have stayed green while
      // this route around them shipped.
      setFamilyOverride('commercial');
      // Removing a chip is an explicit edit of this family's selection, so the memory tracks it.
      commercialMemoryRef.current = next;
      onFiltersChange({
        ...filters,
        // Issue #2572 — the SAME family-fallback rule as `handleToggleSubtype`, reached through a
        // SECOND path, exactly as the #2552 note above this line records for its own invariant.
        // Measured in a browser before this fix: dismissing the last subtype chip emitted neither a
        // subtype nor a family token, and the list went straight back to all 10 rows — three
        // Residential [BEDS] listings among them — while the chip row still read "All commercial".
        // That is the defect the toggle path was fixed for, arriving through the back door that
        // fix's own comment warned about, and the toggle-path tests stayed green while it shipped.
        //
        // The two paths must agree: while a subtype survives, no family token rides with it (the
        // #2450 contradiction); when the last one goes, the selection lands on the whole Commercial
        // family, never on no filter at all.
        propertyTypes: next
          ? withoutCommercialFamilyTokens(filters.propertyTypes)
          : [...COMMERCIAL_FAMILY_TOKENS],
        commercialSubtypes: next,
      });
    },
    [filters, onFiltersChange, isCommercialSubtypeSupported],
  );

  const handleRemovePropertyType = useCallback(
    (type: string) => {
      if (!onFiltersChange) return;
      const remaining = (filters.propertyTypes ?? []).filter((t) => t !== type);
      const next = remaining.length > 0 ? remaining : undefined;
      // The mirror of the note in `handleRemoveSubtype`: recording intent is what stops a stale
      // override speaking once this empties the filters.
      //
      // WHICH family is recorded depends on the TOKEN, not on the control (re-review finding). The
      // chip row also carries Commercial FAMILY tokens — an inbound `?type=warehouse` renders
      // `selected-chip-type-warehouse` — and hard-coding `'residential'` there was actively wrong:
      // dismissing it emptied the axis, and the override then said Residential over what had been
      // a Commercial selection, closing the subtype row under the buyer. That is F2's class on the
      // neighbouring axis.
      // Issue #2572 — `type` is a plain `string` here: the chip's stored token, which this
      // handler's own note below points out is parsed with NO allowlist, so it cannot be assumed to
      // be a valid PropertyType. Typing COMMERCIAL_FAMILY_TOKENS from the filter contract (so it
      // could be written) made the bare `.includes(type)` a type error. Widening the ARRAY for the
      // membership test is the correct direction: "is this arbitrary string one of the four" is
      // precisely the question being asked. Casting `type` instead would assert a validity this
      // handler is documented not to have.
      //
      // Hoisted from the `setFamilyOverride` argument because the emission below needs the same
      // answer. Computing it twice is how the two would drift.
      const removedFamilyToken = (COMMERCIAL_FAMILY_TOKENS as readonly string[]).includes(type);
      setFamilyOverride(removedFamilyToken ? 'commercial' : 'residential');
      // THE MEMORY IS FILTERED, NOT BANKED WHOLE (third-cycle review finding), and the previous
      // revision fixed the line ABOVE while leaving this one unconditional — the same class, one
      // line apart.
      //
      // A mixed `?type=warehouse,apartment` is reachable: the `type` param is parsed with no
      // allowlist. Dismissing the apartment chip leaves `['warehouse']`, and banking that whole
      // value as the RESIDENTIAL memory meant the next click on Residential emitted
      // `withoutCommercialFamilyTokens(['warehouse']) ?? ['warehouse']` — restoring the commercial
      // token, so `commercialFromFilters` stayed true and the buyer asked for Residential and
      // remained in Commercial over a Commercial predicate, with nothing on screen explaining it.
      //
      // THIS WAS NOT THE ONLY DOOR, and an earlier revision of this very comment claimed it was —
      // asserted by reasoning rather than by enumerating the write sites, in the same commit that
      // was fixing the previous instance of the class. The fourth-cycle review then found another:
      // the zero-result relaxation wrapper, which this issue itself added. The guarantee now lives
      // on the READ side in `handleSelectFamily`, which is complete regardless of what any present
      // or future writer banks; filtering here keeps the banked value clean at the point of action
      // rather than being the thing that makes it safe.
      residentialMemoryRef.current = withoutCommercialFamilyTokens(next);
      onFiltersChange({
        ...filters,
        // Issue #2572 (re-review) — the THIRD door on the removal surface, and the one the
        // chip-suppression fix deliberately does not reach. A SINGLE inbound commercial token
        // (`?type=commercial`, reachable by ticking one box in `PropertyTypeFilter` — no URL
        // editing) renders exactly one chip, and length 1 fails the suppression predicate, so that
        // chip stays removable by design. Dismissing it emptied the axis while `setFamilyOverride`
        // above kept the family, so `familyIsUnset` made `activeFamily` resolve to 'commercial':
        // Commercial pressed, "All commercial" pressed, and NOTHING on the wire.
        //
        // The mechanism predates this issue. The VISIBLE lie is new, and that is what makes it
        // ours: enabling the family row is what puts a Commercial chip on screen to contradict the
        // results, so a pre-existing emission became a buyer-facing contradiction at the moment of
        // the flip.
        //
        // Same rule the other two removal paths already follow, keyed on WHAT WAS REMOVED rather
        // than on the control: emptying the axis by removing a FAMILY token lands on the whole
        // Commercial family. Removing the last RESIDENTIAL type still clears to `undefined` — that
        // is a Residential selection going away, which the family row reports honestly, and
        // widening it to the commercial tokens there would invent a narrowing the buyer never
        // asked for.
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

  /**
   * Issue #2555 item 2 (review finding) — Bedrooms must be removable even while its ROW is hidden.
   *
   * Bedrooms is the one axis this work can hide (Commercial has no Bedrooms row), so it is exactly
   * the axis that can become an active-but-invisible narrowing. A filter that is applied, unseen
   * and unremovable short of "Clear filters" is worse than one the buyer can see and reject —
   * especially while the submission-side suppression does not yet cover this panel's one-axis
   * Commercial shape (tracked separately; see the note on `showBedroomsRow`).
   */
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
  //
  // `budgetIntent` narrows `DiscoverIntent` to the two purposes the band table is keyed by. It is
  // NOT a third purpose: per the #2458 decision, Rent and Lease share the single `rent` value and
  // only the LABEL says "Rent / Lease" (LEASE is unpersistable under `chk_listing_purpose`).
  const budgetIntent: 'buy' | 'rent' = intent === 'rent' ? 'rent' : 'buy';
  const activeBudgetBands = QUICK_BUDGET_BANDS[activeFamily][budgetIntent];

  // The AREA control's label comes from #2459's own resolver rather than a literal, so the row can
  // never name a quantity the predicate is not comparing. Under the one-axis contract a Commercial
  // selection carries no `propertyTypes`, so this resolves to the broad "AREA (SQ FT)" — which is
  // exactly what the approved mock shows for All commercial.
  // Issue #2459 D1 — "per-row truthful primary area, meaning DISCLOSED in label and chip …
  // Disclosure is NOT optional."
  //
  // THE WHOLE RESULT IS RETAINED, not just `.label`. This call previously ended in `.label` and
  // dropped everything else on the floor — which meant that for a broad or mixed selection (the
  // DEFAULT, since no type narrowing means every type is in play) the row rendered the
  // deliberately non-committal "AREA (SQ FT)" with nothing on screen saying WHICH area was being
  // compared. `primaryAreaLabels.ts` names that exact outcome: a non-null `disclosure` is returned
  // whenever more than one meaning is in play, and "rendering a broad label without this is the
  // failure mode D1 forbids". `shortLabel` serves the selected chip, per the same ruling's
  // "label AND chip" — one of those two halves is not a substitute for the other.
  const areaControl = resolvePrimaryAreaControlLabel({
    propertyTypes: filters.propertyTypes,
    commercialSubtypes: filters.commercialSubtypes,
  });
  const areaControlLabel = areaControl.label;
  const activeAreaMin = filters.areaMinSqft;

  // #2450 copy rule: "Prefer `Ready to occupy` in Commercial contexts."
  const possessionLabel = activeFamily === 'commercial' ? 'Ready to occupy' : 'Ready to move';

  // #2459 AC2, second sentence: "Commercial never shows or submits Bedrooms." The SUBMIT half is
  // owned by `bedroomApplicability.ts`, whose header states in terms that whether the control is
  // VISIBLE is #2450's question — this is that half. A commercial row carries `bedrooms` NULL, so
  // a bedroom control here could only ever narrow the result set to nothing.
  //
  // BOTH HALVES ARE NOW IN FORCE, and this paragraph used to say the opposite. It read "⚠ THE
  // SUBMIT HALF DOES NOT YET COVER THIS PANEL'S SHAPE", on the grounds that
  // `isCommercialOnlySelection` early-returned false when `propertyTypes` was empty — the one-axis
  // Commercial selection this panel emits (`commercialSubtypes` alone) — so `shouldSubmitBedrooms`
  // returned true and `beds=` still reached both the request and the shared LINK against rows whose
  // `bedrooms` is NULL. That was TRUE WHEN WRITTEN and is now FALSE: that predicate gained an
  // explicit empty-`propertyTypes` branch returning `(commercialSubtypes?.length ?? 0) > 0`, so the
  // one-axis shape suppresses the predicate at every boundary that consults it — the city-listings
  // adapter, the counts adapter and `state/url/filters.ts`, which gates `beds=` on the same call.
  // Superseded rather than deleted, because a reader who meets the old claim quoted elsewhere needs
  // to know which way round it went.
  //
  // THE CONSEQUENCE FOR THE CHIP ROW IS NOT COSMETIC. While the submit half was missing, the
  // Bedrooms chip rendered REGARDLESS of this flag so the buyer could at least see and remove a
  // value that was genuinely still narrowing the request — showing it was the honest choice. Now
  // that the value is suppressed, showing it would assert a narrowing the wire does not carry, so
  // the chip is gated on `shouldSubmitBedrooms` as well. The value is not thereby trapped:
  // `hasPropertyFilters` counts `bedrooms` unconditionally and `handleClearPropertyFilters` clears
  // it, and switching back to Residential re-renders this row with the value still pressed — so it
  // is never both invisible and effective. See the chip's own note below.
  // Issue #2596 — the ROW must follow the SUBMITTED rule, not just the family half of it.
  //
  // This read `activeFamily !== 'commercial'` alone, which implements only the Commercial
  // sentence of #2459 AC2 while looking complete. The Plot sentence was missing, and the gap
  // is buyer-visible: `resolvePrimaryAreaMeaning('land') === 'PLOT'` (primaryAreaLabels.ts), so
  // selecting the Residential "Plots" chip already suppresses `beds=` on the wire and already
  // relabels the area control to PLOT SIZE (SQ FT) — while this row went on rendering BHK
  // chips above it. Measured at the merge base: with `quick-chip-land` pressed,
  // `quick-bedrooms-row` was present and the area label read "PLOT SIZE (SQ FT)" in the same
  // frame. #2596's AC is explicit: Residential Plot has "no Bedrooms row, Bedroom chip or
  // `beds=` request".
  //
  // `shouldSubmitBedrooms` is the SAME predicate the chip and the four submission boundaries
  // already consult, so row visibility can no longer disagree with what the request carries —
  // the disagreement was the defect. Deliberately NOT a second, local re-derivation of the
  // rule: that is how the Commercial half went missing in the first place (see
  // bedroomApplicability.ts's header).
  //
  // Emission is UNCHANGED by this line. Bedrooms were already suppressed for a plot-only
  // selection; only the control's visibility moves. The buyer's value is not cleared either —
  // it stays in filter state and re-applies on the way back to a dwelling selection, exactly
  // as the hidden-under-Commercial case already behaves.
  const showBedroomsRow = activeFamily !== 'commercial' && shouldSubmitBedrooms(filters);

  return {
    activeFamily,
    // Issue #2628 — exposed alongside the derived values so a caller with its own downstream
    // usage (AreaSelectedPanel's zero-result relaxation wrapper) can replicate the exact override
    // + per-family-memory write it performed before this hook existed, without a second `useState`
    // instance (see the file header on why a second call would split-brain `activeFamily`).
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

export interface PropertyFilterGroupsProps extends UsePropertyFilterGroupsResult {
  filters: PropertyFilters;
  isCommercialSubtypeSupported?: boolean;
  isReadyToMoveSupported?: boolean;
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
              <div
                className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
                data-testid="quick-family-row"
              >
                <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
                  Type
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                      activeFamily === 'residential'
                        ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                        : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                    )}
                    onClick={() => handleSelectFamily('residential')}
                    data-testid="quick-chip-family-residential"
                    aria-pressed={activeFamily === 'residential'}
                  >
                    Residential
                  </Button>
                  {/* Structurally identical to the Residential chip above, and that is the ruling
                      expressed in markup rather than asserted in a comment: same browsing posture
                      for both families, no auth condition, no disabled branch, no gate copy. */}
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                      activeFamily === 'commercial'
                        ? 'border-gold bg-gold text-gold-foreground shadow-sm hover:bg-gold/90'
                        : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                    )}
                    onClick={() => handleSelectFamily('commercial')}
                    data-testid="quick-chip-family-commercial"
                    aria-pressed={activeFamily === 'commercial'}
                  >
                    Commercial
                  </Button>

                  {/* Issue #2023 — possession chip, moved onto the TYPE row's trailing edge to match
                      the approved mock. `ml-auto` keeps it right-aligned when the row has room and
                      lets it wrap naturally when it does not.

                      Code-review follow-up (unchanged): not every calling surface can actually
                      filter on this (see `isReadyToMoveSupported`). When unsupported the chip renders
                      muted/disabled with an explanatory title instead of toggling into an active
                      state that has no effect on the listings shown — an active-looking chip that
                      does nothing is a UX-honesty bug, not a cosmetic one. A stale
                      `filters.readyToMove=true` from a prior session/URL still renders inert rather
                      than silently clearing the user's URL state as a side effect.

                      THE MOCK'S SECOND TRAILING CHIP ("Broker identity verified") IS DELIBERATELY
                      ABSENT, and this is the one place this panel knowingly departs from the approved
                      design. `PropertyFilters` carries no broker-identity field (its booleans are
                      backOnMarket / newToMarket / reraRegistered / readyToMove), so the control could
                      not narrow anything. Rendering it would ship precisely the inert design-only
                      control #2450 forbids, and wiring it to `reraRegistered` would be worse: RERA
                      registration is a property's statutory registration, not a broker's identity, so
                      the chip would make a verification claim the data does not support. Raised with
                      the owner rather than resolved here. */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isReadyToMoveSupported}
                    className={cn(
                      'h-11 ml-auto min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                      !isReadyToMoveSupported
                        ? 'cursor-not-allowed opacity-50'
                        : activeReadyToMove
                          ? 'border-evergreen bg-evergreen-tint text-evergreen shadow-sm hover:bg-evergreen-tint/80'
                          : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                    )}
                    onClick={isReadyToMoveSupported ? handleToggleReadyToMove : undefined}
                    data-testid="quick-chip-ready-to-move"
                    aria-pressed={isReadyToMoveSupported && activeReadyToMove}
                    title={
                      isReadyToMoveSupported
                        ? undefined
                        : "Ready-to-move filtering isn't available in this view yet — try Browse all listings"
                    }
                  >
                    {possessionLabel}
                  </Button>
                </div>
              </div>
            )}

            {!showSubtypeRow && (
              <div className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start">
                <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
                  Residential type
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                      allTypesActive
                        ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                        : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                    )}
                    onClick={handleSelectAllTypes}
                    data-testid="quick-chip-all"
                    aria-pressed={allTypesActive}
                  >
                    All
                  </Button>
                  {QUICK_PROPERTY_TYPES.map((type) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                        activePropertyTypes.has(type)
                          ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                          : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                      )}
                      onClick={() => handleTogglePropertyType(type)}
                      data-testid={`quick-chip-${type}`}
                      aria-pressed={activePropertyTypes.has(type)}
                    >
                      {PROPERTY_TYPE_LABELS[type]}
                    </Button>
                  ))}
                  {/* Issue #2555 — the possession chip moved to the TYPE row's trailing edge to
                      match the approved mock; see its note there. It is no longer rendered here.
                      While the capability is OFF there is no TYPE row, so it is re-rendered below
                      instead — today's buyer surface must keep the control it has. */}
                  {!isCommercialSubtypeSupported && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!isReadyToMoveSupported}
                      className={cn(
                        'h-11 ml-auto min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                        !isReadyToMoveSupported
                          ? 'cursor-not-allowed opacity-50'
                          : activeReadyToMove
                            ? 'border-evergreen bg-evergreen-tint text-evergreen shadow-sm hover:bg-evergreen-tint/80'
                            : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                      )}
                      onClick={isReadyToMoveSupported ? handleToggleReadyToMove : undefined}
                      data-testid="quick-chip-ready-to-move"
                      aria-pressed={isReadyToMoveSupported && activeReadyToMove}
                      title={
                        isReadyToMoveSupported
                          ? undefined
                          : "Ready-to-move filtering isn't available in this view yet — try Browse all listings"
                      }
                    >
                      {possessionLabel}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Commercial subtype row — family-local, so it appears only while Commercial is the
                active family and never alongside the Residential type chips. The second half of
                that sentence is enforced by the `!showSubtypeRow` guard on those chips above, on
                this same condition; an earlier revision asserted it in prose while the two rows
                rendered in the same block, which is how the contradictory selection stayed
                reachable. */}
            {showSubtypeRow && (
              <div
                className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
                data-testid="quick-subtype-row"
              >
                {/* Issue #2555 mock parity — the approved "COMMERCIAL TYPE" label, inline at the
                    left of its own chips. The row wraps after "Commercial Building" at the
                    desktop target; "Warehouse / Godown" and "Commercial Land" flow to a second
                    line and stay fully readable because the chips size to their content rather
                    than being truncated. */}
                <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
                  Commercial type
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {COMMERCIAL_SUBTYPE_CHOICES.map((choice) => {
                    // "All commercial" is the active chip precisely when no subtype narrows the
                    // family — it is the absence of a narrowing, not a sixth subtype.
                    const pressed =
                      choice.value === null
                        ? activeCommercialSubtypes.size === 0
                        : activeCommercialSubtypes.has(choice.value);
                    return (
                      <Button
                        key={choice.testId}
                        variant="outline"
                        size="sm"
                        className={cn(
                          'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                          pressed
                            ? 'border-gold bg-gold text-gold-foreground shadow-sm hover:bg-gold/90'
                            : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                        )}
                        onClick={() => handleToggleSubtype(choice.value)}
                        data-testid={choice.testId}
                        aria-pressed={pressed}
                      >
                        {choice.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
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
              <div
                className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
                data-testid="quick-bedrooms-row"
              >
                <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
                  Bedrooms
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {QUICK_BEDROOMS.map((bed) => (
                    <Button
                      key={bed}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                        activeBedrooms.has(bed)
                          ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                          : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                      )}
                      onClick={() => handleToggleBedroom(bed)}
                      data-testid={`quick-chip-${bed}-bhk`}
                      aria-pressed={activeBedrooms.has(bed)}
                    >
                      {bed} BHK
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Issue #2555 — AREA (SQ FT) presets. Each writes `areaMinSqft` through #2459's own
                `applyAreaBound`, the same writer the numeric AreaRangeFilter uses, and the label
                comes from #2459's resolver. */}
            <div
              className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
              data-testid="quick-area-row"
            >
              <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
                {areaControlLabel}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_AREA_PRESETS.map((preset) => {
                  // "Any size" is active precisely when no lower bound narrows the results.
                  const pressed =
                    preset.min === undefined ? activeAreaMin == null : activeAreaMin === preset.min;
                  return (
                    <Button
                      key={preset.testId}
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                        pressed
                          ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                          : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                      )}
                      onClick={() => handleSelectArea(preset.min)}
                      data-testid={preset.testId}
                      aria-pressed={pressed}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Issue #2459 D1, the LABEL half of "meaning DISCLOSED in label and chip". */}
            {areaControl.disclosure !== null && (
              <p className="text-xs text-muted-foreground md:ml-[105px]" data-testid="quick-area-disclosure">
                {areaControl.disclosure}
              </p>
            )}

            {/* Issue #2555 item 3 — purpose- and family-aware bands; see QUICK_BUDGET_BANDS. */}
            <div
              className="flex flex-col gap-[7px] md:grid md:grid-cols-[96px_minmax(0,1fr)] md:gap-x-[9px] md:items-start"
              data-testid="quick-budget-row"
            >
              <span className="pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-[1.25]">
                {budgetIntent === 'rent' ? 'Monthly rent' : 'Budget'}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                    activePriceMax == null
                      ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                      : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                  )}
                  onClick={() => handleSelectBudget(undefined)}
                  data-testid="quick-chip-budget-any"
                  aria-pressed={activePriceMax == null}
                >
                  Any price
                </Button>
                {activeBudgetBands.map((budget) => (
                  <Button
                    key={budget.max}
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-11 min-h-[44px] px-[14px] text-[13px] font-semibold rounded-full md:min-h-0 md:h-auto md:py-[6px] md:px-[12px] md:text-[12.5px] md:leading-normal',
                      activePriceMax === budget.max
                        ? 'border-copper bg-copper text-copper-foreground shadow-sm hover:bg-copper-hover'
                        : 'border-border bg-card text-[hsl(var(--text-body))] hover:border-border-strong',
                    )}
                    onClick={() => handleSelectBudget(budget.max)}
                    data-testid={`quick-chip-budget-${budget.max}`}
                    aria-pressed={activePriceMax === budget.max}
                  >
                    {budget.label}
                  </Button>
                ))}
              </div>
            </div>

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
              //
              // THIS IS A CORRECTNESS FIX, NOT TIDYING. Every entry in this array gets a dismiss
              // button routed at `handleRemovePropertyType`. Emitting the family tokens therefore
              // created a removal path that did not exist before this issue: dismissing all four
              // left `propertyTypes: undefined` while `familyOverride` still said 'commercial', so
              // the panel read Commercial with "All commercial" pressed and NOTHING on the wire —
              // the exact unnarrowed state this issue exists to remove, reachable in four clicks
              // from the new default. Dismissing only some was a weaker form of the same lie: the
              // wire carried a partial family while "All commercial" still read pressed, because
              // that chip keys off `activeCommercialSubtypes.size === 0` and never off the tokens.
              //
              // Suppressing the chips closes the removal path, the partial-family state and the
              // four-chips-for-one-concept noise together, instead of teaching a FOURTH handler the
              // same rule — which would leave the intermediate partial states standing. The family
              // row above already shows Commercial as pressed, so nothing is concealed: the
              // selection stays visible, it simply cannot be dismantled into a state no control can
              // express. `hasPropertyFilters` still counts the axis, so it is not trapped either.
              //
              // EXACTLY the family set, and only while no subtype is held. A genuine buyer
              // selection that merely happens to contain a commercial token — a mixed
              // `?type=warehouse,apartment` link, or a subtype-narrowed selection — is untouched
              // and still renders its chips normally.
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
              // ruled must carry none — and omitting the chip rather than only guarding the handler
              // is what stops a rendered-but-dead dismiss button, the class this panel refuses.
              //
              // THE COST IS REAL AND IS NOT "the value is inert" (re-review finding). Unlike
              // `readyToMove` below, an inbound `?subtype=` is NOT inert: it serialises back into
              // the URL, so it persists, reloads and shares, and it reaches the markers endpoint
              // for signed-in buyers. Only THIS card list ignores it (`useDiscoverCityListings`
              // sends no subtype param), which is the capability flag's own premise. So omitting
              // the chip satisfies the owner's "no Commercial control" ruling at the price of the
              // buyer not seeing a narrowing that is still partly live. That was raised with the
              // owner as a disclosure question — a non-removable label is not a control — and HAS
              // NOW BEEN RULED: show a label, not a chip. It is implemented immediately after this
              // chip row rather than inside it, because every entry in `selectedChips` renders a
              // dismiss button, and a dismissable subtype affordance is the Commercial control the
              // gate-off ruling forbids. `hasPropertyFilters` deliberately still counts the axis,
              // so the narrowing is not trapped.
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
              // on `showBedroomsRow`. Those answer two different questions and the gap between them
              // is the point: the ROW's visibility is #2450's question (hidden under any Commercial
              // selection), while the CHIP must track whether the value is actually SUBMITTED
              // (#2459 AC2's half). Where the row is hidden but the value still travels, the chip
              // stays the buyer's only way to see and remove it.
              //
              // WHY NOT UNGATED, which is what this was until now. The earlier revision rendered it
              // unconditionally, reasoning that a hidden row makes a stale bedroom value invisible.
              // That was correct while `shouldSubmitBedrooms` still returned true for this panel's
              // one-axis Commercial shape — the value really did reach the request and the shared
              // link, so surfacing it was honest. That predicate now suppresses it (see the
              // `showBedroomsRow` note above), which INVERTS the conclusion: an ungated chip would
              // present an inert value as an applied filter, the precise class the `readyToMove`
              // chip three blocks below refuses on identical grounds. A chip that says "3 BHK" over
              // a request carrying no `beds=` is a false report of the search.
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

              // Gated on the capability for the same honesty reason the chip itself is: where the
              // surface cannot filter on possession, a stale URL-carried value is inert and must
              // not be presented as an applied filter.
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
                  // from one of this family/intent's bands.
                  //
                  // THE FALLBACK CARRIES `/month` UNDER RENT (review finding). Every rent BAND
                  // label has it; without it here an off-band rent ceiling rendered as "≤ ₹40,000",
                  // indistinguishable in register from a purchase price — in the one panel whose
                  // entire item-3 premise is that the two are different quantities.
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
                // Issue #2459 D1, the CHIP half — the meaning travels with the value, exactly as
                // `ActiveContextChips` already does it (same formula, same shared vocabulary). This
                // chip previously read a bare "1,000+ sq ft", which over a mixed selection is
                // comparing built-up area on some rows and plot size on others while saying so
                // nowhere. No copy is coined here: `shortLabel` and `disclosure` both come from the
                // shared module, because a second declaration of this taxonomy is the drift #2526
                // was filed to stop.
                //
                // The disclosure sits INSIDE the label deliberately, which also puts it into the
                // dismiss button's accessible name for free (see the `aria-label` below).
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
              if (selectedChips.length === 0) return null;

              return (
                <div
                  className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3"
                  role="group"
                  aria-label="Selected filters"
                  data-testid="selected-filter-chips"
                >
                  {selectedChips.map((chip) => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold-tint px-2.5 py-1 text-xs font-medium text-foreground"
                      data-testid={chip.testId}
                    >
                      {chip.label}
                      <button
                        type="button"
                        onClick={chip.onRemove}
                        aria-label={`Remove ${chip.label} filter`}
                        data-testid={`${chip.testId}-dismiss`}
                        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Issue #2572 — the #2555 item-3 NON-REMOVABLE SUBTYPE DISCLOSURE stood here and is
                deleted with the capability flip, exactly as its own closing paragraph instructed.
                It existed to narrate a divergence that can no longer occur: while the capability
                was false an inbound `?subtype=SHOP` survived in URL state and reached the markers
                endpoint while narrowing no cards, so the panel owed the buyer a sentence saying the
                narrowing was carried but not applied. Now that both production call sites pass
                `isCommercialSubtypeSupported`, the card path consumes the subtype and the removable
                subtype chip above renders instead — so the disclosure would have become a standing
                explanation of a state that no longer happens, which is what it told us not to leave
                behind. Nothing asserted it: its `data-testid` had exactly one occurrence in the
                repository, its own. */}
          </div>
      </div>
    </>
  );
}
