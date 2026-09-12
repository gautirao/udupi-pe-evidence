/**
 * Issue #2459 AC2 (submit half). The Bedroom rule has TWO sentences, and BOTH are quoted here
 * deliberately:
 *
 *   > "Plots never show or submit a Bedroom filter."
 *   > "Commercial never shows or submits Bedrooms."
 *
 * An earlier revision of this header quoted only the first. The second was then absent from the
 * code as well — Shop, Office, Commercial Building and Warehouse all kept emitting `beds=` — and
 * sixteen green tests did not notice, because none of them selected a Commercial shape. A header
 * that quotes half a rule is how the other half goes missing; do not trim either sentence.
 *
 * Neither shape HAS bedrooms. A plot has none; a commercial row carries `bedrooms` NULL, so
 * `AND pl.bedrooms IN (3)` eliminates every one of them. In both cases the bedroom bound is not a
 * narrow search — it is a search that can only ever return nothing, HTTP 200 with no error and no
 * reason the buyer can see. This module owns the ONE question every submission boundary asks
 * before emitting the bedroom predicate: can the active property-type selection have bedrooms at
 * all?
 *
 * ## Why the Commercial half became more urgent AFTER it was written up
 *
 * Before #2530, picking Warehouse emitted `type=commercial&subtype=WAREHOUSE`, which the server
 * resolved to `AND FALSE` — so the selection returned zero rows anyway and the bedroom predicate
 * was MASKED by a larger defect. #2530 fixed the type emission; real inventory now comes back, and
 * the bedroom predicate became the SOLE remaining cause of a silent zero. Removing it is what lets
 * #2530's fix actually reach the buyer.
 *
 * ## Suppression is about SUBMISSION, not about the buyer's state
 *
 * Nothing here deletes `bedrooms`. The value stays exactly where it already lived — in the
 * PropertyFilters React state owned by `useDiscoverPageState` — so switching back to Apartment /
 * Villa / House re-emits the buyer's previous selection with no restore machinery of any kind.
 * A destructive "clear bedrooms when plots are picked" would have made that impossible, and would
 * have needed a second place to remember the value: exactly the parallel filter-state owner
 * #2459's approved plan forbids.
 *
 * ## EVERY submission boundary asks this predicate — no exceptions
 *
 * The rule is stated as a closed invariant rather than as a count, because a count is what went
 * wrong here before: an earlier revision of this header said "two boundaries" while three already
 * existed, and a reader auditing the claim would have stopped one short. The invariant is:
 *
 *   > Anything that can put a bedroom constraint in front of the server — a request, a link, or a
 *   > counts query — calls {@link shouldSubmitBedrooms} first.
 *
 * That sentence stays true as call sites are added; the census below is only where they are TODAY
 * (three, verified 2026-09-12), and is not the thing to keep in step. If you add a fourth, add the
 * call — updating this list is a courtesy, not the contract.
 *
 *  - `lib/discoverSearchParams.ts` — the single builder BOTH `/api/discover/listings` and
 *    `/api/discover/markers` call, so cards and map markers cannot disagree about whether a
 *    bedroom constraint was applied.
 *  - `features/discover/state/url/filters.ts` — `serializeFilters`, so the constraint is not
 *    written into a link either. Without this half, a plot-only URL could be reloaded or shared
 *    with `beds=3` still on it: invisible, unremovable, and silently reapplied by whatever reads
 *    it next.
 *  - `features/discover/adapters/navigationCountsFilters.ts` — the destination-counts query, which
 *    sits behind the SAME `DiscoverListingPredicateBuilder`. Omitting this one would be worse than
 *    the original defect rather than a partial fix: before AC2 every path emitted bedrooms —
 *    wrong, but CONSISTENT — whereas suppressing at only the request and link boundaries would
 *    make a destination advertise a count its own result list cannot reproduce.
 *
 * ## The meaning, not a hand-maintained list of types
 *
 * "Plot" is resolved through {@link resolvePrimaryAreaMeaning} and "Commercial" through
 * {@link resolvePrimaryAreaFamily} — the same #2458-derived mapping the area control's label is
 * built from, mirroring `DiscoverPrimaryArea.java`. A second literal list of plot-ish or
 * commercial-ish property types here would be a further declaration of the same taxonomy with
 * nothing holding it in step; adding a new one would then silently keep submitting bedrooms for
 * it. Deriving both means a taxonomy change lands here for free, and NO new vocabulary is coined
 * for the Commercial half — `resolvePrimaryAreaFamily` already answers it.
 *
 * This module renders nothing and knows nothing about controls. Whether the bedroom control is
 * VISIBLE is a separate question owned by #2450.
 */
