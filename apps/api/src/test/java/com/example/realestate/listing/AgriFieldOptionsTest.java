package com.example.realestate.listing;

import com.example.realestate.listing.api.AgriFieldOptions;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link AgriFieldOptions} — verifies that each canonical set is non-empty,
 * each display-label map covers every member of its corresponding canonical set,
 * and that specific required values are present.
 */
class AgriFieldOptionsTest {

    // ── water_source ──────────────────────────────────────────────────────────

    @Test
    void waterSources_setIsNonEmpty() {
        assertThat(AgriFieldOptions.VALID_WATER_SOURCES).isNotEmpty();
    }

    @Test
    void waterSources_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_WATER_SOURCES,
                AgriFieldOptions.WATER_SOURCE_LABELS,
                "water_source");
    }

    @Test
    void waterSources_containsRequiredValues() {
        assertThat(AgriFieldOptions.VALID_WATER_SOURCES).contains(
                "BOREWELL", "WELL", "RIVER", "RAIN_FED", "POND", "STREAM", "NOT_AVAILABLE", "OTHER");
    }

    @Test
    void waterSources_labelBorewellIsCorrect() {
        assertThat(AgriFieldOptions.WATER_SOURCE_LABELS.get("BOREWELL")).isEqualTo("Borewell");
    }

    @Test
    void waterSources_labelWellIsOpenWell() {
        assertThat(AgriFieldOptions.WATER_SOURCE_LABELS.get("WELL")).isEqualTo("Open well");
    }

    @Test
    void waterSources_labelRainFedIsCorrect() {
        assertThat(AgriFieldOptions.WATER_SOURCE_LABELS.get("RAIN_FED")).isEqualTo("Rain-fed");
    }

    @Test
    void waterSources_labelNotAvailableIsCorrect() {
        assertThat(AgriFieldOptions.WATER_SOURCE_LABELS.get("NOT_AVAILABLE")).isEqualTo("Not available");
    }

    // ── soil_type ─────────────────────────────────────────────────────────────

    @Test
    void soilTypes_setIsNonEmpty() {
        assertThat(AgriFieldOptions.VALID_SOIL_TYPES).isNotEmpty();
    }

    @Test
    void soilTypes_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_SOIL_TYPES,
                AgriFieldOptions.SOIL_TYPE_LABELS,
                "soil_type");
    }

    @Test
    void soilTypes_containsRequiredValues() {
        assertThat(AgriFieldOptions.VALID_SOIL_TYPES).contains(
                "RED_LATERITE", "BLACK_COTTON", "ALLUVIAL", "SANDY_LOAM", "CLAY", "OTHER");
    }

    @Test
    void soilTypes_redLateriteLabelIsCorrect() {
        assertThat(AgriFieldOptions.SOIL_TYPE_LABELS.get("RED_LATERITE")).isEqualTo("Red laterite");
    }

    @Test
    void soilTypes_oldFreeTextValuesNotPresent() {
        // Confirm old pre-canonical strings are not valid — they must have been backfilled via V91
        assertThat(AgriFieldOptions.VALID_SOIL_TYPES).doesNotContain("Laterite", "Red loam");
    }

    // ── road_access ───────────────────────────────────────────────────────────

    @Test
    void roadAccess_setIsNonEmpty() {
        assertThat(AgriFieldOptions.VALID_ROAD_ACCESS_VALUES).isNotEmpty();
    }

    @Test
    void roadAccess_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_ROAD_ACCESS_VALUES,
                AgriFieldOptions.ROAD_ACCESS_LABELS,
                "road_access");
    }

    @Test
    void roadAccess_containsRequiredValues() {
        assertThat(AgriFieldOptions.VALID_ROAD_ACCESS_VALUES).contains(
                "TARRED_ROAD", "KACHCHA_ROAD", "HIGHWAY_FRONTAGE", "NO_ROAD_ACCESS", "OTHER");
    }

    @Test
    void roadAccess_oldFreeTextValuesNotPresent() {
        assertThat(AgriFieldOptions.VALID_ROAD_ACCESS_VALUES).doesNotContain("Tar road", "Mud road");
    }

    // ── cultivation_status ────────────────────────────────────────────────────

    @Test
    void cultivationStatus_setIsNonEmpty() {
        assertThat(AgriFieldOptions.VALID_CULTIVATION_STATUSES).isNotEmpty();
    }

    @Test
    void cultivationStatus_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_CULTIVATION_STATUSES,
                AgriFieldOptions.CULTIVATION_STATUS_LABELS,
                "cultivation_status");
    }

    @Test
    void cultivationStatus_containsRequiredValues() {
        assertThat(AgriFieldOptions.VALID_CULTIVATION_STATUSES).contains(
                "CULTIVATED", "FALLOW", "ARECA_PLANTATION", "COCONUT_PLANTATION",
                "PARTIALLY_CULTIVATED", "OTHER");
    }

    @Test
    void cultivationStatus_arecaPlantationLabelIsCorrect() {
        assertThat(AgriFieldOptions.CULTIVATION_STATUS_LABELS.get("ARECA_PLANTATION"))
                .isEqualTo("Areca plantation");
    }

    // ── ownership_type ────────────────────────────────────────────────────────

    @Test
    void ownershipType_setIsNonEmpty() {
        assertThat(AgriFieldOptions.VALID_OWNERSHIP_TYPES).isNotEmpty();
    }

    @Test
    void ownershipType_labelsCoversAllMembers() {
        assertAllMembersHaveLabel(
                AgriFieldOptions.VALID_OWNERSHIP_TYPES,
                AgriFieldOptions.OWNERSHIP_TYPE_LABELS,
                "ownership_type");
    }

    @Test
    void ownershipType_containsRequiredValues() {
        assertThat(AgriFieldOptions.VALID_OWNERSHIP_TYPES).contains(
                "FREEHOLD", "INHERITED", "PATTA", "SURVEY_SETTLEMENT", "KATHA", "REVENUE", "OTHER");
    }

    @Test
    void ownershipType_surveySettlementLabelIsCorrect() {
        assertThat(AgriFieldOptions.OWNERSHIP_TYPE_LABELS.get("SURVEY_SETTLEMENT"))
                .isEqualTo("Survey settlement");
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
