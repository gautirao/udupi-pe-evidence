package com.example.realestate.listing;

import com.example.realestate.listing.api.AgriFieldOptions;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.example.realestate.trust.BadgeInvalidationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Existing-value compatibility integration test for the {@code landCategory} field.
 *
 * <p><b>Why this test exists (AC4, Q1 wire):</b> As of M38-10b (#1693), {@code landCategory}
 * is newly wired to strict set-membership validation in {@code ListingController.validateAgriFields}.
 * Before wiring, any string was accepted. This IT proves that every value the frontend has ever
 * produced for this field ({@code FARMLAND}, {@code PLANTATION}, {@code FARM_PLOT},
 * {@code AGRICULTURAL_PLOT}, {@code OTHER}) is a member of
 * {@link AgriFieldOptions#VALID_LAND_CATEGORIES} and is correctly stored and updated in a real
 * Postgres database — without exception.
 *
 * <p><b>What is tested:</b>
 * <ol>
 *   <li>{@code createDraft} with each FE land-category value succeeds (returns a non-null
 *       {@code Listing} with the correct {@code landCategory} stored).</li>
 *   <li>{@code updateListing} changing {@code landCategory} to a different valid value
 *       succeeds (returns the updated listing with the new value).</li>
 *   <li>{@code VALID_LAND_CATEGORIES} is a superset of every value seeded — proving the
 *       authority set covers all real production values (set-level compatibility check).</li>
 * </ol>
 *
 * <p><b>Pattern:</b> {@code @DataJpaTest} + PostGIS Testcontainers, hand-built service layer
 * (peripheral collaborators mocked), following {@code AgriListingBoundaryJourneyIT}. No
 * {@code @SpringBootTest} needed; the persistence and service paths are the only subjects.
 * Per [[seeded-data-correctness-over-mocked]]: we seed the real value set, not a single
 * artificial row.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class LandCategoryCompatibilityIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** The exact key set the FE (agriFieldLabels.ts) has ever produced for landCategory. */
    private static final java.util.Set<String> FE_LAND_CATEGORY_KEYS =
            java.util.Set.of("FARMLAND", "PLANTATION", "FARM_PLOT", "AGRICULTURAL_PLOT", "OTHER");

    /** Stable update target: rotate through valid values to avoid trivial no-op updates. */
    private static final String UPDATE_TARGET = "PLANTATION";

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private PriceChangeLogRepository priceChangeLogRepository;

    private ListingCrudService crudService;

    private static final UUID OWNER_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);

        // Mocked peripheral collaborators irrelevant to the land-category compatibility check.
        ApplicationEventPublisher events      = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup     = mock(ListingDeduplicationService.class);
        BadgeInvalidationService badge        = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox             = mock(SearchOutboxWriter.class);
        PolygonBoundaryValidator validator    = mock(PolygonBoundaryValidator.class);
        QualityRecomputeService qualityRecompute = mock(QualityRecomputeService.class);
        var amenityRepo = mock(com.example.realestate.listing.residential.ListingAmenityRepository.class);
        var locationFeatureRepo = mock(com.example.realestate.listing.residential.ListingLocationFeatureRepository.class);
        var preferredTenantRepo = mock(com.example.realestate.listing.residential.ListingPreferredTenantRepository.class);
        var suitableUseRepo = mock(com.example.realestate.listing.commercial.ListingSuitableUseRepository.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator,
                qualityRecompute, amenityRepo, locationFeatureRepo, preferredTenantRepo, suitableUseRepo);
    }

    @Test
    @DisplayName("AC4: VALID_LAND_CATEGORIES is a superset of all known FE-produced values")
    void validLandCategories_isSupersetOfFeLandCategoryKeys() {
        assertThat(AgriFieldOptions.VALID_LAND_CATEGORIES)
                .as("VALID_LAND_CATEGORIES must contain every value the FE has ever produced")
                .containsAll(FE_LAND_CATEGORY_KEYS);
    }

    @Test
    @DisplayName("AC4: createDraft accepts all FE land-category values (FARMLAND)")
    void createDraft_farmland_succeeds() {
        assertCreateAndUpdateSucceed("FARMLAND");
    }

    @Test
    @DisplayName("AC4: createDraft accepts all FE land-category values (PLANTATION)")
    void createDraft_plantation_succeeds() {
        assertCreateAndUpdateSucceed("PLANTATION");
    }

    @Test
    @DisplayName("AC4: createDraft accepts all FE land-category values (FARM_PLOT)")
    void createDraft_farmPlot_succeeds() {
        assertCreateAndUpdateSucceed("FARM_PLOT");
    }

    @Test
    @DisplayName("AC4: createDraft accepts all FE land-category values (AGRICULTURAL_PLOT)")
    void createDraft_agriculturalPlot_succeeds() {
        assertCreateAndUpdateSucceed("AGRICULTURAL_PLOT");
    }

    @Test
    @DisplayName("AC4: createDraft accepts all FE land-category values (OTHER)")
    void createDraft_other_succeeds() {
        assertCreateAndUpdateSucceed("OTHER");
    }

    @Test
    @DisplayName("AC4: createDraft accepts null landCategory (optional field)")
    void createDraft_nullLandCategory_succeeds() {
        Listing listing = createAgriDraft(null);
        assertThat(listing).isNotNull();
        assertThat(listing.getLandCategory()).isNull();
    }

    // ── helper ────────────────────────────────────────────────────────────────

    /**
     * Creates an agricultural_land DRAFT with the given {@code landCategory}, asserts it persists
     * correctly, then updates the listing to a different valid landCategory and asserts the update
     * succeeds. Tests both the create and update paths end-to-end through the real DB.
     */
    private void assertCreateAndUpdateSucceed(String createLandCategory) {
        // 1. Create with the given landCategory value.
        Listing created = createAgriDraft(createLandCategory);
        assertThat(created).isNotNull();
        assertThat(created.getId()).isNotNull();
        assertThat(created.getLandCategory()).isEqualTo(createLandCategory);

        // 2. Update to a different valid landCategory.
        // Use a rotation: if the created value IS the update target, pick "FARMLAND" instead.
        String updateTarget = UPDATE_TARGET.equals(createLandCategory) ? "FARMLAND" : UPDATE_TARGET;

        Listing updated = crudService.updateListing(
                created.getId(), OWNER_ID, false,
                // propertyType, title, locality, price, description
                null, null, null, null, null,
                // landArea, bedrooms, builtArea, addressConfirmed, latitude, longitude
                null, null, null, null, null, null,
                // landAreaUnit, builtAreaUnit, videoUrl, applyVideoUrl, reraNumber
                null, null, null, false, null,
                // listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors
                null, null, null, null, null,
                // furnishingStatus, washrooms, parkingCount, roadFrontageFt,
                // commercialUsage, numberOfUnits, monthlyRent, securityDepositMonths, lockInMonths
                null, null, null, null, null, null, null, null, null,
                // possessionStatus, expectedPossessionDate, approvalsDeclared
                null, null, null,
                // waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber
                null, null, null, null, null, null,
                // landCategory, farmhouseAvailable, fencingDone, boundaryGeoJson
                updateTarget, null, null, null);

        assertThat(updated).isNotNull();
        assertThat(updated.getLandCategory()).isEqualTo(updateTarget);
    }

    private Listing createAgriDraft(String landCategory) {
        return crudService.createDraft(
                OWNER_ID, "agricultural_land",
                "Agri compatibility test plot",
                "Udupi",
                new BigDecimal("3500000"),
                "Test listing for land category compatibility",
                // landArea, bedrooms, builtArea, landAreaUnit, builtAreaUnit, videoUrl
                new BigDecimal("2"), null, null, "acre", null, null,
                // listingPurpose, carpetArea, carpetAreaUnit, floorNumber, totalFloors,
                // furnishingStatus, washrooms, parkingCount, roadFrontageFt,
                // commercialUsage, numberOfUnits, monthlyRent, securityDepositMonths, lockInMonths
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                // sellerType
                "dealer",
                // waterSource, soilType, roadAccess, cultivationStatus, ownershipType, surveyNumber
                null, null, null, null, null, null,
                // landCategory, farmhouseAvailable, fencingDone
                landCategory, null, null);
    }
}
