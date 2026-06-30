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
}
