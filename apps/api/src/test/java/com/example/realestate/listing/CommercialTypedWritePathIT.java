package com.example.realestate.listing;

import com.example.realestate.listing.commercial.CommercialListingFields;
import com.example.realestate.listing.commercial.ListingSuitableUse;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.residential.ListingAmenity;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.listing.residential.ResidentialListingFields;
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
 * Real-write-path seeded-data proof for M38-FU2 (#1730): commercial typed listing fields
 * (scalar columns + the two multi-select child sets) survive a REAL create/update through
 * {@link ListingCrudService} against a real PostgreSQL/PostGIS container.
 *
 * <p><b>Level chosen — service layer over {@code @DataJpaTest}, mirroring
 * {@code AgriListingBoundaryJourneyIT} (#1368) and {@code V103ResidentialFieldsMigrationIT}
 * (#1626).</b> {@link ListingCrudService} is constructed directly with the real
 * {@link ListingRepository}, {@link ListingAmenityRepository} (utilities reuse), and
 * {@link ListingSuitableUseRepository} beans so the actual write path (not a raw SQL insert)
 * is exercised end-to-end; peripheral collaborators irrelevant to this proof (dedupe, search
 * outbox, badge invalidation, quality recompute, boundary validation, events) are mocked.
 *
 * <p>Per user preference (seeded-data-correctness-over-mocked): every assertion reads back
 * values THROUGH the real write path — never a direct INSERT of the expected row. The one
 * exception (AC-legacy) intentionally uses a raw JdbcTemplate INSERT to SIMULATE a pre-#1730
 * legacy row (the V102 commercial backfill state, {@code commercial_subtype IS NULL}), which
 * by definition predates this write path.
 *
 * <p>Cross-subtype / enum validation (structural + value-set rejection) is enforced at the
 * controller layer and is covered by {@code ListingControllerFamilyValidationTest}
 * (MockMvc unit tests) — {@link ListingCrudService} itself performs no subtype validation,
 * so it is out of scope for this DB-level IT.
 *
 * <p>Coverage AC matrix (#1730 acceptance criteria):
 * <ul>
 *   <li>AC1-5: POST SHOP/OFFICE/BUILDING/WAREHOUSE/LAND — non-NULL commercial_subtype, all
 *       supplied scalar fields, and both child sets (utilities via listing_amenities,
 *       suitableUses via listing_suitable_uses) persist through the real write path.</li>
 *   <li>AC6: legacy commercial_subtype NULL row (simulated V102 backfill state) reads back with
 *       zero constraint violations; a PUT that omits commercialSubtype leaves it NULL while
 *       another field changes (REPLACE-not-clobber semantics).</li>
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
class CommercialTypedWritePathIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private ListingAmenityRepository listingAmenityRepository;

    @Autowired
    private ListingSuitableUseRepository listingSuitableUseRepository;

    @Autowired
    private ListingLocationFeatureRepository listingLocationFeatureRepository;

    @Autowired
    private ListingPreferredTenantRepository listingPreferredTenantRepository;

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

        // Peripheral collaborators irrelevant to the commercial typed-field write path — mocked.
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup = mock(ListingDeduplicationService.class);
        BadgeInvalidationService badge = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox = mock(SearchOutboxWriter.class);
        QualityRecomputeService qualityRecompute = mock(QualityRecomputeService.class);

        var commercialSpaceDetailRepo = mock(com.example.realestate.listing.typed.CommercialSpaceDetailRepository.class);
        var residentialUnitDetailRepo = mock(com.example.realestate.listing.typed.ResidentialUnitDetailRepository.class);
        var agriCropRepo = mock(com.example.realestate.listing.agricultural.ListingAgriCropRepository.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator,
                qualityRecompute, listingAmenityRepository, listingLocationFeatureRepository,
                listingPreferredTenantRepository, listingSuitableUseRepository,
                commercialSpaceDetailRepo, residentialUnitDetailRepo, agriCropRepo);
    }

    private CommercialListingFields shopFields() {
        return new CommercialListingFields(
                "SHOP", "GROUND_FLOOR", null, "HIGH_STREET",
                null, null, null, null,
                null, null, null,
                null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null,
                null, null, "SQ_FT",
                List.of("RETAIL", "GROCERY"), List.of("POWER", "CCTV"));
    }

    @Test
    @DisplayName("AC1: POST commercial subtype=SHOP — subtype, scalar fields, and both child sets persist through the real write path")
    void shop_createDraft_persistsSubtypeFieldsAndChildSets() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Shop near market", "Udupi",
                new BigDecimal("2000000"), "Retail shop", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, shopFields());

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getCommercialSubtype()).isEqualTo("SHOP");
        assertThat(fromDb.getFloorChoice()).isEqualTo("GROUND_FLOOR");
        assertThat(fromDb.getHubType()).isEqualTo("HIGH_STREET");
        assertThat(fromDb.getCommercialAreaUnit()).isEqualTo("SQ_FT");
        assertThat(fromDb.getListingFamily()).isEqualTo("COMMERCIAL");

        List<String> utilities = listingAmenityRepository.findByListingIdOrderByCodeAsc(saved.getId())
                .stream().map(ListingAmenity::getCode).toList();
        assertThat(utilities).containsExactlyInAnyOrder("POWER", "CCTV");

        List<String> suitableUses = listingSuitableUseRepository.findByListingIdOrderByCodeAsc(saved.getId())
                .stream().map(ListingSuitableUse::getCode).toList();
        assertThat(suitableUses).containsExactlyInAnyOrder("RETAIL", "GROCERY");
    }

    @Test
    @DisplayName("AC2: POST commercial subtype=OFFICE — office-only scalar fields persist")
    void office_createDraft_persistsOfficeOnlyFields() {
        CommercialListingFields officeFields = new CommercialListingFields(
                "OFFICE", "UPPER_FLOOR", null, "IT_PARK",
                null, null, null, null,
                40, 4, 2,
                null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null,
                "FURNISHED", null, "SQ_FT",
                List.of("IT_TECH"), List.of("INTERNET", "AC"));

        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Tech office", "Udupi",
                new BigDecimal("5000000"), "Office space", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, officeFields);

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getCommercialSubtype()).isEqualTo("OFFICE");
        assertThat(fromDb.getOfficeSeats()).isEqualTo(40);
        assertThat(fromDb.getOfficeCabins()).isEqualTo(4);
        assertThat(fromDb.getOfficeMeetingRooms()).isEqualTo(2);
        assertThat(fromDb.getCommercialFurnishingStatus()).isEqualTo("FURNISHED");
    }

    @Test
    @DisplayName("AC3: POST commercial_building — derived subtype=BUILDING, floor-mode/occupancy/power-load persist")
    void building_createDraft_derivesSubtypeAndPersistsBuildingFields() {
        CommercialListingFields buildingFields = new CommercialListingFields(
                "BUILDING", null, "WHOLE_BUILDING", null,
                null, null, null, null,
                null, null, null,
                "VACANT", new BigDecimal("50"),
                null, null, null, null,
                null, null, null,
                null, null,
                null, null,
                null, null, null,
                List.of("MIXED_USE"), List.of("FIRE", "SECURITY"));

        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial_building", "Block A", "Udupi",
                new BigDecimal("10000000"), "Commercial block", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, buildingFields);

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getCommercialSubtype()).isEqualTo("BUILDING");
        assertThat(fromDb.getFloorMode()).isEqualTo("WHOLE_BUILDING");
        assertThat(fromDb.getOccupancyStatus()).isEqualTo("VACANT");
        assertThat(fromDb.getPowerLoadKva()).isEqualByComparingTo("50");
    }

    @Test
    @DisplayName("AC4: POST warehouse — derived subtype=WAREHOUSE, clear-height/loading-bays/truck-access/flooring persist")
    void warehouse_createDraft_derivesSubtypeAndPersistsWarehouseFields() {
        CommercialListingFields warehouseFields = new CommercialListingFields(
                "WAREHOUSE", null, null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                new BigDecimal("24"), 3, true, "TRIMIX",
                null, null, null,
                null, null,
                null, null,
                null, null, null,
                List.of("STORAGE"), List.of("POWER"));

        Listing saved = crudService.createDraft(
                OWNER_ID, "warehouse", "WH A", "Udupi",
                new BigDecimal("8000000"), "Warehouse", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, warehouseFields);

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getCommercialSubtype()).isEqualTo("WAREHOUSE");
        assertThat(fromDb.getWarehouseClearHeightFt()).isEqualByComparingTo("24");
        assertThat(fromDb.getWarehouseLoadingBays()).isEqualTo(3);
        assertThat(fromDb.getWarehouseTruckAccess()).isTrue();
        assertThat(fromDb.getWarehouseFlooring()).isEqualTo("TRIMIX");
    }

    @Test
    @DisplayName("AC5: POST commercial_land — derived subtype=LAND, zoning/ownership/approvals persist")
    void land_createDraft_derivesSubtypeAndPersistsLandFields() {
        CommercialListingFields landFields = new CommercialListingFields(
                "LAND", null, null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null, null, null,
                "Mixed-use commercial zone", "FREEHOLD", "DC converted",
                null, null,
                null, null,
                null, null, "ACRE",
                List.of("RETAIL"), null);

        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial_land", "Comm land", "Udupi",
                new BigDecimal("3000000"), "Commercial land plot", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, landFields);

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getCommercialSubtype()).isEqualTo("LAND");
        assertThat(fromDb.getCommercialZoning()).isEqualTo("Mixed-use commercial zone");
        assertThat(fromDb.getCommercialOwnership()).isEqualTo("FREEHOLD");
        assertThat(fromDb.getCommercialApprovals()).isEqualTo("DC converted");
    }

    @Test
    @DisplayName("#2289: PUT that switches commercial subtype OFFICE -> WAREHOUSE (no OFFICE fields "
            + "in payload, matching what the Edit UI actually sends per #2281) nulls out the stale "
            + "OFFICE-only fields instead of leaving them persisted for the new subtype")
    void updateListing_commercialSubtypeSwitch_officeToWarehouse_clearsStaleOfficeFields() {
        CommercialListingFields officeFields = new CommercialListingFields(
                "OFFICE", "UPPER_FLOOR", null, "IT_PARK",
                null, null, null, null,
                40, 4, 2,
                null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null,
                "FURNISHED", null, "SQ_FT",
                List.of("IT_TECH"), List.of("INTERNET", "AC"));

        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Tech office", "Udupi",
                new BigDecimal("5000000"), "Office space", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, officeFields);

        Listing beforeUpdate = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(beforeUpdate.getOfficeSeats()).isEqualTo(40);
        assertThat(beforeUpdate.getCommercialSubtype()).isEqualTo("OFFICE");

        // PUT transitioning to WAREHOUSE — the resolved (post-derivation) subtype is WAREHOUSE and
        // the payload carries only WAREHOUSE-specific fields, exactly as the real controller would
        // construct CommercialListingFields for a "propertyType": "warehouse" request with no
        // OFFICE fields supplied (see ListingController#resolveCommercialSubtype).
        CommercialListingFields warehouseFields = new CommercialListingFields(
                "WAREHOUSE", null, null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                new BigDecimal("24"), 3, true, "TRIMIX",
                null, null, null,
                null, null,
                null, null,
                null, null, "SQ_FT",
                null, null);

        Listing updated = crudService.updateListing(
                saved.getId(), OWNER_ID, false,                             // listingId, userId, isAdmin
                "warehouse", null, null,                                    // propertyType, title, locality
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
                ResidentialListingFields.EMPTY, warehouseFields);

        assertThat(updated.getCommercialSubtype()).isEqualTo("WAREHOUSE");
        assertThat(updated.getWarehouseClearHeightFt()).isEqualByComparingTo("24");
        assertThat(updated.getWarehouseLoadingBays()).isEqualTo(3);

        assertThat(updated.getOfficeSeats())
                .as("#2289: stale OFFICE-only field must be nulled out after subtype switch to WAREHOUSE")
                .isNull();
        assertThat(updated.getOfficeCabins()).isNull();
        assertThat(updated.getOfficeMeetingRooms()).isNull();
        assertThat(updated.getFloorChoice())
                .as("#2289: stale SHOP/OFFICE-only field must be nulled out")
                .isNull();
        assertThat(updated.getHubType()).isNull();

        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getOfficeSeats()).isNull();
        assertThat(fromDb.getWarehouseClearHeightFt()).isEqualByComparingTo("24");
    }

    @Test
    @DisplayName("#2289 follow-up: PUT that switches commercial subtype OFFICE -> LAND (utilities "
            + "omitted from the payload, since LAND rejects utilities on input) clears the stale "
            + "listing_amenities rows instead of leaving them persisted for the LAND-excluded field")
    void updateListing_commercialSubtypeSwitch_officeToLand_clearsStaleUtilitiesChildRows() {
        CommercialListingFields officeFields = new CommercialListingFields(
                "OFFICE", "UPPER_FLOOR", null, "IT_PARK",
                null, null, null, null,
                40, 4, 2,
                null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null,
                "FURNISHED", null, "SQ_FT",
                List.of("IT_TECH"), List.of("INTERNET", "AC"));

        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Tech office", "Udupi",
                new BigDecimal("5000000"), "Office space", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, officeFields);

        assertThat(listingAmenityRepository.findByListingIdOrderByCodeAsc(saved.getId()))
                .as("sanity: OFFICE draft persisted its utilities via listing_amenities")
                .hasSize(2);

        // PUT transitioning to commercial_land — the resolved subtype is LAND, and the payload
        // omits `utilities` entirely (null), exactly as a real request must: LAND rejects a
        // non-empty `utilities` on input (validateCommercialFieldSet), so there is nothing valid
        // for the caller to supply for this now-excluded field.
        CommercialListingFields landFields = new CommercialListingFields(
                "LAND", null, null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null, null, null,
                "Mixed-use commercial zone", "FREEHOLD", "DC converted",
                null, null,
                null, null,
                null, null, "ACRE",
                null, null);

        Listing updated = crudService.updateListing(
                saved.getId(), OWNER_ID, false,                             // listingId, userId, isAdmin
                "commercial_land", null, null,                              // propertyType, title, locality
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
                ResidentialListingFields.EMPTY, landFields);

        assertThat(updated.getCommercialSubtype()).isEqualTo("LAND");
        assertThat(updated.getCommercialZoning()).isEqualTo("Mixed-use commercial zone");

        assertThat(listingAmenityRepository.findByListingIdOrderByCodeAsc(saved.getId()))
                .as("#2289 follow-up: stale listing_amenities (utilities) rows from the prior OFFICE "
                        + "subtype must not survive a switch to LAND, which excludes utilities entirely")
                .isEmpty();
    }

    @Test
    @DisplayName("AC6: legacy commercial_subtype=NULL row (simulated V102 backfill) reads back cleanly; "
            + "PUT omitting commercialSubtype leaves it NULL while another field changes")
    void legacyNullSubtypeRow_readsBackCleanly_andPutOmittingSubtypeLeavesItUnchanged() {
        // Simulate the V102 backfill state — a pre-#1730 commercial row with no typed fields
        // at all (raw JdbcTemplate INSERT, since this state predates the #1730 write path).
        UUID legacyId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, created_at, updated_at, property_type, created_by, status, title, price) "
                        + "VALUES (?, now(), now(), 'commercial', ?, 'DRAFT', 'Legacy shop', 1000000)",
                legacyId, OWNER_ID);

        Listing legacy = listingRepository.findById(legacyId).orElseThrow();
        assertThat(legacy.getCommercialSubtype()).isNull();
        assertThat(legacy.getFloorChoice()).isNull();
        assertThat(legacy.getHubType()).isNull();

        // PUT: change the title, omit commercialSubtype entirely (CommercialListingFields.EMPTY).
        Listing updated = crudService.updateListing(
                legacyId, OWNER_ID, false,                                  // listingId, userId, isAdmin
                null, "Legacy shop — updated title", null,                  // propertyType, title, locality
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
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        assertThat(updated.getTitle()).isEqualTo("Legacy shop — updated title");
        assertThat(updated.getCommercialSubtype())
                .as("PUT omitting commercialSubtype must leave the existing NULL value unchanged")
                .isNull();
    }
}
