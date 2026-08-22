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
 * Migration/compatibility integration test for the {@code agriConversionStatus} field (#2043).
 *
 * <p><b>What is tested</b> — mirrors {@link LandCategoryCompatibilityIT} exactly:
 * <ol>
 *   <li>Existing rows (created before {@code agriConversionStatus} is ever supplied) remain
 *       {@code null} — V126 is additive-only, no backfill.</li>
 *   <li>{@code createDraft} accepts {@code null} (optional field).</li>
 *   <li>{@code createDraft} accepts each of the 4 canonical values and round-trips on reload.</li>
 *   <li>{@code updateListing} changes {@code agriConversionStatus} to a different valid value and
 *       the update round-trips.</li>
 *   <li>An unknown machine value is rejected by {@link AgriFieldOptions#VALID_CONVERSION_STATUSES}
 *       membership (set-level check; controller-level 400 is covered by
 *       {@code ListingControllerAgriValidationTest}).</li>
 * </ol>
 *
 * <p>Pattern: {@code @DataJpaTest} + PostGIS Testcontainers, hand-built service layer (peripheral
 * collaborators mocked) — identical harness to {@link LandCategoryCompatibilityIT}.
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
class AgriConversionStatusCompatibilityIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** Stable update target: rotate through valid values to avoid trivial no-op updates. */
    private static final String UPDATE_TARGET = "CONVERSION_APPLIED";

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private PriceChangeLogRepository priceChangeLogRepository;

    private ListingCrudService crudService;

    private static final UUID OWNER_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);

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
        var commercialSpaceDetailRepo = mock(com.example.realestate.listing.typed.CommercialSpaceDetailRepository.class);
        var residentialUnitDetailRepo = mock(com.example.realestate.listing.typed.ResidentialUnitDetailRepository.class);
        var agriCropRepo = mock(com.example.realestate.listing.agricultural.ListingAgriCropRepository.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator,
                qualityRecompute, amenityRepo, locationFeatureRepo, preferredTenantRepo, suitableUseRepo,
                commercialSpaceDetailRepo, residentialUnitDetailRepo, agriCropRepo);
    }

    @Test
    @DisplayName("V126: existing row created without agriConversionStatus stays null (no backfill)")
    void existingRow_withoutAgriConversionStatus_remainsNull() {
        Listing created = createAgriDraft(null);

        Listing reloaded = listingRepository.findById(created.getId()).orElseThrow();
        assertThat(reloaded.getAgriConversionStatus()).isNull();
    }

    @Test
    @DisplayName("createDraft accepts null agriConversionStatus (optional field)")
    void createDraft_nullAgriConversionStatus_succeeds() {
        Listing listing = createAgriDraft(null);
        assertThat(listing).isNotNull();
        assertThat(listing.getAgriConversionStatus()).isNull();
    }

    @Test
    @DisplayName("createDraft accepts NOT_CONVERTED and round-trips")
    void createDraft_notConverted_succeeds() {
        assertCreateAndUpdateSucceed("NOT_CONVERTED");
    }

    @Test
    @DisplayName("createDraft accepts CONVERSION_APPLIED and round-trips")
    void createDraft_conversionApplied_succeeds() {
        assertCreateAndUpdateSucceed("CONVERSION_APPLIED");
    }

    @Test
    @DisplayName("createDraft accepts APPROVED_FOR_CONVERSION and round-trips")
    void createDraft_approvedForConversion_succeeds() {
        assertCreateAndUpdateSucceed("APPROVED_FOR_CONVERSION");
    }

    @Test
    @DisplayName("createDraft accepts NOT_SURE and round-trips")
    void createDraft_notSure_succeeds() {
        assertCreateAndUpdateSucceed("NOT_SURE");
    }

    @Test
    @DisplayName("VALID_CONVERSION_STATUSES rejects an unknown machine value (set-level check)")
    void validConversionStatuses_rejectsUnknownValue() {
        assertThat(AgriFieldOptions.VALID_CONVERSION_STATUSES).doesNotContain("REJECTED_BY_AUTHORITY");
    }

    // ── helper ────────────────────────────────────────────────────────────────

    /**
     * Creates an agricultural_land DRAFT with the given {@code agriConversionStatus}, asserts it
     * persists correctly, then updates the listing to a different valid value and asserts the
     * update round-trips through the real DB. Mirrors
     * {@link LandCategoryCompatibilityIT#assertCreateAndUpdateSucceed(String)}.
     */
    private void assertCreateAndUpdateSucceed(String createStatus) {
        Listing created = createAgriDraft(createStatus);
        assertThat(created).isNotNull();
        assertThat(created.getId()).isNotNull();
        assertThat(created.getAgriConversionStatus()).isEqualTo(createStatus);

        String updateTarget = UPDATE_TARGET.equals(createStatus) ? "NOT_CONVERTED" : UPDATE_TARGET;

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
                // landCategory, agriConversionStatus, farmhouseAvailable, fencingDone, boundaryGeoJson
                null, updateTarget, null, null, null);

        assertThat(updated).isNotNull();
        assertThat(updated.getAgriConversionStatus()).isEqualTo(updateTarget);
    }

    private Listing createAgriDraft(String agriConversionStatus) {
        return crudService.createDraft(
                OWNER_ID, "agricultural_land",
                "Agri conversion-status compatibility test plot",
                "Udupi",
                new BigDecimal("3500000"),
                "Test listing for agri conversion status compatibility",
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
                // landCategory, agriConversionStatus, farmhouseAvailable, fencingDone
                null, agriConversionStatus, null, null);
    }
}
