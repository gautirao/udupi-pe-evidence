package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * #2433 — the explicit, privacy-reviewed allowlist of Commercial facts a Discover
 * result card may summarise.
 *
 * <p>This is a separate record rather than eleven more components on
 * {@link DiscoverListingResponse} for three reasons:
 *
 * <ul>
 *   <li>the allowlist stays auditable in ONE place, which is the whole point of the
 *       deliberate allowlist approach {@code ListingIndexDocument} and the public DTOs
 *       already use — a reviewer can read this file and know exactly what leaves the
 *       server;</li>
 *   <li>{@code DiscoverListingResponse} gains a single appended component, which keeps
 *       the conflict surface with #2458's own append down to one hunk instead of eleven;</li>
 *   <li>{@code DiscoverListingsService.buildListing} stays a readable funnel rather than
 *       growing to forty positional parameters.</li>
 * </ul>
 *
 * <h2>What is deliberately NOT here</h2>
 *
 * <p>{@code expected_rental_yield_pct} and {@code current_monthly_income_paise} are
 * excluded as derived ROI claims (#2433 non-goal). {@code lease_term_months} and
 * {@code lease_escalation_pct} are excluded because LEASE is not persistable at all —
 * {@code chk_listing_purpose} admits only {@code sale|rent} and zero LEASE rows exist.
 * {@code power_load_kva}, {@code commercial_approvals} and {@code commercial_ownership}
 * are excluded as too specialised for a compact card, and the latter two edge toward
 * legal claims this issue explicitly must not make.
 *
 * <h2>Two storage shapes for the same fact</h2>
 *
 * <p>Floor and total-floors exist in TWO places. V104 added flat write columns
 * ({@code property_listings.floor_choice} / {@code floor_mode}) while V102's typed child
 * tables carry {@code floor_number} / {@code total_floors}. A listing authored through
 * one path reads NULL on the other, so BOTH are projected and the presentation layer
 * falls back between them. Projecting only one source renders a blank summary for every
 * row written through the other path.
 *
 * <p>Every component is nullable and the record is {@code NON_NULL}-serialised, so an
 * absent fact is simply missing from the JSON rather than being sent as null. Absence is
 * the norm here, not the exception: every V104 column is nullable with no backfill.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverCommercialFacts(
        /** V104 flat shape — {@code property_listings.floor_choice}. */
        String floorChoice,
        /** V104 flat shape — {@code property_listings.floor_mode}. */
        String floorMode,
        /**
         * V102 typed-child {@code listing_commercial_space_details.floor_number}, falling back
         * to the V32 flat {@code property_listings.floor_number} (#2506). Distinct from the
         * V104 {@code floorChoice}/{@code floorMode} token above, which the client PREFERS
         * over this integer — see {@link CommercialFactAuthority} for both orderings.
         */
        Integer floorNumber,
        /**
         * V102 typed-child shape, coalesced across the space / building / warehouse
         * projections, falling back to the V32 flat {@code property_listings.total_floors}
         * (#2506).
         *
         * <p>Each projection is keyed by {@code listing_id} PK, so the coalesce cannot merge
         * two different listings' floor counts.
         *
         * <p>It is NOT true, however, that a listing belongs to at most one of them — this
         * javadoc asserted that until #2516 checked. {@code refreshTypedProjections} (#1734)
         * branches on listing_FAMILY rather than {@code property_type}, so it upserts
         * {@code listing_commercial_space_details} for EVERY Commercial-family listing and
         * never writes the building / warehouse / land tables at all. A warehouse can hold
         * both rows. The space projection is coalesced FIRST because it is the only one the
         * write path keeps current; the others are V102 backfill remnants.
         *
         * <p>That ordering is the best available, NOT a guarantee. {@code COALESCE} cannot
         * distinguish an absent space row from one holding {@code NULL}, so in principle a
         * CLEARED value could yield to a stale remnant. Only presence-aware selection would
         * close that, and it is deliberately not done.
         *
         * <p>That case is unreachable through the API, verified rather than assumed:
         * {@code updateListing} applies these scalars as set-if-non-null, so null means "leave
         * untouched" rather than "clear", and the #2289 subtype-switch nuller touches only
         * V104 fields. The flat value is monotone, so only a direct DB write could produce it.
         * The SQL limitation is still real, so do not add a COALESCE arm assuming otherwise.
         */
        Integer totalFloors,
        String hubType,
        Integer officeSeats,
        String occupancyStatus,
        Double warehouseClearHeightFt,
        Integer warehouseLoadingBays,
        /**
         * Coalesced across the space / building / warehouse / land projections, falling back
         * to the V32 flat {@code property_listings.road_frontage_ft} (#2506). Same ordering
         * rationale as {@code totalFloors} above.
         */
        Double roadFrontageFt,
        String commercialZoning
) {

    /**
     * Returns {@code null} when no fact is populated, so the enclosing
     * {@code NON_NULL} DTO omits the object entirely rather than emitting an empty
     * {@code {}}.
     *
     * <p>This matters for honesty, not just payload size: an empty object invites a
     * client to render an empty summary row, and #2433 requires absent facts to be
     * hidden without a placeholder that implies knowledge.
     */
    public static DiscoverCommercialFacts orNullIfEmpty(DiscoverCommercialFacts facts) {
        if (facts == null || facts.isEmpty()) {
            return null;
        }
        return facts;
    }

    /** True when every allowlisted fact is absent. */
    public boolean isEmpty() {
        return isBlank(floorChoice)
                && isBlank(floorMode)
                && floorNumber == null
                && totalFloors == null
                && isBlank(hubType)
                && officeSeats == null
                && isBlank(occupancyStatus)
                && warehouseClearHeightFt == null
                && warehouseLoadingBays == null
                && roadFrontageFt == null
                && isBlank(commercialZoning);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
