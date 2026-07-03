package com.example.realestate.listing.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Contract drift guard — asserts that the committed JSON contract file
 * ({@code src/lib/listing-field-options.json}) exactly matches the Java authority constants.
 *
 * <p><b>Java is the single source of truth.</b> The contract JSON is derived from Java.
 * If you change a Java authority set, you must update the JSON file too — this test
 * will fail on any divergence, blocking the PR at the test stage.
 *
 * <p>The frontend-engineer's Vitest parity test (listed as
 * {@code src/lib/__tests__/listing-field-options.parity.test.ts}) will then assert that
 * the FE TypeScript constants match the same committed JSON file (AC2).
 *
 * <p>Path resolved relative to the Maven build directory ({@code user.dir} = {@code backend/}):
 * {@code ../src/lib/listing-field-options.json}.
 */
class ListingFieldOptionsContractTest {

    private static JsonNode contract;

    @BeforeAll
    static void loadContract() throws Exception {
        Path contractPath = Paths.get(System.getProperty("user.dir"))
                .resolve("../src/lib/listing-field-options.json")
                .toAbsolutePath()
                .normalize();

        assertThat(contractPath.toFile())
                .as("Contract file must exist at %s", contractPath)
                .exists()
                .isFile();

        String json = Files.readString(contractPath);
        contract = new ObjectMapper().readTree(json);
    }

    // ── agri wired sets ───────────────────────────────────────────────────────

    @Test
    void contract_agriWaterSource_matchesJavaAuthority() {
        assertContractSetMatches("agri", "waterSource", AgriFieldOptions.VALID_WATER_SOURCES);
    }

    @Test
    void contract_agriSoilType_matchesJavaAuthority() {
        assertContractSetMatches("agri", "soilType", AgriFieldOptions.VALID_SOIL_TYPES);
    }

    @Test
    void contract_agriRoadAccess_matchesJavaAuthority() {
        assertContractSetMatches("agri", "roadAccess", AgriFieldOptions.VALID_ROAD_ACCESS_VALUES);
    }

    @Test
    void contract_agriCultivationStatus_matchesJavaAuthority() {
        assertContractSetMatches("agri", "cultivationStatus", AgriFieldOptions.VALID_CULTIVATION_STATUSES);
    }

    @Test
    void contract_agriOwnershipType_matchesJavaAuthority() {
        assertContractSetMatches("agri", "ownershipType", AgriFieldOptions.VALID_OWNERSHIP_TYPES);
    }

    @Test
    void contract_agriLandCategory_matchesJavaAuthority() {
        assertContractSetMatches("agri", "landCategory", AgriFieldOptions.VALID_LAND_CATEGORIES);
    }

    // ── residential aligned sets ──────────────────────────────────────────────

    @Test
    void contract_residentialFurnishingStatus_matchesJavaAuthority() {
        assertContractSetMatches("residential", "furnishingStatus",
                ResidentialFieldOptions.VALID_FURNISHING_STATUSES);
    }

    // ── commercial aligned sets ───────────────────────────────────────────────

