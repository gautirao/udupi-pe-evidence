package com.example.realestate.listing.api;

import com.example.realestate.booking.BookingCascadeService;
import com.example.realestate.discover.AreaResolutionService;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.listing.area.ListingAreaResolutionService;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.duplicate.ProximityDuplicateService;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.workflow.ListingTransitionPolicy;
import com.example.realestate.listing.workflow.ListingWorkflowService;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Full broker create -> update(locality+coords) -> submit -> admin approve journey for #2263,
 * against a REAL Testcontainers Postgres/PostGIS database with all Flyway migrations applied
 * (including the V71 seed data: the {@code udupi} city and its {@code IN|KA|Udupi|Manipal} area).
 *
 * <p><b>Bug under test</b>: every broker-approved listing previously went LIVE with a null
 * {@code area_key} (no code on the create/update/submit/approve path ever set it), which made
 * {@code PublicListingController.getById}'s {@code findByIdWithActiveCity} INNER JOIN (areas ->
 * cities) exclude it — anonymous visitors got a 404 for an otherwise-valid LIVE listing. This test
 * proves the fix end to end: after submit, {@code area_key} is non-null and correctly resolved
 * against the real {@code areas}/{@code area_alias} tables, and the exact repository query the
 * public endpoint uses returns the row.
 *
 * <p><b>Harness — copied from {@code AgriListingBoundaryJourneyIT}/{@code ReviewAction500ReproIT}
 * (#1368 precedent)</b>: this repo has no {@code @SpringBootTest}+MockMvc harness for the listing
 * controllers, so — per that established precedent — this drives {@link ListingCrudService} and
 * {@link ListingWorkflowService} directly (real beans, real Testcontainers-backed repositories)
 * rather than going through HTTP. {@link GeocodingPort} is a hand-written deterministic fake (no
 * real Nominatim network call) so the test is hermetic; {@link AreaResolutionService} is REAL and
 * runs against the real seeded/fixture {@code areas}/{@code area_alias}/{@code cities} rows.
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
class BrokerAreaKeyResolutionJourneyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String MANIPAL_AREA_KEY = "IN|KA|Udupi|Manipal";
    private static final UUID OWNER_ID = UUID.randomUUID();
    private static final UUID ADMIN_ID = UUID.randomUUID();

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private ListingImageRepository imageRepository;

    @Autowired
    private ListingStatusHistoryRepository statusHistoryRepository;

    @Autowired
    private PriceChangeLogRepository priceChangeLogRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ListingCrudService crudService;
    private ListingWorkflowService workflowService;
    private int udupiCityId;

    /** Deterministic, network-free stand-in for real Nominatim geocoding. */
    private static final class FakeGeocodingPort implements GeocodingPort {
        @Override
        public GeocodingService.GeoResult geocode(String locality) {
            if ("Manipal It Fixture Locality".equals(locality)) {
                return new GeocodingService.GeoResult(
                        13.35, 74.79, "Manipal, Udupi, Karnataka, India",
                        "India", "Karnataka", "Udupi", "Manipal", null);
            }
            if ("Some Totally Unmapped Village".equals(locality)) {
                // Geocodes successfully, but to a city with no matching `cities` row — exercises
                // the UNRESOLVED (no cityId) branch rather than the "geocoding returned null" one.
                return new GeocodingService.GeoResult(
                        20.0, 80.0, "Some Totally Unmapped Village, Nowhereland",
                        "India", "Nowhere State", "Nonexistent City Xyz", "Some Totally Unmapped Village", null);
            }
            return null;
        }
    }

    @BeforeEach
    void setUp() {
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);

        // Alias fixture: the ONLY reliable resolution path exercised here (mirrors
        // AreaResolutionServiceIT's ALIAS fixtures) — CANONICAL_KEY rarely hits in practice
        // because computeAreaKey's ingestion-side normalisation lower-cases every segment while
        // canonical areas.area_key rows keep mixed case (e.g. "IN|KA|Udupi|Manipal").
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Manipal It Fixture Locality', 'manipal it fixture locality', 'it-fixture')
                """, udupiCityId, MANIPAL_AREA_KEY);

        PolygonBoundaryValidator validator = new PolygonBoundaryValidator(listingRepository, objectMapper);
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);
        ListingTransitionPolicy policy = new ListingTransitionPolicy(
                listingRepository, imageRepository, objectMapper, 10);
        ListingAreaResolutionService areaResolutionService = new ListingAreaResolutionService(
                new FakeGeocodingPort(), new AreaResolutionService(jdbcTemplate), jdbcTemplate);

        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup = mock(ListingDeduplicationService.class);
        BadgeInvalidationService badge = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox = mock(SearchOutboxWriter.class);
        ProximityDuplicateService proximity = mock(ProximityDuplicateService.class);
        BookingCascadeService bookingCascade = mock(BookingCascadeService.class);
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

        workflowService = new ListingWorkflowService(
                listingRepository, events, ownershipGuard, proximity, policy,
                statusHistoryRepository, imageRepository, objectMapper,
                bookingCascade, false, outbox, qualityRecompute, areaResolutionService);
    }

    private void seedImages(UUID listingId, int count) {
        for (int i = 0; i < count; i++) {
            jdbcTemplate.update(
                    "INSERT INTO public.listing_images "
                            + "(id, listing_id, storage_path, url, position, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, now())",
                    UUID.randomUUID(), listingId, "path/" + i + ".jpg", "http://img/" + i + ".jpg", i);
        }
    }

    /** POST /api/listings (draft) -> PUT (locality + map-pin coords + address confirm). */
    private UUID createSubmittableBrokerDraft() {
        Listing draft = crudService.createDraft(
                OWNER_ID, "house", "Cozy house near Manipal",
                "Manipal It Fixture Locality", new BigDecimal("5000000"), "A cozy house");
        UUID id = draft.getId();

        listingRepository.flush();
        seedImages(id, 3);

        // PUT: confirm address + set the broker's map-pin lat/lng (never touched by resolution).
        crudService.updateListing(id, OWNER_ID, false,
                null, null, null, null, null,
                null, null, null,
                /* addressConfirmed */ true, /* lat */ 13.3489, /* lon */ 74.7864,
                null, null,
                /* videoUrl */ null, /* applyVideoUrl */ false,
                /* reraNumber */ null);
        return id;
    }

    @Test
    @DisplayName("#2263: broker create -> submit resolves area_key via ALIAS against the real areas/area_alias tables")
    void submitListing_resolvesAreaKeyFromLocality() {
        UUID id = createSubmittableBrokerDraft();

        Listing submitted = workflowService.submitListing(id, OWNER_ID, false);

        assertThat(submitted.getStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(submitted.getAreaKey())
                .as("area_key must be resolved by submit time, not left null")
                .isEqualTo(MANIPAL_AREA_KEY);
        assertThat(submitted.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(submitted.getAreaResolutionMethod()).isEqualTo("ALIAS");
        // Broker-supplied map-pin coordinates are untouched by area resolution.
        assertThat(submitted.getLatitude()).isEqualTo(13.3489);
        assertThat(submitted.getLongitude()).isEqualTo(74.7864);
    }

    @Test
    @DisplayName("#2263: full journey create -> submit -> approve -> LIVE listing is visible via "
            + "the exact PublicListingController.getById query (findByIdWithActiveCity)")
    void fullJourney_approvedListing_visibleToAnonymousVisitors() {
        UUID id = createSubmittableBrokerDraft();
        workflowService.submitListing(id, OWNER_ID, false);

        Listing approved = workflowService.approveListing(id, ADMIN_ID);

        assertThat(approved.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(approved.getAreaKey()).isEqualTo(MANIPAL_AREA_KEY);

        // This is the EXACT query PublicListingController.getById uses to decide 404 vs 200 —
        // an INNER JOIN through areas -> cities that a null area_key always failed.
        assertThat(listingRepository.findByIdWithActiveCity(id))
                .as("approved listing must now be reachable by the public/anonymous lookup path")
                .isPresent();
    }

    @Test
    @DisplayName("#2263: a locality with no alias/canonical match still goes LIVE (parity with "
            + "existing ingestion UNRESOLVED behaviour) — proves this fix never blocks approval")
    void unresolvableLocality_stillReachesLive_withUnresolvedAreaKey() {
        Listing draft = crudService.createDraft(
                OWNER_ID, "house", "House in an unmapped village",
                "Some Totally Unmapped Village", new BigDecimal("3000000"), "A house");
        UUID id = draft.getId();
        listingRepository.flush();
        seedImages(id, 3);
        crudService.updateListing(id, OWNER_ID, false,
                null, null, null, null, null, null, null, null, true);

        workflowService.submitListing(id, OWNER_ID, false);
        Listing approved = workflowService.approveListing(id, ADMIN_ID);

        assertThat(approved.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(approved.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
    }
}
