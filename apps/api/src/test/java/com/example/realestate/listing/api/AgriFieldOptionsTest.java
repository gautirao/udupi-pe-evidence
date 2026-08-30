package com.example.realestate.listing.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link AgriFieldOptions} — focuses on the VALID_LAND_CATEGORIES set
 * (added in M38-10b / #1693) and the rejectIfUnknown semantics for landCategory.
 *
 * <p>The existing 5 wired sets (waterSource / soilType / roadAccess / cultivationStatus /
 * ownershipType) are covered by the companion class at
 * {@code com.example.realestate.listing.AgriFieldOptionsTest}.
 *
 * <p>rejectIfUnknown semantics are tested via a local replica of the controller's static helper
 * to avoid introducing a @WebMvcTest context for pure constant assertions. The controller-level
 * integration (400 on invalid value via MockMvc) is covered by ListingControllerAgriValidationTest.
 */
class AgriFieldOptionsTest {

    // ── VALID_LAND_CATEGORIES ─────────────────────────────────────────────────

    @Test
    void landCategories_setIsNonEmpty() {
        assertThat(AgriFieldOptions.VALID_LAND_CATEGORIES).isNotEmpty();
    }

    @Test
    void landCategories_containsAllFeLandCategoryKeys() {
        // These are the exact keys the FE (src/lib/agriFieldLabels.ts LAND_CATEGORY_LABELS)
        // has ever produced. VALID_LAND_CATEGORIES must be a superset of this set.
        Set<String> feKeys = Set.of("FARMLAND", "PLANTATION", "FARM_PLOT", "AGRICULTURAL_PLOT", "OTHER");
        assertThat(AgriFieldOptions.VALID_LAND_CATEGORIES).containsAll(feKeys);
    }

    @Test
    void landCategories_containsExpectedMembers() {
        assertThat(AgriFieldOptions.VALID_LAND_CATEGORIES).contains(
                "FARMLAND", "PLANTATION", "FARM_PLOT", "AGRICULTURAL_PLOT", "OTHER");
    }

    @Test
    void landCategories_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_LAND_CATEGORIES,
                AgriFieldOptions.LAND_CATEGORY_LABELS,
                "landCategory");
    }

    @Test
    void landCategories_labelFarmlandIsCorrect() {
        assertThat(AgriFieldOptions.LAND_CATEGORY_LABELS.get("FARMLAND")).isEqualTo("Farmland");
    }

    @Test
    void landCategories_labelAgriculturalPlotIsCorrect() {
        assertThat(AgriFieldOptions.LAND_CATEGORY_LABELS.get("AGRICULTURAL_PLOT")).isEqualTo("Agricultural plot");
    }

    @Test
    void landCategories_labelFarmPlotIsCorrect() {
        assertThat(AgriFieldOptions.LAND_CATEGORY_LABELS.get("FARM_PLOT")).isEqualTo("Farm plot");
    }

    // ── rejectIfUnknown semantics ─────────────────────────────────────────────

    @Test
    void rejectIfUnknown_validMember_accepted() {
        for (String member : AgriFieldOptions.VALID_LAND_CATEGORIES) {
            // Should not throw for any valid member.
            rejectIfUnknown("landCategory", member, AgriFieldOptions.VALID_LAND_CATEGORIES);
        }
    }

    @Test
    void rejectIfUnknown_null_accepted() {
        // null must always be accepted (optional field semantics).
        rejectIfUnknown("landCategory", null, AgriFieldOptions.VALID_LAND_CATEGORIES);
    }

    @Test
    void rejectIfUnknown_blank_accepted() {
        // blank must always be accepted (same as null for optional fields).
        rejectIfUnknown("landCategory", "", AgriFieldOptions.VALID_LAND_CATEGORIES);
        rejectIfUnknown("landCategory", "   ", AgriFieldOptions.VALID_LAND_CATEGORIES);
    }

    @Test
    void rejectIfUnknown_unknownValue_throwsBadRequest() {
        assertThatThrownBy(() ->
                rejectIfUnknown("landCategory", "WET_LAND", AgriFieldOptions.VALID_LAND_CATEGORIES))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid value for landCategory")
                .hasMessageContaining("WET_LAND")
                .hasMessageContaining("Allowed values:");
    }

    @Test
    void rejectIfUnknown_freeLegacyString_throwsBadRequest() {
        // Strings that might have been stored before #1458 introduced canonical keys.
        assertThatThrownBy(() ->
                rejectIfUnknown("landCategory", "agricultural", AgriFieldOptions.VALID_LAND_CATEGORIES))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ── forward-only sets must not expose SCREAMING_SNAKE design label strings ─

    @Test
    void facingValues_containsNotSure() {
        assertThat(AgriFieldOptions.VALID_FACING_VALUES).contains("NOT_SURE");
    }

    @Test
    void fencingStatuses_containsNotSure() {
        assertThat(AgriFieldOptions.VALID_FENCING_STATUSES).contains("NOT_SURE");
    }

    @Test
    void yn_containsAllThreeValues() {
        assertThat(AgriFieldOptions.VALID_YN).containsExactlyInAnyOrder("YES", "NO", "NOT_SURE");
    }

    @Test
    void crops_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(AgriFieldOptions.VALID_CROPS, AgriFieldOptions.CROP_LABELS, "crops");
    }

    @Test
    void conversionStatuses_containsNotSure() {
        assertThat(AgriFieldOptions.VALID_CONVERSION_STATUSES).contains("NOT_SURE");
    }

    // ── VALID_CONVERSION_STATUSES (agri conversion status, #2043) ────────────────

    @Test
    void conversionStatuses_containsExpectedMembers() {
        assertThat(AgriFieldOptions.VALID_CONVERSION_STATUSES).containsExactlyInAnyOrder(
                "NOT_CONVERTED", "CONVERSION_APPLIED", "APPROVED_FOR_CONVERSION", "NOT_SURE");
    }

    @Test
    void conversionStatuses_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_CONVERSION_STATUSES,
                AgriFieldOptions.CONVERSION_STATUS_LABELS,
                "agriConversionStatus");
    }

    @Test
    void conversionStatuses_labelNotConvertedIsCorrect() {
        assertThat(AgriFieldOptions.CONVERSION_STATUS_LABELS.get("NOT_CONVERTED")).isEqualTo("Not converted");
    }

    @Test
    void rejectIfUnknown_conversionStatus_validMember_accepted() {
        for (String member : AgriFieldOptions.VALID_CONVERSION_STATUSES) {
            rejectIfUnknown("agriConversionStatus", member, AgriFieldOptions.VALID_CONVERSION_STATUSES);
        }
    }

    @Test
    void rejectIfUnknown_conversionStatus_null_accepted() {
        rejectIfUnknown("agriConversionStatus", null, AgriFieldOptions.VALID_CONVERSION_STATUSES);
    }

    @Test
    void rejectIfUnknown_conversionStatus_unknownValue_throwsBadRequest() {
        assertThatThrownBy(() ->
                rejectIfUnknown("agriConversionStatus", "REJECTED", AgriFieldOptions.VALID_CONVERSION_STATUSES))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invalid value for agriConversionStatus")
                .hasMessageContaining("REJECTED")
                .hasMessageContaining("Allowed values:");
    }

    // ── helper: replicates ListingController.rejectIfUnknown (private static) ─

    private static void rejectIfUnknown(String fieldName, String value, Set<String> validValues) {
        if (value != null && !value.isBlank() && !validValues.contains(value)) {
            String allowed = new java.util.TreeSet<>(validValues).stream()
                    .collect(java.util.stream.Collectors.joining(", "));
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Invalid value for " + fieldName + ": '" + value + "'. "
                            + "Allowed values: " + allowed);
        }
    }

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
