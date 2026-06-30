package com.example.realestate.listing.api;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link CommercialFieldOptions} — verifies that each canonical set is non-empty,
 * each display-label map covers every member of its corresponding set, and that specific
 * required values are present.
 *
 * <p>All sets are AUTHOR-ONLY; no runtime enforcement is tested here.
 */
class CommercialFieldOptionsTest {

    @Test
    void commercialSubtypes_setIsNonEmpty() {
        assertThat(CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES).isNotEmpty();
    }

    @Test
    void commercialSubtypes_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES,
                CommercialFieldOptions.COMMERCIAL_SUBTYPE_LABELS,
                "commercialSubtype");
    }

    @Test
    void commercialSubtypes_containsExpectedValues() {
        assertThat(CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES)
                .contains("SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND");
    }

    @Test
    void listingPurposes_containsSaleRentLease() {
        assertThat(CommercialFieldOptions.VALID_LISTING_PURPOSES)
                .containsExactlyInAnyOrder("SALE", "RENT", "LEASE");
    }

    @Test
    void listingPurposes_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_LISTING_PURPOSES,
                CommercialFieldOptions.LISTING_PURPOSE_LABELS,
                "listingPurpose");
    }

    @Test
    void floorChoices_containsExpectedValues() {
        assertThat(CommercialFieldOptions.VALID_FLOOR_CHOICES)
                .contains("GROUND_FLOOR", "FIRST_FLOOR", "UPPER_FLOOR", "MULTIPLE_FLOORS");
    }

    @Test
    void floorChoices_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_FLOOR_CHOICES,
                CommercialFieldOptions.FLOOR_CHOICE_LABELS,
                "floorChoice");
    }

    @Test
    void shopSuitableUses_containsOther() {
        assertThat(CommercialFieldOptions.VALID_SHOP_SUITABLE_USES).contains("OTHER");
    }

    @Test
    void shopSuitableUses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_SHOP_SUITABLE_USES,
                CommercialFieldOptions.SHOP_SUITABLE_USE_LABELS,
                "shopSuitableUses");
    }

    @Test
    void officeSuitableUses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_OFFICE_SUITABLE_USES,
                CommercialFieldOptions.OFFICE_SUITABLE_USE_LABELS,
                "officeSuitableUses");
    }

    @Test
    void buildingSuitableUses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_BUILDING_SUITABLE_USES,
                CommercialFieldOptions.BUILDING_SUITABLE_USE_LABELS,
                "buildingSuitableUses");
    }

    @Test
    void warehouseSuitableUses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_WAREHOUSE_SUITABLE_USES,
                CommercialFieldOptions.WAREHOUSE_SUITABLE_USE_LABELS,
                "warehouseSuitableUses");
    }

    @Test
    void commercialLandSuitableUses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_COMMERCIAL_LAND_SUITABLE_USES,
                CommercialFieldOptions.COMMERCIAL_LAND_SUITABLE_USE_LABELS,
                "commercialLandSuitableUses");
    }

    @Test
    void shopHubTypes_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_SHOP_HUB_TYPES,
                CommercialFieldOptions.SHOP_HUB_TYPE_LABELS,
                "shopHubTypes");
    }

    @Test
    void officeHubTypes_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_OFFICE_HUB_TYPES,
                CommercialFieldOptions.OFFICE_HUB_TYPE_LABELS,
                "officeHubTypes");
    }

    @Test
    void amenitiesUtilities_containsTenValues() {
        assertThat(CommercialFieldOptions.VALID_AMENITIES_UTILITIES).hasSize(10);
    }

    @Test
    void amenitiesUtilities_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_AMENITIES_UTILITIES,
                CommercialFieldOptions.AMENITY_UTILITY_LABELS,
                "amenitiesUtilities");
    }

    @Test
    void occupancyStatuses_containsExpectedValues() {
        assertThat(CommercialFieldOptions.VALID_OCCUPANCY_STATUSES)
                .containsExactlyInAnyOrder("VACANT", "PARTLY_OCCUPIED", "FULLY_OCCUPIED");
    }

    @Test
    void commercialFurnishing_containsPlugAndPlay() {
        // Office furnishing has a PLUG_AND_PLAY option absent from residential.
        assertThat(CommercialFieldOptions.VALID_COMMERCIAL_FURNISHING_STATUSES)
                .contains("PLUG_AND_PLAY");
    }

    @Test
    void commercialFurnishing_doesNotUseLowercaseKeys() {
        // Commercial furnishing is for the typed model (SCREAMING_SNAKE),
        // unlike residential furnishingStatus which is stored lowercase.
        assertThat(CommercialFieldOptions.VALID_COMMERCIAL_FURNISHING_STATUSES)
                .doesNotContain("unfurnished", "semi_furnished", "furnished");
    }

    @Test
    void commercialFurnishing_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_COMMERCIAL_FURNISHING_STATUSES,
                CommercialFieldOptions.COMMERCIAL_FURNISHING_STATUS_LABELS,
                "commercialFurnishing");
    }

    @Test
    void maintInc_containsIncludedAndExcluded() {
        assertThat(CommercialFieldOptions.VALID_MAINT_INC)
                .containsExactlyInAnyOrder("INCLUDED", "EXCLUDED");
    }

    @Test
    void commercialAreaUnits_doesNotContainCents() {
        // Commercial design has no Cents; residential does.
        assertThat(CommercialFieldOptions.VALID_COMMERCIAL_AREA_UNITS).doesNotContain("CENTS");
    }

    @Test
    void commercialAreaUnits_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                CommercialFieldOptions.VALID_COMMERCIAL_AREA_UNITS,
                CommercialFieldOptions.COMMERCIAL_AREA_UNIT_LABELS,
                "commercialAreaUnits");
    }

    // ── helper ────────────────────────────────────────────────────────────────

    private void assertAllMembersHaveLabel(Set<String> validSet, Map<String, String> labels, String fieldName) {
        for (String member : validSet) {
            assertThat(labels)
                    .as("display-label map for %s must contain key '%s'", fieldName, member)
                    .containsKey(member);
            assertThat(labels.get(member))
                    .as("display label for %s.%s must not be blank", fieldName, member)
                    .isNotBlank();
        }
    }
}
