import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  Layers,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  X,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { DiscoverCityListingItem } from '@/hooks/useDiscoverCityListings';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { useDiscoverAreas } from '@/hooks/useDiscoverAreas';
import { PropertyCard } from '../PropertyCard';
import { AreaFirstBreadcrumb } from '../AreaFirstBreadcrumb';
import type { DiscoverJourney, DiscoverIntent } from '@/hooks/useDiscoverUrlState';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { deriveDiscoverEmptyStateCopy } from '../emptyStateCopy';
import { StartOverButton } from '../StartOverButton';
import { useDiscoverActions, useDiscoverNav, useDiscoverShell } from '@/features/discover/context/useDiscoverContext';
import { AreaSetSelectedHeader, AreaSetTwoTileRow, DrawSearchAreaEntry } from './AreaSetSelectedExtras';
import { AreaZeroResultRecovery } from './AreaZeroResultRecovery';
import { AreaSelectedPanelScopeBar } from './AreaSelectedPanelScopeBar';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { SCOPE_TITLE } from '@/features/discover/presentation/scopeTitles';
import type { CommercialSubtype } from '@/lib/listing-constants';
// Issue #2555 — the AREA (SQ FT) presets consume #2459's REAL contract rather than a
// design-only lookalike: `applyAreaBound` is the same writer `AreaRangeFilter` uses (so an
// inverted range is repaired identically), and `resolvePrimaryAreaControlLabel` is the same
// label authority, so this row can never name a quantity the predicate is not comparing.
// #2450: "Never ship an inert design-only Area chip."
import { applyAreaBound } from '@/features/discover/filters/areaBounds';
import { resolvePrimaryAreaControlLabel } from '@/features/discover/filters/primaryAreaLabels';
// Issue #2555 — the SUBMIT half of #2459 AC2's bedroom rule, shared with the URL writer and the
// counts/city-listings adapters. Imported so the selected-filter chip can ask the same question
// those boundaries ask, rather than this file re-deriving half the rule and getting it backwards.
import { shouldSubmitBedrooms } from '@/features/discover/filters/bedroomApplicability';
// #2430's shared display authority. The selected-filter chips resolve property-type wording
// through it rather than this file's private `PROPERTY_TYPE_LABELS`, which covers only the three
// Residential quick types — so a Commercial FAMILY token arriving from a URL (`?type=warehouse`)
// rendered as a raw stored token in a buyer-facing chip.
import { getPropertyTypeLabel } from '@/lib/propertyTypeConfig';

// Quick filter options (hardcoded MVP). 'All' is a virtual chip that clears the
// property-type selection — it is not a property_type value.
const QUICK_PROPERTY_TYPES = ['apartment', 'villa', 'land'] as const;
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
  land: 'Plots',
};

/**
 * Issue #2450 — the two TYPE families a buyer chooses between.
 *
 * `QUICK_PROPERTY_TYPES` above is the Residential family's membership; Commercial rides the
 * SUBTYPE axis alone (see `COMMERCIAL_SUBTYPE_CHOICES`), which is why there is no
 * `QUICK_COMMERCIAL_TYPES` counterpart.
 */