    @Test
    void contract_commercialListingPurpose_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "listingPurpose",
                CommercialFieldOptions.VALID_LISTING_PURPOSES);
    }

    @Test
    void contract_commercialFloorChoice_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "floorChoice",
                CommercialFieldOptions.VALID_FLOOR_CHOICES);
    }

    @Test
    void contract_commercialAvailability_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "availability",
                CommercialFieldOptions.VALID_COMMERCIAL_AVAILABILITY);
    }

    // ── commercial newly-exposed enum-enforced sets (#1684 — full parity with the
    // ~13 vocabulary groups HARD-ENFORCED by ListingController.validateCommercialFields
    // since #1730) ────────────────────────────────────────────────────────────

    @Test
    void contract_commercialSubtype_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "commercialSubtype",
                CommercialFieldOptions.VALID_COMMERCIAL_SUBTYPES);
    }

    @Test
    void contract_commercialFloorMode_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "floorMode",
                CommercialFieldOptions.VALID_FLOOR_MODES);
    }

    @Test
    void contract_commercialHubType_shop_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "hubType", "shop",
                CommercialFieldOptions.VALID_SHOP_HUB_TYPES);
    }

    @Test
    void contract_commercialHubType_office_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "hubType", "office",
                CommercialFieldOptions.VALID_OFFICE_HUB_TYPES);
    }

    @Test
    void contract_commercialSuitableUses_shop_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "suitableUses", "shop",
                CommercialFieldOptions.VALID_SHOP_SUITABLE_USES);
    }

    @Test
    void contract_commercialSuitableUses_office_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "suitableUses", "office",
                CommercialFieldOptions.VALID_OFFICE_SUITABLE_USES);
    }

    @Test
    void contract_commercialSuitableUses_building_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "suitableUses", "building",
                CommercialFieldOptions.VALID_BUILDING_SUITABLE_USES);
    }

    @Test
    void contract_commercialSuitableUses_warehouse_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "suitableUses", "warehouse",
                CommercialFieldOptions.VALID_WAREHOUSE_SUITABLE_USES);
    }

    @Test
    void contract_commercialSuitableUses_land_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "suitableUses", "land",
                CommercialFieldOptions.VALID_COMMERCIAL_LAND_SUITABLE_USES);
    }

    @Test
    void contract_commercialUtilities_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "utilities",
                CommercialFieldOptions.VALID_AMENITIES_UTILITIES);
    }

    @Test
    void contract_commercialOccupancyStatus_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "occupancyStatus",
                CommercialFieldOptions.VALID_OCCUPANCY_STATUSES);
    }

    @Test
    void contract_commercialFurnishingStatus_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "commercialFurnishingStatus",
                CommercialFieldOptions.VALID_COMMERCIAL_FURNISHING_STATUSES);
    }

    @Test
    void contract_commercialOwnership_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "commercialOwnership",
                CommercialFieldOptions.VALID_COMMERCIAL_OWNERSHIP);
    }

    @Test
    void contract_commercialWarehouseFlooring_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "warehouseFlooring",
                CommercialFieldOptions.VALID_WAREHOUSE_FLOORING);
    }

    @Test
    void contract_commercialAreaUnit_matchesJavaAuthority() {
        assertContractSetMatches("commercial", "commercialAreaUnit",
                CommercialFieldOptions.VALID_COMMERCIAL_AREA_UNITS);
    }

    // ── helper ────────────────────────────────────────────────────────────────

    private static void assertContractSetMatches(String domain, String field, Set<String> javaSet) {
        JsonNode domainNode = contract.get(domain);
        assertThat(domainNode)
                .as("Contract JSON must contain domain '%s'", domain)
                .isNotNull();

        JsonNode fieldNode = domainNode.get(field);
        assertThat(fieldNode)
                .as("Contract JSON must contain field '%s.%s'", domain, field)
                .isNotNull();
        assertThat(fieldNode.isArray())
                .as("Contract JSON field '%s.%s' must be a JSON array", domain, field)
                .isTrue();

        Set<String> contractSet = new HashSet<>();
        fieldNode.forEach(n -> contractSet.add(n.asText()));

        assertThat(contractSet)
                .as("Contract JSON %s.%s must match Java authority exactly (no missing, no extra members). "
                        + "Update src/lib/listing-field-options.json to match the Java set.",
                        domain, field)
                .containsExactlyInAnyOrderElementsOf(javaSet);
    }

    /**
     * Nested-group variant of {@link #assertContractSetMatches(String, String, Set)} for the
     * per-subtype commercial groups ({@code hubType.<subtype>}, {@code suitableUses.<subtype>}),
     * which are objects of arrays rather than a flat array.
     */
    private static void assertContractSetMatches(String domain, String field, String subfield, Set<String> javaSet) {
        JsonNode domainNode = contract.get(domain);
        assertThat(domainNode)
                .as("Contract JSON must contain domain '%s'", domain)
                .isNotNull();

        JsonNode fieldNode = domainNode.get(field);
        assertThat(fieldNode)
                .as("Contract JSON must contain field '%s.%s'", domain, field)
                .isNotNull();

        JsonNode subfieldNode = fieldNode.get(subfield);
        assertThat(subfieldNode)
                .as("Contract JSON must contain field '%s.%s.%s'", domain, field, subfield)
                .isNotNull();
        assertThat(subfieldNode.isArray())
                .as("Contract JSON field '%s.%s.%s' must be a JSON array", domain, field, subfield)
                .isTrue();

        Set<String> contractSet = new HashSet<>();
        subfieldNode.forEach(n -> contractSet.add(n.asText()));

        assertThat(contractSet)
                .as("Contract JSON %s.%s.%s must match Java authority exactly (no missing, no extra members). "
                        + "Update src/lib/listing-field-options.json to match the Java set.",
                        domain, field, subfield)
                .containsExactlyInAnyOrderElementsOf(javaSet);
    }
}
