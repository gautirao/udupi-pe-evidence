package com.example.realestate.listing.residential;

import java.math.BigDecimal;
import java.util.List;

/**
 * Bounded value carrier for the net-new residential design-spec fields (#1626 / M38-13A).
 *
 * <p>This is NOT a new DTO/API-contract shape — {@code CreateRequest}/{@code UpdateRequest}
 * in {@code ListingController} remain the flat, additive, all-nullable API contract (architect
 * decision d2). This record exists purely to avoid extending the already-large positional
 * parameter lists of {@code ListingCrudService.createDraft}/{@code updateListing} by another
 * ~39 parameters; the controller constructs one of these per request from the flat DTO fields
 * and passes it as a single additional trailing parameter to new overloads.
 *
 * <p>All fields are nullable. {@code null} means "not supplied" (leave unset on create,
 * leave unchanged on update) — never coerced to a default. The three {@code List<String>}
 * fields are the FINAL desired multi-select set for their child table (REPLACE semantics,
 * not a delta) — see {@code ListingCrudService} write path.
 */
public record ResidentialListingFields(
        Integer bathrooms,
        Integer balconies,
        String facing,
        String availabilityTimeline,
        BigDecimal superBuiltArea,
        String superBuiltAreaUnit,
        String propertyAge,
        String residentialWaterSource,
        Integer parking2wCount,
        Integer parking4wCount,
        BigDecimal roadWidthFt,
        String plotDimensions,
        String conversionStatus,
        String khataNumber,
        String propertyTaxPid,
        String approvingAuthority,
        String projectName,
        String builderName,
        Long maintenancePaise,
        Boolean hasLift,
        Boolean hasPowerBackup,
        Boolean isGated,
        Boolean hasGarden,
        Boolean hasTerrace,
        Boolean hasCompound,
        Boolean hasServantRoom,
        Boolean isCornerPlot,
        Boolean hasBoundaryWall,
        Boolean isGatedLayout,
        Boolean hasWaterConnection,
        Boolean hasElectricityConnection,
        Boolean hasDrainage,
        Boolean priceNegotiable,
        Boolean rentNegotiable,
        Boolean petsAllowed,
        Boolean maintenanceIncluded,
        List<String> amenities,
        List<String> specialLocationViews,
        List<String> preferredTenants
) {
    /** All-null instance for call sites that have no residential fields to apply. */
    public static final ResidentialListingFields EMPTY = new ResidentialListingFields(
            null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null, null, null);
}
