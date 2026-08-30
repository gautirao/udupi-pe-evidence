package com.example.realestate.listing;

import com.example.realestate.listing.agricultural.ListingAgriCrop;
import com.example.realestate.listing.agricultural.ListingAgriCropRepository;
import com.example.realestate.listing.commercial.CommercialListingFields;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.listing.residential.ResidentialListingFields;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.example.realestate.trust.BadgeInvalidationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Real-write-path seeded-data proof for #2044: agricultural crop multi-select
 * ({@code listing_agri_crops}) survives a REAL create/update through {@link ListingCrudService}
 * against a real PostgreSQL/PostGIS container.
 *
 * <p><b>Level chosen — service layer over {@code @DataJpaTest}, mirroring
 * {@code CommercialTypedWritePathIT} (#1730) exactly.</b> {@link ListingCrudService} is
 * constructed directly with the real {@link ListingRepository} and
 * {@link ListingAgriCropRepository} beans so the actual write path (not a raw SQL insert) is
 * exercised end-to-end; peripheral collaborators irrelevant to this proof (dedupe, search
 * outbox, badge invalidation, quality recompute, boundary validation, events) are mocked.
 *
 * <p>Per user preference (seeded-data-correctness-over-mocked): every assertion reads back
 * values THROUGH the real write path — never a direct INSERT of the expected row.
 *
 * <p>No shared Testcontainers base class exists in this codebase (see
 * {@code AgriDestinationEquivalenceIT}) — each IT declares its own static container.
 *
 * <p>Coverage AC matrix (#2044):
 * <ul>
 *   <li>AC1: POST agricultural_land with crops — rows persist in listing_agri_crops.</li>
 *   <li>AC3: null/empty/replace semantics (delete-then-insert, mirroring residential/commercial
 *       child-set writers exactly).</li>
 *   <li>AC4: resubmitting duplicate crop codes is idempotent (deduplicated via LinkedHashSet).</li>
 *   <li>AC5: deleting the listing cascades to its crop rows (FK ON DELETE CASCADE, V102).</li>
 *   <li>AC6: unknown crop code is rejected with 400 at the controller boundary — covered
 *       separately in {@code ListingControllerAgriValidationTest} (MockMvc unit test), out of
 *       scope for this DB-level IT.</li>
 *   <li>AC7: a pre-existing agricultural_land listing with zero crop rows reads back an empty
 *       list, never null, via {@link ListingAgriCropRepository#findByListingIdOrderByCodeAsc}.</li>
 *   <li>AC16: switching a listing OUT of agricultural_land deletes its crop rows (family-switch
 *       cleanup) — the qa-fast gap this run closes.</li>
 * </ul>
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
class AgriTypedWritePathIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private ListingAgriCropRepository listingAgriCropRepository;

    @Autowired
    private ListingAmenityRepository listingAmenityRepository;

    @Autowired
    private ListingLocationFeatureRepository listingLocationFeatureRepository;

    @Autowired
    private ListingPreferredTenantRepository listingPreferredTenantRepository;

    @Autowired
    private ListingSuitableUseRepository listingSuitableUseRepository;

    @Autowired
    private PriceChangeLogRepository priceChangeLogRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final UUID OWNER_ID = UUID.randomUUID();

    private ListingCrudService crudService;

    @BeforeEach
    void setUp() {
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);
        PolygonBoundaryValidator validator =
                new PolygonBoundaryValidator(listingRepository, new ObjectMapper());

        // Peripheral collaborators irrelevant to the agri crop write path — mocked.
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup = mock(ListingDeduplicationService.class);
        BadgeInvalidationService badge = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox = mock(SearchOutboxWriter.class);
        QualityRecomputeService qualityRecompute = mock(QualityRecomputeService.class);

        var commercialSpaceDetailRepo = mock(com.example.realestate.listing.typed.CommercialSpaceDetailRepository.class);
        var residentialUnitDetailRepo = mock(com.example.realestate.listing.typed.ResidentialUnitDetailRepository.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator,
                qualityRecompute, listingAmenityRepository, listingLocationFeatureRepository,
                listingPreferredTenantRepository, listingSuitableUseRepository,
                commercialSpaceDetailRepo, residentialUnitDetailRepo, listingAgriCropRepository);
    }

    private Listing createAgriDraft(List<String> crops) {
        return crudService.createDraft(
                OWNER_ID, "agricultural_land", "Farmland near river", "Udupi",
                new BigDecimal("2000000"), "Good farmland",
                new BigDecimal("2"), null, null, "ACRE", null, null,
                null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null,
                "dealer",
                null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY, crops);
    }

    /**
     * Issues a bare-minimum PUT for {@code listingId}, changing only {@code propertyType} (when
     * non-null) and {@code crops} — every other field is left as "not supplied" (null). Mirrors
     * the exact 50-parameter positional shape of the widest
     * {@link ListingCrudService#updateListing} overload (#2044's trailing {@code crops} param).
     */
    private Listing updateOnlyPropertyTypeAndCrops(UUID listingId, String propertyType, List<String> crops) {
        return crudService.updateListing(
                listingId, OWNER_ID, false,                                 // listingId, userId, isAdmin
                propertyType, null, null,                                   // propertyType, title, locality
                null, null,                                                 // price, description
                null, null, null,                                          // landArea, bedrooms, builtArea
                null, null, null,                                          // addressConfirmed, latitude, longitude
                null, null,                                                 // landAreaUnit, builtAreaUnit
                null, false, null,                                         // videoUrl, applyVideoUrl, reraNumber
                null, null, null,                                          // listingPurpose, carpetArea, carpetAreaUnit
                null, null,                                                 // floorNumber, totalFloors
                null, null, null,                                          // furnishingStatus, washrooms, parkingCount
                null, null, null,                                          // roadFrontageFt, commercialUsage, numberOfUnits
                null, null, null,                                          // monthlyRent, securityDepositMonths, lockInMonths
                null, null, null,                                          // possessionStatus, expectedPossessionDate, approvalsDeclared
                null, null, null,                                          // waterSource, soilType, roadAccess
                null, null, null,                                          // cultivationStatus, ownershipType, surveyNumber
                null, null, null, null,                                    // landCategory, agriConversionStatus, farmhouseAvailable, fencingDone
                null,                                                       // boundaryGeoJson
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY, crops);
    }

    @Test
    @DisplayName("AC1: POST agricultural_land with crops — rows persist in listing_agri_crops")
    void createDraft_withCrops_persistsRows() {
        Listing saved = createAgriDraft(List.of("PADDY", "COCONUT"));

        List<String> crops = listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())
                .stream().map(ListingAgriCrop::getCode).toList();
        assertThat(crops).containsExactlyInAnyOrder("PADDY", "COCONUT");

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getPropertyType()).isEqualTo("agricultural_land");
    }

    @Test
    @DisplayName("AC3: null crops on create means none supplied — no rows written")
    void createDraft_withNullCrops_writesNoRows() {
        Listing saved = createAgriDraft(null);

        assertThat(listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())).isEmpty();
    }

    @Test
    @DisplayName("AC3: PUT with null crops leaves existing crop rows unchanged")
    void updateListing_withNullCrops_leavesExistingRowsUnchanged() {
        Listing saved = createAgriDraft(List.of("PADDY", "MANGO"));

        updateOnlyPropertyTypeAndCrops(saved.getId(), null, null);

        List<String> crops = listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())
                .stream().map(ListingAgriCrop::getCode).toList();
        assertThat(crops).as("null crops on PUT must leave existing rows untouched")
                .containsExactlyInAnyOrder("PADDY", "MANGO");
    }

    @Test
    @DisplayName("AC3: PUT with empty crops list clears all existing rows")
    void updateListing_withEmptyCrops_clearsAllRows() {
        Listing saved = createAgriDraft(List.of("PADDY", "MANGO"));

        updateOnlyPropertyTypeAndCrops(saved.getId(), null, List.of());

        assertThat(listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())).isEmpty();
    }

    @Test
    @DisplayName("AC3: PUT with a new non-empty crops list REPLACES the old set")
    void updateListing_withNewCrops_replacesOldSet() {
        Listing saved = createAgriDraft(List.of("PADDY"));

        updateOnlyPropertyTypeAndCrops(saved.getId(), null, List.of("CASHEW", "PEPPER"));

        List<String> crops = listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())
                .stream().map(ListingAgriCrop::getCode).toList();
        assertThat(crops).containsExactlyInAnyOrder("CASHEW", "PEPPER");
    }

    @Test
    @DisplayName("AC4: duplicate crop codes in the request are deduplicated (idempotent resubmit)")
    void createDraft_withDuplicateCrops_deduplicates() {
        Listing saved = createAgriDraft(List.of("PADDY", "PADDY", "COCONUT"));

        List<String> crops = listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())
                .stream().map(ListingAgriCrop::getCode).toList();
        assertThat(crops).containsExactlyInAnyOrder("PADDY", "COCONUT");
        assertThat(crops).hasSize(2);
    }

    @Test
    @DisplayName("AC5: deleting the listing cascades to its listing_agri_crops rows")
    void deletingListing_cascadesToAgriCropRows() {
        Listing saved = createAgriDraft(List.of("PADDY", "COCONUT"));
        assertThat(listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())).hasSize(2);

        jdbcTemplate.update("DELETE FROM public.property_listings WHERE id = ?", saved.getId());

        assertThat(listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId()))
                .as("ON DELETE CASCADE (V102) must remove crop rows when the parent listing is deleted")
                .isEmpty();
    }

    @Test
    @DisplayName("AC7: a pre-existing agricultural_land listing with zero crop rows reads back [] not null")
    void preExistingListing_withNoCrops_readsBackEmptyListNotNull() {
        Listing saved = createAgriDraft(null);

        List<ListingAgriCrop> rows = listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId());
        assertThat(rows).isNotNull();
        assertThat(rows).isEmpty();
    }

    @Test
    @DisplayName("AC16: switching a listing OUT of agricultural_land deletes its crop rows (family-switch cleanup)")
    void updateListing_switchingAwayFromAgricultural_deletesCropRows() {
        Listing saved = createAgriDraft(List.of("PADDY", "COCONUT"));
        assertThat(listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId())).hasSize(2);

        updateOnlyPropertyTypeAndCrops(saved.getId(), "house", null);

        assertThat(listingAgriCropRepository.findByListingIdOrderByCodeAsc(saved.getId()))
                .as("AC16: a listing switched away from agricultural_land must not strand crop rows")
                .isEmpty();
    }
}