type PropertyFamily = 'residential' | 'commercial';

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
const COMMERCIAL_FAMILY_TOKENS: readonly NonNullable<PropertyFilters['propertyTypes']>[number][] = [
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
const withoutCommercialFamilyTokens = (
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

interface AreaSelectedPanelProps {
  selectedArea: AreaPoint;
  areaListings?: DiscoverCityListingItem[];
  /**
   * Issue #1817 (code-review follow-up, AC5) — precomputed via the SAME
   * formatDiscoverBadgeCopy(discoverBadge, ...) call the map badge pill renders from
   * (MapDiscovery.tsx), so this panel's result-summary stat can never diverge from the
   * map badge (design §6 "Area selected + filters" → `M of N match in {scope}`).
   * Optional: falls back to a lightweight local "{count} verified properties in {area}"
   * default when omitted, so existing callers/tests that don't wire the full selector
   * keep working unchanged.
   */
  areaResultSummaryText?: string | null;
  isLoadingListings?: boolean;
  isAuthenticated?: boolean;
  onBack?: () => void;
  onStartOver?: () => void;
  journey?: DiscoverJourney | null;
  filtersContent?: React.ReactNode;
  trendsHref?: string;
  isFetching?: boolean;
  isInitialLoading?: boolean;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Active context chips forwarded below the header (seller/date/boolean filters). */
  activeContextChips?: React.ReactNode;
  /** Current property filters. */
  filters?: PropertyFilters;
  /** Called when property filters change (from quick chips or clear action). */
  onFiltersChange?: (filters: PropertyFilters) => void;
  /** Called for genuine journey switches (kept for non-CTA usage). */
  onSelectJourney?: (journey: DiscoverJourney) => void;
  /**
   * Called when the user clicks the "Add a school in this area" CTA (Issue #1157).
   * Enters the area-first school-picking sub-step WITHOUT flipping the journey, so
   * Back returns to area-selected instead of deleting the area.
   */
  onAddSchool?: () => void;
  /** Issue #1494 — current buy/rent intent for summary/empty-state copy. Default 'buy'. */
  intent?: DiscoverIntent;
  /**
   * Issue #1547 — id of the currently selected listing (URL/parent-derived, from the
   * `listing` URL param). Drives the copper selected card frame + scroll-into-view.
   * Null/undefined = no selection.
   */
  selectedListingId?: string | null;
  /** Issue #1547 — called when a card is activated, to sync the selected marker. */
  onSelectListing?: (id: string) => void;
  /**
   * Issue #1547 — ephemeral hover/focus signal for card→marker highlight.
   * Called with the listing id on card mouseenter/focus, null on mouseleave/blur.
   */
  onHoverListing?: (id: string | null) => void;
  // ── Issue #1606 — area-first results redesign ──────────────────────────────
  /** Human-readable city label (e.g. "Udupi") for the breadcrumb + controls card. */
  cityLabel?: string;
  /** Selected group display name (e.g. "University Belt"); null when group-less. */
  groupName?: string | null;
  /** Region/scope name (e.g. "North Bangalore"); null when scope-less. */
  regionName?: string | null;
  /** City slug — drives the in-panel city selector. */
  city?: string;
  /** Called when the user changes city from the in-panel controls card. */
  onCityChange?: (city: string) => void;
  /** Called when the user changes buy/rent intent from the in-panel controls card. */
  onIntentChange?: (intent: DiscoverIntent) => void;
  /** Breadcrumb: navigate to the Discover landing (Home crumb). */
  onCrumbHome?: () => void;
  /** Breadcrumb: navigate to the city's area-first landing (city crumb). */
  onCrumbCity?: () => void;
  /** Breadcrumb: navigate back to the region's landing (region crumb). */
  onCrumbRegion?: () => void;
  /** Breadcrumb: navigate back to the selected group's drill-down (group crumb). */
  onCrumbGroup?: () => void;
  /**
   * Issue #2023 code-review follow-up — whether the "Ready to move" quick
   * filter chip has any effect on the listings actually shown by the calling
   * surface. Defaults to `true` so existing callers (e.g. NodeListingsSurface,
   * which forwards `readyToMove` to useDiscoverListings via
   * buildDiscoverSearchParams) keep their current behavior unchanged. Callers
   * whose listings hook has no readyToMove/possessionStatus param (e.g. the
   * default area-leaf surface backed by useDiscoverCityListings) must pass
   * `false` — the chip then renders visually disabled and inert instead of
   * silently toggling active with no effect on the results.
   */
  isReadyToMoveSupported?: boolean;
  /**
   * Issue #2450 — whether the calling surface's listings hook can actually consume a Commercial
   * SUBTYPE narrowing. Follows the `isReadyToMoveSupported` precedent directly above, and for the
   * same honesty reason, but **defaults FALSE** where that one defaults true.
   *
   * WHY FALSE WAS THE RIGHT DEFAULT, AND WHY BOTH PRODUCTION SITES NOW PASS IT TRUE (#2572). The
   * original reasoning: this panel's card list is fed by `useDiscoverCityListings`, which carried
   * no `commercialSubtypes` param at all, so a buyer picking Commercial → Warehouse would see
   * results **unchanged** — worse than an empty list, because zero at least signals that something
   * happened while unchanged results signal a control that did nothing.
   *
   * BOTH HALVES OF THAT PREMISE HAVE SINCE GONE, and this is the block a reader consults to decide
   * whether the flag may be passed, so it must not keep arguing against the answer:
   *   - #2533 removed the singular-`propertyType` half: the hook now accepts and sends the full
   *     multi-value selection.
   *   - #2509 removed the subtype half. `useDiscoverCityListings` DOES carry `commercialSubtypes`
   *     (a repeated param, and in the react-query key), and `CityAreaListingsController` binds,
   *     validates and forwards it. The sentence that stood here — "the subtype gap above is what
   *     still keeps this flag false" — described a gap that no longer exists.
   *
   * So shipping it reachable now AVOIDS the inert-control class #2450 exists to remove, rather
   * than pinning it: the control narrows. The DEFAULT stays false, because a surface whose hook
   * cannot consume the axis must still be able to say so; what changed is that the two production
   * call sites (`NodeListingsSurface`, `DiscoverAreasJourneyPanel`) pass it true.
   *
   * GATE-OFF IS "NO FAMILY ROW", NOT "RESIDENTIAL ALONE" (owner ruling on PR #2500, Option A).
   * While this is false the panel renders NO family row and NO Commercial subtype control — no
   * family chips, no subtype row, and no subtype entry in the selected-filter chip row. A
   * one-option Residential-only selector was explicitly REJECTED: a lone Residential chip is
   * indistinguishable from "this product has no commercial inventory", which is a claim about the
   * catalogue that the capability flag is not making.
   *
   * THIS CLAIM WAS NARROWED IN #2555, and the correction is recorded rather than silently applied.
   * It previously said today's buyer surface is preserved "byte-for-byte". That is no longer true
   * and must not be read as a guarantee. #2555 changes the capability-OFF surface in SEVEN ways.
   * Items 4 and 5 need a derived-Commercial selection, which is reachable because `activeFamily` is
   * DERIVED from filters independently of this flag (see `commercialFromFilters`) — an inbound
   * `?subtype=SHOP` or `?type=warehouse` reads as Commercial even while no Commercial control
   * renders. Items 1, 2, 3, 6 and 7 need no such URL:
   *
   *   1. a removable selected-filter chip row, rendered on ANY filtered state;
   *   2. the AREA (SQ FT) preset row, which is ungated and so renders for every buyer, and which
   *      is LIVE on both surfaces as of `65b5dc7c`. Until that commit it DIVERGED: the two
   *      projections feeding this panel's `filters` prop omitted the area keys and
   *      `useDiscoverCityListings` had no area param, so the chip could not latch and the CARDS did
   *      not narrow — while `useDiscoverMapData` forwarded `filters` WHOLESALE to
   *      `useDiscoverFilteredMarkers`, which hands them to `buildDiscoverSearchParams`, which DOES
   *      emit `areaMinSqft`, so a signed-in buyer's MAP narrowed against a list that ignored the
   *      bound. `65b5dc7c` added the keys to both branches of `resolveEffectiveAreaLeafFilters`, to
   *      `NodeListingsSurface`'s inline twin and its memo deps, to the `cityListingsQueryParams`
   *      `Pick<>` union and return object, and to `useDiscoverCityListings`' params, react-query key
   *      and URL append. The divergence is closed; this is still the ONE part of #2555 that
   *      "dormant behind the capability" does not cover. See the row's own comment for the chain;
   *   3. family/intent-aware Budget bands, which change the band labels where one fixed list
   *      stood — BUY as well as RENT: `?type=warehouse` with `intent=buy` renders the Commercial
   *      buy bands (≤ ₹1 Cr / ≤ ₹2.5 Cr / ≤ ₹5 Cr) where the merge base showed ≤ ₹50L / ≤ ₹80L /
   *      ≤ ₹1.2Cr;
   *   4. the Bedrooms row, previously UNCONDITIONAL, is now hidden under a derived-Commercial
   *      selection — the departure with the most behaviour behind it, since such a buyer loses a
   *      control they have in production today. The value stays visible and removable via the
   *      Bedrooms chip in the row named in (1), which is why that chip renders regardless of
   *      `showBedroomsRow`;
   *   5. the possession chip's copy, previously the literal "Ready to move", now reads
   *      "Ready to occupy" under a derived-Commercial selection; and
   *   6. the EXISTING Budget chips are restyled and their label moves: active state navy
   *      (`bg-primary`) → copper, square (`px-3`) → pill (`rounded-full px-3.5`), and the `Budget`
   *      label leaves its own block for the trailing edge of the AREA row. Visual only — but it is
   *      UNCONDITIONAL, needing neither a derived-Commercial URL nor any filter at all, so it is
   *      the departure that reaches the most buyers; and
   *   7. an area-only narrowing now COUNTS as an active filter. `hasPropertyFilters` and
   *      `handleClearPropertyFilters` both gained the area bounds, so the zero-result state
   *      routes to the filtered cause and offers "Clear filters" where the merge base — which
   *      ignored the axis in both readers — claimed "a real area with nothing listed today, not a
   *      filtered-out result" and offered nothing. A behaviour change on the capability-OFF
   *      surface, and a fix rather than a regression: it is (2)'s tail, since the ungated AREA row
   *      is what makes an area-only narrowing reachable in one click.
   *
   *      RECONCILED AFTER `65b5dc7c`. This item was written while (2) still diverged, and it was
   *      accurate then for a narrower reason than it reads now: the row made an area-only state
   *      REACHABLE, so classifying it as filtered was right, but on the card surface no such state
   *      was actually PRODUCED — the projection dropped the bound before it could empty a list. Now
   *      that the projections forward it, the same sentence describes a real narrowing: an
   *      area-only zero-result is genuinely produced by this row, and the reader routing that sends
   *      it to the filtered cause is load-bearing rather than anticipatory. The item did not become
   *      true; it became true for the stronger reason.
   *
   * What the gate still guarantees is the sentence above — no Commercial *control* is reachable:
   * no family row, no subtype row, no subtype chip. It does NOT guarantee an unchanged surface.
   *
   * TREAT THIS LIST AS VERIFIED-AT-A-HEAD, NOT AS SELF-EVIDENTLY COMPLETE. It has now been wrong
   * THREE times: the first attempt named only (1); the second declared itself "deliberate" while
   * missing (4) and (5); the third said FIVE and missed (6), the most reachable of them all. Every
   * miss was found the same way — by diffing what actually renders with the flag off against the
   * merge base — and every miss was produced the same way, by reasoning about intent instead. If
   * you are relying on this for the flag-flip decision, re-derive it; do not trust this paragraph.
   *
   * AND A FOURTH FAILURE MODE, distinct from the three above: an item can be VERIFIED-CORRECT when
   * written and go false later without anyone touching it. (2) and (7) both did, overtaken by
   * `65b5dc7c` two commits into this same branch — not by a distant lane. Incompleteness is caught
   * by re-deriving the list; STALENESS is not, because re-deriving a list you believe is settled is
   * exactly the step a reader skips. Nothing in the typechecker, the linter or the suite fails when
   * a comment stops describing the code. The only defence is to treat a behaviour change and its
   * comment as one edit, which is why the fix commit and these corrections are recorded together.
   *
   * IT HAS NOW FLIPPED (Issue #2572). This previously read "It flips to true once the card path
   * can consume a subtype — which is #2533's multi-value narrowing work. #2533 must land before
   * this is ENABLED". #2533 landed, #2509 landed, and #2552 / #2553 / #2555 closed the enablement
   * gate, so both production call sites now pass this true and the Commercial family is reachable.
   * The paragraph is kept in its corrected form rather than deleted because the CONDITION it named
   * is the right one to re-check if anyone adds a third call site: pass this true only from a
   * surface whose listings hook actually consumes the subtype.
   */
  isCommercialSubtypeSupported?: boolean;
  /**
   * Issue #2015 — true when the panel is displaying a committed VIEWPORT
   * `resultScope` ("Search this area") rather than the selected AREA_SET.
   * `selectedArea`/`areaLabel` stay populated in this state (the area chip
   * still shows "Return to {area}" elsewhere), but the headline/sub-copy
   * below must not claim the listings are scoped to that area anymore —
   * they're scoped to the panned/zoomed map viewport instead. Defaults to
   * false so every existing AREA_SET caller/test is unaffected.
   */
  isViewportScope?: boolean;
  /**
   * Issue #2018 requirement A ("error is not empty") — true when the listings
   * request this panel is rendering FAILED (5xx/timeout/network), as opposed
   * to succeeding with zero rows.
   *
   * The distinction is load-bearing, not cosmetic: the zero-result recovery
   * state states "no matching listings in {scope}" as a fact about the
   * marketplace and offers nearby areas that "have matches" — claims this
   * panel cannot make about a query that never came back. So when this is
   * true the panel renders an error treatment instead:
   *   - with no results to fall back on -> the explicit request-failure state
   *     + Retry (`area-listings-error`);
   *   - with a retained last-good set (`useDiscoverCityListings` uses
   *     `keepPreviousData`, so a refetch failure commonly leaves one) -> the
   *     cards stay and an inline banner + Retry appears above them
   *     (`area-listings-retry-banner`).
   *
   * Defaults false, so every existing caller behaves exactly as before.
   */
  /**
   * Issue #2018 slice 3 — starts a NEW polygon drawing for the zero-result
   * "Adjust boundary" action. Threaded from `useDiscoverPageState`'s
   * `handleRedrawPolygon` (#2419 PR-1) through the panel surface model.
   * Commits nothing on its own. Omitted renders no row rather than a dead
   * control.
   */
  onRedrawPolygon?: () => void;
  isListingsError?: boolean;
  /**
   * Re-issues the failed listings request. Omitted renders the error states
   * without a Retry button rather than a dead one — the same honesty rule
   * `isReadyToMoveSupported` follows above.
   */
  onRetryListings?: () => void;
}

export function AreaSelectedPanel({
  selectedArea,
  areaListings,
  areaResultSummaryText,
  isLoadingListings,
  isAuthenticated = false,
  onBack,
  onStartOver,
  journey,
  filtersContent,
  trendsHref,
  isFetching = false,
  isInitialLoading = false,
  searchQuery = '',
  onSearchChange,
  activeContextChips,
  filters = {},
  onFiltersChange,
  onSelectJourney,
  onAddSchool,
  intent = 'buy',
  selectedListingId = null,
  onSelectListing,
  onHoverListing,
  cityLabel,
  groupName,
  regionName,
  city,
  onCityChange,
  onIntentChange,
  onCrumbHome,
  onCrumbCity,
  onCrumbRegion,
  onCrumbGroup,
  isReadyToMoveSupported = true,
  isCommercialSubtypeSupported = false,
  isViewportScope = false,
  onRedrawPolygon,
  isListingsError = false,
  onRetryListings,
}: AreaSelectedPanelProps) {
  const navigate = useNavigate();
  const areaLabel = selectedArea.areaLabel;
  const intentNoun = intent === 'rent' ? 'rent' : 'sale';

  // Issue #1547 — scroll the selected card into view when selection is driven from the
  // map marker side. Guards the missing-ref case so a marker click never crashes.
  const cardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  useEffect(() => {
    if (!selectedListingId) return;
    const node = cardRefs.current.get(selectedListingId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedListingId]);

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

  const handleAddSchool = useCallback(() => {
    onAddSchool?.();
  }, [onAddSchool]);

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

  const resolvedCityLabel = cityLabel ?? city ?? '';
  const count = areaListings?.length ?? 0;

  // Issue #2596 — result language follows the family, per the updated kit's §Result language:
  // Commercial reads "Commercial properties in X" with the count noun "commercial listings",
  // and never borrows a Residential noun.
  //
  // STRINGS ONLY, deliberately. `count` is still `areaListings.length` and nothing about how it
  // is computed, fetched or filtered changes here — this renames what the buyer reads, not what
  // the number means.
  //
  // ONE FAMILY AUTHORITY PER RENDER (review 5210279153, F2). These previously keyed off
  // `commercialFromFilters` while `showSubtypeRow` keys off `activeFamily`. Those are NOT the
  // same predicate: `activeFamily` is Commercial the moment the buyer CLICKS the chip (via
  // `familyOverride`), whereas `commercialFromFilters` only becomes true once that emission
  // round-trips back as props. The two could therefore disagree inside a single render — an open
  // Commercial subtype row with the chip pressed, above a heading still reading
  // "Properties in {area}".
  //
  // CONVERGED RATHER THAN DOCUMENTED. The alternative was to pin the divergence with a test, but
  // that would promote an incoherent frame into the contract. Keying both off `activeFamily`
  // makes the heading, the count noun and the subtype row describe the same family by
  // construction, which is the property actually wanted.
  //
  // This is not only a test-shape concern. Both production call sites are controlled, so the
  // emission does round-trip — but not until the NEXT render, and the old predicate made that one
  // render say Residential over an already-open Commercial subtype row.
  //
  // The empty-state and zero-result nouns still read `commercialFromFilters`, deliberately: they
  // describe a result set already FETCHED under the emitted filters, so the filters are the honest
  // source there, while these two describe the control surface the buyer is looking at right now.
  // They agree in every state a production call site can reach.
  //
  // The Residential wording is untouched, so the existing heading and hero assertions (which all
  // render the Residential default) keep passing on their own terms.
  const commercialFamilyActive = activeFamily === 'commercial';
  const headingNoun = commercialFamilyActive ? 'Commercial properties' : 'Properties';
  const countNoun = commercialFamilyActive
    ? count === 1
      ? 'commercial listing'
      : 'commercial listings'
    : intentNoun === 'rent'
      ? 'shown for rent'
      : 'shown for sale';

  // Issue #2017 — plural committed-header/two-tile-row for a multi-area
  // AREA_SET result scope. `nav.resultScope?.active` is the confirmed real
  // access pattern for the #2016 committed scope (see useDiscoverMapDataController,
  // AreaSetDraftContext, DiscoverMapCanvas for the same idiom). A single-area
  // AREA_SET commit (or no AREA_SET commit at all) leaves `multiAreaKeys` null
  // and this file's existing single-area JSX renders completely unchanged.
  const nav = useDiscoverNav();
  const actions = useDiscoverActions();
  const shell = useDiscoverShell();
  const activeScope = nav.resultScope?.active ?? null;
  const multiAreaKeys =
    activeScope?.kind === 'AREA_SET' && activeScope.areaKeys.length > 1 ? activeScope.areaKeys : null;

  // Issue #2018 slice 3 — which KIND of scope owns these results, derived from
  // the committed scope this component already reads. Purely additive: it is
  // consumed only by the zero-result recovery, so every populated-results
  // render path is untouched.
  //
  // POLYGON is read straight off `activeScope` because, unlike VIEWPORT, it
  // has no `isPolygonScope` prop anywhere to thread — both flags in
  // useDiscoverMapData are gated on `kind === 'VIEWPORT'`, which is exactly
  // why a committed polygon previously fell through to the area-shaped path.
  // `isViewportScope` stays the source of truth for VIEWPORT so this cannot
  // disagree with the heading/sub-copy above, which already key off it.
  const resultScopeKind: 'AREA' | 'POLYGON' | 'VIEWPORT' = isViewportScope
    ? 'VIEWPORT'
    : activeScope?.kind === 'POLYGON'
      ? 'POLYGON'
      : 'AREA';

  // Issue #2478 (step 1) — panel-side scope bar for a committed VIEWPORT or
  // POLYGON result scope, mirroring ActiveScopeChip's "Return to <Area>"
  // logic verbatim (see that component's doc comment for the full
  // reasoning).
  //
  // AREA_SET `previous` area-name resolution (`previousAreas` below) comes
  // from a dedicated `useDiscoverAreas` call keyed on
  // `city || nav.city || DEFAULT_CITY` — the same idiom already used twice
  // further down (AreaSetSelectedHeader, AreaZeroResultRecovery); see that
  // doc comment for why `||` (not `??`) is required. This was previously
  // hardcoded to `[]`, which silently fell back to the generic "Return to
  // previous area" label for every AREA_SET previous scope — the exact bug
  // class #2015 MUST-HAVE #3 fixed in ActiveScopeChip. This closes the
  // panel-side regression to match.
  //
  // Camera-fit on Return (ActiveScopeChip's `publishCameraIntent` /
  // `computeGroupBounds` branch):
  //   - `previous.kind === 'VIEWPORT' | 'POLYGON'`: ActiveScopeChip's own
  //     `handleReturn` has no camera-fit branch for these kinds either —
  //     this is reference parity, not a gap.
  //   - `previous.kind === 'AREA_SET'` with 2+ areas: already covered
  //     ambiently by useDiscoverMapDataController's multi-area AREA_SET
  //     auto-fit effect, which re-fires on any `resultScope` change
  //     regardless of which UI triggered it.
  //   - `previous.kind === 'AREA_SET'` with exactly 1 area: Issue #2480.
  //     `handleReturnToPreviousScope` below CANNOT safely call
  //     `shell.focusAreaSetMember`/`shell.fitAreaSet` synchronously right
  //     after `actions.commitResultScope(previous)` — those stable delegates
  //     close over whatever `AreaSetCameraActions` was registered as of the
  //     LAST render before the commit, i.e. they still read the PRE-commit
  //     `resultScope`, so a synchronous call would silently no-op against
  //     stale state. Instead, Return records a one-shot restore request via
  //     `shell.setAreaSetCameraRestoreRequest` (bound to the single areaKey
  //     it was issued for), which a POST-COMMIT effect in
  //     `useDiscoverMapDataController` consumes once the committed scope has
  //     actually changed, publishing the camera intent directly. See that
  //     effect's doc, and `DiscoverShellContextValue.getAreaSetCameraRestoreRequest`
  //     in context/types.ts, for the full reasoning.
  const resolvedAreasCity = city || nav.city || DEFAULT_CITY;
  const { data: discoverAreasData } = useDiscoverAreas(resolvedAreasCity);
  const previousResultScope = nav.resultScope?.previous ?? null;
  const previousAreas: AreaPoint[] =
    previousResultScope?.kind === 'AREA_SET'
      ? previousResultScope.areaKeys
          .map((key) => discoverAreasData?.areas.find((area) => area.areaKey === key))
          .filter((area): area is NonNullable<typeof area> => area != null)
          .map((area) => ({
            areaKey: area.areaKey,
            areaLabel: area.name,
            geo_center_lat: area.geoCenterLat,
            geo_center_lon: area.geoCenterLon,
            bbox:
              area.minLat != null && area.minLon != null && area.maxLat != null && area.maxLon != null
                ? ([
                    [area.minLat, area.minLon],
                    [area.maxLat, area.maxLon],
                  ] as [[number, number], [number, number]])
                : null,
            listingCount: area.listingCount,
          }))
      : [];
  const returnLabel = previousResultScope
    ? previousResultScope.kind === 'AREA_SET'
      ? previousAreas.length === 1
        ? `Return to ${previousAreas[0].areaLabel}`
        : previousAreas.length > 1
          ? `Return to ${previousAreas.map((area) => area.areaLabel).join(', ')}`
          : 'Return to previous area'
      : previousResultScope.kind === 'POLYGON'
        ? 'Return to previous search area'
        : 'Return to previous area'
    : null;
  const handleReturnToPreviousScope = useCallback(() => {
    // Per #2015 AC7, a scope-boundary restore is a PUSH transition (browser
    // back stays undoable) — intentionally no `{ history: 'replace' }`.
    actions.commitResultScope(previousResultScope);
    // Issue #2480 — single-area (N=1) AREA_SET camera restore. Cannot call
    // `shell.focusAreaSetMember`/`shell.fitAreaSet` synchronously here — see
    // the doc comment above. Instead, record a one-shot request that the
    // post-commit effect in useDiscoverMapDataController will consume once
    // the commit above has actually landed. N>1 AREA_SET and non-AREA_SET
    // previous scopes are intentionally left alone (see doc comment above).
    //
    // The target is resolved HERE, from `previousAreas` (already loaded by
    // this panel for the Return label above), not left for the consuming
    // effect to recompute later — see `AreaSetCameraRestoreRequest`'s doc in
    // context/types.ts for why that matters (deferred #2017 double-fire).
    // If the single area doesn't actually resolve in `previousAreas` (e.g.
    // areas data not loaded here either), issue no request at all — an
    // honest degradation, since the Return label already falls back to the
    // generic "Return to previous area" in that case too.
    if (
      previousResultScope?.kind === 'AREA_SET' &&
      previousResultScope.areaKeys.length === 1 &&
      previousAreas.length === 1
    ) {
      shell.setAreaSetCameraRestoreRequest({
        areaKey: previousAreas[0].areaKey,
        bounds: previousAreas[0].bbox,
        center: [previousAreas[0].geo_center_lat, previousAreas[0].geo_center_lon],
      });
    }
  }, [actions, previousAreas, previousResultScope, shell]);

  // "Edit areas" / "Add nearby areas" open the AREA_SET draft (Issue #2017;
  // Issue #2596 owner-directed rework) — `openAreaSetDraft()` is the single
  // cross-tree open signal all surfaces read to swap to AreaSetDraftPanel in-panel.
  const handleEditAreas = useCallback(() => {
    shell.openAreaSetDraft();
  }, [shell]);
  const handleClearAreas = useCallback(() => {
    actions.commitResultScope(null);
  }, [actions]);

  /**
   * Issue #2596 — remove ONE committed area from the right panel's chips.
   *
   * Commits the REMAINING keys, so the panel's chips, heading and count update immediately. This
   * is deliberately NOT the map overlay's behaviour: those chips edit the uncommitted DRAFT via
   * `commands.remove` and take effect only on "Show listings". Both read the same AREA_SET state,
   * so this introduces no second selection state — it acts at the committed layer rather than the
   * draft layer.
   *
   * Removing the LAST area clears the scope instead of committing an empty AREA_SET, which is not
   * a state the rest of the app models — the same call `handleClearAreas` makes above.
   */
  const handleRemoveCommittedArea = useCallback(
    (areaKey: string) => {
      const remaining = (multiAreaKeys ?? []).filter((key) => key !== areaKey);
      if (remaining.length === 0) {
        actions.commitResultScope(null);
        return;
      }
      actions.commitResultScope({ kind: 'AREA_SET', areaKeys: remaining });
    },
    [multiAreaKeys, actions],
  );

  const handleAddNearbyAreas = useCallback(() => {
    shell.openAreaSetDraft();
  }, [shell]);

  /**
   * The recommendation tiles that ride under the property search (Issue #2596).
   * Extracted to a local rather than inlined so the workflow group below can
   * ask whether it has ANY child before rendering its bordered container —
   * otherwise a caller that supplies neither `onSearchChange` nor a tile state
   * would paint an empty hairlined strip.
   *
   * AREA_SET (single committed area) ONLY. VIEWPORT scope renders the separate
   * CTA below instead — see that constant for why it is not in this group.
   */
  const areaRecommendationTiles: ReactNode =
    multiAreaKeys || isViewportScope ? null : (
      <AreaSetTwoTileRow
        primaryAreaName={selectedArea.areaLabel}
        primaryAreaKey={selectedArea.areaKey}
        // Same `city || nav.city || DEFAULT_CITY` resolution the plural header
        // above uses, for the same reason: `AreaLeafListingsSurface` passes
        // `cityLabel` but not `city`, and at a bare `/discover` URL `nav.city`
        // is itself `''`. See that prop's comment for the full rationale.
        city={city || nav.city || DEFAULT_CITY}
        // The AreaPoint the map journey supplies already carries the count;
        // `deriveAreaPointFromNode` (the node journey) does not. Passed as a
        // fallback so the tile can render a count on the very first paint,
        // before the shared areas query this row self-sources has resolved.
        fallbackSchoolCount={selectedArea.schoolCount}
        onAddSchool={onAddSchool ? handleAddSchool : undefined}
        onAddNearbyAreas={handleAddNearbyAreas}
      />
    );

  /**
   * VIEWPORT-scope "Add a school in this area" CTA (Issue #2015), kept at its
   * MERGE-BASE presentation — own bordered/padded wrapper, sitting directly
   * below the heading and above the property search.
   *
   * WHY THIS IS DELIBERATELY NOT IN THE WORKFLOW GROUP (#2601, owner ruling
   * "option D"). An earlier revision folded this CTA into the shared search +
   * tiles group, which stripped its standalone wrapper and moved it below the
   * search. That is a user-visible change to a surface NOBODY HAS BEEN ABLE TO
   * WITNESS: three gates independently failed to find any reachable route to
   * VIEWPORT scope, at either viewport, in either arm. Code review 5219381573
   * put the choice plainly — preserve the prior presentation, or owner-scope
   * the changed surface out; do not certify a PASS on a surface no one has
   * seen. The owner chose preserve.
   *
   * So this branch carries NO visual delta in this PR by construction, and
   * whoever fixes VIEWPORT reachability can re-open the question against a
   * surface that is still where they left it. The wrapper below is restored
   * byte-for-byte from `cdb3c7d0`.
   *
   * `isViewportScope` and `multiAreaKeys` are mutually exclusive in practice,
   * but the `!multiAreaKeys` guard is kept explicit so this can never
   * double-render alongside the plural header's own action row.
   */
  const viewportSchoolCta: ReactNode =
    !multiAreaKeys && isViewportScope && onAddSchool ? (
      <div className="border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={handleAddSchool}
          data-testid="add-school-cta"
          className="flex w-full items-center gap-3 rounded-xl border border-plum/20 bg-plum-tint p-3 text-left shadow-sm transition-colors hover:border-plum/50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plum text-plum-foreground">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-semibold text-foreground">Add a school in this area</span>
          <span className="shrink-0 text-xs text-muted-foreground">Optional</span>
        </button>
      </div>
    ) : null;

  return (
    <div className="area-panel-container flex flex-1 flex-col overflow-y-auto">
      {/* Breadcrumb — sticky, area-first hierarchy: Home › City › Group › Area (Issue #1606) */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <AreaFirstBreadcrumb
          cityLabel={resolvedCityLabel || areaLabel}
          regionName={regionName}
          groupName={groupName}
          areaLabel={areaLabel}
          onHome={onCrumbHome}
          onCity={onCrumbCity}
          onRegion={regionName ? onCrumbRegion : undefined}
          onGroup={groupName ? onCrumbGroup : undefined}
        />
      </div>

      {/* Toolbar — journey pill + Trends / Filters / Back / Start over.
          Issue #2596: this row is the app's counterpart to the kit's
          `ExpModeBar`, which sits in the panel's FIXED top section directly
          above the filters (ExpPanel.jsx L884-887). The headline, count and
          sub-copy that used to share this container now render BELOW the
          quick-filter card, matching the kit's scrolling body — see the
          heading section further down. */}
      <div className="px-4 pb-2 pt-3.5">
        {/* No `mb-*` here any more: this row is now the section's only child,
            so the container's own `pb-3` supplies the whole gap. */}
        <div className="flex items-center justify-between gap-2">
          {journey === 'area-first' ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary-foreground">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              Area-first
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1.5">
            {trendsHref && (
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                <Link to={trendsHref}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Trends
                </Link>
              </Button>
            )}
            {filtersContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-7 w-7">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="sr-only">Filters</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0">
                  <SheetHeader className="sr-only">
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  {filtersContent}
                </SheetContent>
              </Sheet>
            )}
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onBack}
                aria-label="Back to areas"
                data-testid="back-button"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            {journey != null && onStartOver != null && (
              // Issue #1817 (AC8) — an area is selected here (deeper than a region),
              // so this site always confirms before resetting.
              <StartOverButton
                onStartOver={onStartOver}
                hasSubstantialState
                cityLabel={resolvedCityLabel || areaLabel}
                className="h-7 gap-1.5 rounded-full border border-input px-2 text-xs text-muted-foreground hover:text-foreground"
              />
            )}
          </div>
        </div>
      </div>

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

      {/* Heading section — result-scope eyebrow, headline, count, sub-copy.
          Issue #2596 FILTER PLACEMENT: this block now renders AFTER the
          quick-filter card, not before it. The kit puts the filters in the
          panel's fixed top section on desktop (ExpPanel.jsx L886) and at the
          very top of the scrolling body on mobile (L894-898); in BOTH cases
          they precede `EPHeading`. The filters must never trail the
          search/recommendation workflow, which is what this file did before.

          RESIDUAL DEVIATION, disclosed rather than papered over: this panel is
          a SINGLE scroll column (`area-panel-container ... overflow-y-auto`),
          so the DESKTOP treatment reproduced here is the kit's ORDERING, not
          its PINNING. The kit's desktop filters sit in a `flex: none` header
          that does not scroll away; ours scroll with the body. Making them
          genuinely sticky means restructuring this panel into fixed + scroll
          regions, which is app-shell work this issue does not own. */}
      {/* Issue #2596 density (owner follow-up) — `pb-4 pt-3.5` -> `pb-2.5 pt-2.5`. MEASURED at
          1366×768: this section rendered 152px against the kit's 64px `scope-bar`. Most of that
          difference is CONTENT this surface carries and the kit does not (the sub-copy line and
          the intent helper), which a spacing-only pass must not delete — so what is reclaimed
          here is the section padding and the two dead margins above, not the copy. */}
      <div className="border-b border-border px-4 pb-2.5 pt-2.5">
        {/* Issue #2159 reskin — mock density rule (VISUAL_RULES §3): the scope
            eyebrow, area title and result count read as ONE compact block
            instead of a full-bleed hero headline. Count sits outside the <h1>
            (a sibling, not a child) so the heading's accessible name stays
            exactly "Properties in {areaLabel}" for existing tests/consumers.

            PR #2180 review fix — `count` is areaListings.length, the length
            of the bounded per-area fetch slice (caller wires
            useDiscoverCityListings with limitPerArea: 50), NOT an
            authoritative total. The evergreen result-summary strip further
            below gets to say "X verified properties" safely because it has
            an escape hatch to the caller-precomputed `areaResultSummaryText`
            (same formatDiscoverBadgeCopy(...) call the map badge uses — see
            the prop's own JSDoc above). This hero block does not have that
            wiring, so for any area with >50 matches, labelling this number
            "for sale"/"for rent" would silently understate the true total.
            Labelled "shown" instead — true regardless of whether the area
            has more matches than the fetch limit. */}
        {multiAreaKeys ? (
          <AreaSetSelectedHeader
            areaKeys={multiAreaKeys}
            // Issue #2017 — fall back to the authoritative `nav.city` slug
            // (already read above for `activeScope`/`multiAreaKeys`) when the
            // caller omits the `city` prop entirely. `DiscoverAreasJourneyPanel`'s
            // `AreaLeafListingsSurface` (the default AREA-leaf render path — the
            // component this panel most commonly mounts under) passes
            // `cityLabel` but not `city`, which otherwise silently collapsed to
            // `''` here and sat below `useDiscoverAreas`'s `enabled: city.length
            // > 0` guard inside AreaSetSelectedHeader — the areas query never
            // fired, so the plural header always rendered its generic
            // "N areas" fallback instead of resolved names/counts, even once
            // listings had loaded. `nav.city` is the same city slug every
            // caller (this one included) already derives `cityLabel` from via
            // `CITY_CONFIG[nav.city]`, so this cannot diverge from what the
            // panel is actually displaying. Explicit `city` props (e.g.
            // NodeListingsSurface's `city={nav.city}`) still take precedence.
            //
            // Uses `||` (not `??`) and falls back through to DEFAULT_CITY, matching
            // the established `nav.city || DEFAULT_CITY` idiom used everywhere else
            // in Discover (see useDiscoverPageComposition.ts,
            // useDiscoverAreaGroupsController.ts, useDiscoverJourneySwitchController.ts,
            // useDiscoverNavigationController.ts). At a plain `/discover` URL with no
            // `?city=` param, `nav.city` itself is `''` (documented in
            // useDiscoverAgriController.ts and CityLaunchPreview.test.tsx) — a `??`
            // fallback never catches that empty string, so it silently reached
            // `useDiscoverAreas('')` and sat below its `enabled: city.length > 0`
            // guard, same failure mode as the missing-prop case above.
            city={city || nav.city || DEFAULT_CITY}
            count={count}
            intentNoun={intentNoun}
            isLoadingListings={isLoadingListings}
            onEditAreas={handleEditAreas}
            onClearAreas={handleClearAreas}
            onRemoveArea={handleRemoveCommittedArea}
            // Issue #2017 (Fit all / focus-one) — camera-only actions
            // registered by useDiscoverMapDataController; see
            // DiscoverShellContextValue's AreaSetCameraActions doc. Neither
            // call touches `resultScope`/`rareas`.
            onFitAll={shell.fitAreaSet}
            onFocusArea={shell.focusAreaSetMember}
            // Issue #2419 (PR-2) — "Draw search area". Same shell-registered
            // indirection as the two camera actions above; unlike them it
            // enters draw mode rather than moving the camera, and still
            // commits nothing on its own.
            onDrawSearchArea={shell.startDrawSearchArea}
            // Below the mobile breakpoint the map canvas is not mounted until
            // the Map view is open, so the draw tool must have a surface to
            // arm on. A no-op on desktop, where the map is always present.
            onRevealMap={shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined}
          />
        ) : (
          <>
            {/* Issue #2419 (PR-2) — the draw entry belongs in EVERY eligible
                residential listing state, not only the multi-area one. It
                previously lived inline in AreaSetSelectedHeader above, so a
                SINGLE committed area — much the more common state, and the
                one the #2016 contract spec reaches — had no entry at all.
                Hidden by its own eligibility rule for VIEWPORT scope, agri
                and anonymous shoppers, so this placement adds a control only
                where drawing genuinely applies. */}
            {/* Issue #2596 density — `empty:hidden`. MEASURED, not guessed: at 1366×768 this row
                renders at height 0 (its `DrawSearchAreaEntry` child is hidden by its own
                eligibility rule on this route) while its `mb-2` still applies, so it contributed
                8px of whitespace for nothing. `:empty` matches precisely when the child rendered
                null, so the margin survives wherever the row actually has content. */}
            {!isViewportScope && (
              <div
                className="mb-2 flex flex-wrap items-center gap-1.5 empty:hidden"
                data-testid="area-single-action-row"
              >
                <DrawSearchAreaEntry
                  hasResidentialListingScope
                  onDrawSearchArea={shell.startDrawSearchArea}
                  onRevealMap={
                    shell.isMobileShell ? () => shell.setMobileView('MAP') : undefined
                  }
                />
              </div>
            )}
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {isViewportScope
                    ? `Result scope — ${SCOPE_TITLE.VIEWPORT}`
                    : resultScopeKind === 'POLYGON'
                      ? 'Result scope — Drawn area'
                      : 'Result scope — Selected area'}
                </p>
                <h1 className="mt-0.5 font-['Fraunces',_ui-serif,_Georgia,_serif] text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {/* Issue #2461 — a committed POLYGON now renders the
                      polygon-scoped card list, so the heading must stop
                      attributing those results to the previously-selected
                      area. Keyed off the same `resultScopeKind` the
                      zero-result recovery already reads. */}
                  {isViewportScope
                    ? 'On screen right now'
                    : resultScopeKind === 'POLYGON'
                      ? `${headingNoun} in your drawn area`
                      : `${headingNoun} in ${areaLabel}`}
                </h1>
              </div>
              {!isLoadingListings && (
                <div className="shrink-0 text-right" data-testid="area-header-count">
                  <p className="font-mono text-2xl font-semibold leading-none tabular-nums text-foreground">
                    {count}
                  </p>
                  <p
                    className="mt-0.5 text-[11px] text-muted-foreground"
                    data-testid="area-header-count-noun"
                  >
                    {countNoun}
                  </p>
                </div>
              )}
            </div>
            {/* R-C — sub-copy: 15px, 1.55 line-height, --text-body colour. */}
            <p className="mt-1.5 text-[15px] leading-[1.55] text-[hsl(var(--text-body))]">
              {isViewportScope
                ? 'Explore verified listings in this map area, with map context and area-first filters.'
                : resultScopeKind === 'POLYGON'
                  ? 'Explore verified listings inside the area you drew, with map context and area-first filters.'
                  : `Explore verified listings around ${areaLabel}, with map context and area-first filters.`}
            </p>
            <AreaSelectedPanelScopeBar
              resultScopeKind={resultScopeKind}
              returnLabel={returnLabel}
              onReturn={handleReturnToPreviousScope}
              onRedrawPolygon={onRedrawPolygon}
            />
          </>
        )}

        {/* Controls card — REMOVED (product-owner ruling, #1953 follow-up).
            City was already removed from this card in build step 6, leaving
            Buy/Rent as its only occupant; now that Buy/Rent is ALSO removed
            (the persistent DiscoverControlBar is the SOLE Buy/Rent control
            on /discover, same ownership rationale as the prior city
            removal), the `onIntentChange &&`-gated card has nothing left to
            hold and is retired with it — leaving it in place would render
            an empty bordered "Looking to" box whenever `onIntentChange` is
            supplied, which is worse than not rendering at all. The intent-
            aware price helper directly below is UNCHANGED (it was already a
            separate, unconditional element, not part of this gate).
            `intent`/`onIntentChange` remain accepted (now JSX-unused) props
            — kept threaded through unchanged, mirroring the existing
            `onCityChange` convention already established on this exact
            component, so no prop-interface churn ripples into
            DiscoverRightPanel / DiscoverRightPanelContainer for this file. */}

        <p className="mt-2.5 text-xs text-muted-foreground" data-testid="area-intent-helper">
          {isViewportScope
            ? `Showing ${intentNoun} prices in ₹ for this area.`
            : resultScopeKind === 'POLYGON'
              ? `Showing ${intentNoun} prices in ₹ for your drawn area.`
              : `Showing ${intentNoun} prices in ₹ for ${areaLabel}.`}
        </p>

        {/* Issue #2596 density — same `empty:hidden` reasoning as the action row above, and the
            same measurement: `activeContextChips` is frequently a non-null node that renders
            nothing, so the `!= null` guard passes and this div contributed 10px of top margin
            around zero content. */}
        {activeContextChips != null && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 empty:hidden">
            {activeContextChips}
          </div>
        )}
      </div>

      {/* VIEWPORT-scope school CTA — its own bordered strip, directly below the
          heading and ABOVE the search, exactly as at the merge base. Rendered
          here rather than inside the group below so this PR carries no visual
          delta on a surface no gate has been able to reach (#2601 option D);
          see the constant's own comment for the full reasoning. Null in every
          AREA_SET state, so the certified single-area path is untouched. */}
      {viewportSchoolCta}

      {/* Workflow group (Issue #2596) — property search FIRST, then the two
          compact recommendation tiles, read as ONE group.

          THIS ORDERING SUPERSEDES ISSUE #2084 AC8, deliberately. AC8 ruled
          "heading -> school CTA -> search -> filters". The approved kit puts
          the search box first and the tiles beneath it: `EPAreaActions`
          (ExpPanel.jsx L371) is a single flex column, `gap: 8px`, holding the
          `property-search` box (L379) and only then the `1fr 1fr` tile grid
          (L385). The product owner ruled this order for #2596 with AC8 in
          view, so AC8's ordering clause is superseded here rather than
          accidentally contradicted. AC8's other clause — that the school
          shortcut is its own modest row and not a hero block — still holds.

          ONE SEPARATION, NOT TWO. The kit has no divider between the search
          box and the tile grid; they are one workflow separated by spacing.
          This group therefore owns the section's single bottom hairline and
          its own padding, and the children inside carry neither.

          Issue #2017 — the mock's state machine (Experience.jsx: `single =
          scopeKind === "AREA_SET" && committed.length === 1`, `v.areaActions =
          single`) gates the two-tile row on exactly ONE committed area. The
          committed multi-area state's own action surface is the ghost-button
          row inside `AreaSetSelectedHeader` above (Edit areas / Clear selected
          areas / Draw search area / Create alert), matching the mock's
          `EPScopeBar` AREA_SET row, so nothing else is needed there.

          Issue #2596 density (owner follow-up) — `py-3` -> `py-2.5`. The kit's `EPAreaActions`
          carries NO padding of its own; its separation comes from the scrolling body's 12px
          column gap. This panel has no container gap (measured: `gap: normal`, every
          inter-section gap 0), so the section keeps padding rather than losing its separation
          entirely. The inner `gap-2` is the kit's own 8px and is unchanged, as is the tile
          height — those were measured to parity in the density pass and are not to regress. */}
      {(onSearchChange != null || areaRecommendationTiles != null) && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5">
          {onSearchChange && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              {/* `h-10` = 40px (Issue #2596, owner-authorised kit parity). The kit's
                  `property-search` box declares `minHeight: "40px"` (ExpPanel.jsx L379);
                  this was `h-9` = 36px. No custom height scale is configured, so the
                  Tailwind default applies and `h-10` is 2.5rem = 40px exactly. The
                  absolutely-positioned search icon and clear button both centre on
                  `top-1/2 -translate-y-1/2`, so neither needs adjusting. */}
              <Input
                placeholder={`Search properties in ${areaLabel}`}
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-10 pl-8 pr-8 text-sm"
                data-testid="area-search-input"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear search"
                  data-testid="area-search-clear"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {areaRecommendationTiles}
        </div>
      )}

      {/* Listings body */}
      <div
        className={cn(
          'transition-opacity duration-150',
          isFetching && !isInitialLoading ? 'pointer-events-none opacity-50' : 'opacity-100',
        )}
      >
        {isLoadingListings ? (
          <div className="space-y-3 p-4">
            {/* a4 — rounded-xl skeleton cards for consistency with PropertyCard corners. */}
            {[0, 1, 2].map((i) => (
              <div key={i} data-testid="listing-skeleton" className="rounded-xl border border-border p-3">
                <Skeleton className="mb-3 h-40 w-full rounded-lg" />
                <Skeleton className="mb-2 h-4 w-2/3" />
                <Skeleton className="mb-2 h-3 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : isListingsError && (!areaListings || areaListings.length === 0) ? (
          // Issue #2018 requirement A — "error is not empty". A settled request
          // failure with nothing to fall back on gets the explicit
          // request-failure state, NEVER the zero-result recovery below: that
          // recovery asserts "no matching listings in {scope}" as a fact about
          // the marketplace, and this request never successfully asked it.
          //
          // Copy follows the frozen mock's own error state (ExpPanel.jsx
          // L566-572): name it a request failure and say the search is
          // untouched. Structure mirrors the #2015 anon-viewport first-load
          // failure branch in DiscoverRightPanel.tsx.
          <div
            className="m-4 flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center"
            data-testid="area-listings-error"
          >
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">We could not load these results</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              This is a request failure, not an empty market. Your scope and filters are unchanged.
            </p>
            {onRetryListings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetryListings}
                data-testid="area-listings-error-retry"
              >
                Retry
              </Button>
            )}
          </div>
        ) : !areaListings || areaListings.length === 0 ? (
          (() => {
            // Issue #1817 (AC7) — cause-routed empty state, sourced from the SAME
            // hasPropertyFilters/hasSearch signal the badge's zero-filters/zero-search/
            // zero-empty states use, so the panel and badge never disagree about why
            // the list is empty (design §7).
            const copy = deriveDiscoverEmptyStateCopy({
              hasPropertyFilters,
              hasSearch: !!searchQuery,
              searchQuery,
              n: selectedArea.listingCount ?? null,
              scopeLabel: areaLabel,
              cityLabel: resolvedCityLabel || areaLabel,
              isCityScope: false, // an area is always narrower than its city
              // #2450 copy truth — "homes" is a Residential word. A Commercial selection must not
              // have its zero-result state described as homes, whatever the intent.
              noun: commercialFromFilters
                ? 'properties'
                : intentNoun === 'rent'
                  ? 'rentals'
                  : 'homes',
            });
            const onClearFilters = hasPropertyFilters ? handleClearPropertyFilters : undefined;
            const onClearSearch = searchQuery && onSearchChange ? () => onSearchChange('') : undefined;

            // Issue #2018 (slice 1) — an AREA / AREA_SET zero result is not a
            // dead end: it gets the mock's `EPZero` recovery stack (scope +
            // filter summary, "kept exactly as it is", and nearby areas that
            // DO have matches under the same filters) instead of the generic
            // cause-routed EmptyState. `deriveDiscoverEmptyStateCopy` above is
            // still the single owner of the CAUSE — the recovery banner reads
            // it so this panel and the map badge cannot disagree about why the
            // list is empty (design §7, unchanged).
            //
            // Issue #2018 slice 3 — every scope kind now reaches the recovery
            // stack, which says only what is true of the ACTIVE scope (see
            // AreaZeroResultRecovery's `scopeKind` doc).
            //
            // Slice 1 excluded VIEWPORT here and left POLYGON unconsidered.
            // That was a truthfulness bug for POLYGON specifically: no
            // `isPolygonScope` equivalent exists anywhere (both flags in
            // useDiscoverMapData are gated on `kind === 'VIEWPORT'`), so a
            // committed polygon fell through to the single-canonical-AREA
            // path and this banner named an AREA that is not the scope, then
            // offered nearby areas measured from it. Both statements were
            // false about a drawn search.
            return (
              <AreaZeroResultRecovery
                scopeAreaKeys={multiAreaKeys ?? [selectedArea.areaKey]}
                fallbackScopeName={areaLabel}
                city={city || nav.city || DEFAULT_CITY}
                filters={filters}
                intent={intent}
                searchQuery={searchQuery}
                // #2450 copy truth — see the matching derivation on the empty-state copy above.
                noun={
                  commercialFromFilters
                    ? 'properties'
                    : intentNoun === 'rent'
                      ? 'rentals'
                      : 'homes'
                }
                cause={copy.cause}
                scopeKind={resultScopeKind}
                resultScope={activeScope}
                onAdjustBoundary={onRedrawPolygon}
                // Issue #2552 — WRAPPED, not forwarded raw, and this was the last path by which a
                // stale family override could resurrect. `AreaZeroResultRecovery` emits through
                // this prop directly, so a relaxation click bypassed every `setFamilyOverride` the
                // family controls make. `applyRelaxationPreview`'s empty PROPERTY_TYPES offer
                // returns `propertyTypes: undefined` — a DESIGNED offer, shown to the buyer as
                // "Include every property type" — which makes the filters family-silent and hands
                // the family back to whatever override was last set. A relaxation expresses no
                // family intent, so it clears the override exactly like `handleClearPropertyFilters`.
                //
                // The ternary preserves the prop's OPTIONALITY deliberately: that component gates
                // its entire relaxation block on `onApplyFilters` being defined, so wrapping
                // unconditionally would offer a relaxation on a panel with no filter owner — a
                // control that cannot do anything, which is the dead-control class this panel
                // refuses elsewhere (`onRetryListings`, `onAddSchool`).
                // Issue #2555 (re-review finding) — the memories go with the override, for the
                // identical reason. The empty PROPERTY_TYPES offer is a DELIBERATE clear by the
                // buyer, so banking it is what stops the cleared selection returning on the next
                // family switch. The effect above now banks unconditionally and would cover this
                // on the following render anyway; clearing here as well states the intent at the
                // point of action, exactly as the handlers do.
                //
                // FOURTH-CYCLE FINDING — this wrapper banked `next.propertyTypes` UNFILTERED, and
                // it is a door this issue itself opened. `applyRelaxationPreview` spreads `filters`
                // and overwrites exactly ONE key, so `propertyTypes` passes through untouched on
                // the PRICE_MAX / READY_TO_MOVE / BEDROOMS offers — a buyer on `?type=warehouse`
                // accepting any of them banked a Commercial token as the RESIDENTIAL memory.
                // Filtered here so the banked value is clean at the point of action; the read side
                // in `handleSelectFamily` is what makes that guarantee complete.
                onApplyFilters={
                  onFiltersChange
                    ? (next) => {
                        setFamilyOverride(null);
                        residentialMemoryRef.current = withoutCommercialFamilyTokens(
                          next.propertyTypes,
                        );
                        commercialMemoryRef.current = next.commercialSubtypes;
                        onFiltersChange(next);
                      }
                    : undefined
                }
                onClearFilters={onClearFilters}
                onClearSearch={onClearSearch}
              />
            );
          })()
        ) : (
          <>
            {isListingsError && (
              // Issue #2018 requirement A — a transient failure AFTER a
              // successful load keeps the last good result set on screen
              // (the issue: "the last successful results preserved where
              // available") and surfaces the error as an inline banner
              // instead of wiping the cards. Same two-branch shape and same
              // copy register as the #2015 anon-viewport retry banner in
              // DiscoverRightPanel.tsx — one error treatment, two surfaces.
              <div
                className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                data-testid="area-listings-retry-banner"
                aria-live="polite"
              >
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t refresh these results. Showing the last ones we loaded.
                </p>
                {onRetryListings && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRetryListings}
                    data-testid="area-listings-retry-banner-btn"
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
            {/* Intent-aware verified result summary (Issue #1494 / #1606) */}
            {/* a4 — warm evergreen-tint/60 strip instead of near-invisible bg-muted/20 */}
            <div className="flex items-center gap-1.5 border-b border-border bg-evergreen-tint/60 px-4 py-2" data-testid="area-result-summary">
              <ShieldCheck className="h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
              <p className="text-xs font-medium text-foreground" data-testid="area-result-summary-text">
                {areaResultSummaryText ??
                  `${count} verified ${count === 1 ? 'property' : 'properties'} for ${intentNoun}${
                    isViewportScope
                      ? ' in this area'
                      : resultScopeKind === 'POLYGON'
                        ? ' in your drawn area'
                        : ` in ${areaLabel}`
                  }`}
              </p>
            </div>
            {/* Issue #2159 reskin — the desktop 2-column grid target (mock's dense
                card grid) needs the PANEL's own width, not the viewport's: at the
                1366×768 desktop target the panel column is well under Tailwind's
                1536px `2xl` viewport breakpoint, so `2xl:grid-cols-2` never fired
                and this always rendered single-column on desktop. Tailwind 3.4
                doesn't ship container-query variants without the (uninstalled)
                `@tailwindcss/container-queries` plugin, so a plain native CSS
                container query does the job instead — see `.area-panel-container`
                / `.area-listings-grid` in src/index.css. */}
            {/* Issue #2596 — close the dead band between the controls and the results.
                Measured at the merge base: 66px from the filter card's bottom edge to the first
                card's top, accumulated from three separate paddings (the filter section's py-3,
                this grid's uniform p-4, and the summary strip between them). #2596 asks for
                "meaningful results high in the desktop viewport" and no "unexplained dead band
                between filters and results". The grid keeps its full side and bottom padding and
                only loses the redundant top inset, so card spacing itself is unchanged. */}
            <div className="area-listings-grid grid grid-cols-1 gap-3 px-4 pb-4 pt-2">
              {areaListings.map((listing) => (
                <div
                  key={listing.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(listing.id, node);
                    else cardRefs.current.delete(listing.id);
                  }}
                >
                  <PropertyCard
                    listing={listing}
                    isAuthenticated={isAuthenticated}
                    onNavigate={() => navigate(`/listing/${listing.id}`)}
                    isSelected={selectedListingId === listing.id}
                    onSelect={onSelectListing}
                    onHover={onHoverListing}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Trust strip — verification reassurance footer (Issue #1606, mock parity) */}
      <div className="mt-auto flex items-start gap-2.5 border-t border-border bg-evergreen-tint/40 px-4 py-3.5" data-testid="area-trust-strip">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-evergreen" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Every listing is verified.</span>{' '}
          Documents checked, RERA registered, broker confirmed — before it reaches you.
        </p>
      </div>
    </div>
  );
}