import { SUBTYPE_BEARING_PROPERTY_TYPE } from '@/lib/listing-constants';
import {
  resolvePrimaryAreaFamily,
  resolvePrimaryAreaMeaning,
  type PrimaryAreaSelection,
} from '@/features/discover/filters/primaryAreaLabels';

/**
 * True when EVERY property shape the buyer has selected resolves to `PLOT`.
 *
 * Three deliberate edges:
 *
 *  - **No selection is not plot-only.** An empty (or absent) `propertyTypes` means "no narrowing",
 *    i.e. every type including dwellings — the broadest possible mixture. Treating it as plot-only
 *    would suppress the bedroom predicate for the default view, which is the opposite of AC2.
 *  - **`UNRESOLVED` is not `PLOT`.** A type with no resolvable primary area (`other`, an unmapped
 *    stored value) might well be a dwelling, so it makes the selection NOT plot-only and the
 *    bedroom predicate is submitted as before. Suppressing on a shrug would hide a constraint the
 *    buyer set, which is the more damaging direction of the two.
 *  - **Mixed selections are NOT plot-only.** A selection containing both dwellings and plots
 *    returns false and submits bedrooms unchanged. AC2 covers plot-ONLY; mixed-selection bedroom
 *    semantics are explicitly out of scope for this slice.
 *
 * Subtype narrowing is applied exactly as {@link resolvePrimaryAreaControlLabel} applies it — only
 * to the one subtype-bearing type, every other type resolving from itself — so the control's label
 * and the submitted predicate can never be computed from two different readings of the same
 * selection.
 */
export function isPlotOnlySelection(selection: PrimaryAreaSelection = {}): boolean {
  const selectedTypes = selection.propertyTypes;
  if (selectedTypes == null || selectedTypes.length === 0) return false;

  const selectedSubtypes = selection.commercialSubtypes ?? [];

  for (const rawType of selectedTypes) {
    const subtypesToApply =
      rawType.trim().toLowerCase() === SUBTYPE_BEARING_PROPERTY_TYPE && selectedSubtypes.length > 0
        ? selectedSubtypes
        : [null];

    for (const subtype of subtypesToApply) {
      if (resolvePrimaryAreaMeaning(rawType, subtype) !== 'PLOT') return false;
    }
  }

  return true;
}

/**
 * True when EVERY property shape the buyer has selected is COMMERCIAL — the second sentence of the
 * Bedroom rule, in the same shape as {@link isPlotOnlySelection} and for the same reasons.
 *
 * The family is read from {@link resolvePrimaryAreaFamily}, which already returns `'commercial'`;
 * no new taxonomy is declared here. Subtype is deliberately NOT consulted: all five buyer subtypes
 * (SHOP/OFFICE/BUILDING/WAREHOUSE/LAND) are commercial, and a commercial row carries `bedrooms`
 * NULL whichever one it is, so the family alone settles the question. That also means an
 * unnarrowed Commercial selection — the two-click path `Residential 3 BHK → Commercial Shop` —
 * is covered, which is the case that was reaching the wire.
 *
 * The same three edges as the plot rule, and for the same reasons:
 *
 *  - **No selection is not commercial-only.** Empty/absent `propertyTypes` means every type,
 *    dwellings included.
 *  - **An unfamilied type is not commercial.** `other` resolves to `null`, so it makes the
 *    selection NOT commercial-only and the predicate is submitted as before — a shrug must not
 *    silently drop a constraint the buyer set.
 *  - **Mixed selections are NOT commercial-only.** Apartment + Shop still contains a shape that
 *    HAS bedrooms, so the constraint stays meaningful for that half and is submitted unchanged.
 */
export function isCommercialOnlySelection(selection: PrimaryAreaSelection = {}): boolean {
  const selectedTypes = selection.propertyTypes;
  if (selectedTypes == null || selectedTypes.length === 0) return false;
  return selectedTypes.every((rawType) => resolvePrimaryAreaFamily(rawType) === 'commercial');
}

/**
 * Whether the bedroom predicate may be submitted for this selection — the positive form every
 * call site actually reads, so none has to spell the negation out and get it backwards.
 *
 * BOTH sentences of the rule are answered here rather than at the boundaries. That is the whole
 * point of the single predicate: a boundary that asked only `isPlotOnlySelection` would implement
 * half the rule while looking complete, which is precisely how the Commercial half went missing.
 */
export function shouldSubmitBedrooms(selection: PrimaryAreaSelection = {}): boolean {
  return !isPlotOnlySelection(selection) && !isCommercialOnlySelection(selection);
}
