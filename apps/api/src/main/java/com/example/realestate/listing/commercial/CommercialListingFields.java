package com.example.realestate.listing.commercial;

import java.math.BigDecimal;
import java.util.List;

/**
 * Bounded value carrier for the net-new commercial design-spec fields (#1730 / M38-FU2).
 *
 * <p>This is NOT a new DTO/API-contract shape — {@code CreateRequest}/{@code UpdateRequest}
 * in {@code ListingController} remain the flat, additive, all-nullable API contract, mirroring
 * the architect decision for the residential typed listing flow (#1626, d2). This record exists
 * purely to avoid extending the already-large positional parameter lists of
 * {@code ListingCrudService.createDraft}/{@code updateListing} by another ~29 parameters; the
 * controller constructs one of these per request from the flat DTO fields and passes it as a
 * single additional trailing parameter to new overloads.
 *
 * <p>All fields are nullable. {@code null} means "not supplied" (leave unset on create, leave
 * unchanged on update) — never coerced to a default. The two {@code List<String>} fields are
 * the FINAL desired multi-select set for their child table (REPLACE semantics, not a delta) —
 * see {@code ListingCrudService} write path.
 *
 * <p>{@code commercialSubtype} is resolved/derived by the controller before this record is
 * constructed (see {@code ListingController#resolveCommercialSubtype}) — it is never a raw
 * pass-through of the client-supplied value for {@code commercial_building}/{@code warehouse}/
 * {@code commercial_land} property types.
 */
public record CommercialListingFields(
        String commercialSubtype,
        String floorChoice,
        String floorMode,
        String hubType,
        Integer washroomsPublic,
        Integer washroomsPrivate,
        Integer parkingPublicCount,
        Integer parkingPrivateCount,
        Integer officeSeats,
        Integer officeCabins,
        Integer officeMeetingRooms,
        String occupancyStatus,
        BigDecimal powerLoadKva,
        BigDecimal warehouseClearHeightFt,
        Integer warehouseLoadingBays,
        Boolean warehouseTruckAccess,
        String warehouseFlooring,
        String commercialZoning,
        String commercialOwnership,
        String commercialApprovals,
        BigDecimal expectedRentalYieldPct,
        Long currentMonthlyIncomePaise,
        Integer leaseTermMonths,
        BigDecimal leaseEscalationPct,
        String commercialFurnishingStatus,
        String commercialAvailability,
        String commercialAreaUnit,
        List<String> suitableUses,
        List<String> utilities
) {
    /** All-null instance for call sites that have no commercial fields to apply. */
    public static final CommercialListingFields EMPTY = new CommercialListingFields(
            null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
}
