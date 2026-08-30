package com.example.realestate.listing.api;

import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ResidentialFieldOptions} — verifies that each canonical set is non-empty,
 * each display-label map covers every member, and that the furnishing authority uses LOWERCASE
 * keys (matching the actual stored values in {@code furnishing_status}).
 *
 * <p>All sets are AUTHOR-ONLY; no runtime enforcement is tested here.
 */
class ResidentialFieldOptionsTest {

    // ── furnishing (critical: LOWERCASE keys) ─────────────────────────────────

    @Test
    void furnishingStatuses_setIsNonEmpty() {
        assertThat(ResidentialFieldOptions.VALID_FURNISHING_STATUSES).isNotEmpty();
    }

    @Test
    void furnishingStatuses_usesLowercaseKeys() {
        // CRITICAL: these values are stored in the DB as lowercase.
        // Any SCREAMING_SNAKE key here would silently 400 every furnishingStatus write.
        assertThat(ResidentialFieldOptions.VALID_FURNISHING_STATUSES)
                .containsExactlyInAnyOrder("unfurnished", "semi_furnished", "furnished");
    }

    @Test
    void furnishingStatuses_doesNotContainScreamingSnakeVariants() {
        // Guard: if someone accidentally adds SCREAMING_SNAKE keys, this fails.
        assertThat(ResidentialFieldOptions.VALID_FURNISHING_STATUSES)
                .doesNotContain("UNFURNISHED", "SEMI_FURNISHED", "FURNISHED");
    }

    @Test
    void furnishingStatuses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_FURNISHING_STATUSES,
                ResidentialFieldOptions.FURNISHING_STATUS_LABELS,
                "furnishingStatus");
    }

    @Test
    void furnishingStatuses_unfurnishedLabelIsCorrect() {
        assertThat(ResidentialFieldOptions.FURNISHING_STATUS_LABELS.get("unfurnished"))
                .isEqualTo("Unfurnished");
    }

    @Test
    void furnishingStatuses_semiFurnishedLabelIsCorrect() {
        assertThat(ResidentialFieldOptions.FURNISHING_STATUS_LABELS.get("semi_furnished"))
                .isEqualTo("Semi-furnished");
    }

    // ── facing ────────────────────────────────────────────────────────────────

    @Test
    void facingValues_containsEightDirections() {
        assertThat(ResidentialFieldOptions.VALID_FACING_VALUES).hasSize(8);
    }

    @Test
    void facingValues_usesAbbreviatedNotation() {
        // Residential uses abbreviated NE/NW/SE/SW (not NORTH_EAST like agri).
        assertThat(ResidentialFieldOptions.VALID_FACING_VALUES)
                .contains("NE", "NW", "SE", "SW")
                .doesNotContain("NORTH_EAST", "NORTH_WEST", "SOUTH_EAST", "SOUTH_WEST");
    }

    @Test
    void facingValues_doesNotContainNotSure() {
        // Residential facing has no 'Not sure'; agri facing does (different vocabularies).
        assertThat(ResidentialFieldOptions.VALID_FACING_VALUES).doesNotContain("NOT_SURE");
    }

    @Test
    void facingValues_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_FACING_VALUES,
                ResidentialFieldOptions.FACING_LABELS,
                "facing");
    }

    // ── property status ───────────────────────────────────────────────────────

    @Test
    void propertyStatuses_containsExpectedValues() {
        assertThat(ResidentialFieldOptions.VALID_PROPERTY_STATUSES)
                .containsExactlyInAnyOrder("READY_TO_MOVE", "UNDER_CONSTRUCTION");
    }

    @Test
    void propertyStatuses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_PROPERTY_STATUSES,
                ResidentialFieldOptions.PROPERTY_STATUS_LABELS,
                "propertyStatus");
    }

    // ── residential ownership ─────────────────────────────────────────────────

    @Test
    void residentialOwnership_containsCooperativeSociety() {
        // Residential ownership differs from commercial (which has LEASEHOLD/POWER_OF_ATTORNEY but not COOPERATIVE).
        assertThat(ResidentialFieldOptions.VALID_RESIDENTIAL_OWNERSHIP)
                .contains("COOPERATIVE_SOCIETY");
    }

    @Test
    void residentialOwnership_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_RESIDENTIAL_OWNERSHIP,
                ResidentialFieldOptions.RESIDENTIAL_OWNERSHIP_LABELS,
                "residentialOwnership");
    }

    // ── availability ──────────────────────────────────────────────────────────

    @Test
    void availability_containsExpectedValues() {
        assertThat(ResidentialFieldOptions.VALID_AVAILABILITY)
                .contains("IMMEDIATE", "WITHIN_15_DAYS", "WITHIN_30_DAYS", "AFTER_30_DAYS");
    }

    @Test
    void availability_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_AVAILABILITY,
                ResidentialFieldOptions.AVAILABILITY_LABELS,
                "availability");
    }

    // ── preferred tenants ─────────────────────────────────────────────────────

    @Test
    void preferredTenants_containsExpectedValues() {
        assertThat(ResidentialFieldOptions.VALID_PREFERRED_TENANTS)
                .contains("NO_PREFERENCE", "FAMILY", "STUDENTS", "PROFESSIONALS", "COMPANY_LEASE");
    }

    @Test
    void preferredTenants_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_PREFERRED_TENANTS,
                ResidentialFieldOptions.PREFERRED_TENANT_LABELS,
                "preferredTenants");
    }

    // ── residential area units ────────────────────────────────────────────────

    @Test
    void residentialAreaUnits_containsCents() {
        // Residential has Cents; commercial does not.
        assertThat(ResidentialFieldOptions.VALID_RESIDENTIAL_AREA_UNITS).contains("CENTS");
    }

    @Test
    void residentialAreaUnits_doesNotContainGunta() {
        // Gunta is agri-specific; residential omits it.
        assertThat(ResidentialFieldOptions.VALID_RESIDENTIAL_AREA_UNITS).doesNotContain("GUNTA");
    }

    @Test
    void residentialAreaUnits_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_RESIDENTIAL_AREA_UNITS,
                ResidentialFieldOptions.RESIDENTIAL_AREA_UNIT_LABELS,
                "residentialAreaUnits");
    }

    // ── conversion statuses ───────────────────────────────────────────────────

    @Test
    void conversionStatuses_containsNotSure() {
        assertThat(ResidentialFieldOptions.VALID_CONVERSION_STATUSES).contains("NOT_SURE");
    }

    @Test
    void conversionStatuses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                ResidentialFieldOptions.VALID_CONVERSION_STATUSES,
                ResidentialFieldOptions.CONVERSION_STATUS_LABELS,
                "conversionStatuses");
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
