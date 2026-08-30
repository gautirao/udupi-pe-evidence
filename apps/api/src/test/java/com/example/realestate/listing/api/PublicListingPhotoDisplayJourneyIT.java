package com.example.realestate.listing.api;

import com.example.realestate.booking.BookingCascadeService;
import com.example.realestate.discover.AreaResolutionService;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.listing.agricultural.ListingAgriCropRepository;
import com.example.realestate.listing.area.ListingAreaResolutionService;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
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
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.listing.storage.LocalDevStorageService;
import com.example.realestate.listing.workflow.ListingTransitionPolicy;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.example.realestate.trust.BadgeInvalidationService;
import com.example.realestate.trust.ListingVerificationDimensionRepository;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * #2359: real (non-mocked) create -&gt; submit -&gt; admin approve -&gt; LIVE journey proving broker-
 * uploaded photos actually resolve to a loadable URL on the public listing-detail read path,
 * against a REAL Testcontainers Postgres/PostGIS database.
 *
 * <p><b>Bug under test</b>: a broker's uploaded photo is persisted with a client-supplied,
 * Supabase-style placeholder URL that only resolves to real bytes when rewritten by
 * {@link LocalDevStorageService} (#2351). Before this fix, {@link ListingResponseMapper} —
 * which backs the public {@code GET /api/public/listings/:id} endpoint the {@code /listing/:id}
 * page calls — never applied that rewrite, so the placeholder URL was served as-is and the
 * public gallery showed "Image unavailable" even though {@code imageCount} was correct. This
 * test drives the exact same {@link ListingWorkflowService}/{@link ListingCrudService} lifecycle
 * a real broker submission uses, then calls {@link ListingResponseMapper} exactly as
 * {@code PublicListingController.getById} does, and asserts the resulting URL is the resolved
 * local-storage URL — never the raw unresolvable placeholder.
 *
 * <p><b>Harness — copied from {@code BrokerAreaKeyResolutionJourneyIT}/{@code AgriListingBoundaryJourneyIT}
 * (#1368/#2263 precedent)</b>: this repo has no {@code @SpringBootTest}+MockMvc harness for the
 * listing controllers, so — per that established precedent — this drives
 * {@link ListingCrudService} and {@link ListingWorkflowService} directly (real beans, real
 * Testcontainers-backed repositories) rather than going through HTTP, then constructs the real
 * {@link ListingResponseMapper} (also a real bean wiring, not mocked) the same way
 * {@code PublicListingController} does via Spring DI.
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
class PublicListingPhotoDisplayJourneyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String LOCAL_STORAGE_BASE_URL = "http://localhost:8085/api/dev/local-storage";
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
    private ListingVerificationDimensionRepository dimensionRepository;

    @Autowired
    private ListingAmenityRepository listingAmenityRepository;

    @Autowired
    private ListingLocationFeatureRepository listingLocationFeatureRepository;

    @Autowired
    private ListingPreferredTenantRepository listingPreferredTenantRepository;

    @Autowired
    private ListingSuitableUseRepository listingSuitableUseRepository;

    @Autowired
    private ListingAgriCropRepository listingAgriCropRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ListingCrudService crudService;
    private ListingWorkflowService workflowService;
    private ListingResponseMapper responseMapper;

    /** Deterministic, network-free stand-in for real Nominatim geocoding. */
    private static final class FakeGeocodingPort implements GeocodingPort {
        @Override
        public GeocodingService.GeoResult geocode(String locality) {
            if ("Manipal Photo Journey Fixture Locality".equals(locality)) {
                return new GeocodingService.GeoResult(
                        13.35, 74.79, "Manipal, Udupi, Karnataka, India",
                        "India", "Karnataka", "Udupi", "Manipal", null);
            }
            return null;
        }
    }

    @BeforeEach
    void setUp() {
        int udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, 'IN|KA|Udupi|Manipal', 'Manipal Photo Journey Fixture Locality',
                        'manipal photo journey fixture locality', 'it-fixture')
                """, udupiCityId);

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
        var commercialSpaceDetailRepo = mock(com.example.realestate.listing.typed.CommercialSpaceDetailRepository.class);
        var residentialUnitDetailRepo = mock(com.example.realestate.listing.typed.ResidentialUnitDetailRepository.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator,
                qualityRecompute, listingAmenityRepository, listingLocationFeatureRepository,
                listingPreferredTenantRepository, listingSuitableUseRepository,
                commercialSpaceDetailRepo, residentialUnitDetailRepo, listingAgriCropRepository);

        workflowService = new ListingWorkflowService(
                listingRepository, events, ownershipGuard, proximity, policy,
                statusHistoryRepository, imageRepository, objectMapper,
                bookingCascade, false, outbox, qualityRecompute, areaResolutionService);

        // Real ListingResponseMapper, real LocalDevStorageService — exactly the beans
        // PublicListingController is wired with in production, none mocked.
        LocalDevStorageService localDevStorageService = new LocalDevStorageService();
        ReflectionTestUtils.setField(localDevStorageService, "enabled", true);
        ReflectionTestUtils.setField(localDevStorageService, "publicBaseUrlOverride", LOCAL_STORAGE_BASE_URL);

        responseMapper = new ListingResponseMapper(
                imageRepository, dimensionRepository, listingRepository,
                listingAmenityRepository, listingLocationFeatureRepository, listingPreferredTenantRepository,
                listingSuitableUseRepository, listingAgriCropRepository, localDevStorageService);
    }

    /**
     * Seeds real {@code listing_images} rows shaped exactly like a real broker upload
     * (#2351/#2357): {@code storagePath} under {@code listings/{ownerId}/{listingId}/...} and
     * {@code url} the client-supplied Supabase-style placeholder that only resolves via
     * {@link LocalDevStorageService}.
     */
    private void seedBrokerUploadedImages(UUID listingId, int count) {
        for (int i = 0; i < count; i++) {
            String storagePath = "listings/" + OWNER_ID + "/" + listingId + "/photo-" + i + ".jpg";
            String placeholderUrl = "https://placeholder.local.supabase.co/storage/v1/object/public/"
                    + "listing-images/photo-" + i + ".jpg";
            jdbcTemplate.update(
                    "INSERT INTO public.listing_images "
                            + "(id, listing_id, storage_path, url, position, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, now())",
                    UUID.randomUUID(), listingId, storagePath, placeholderUrl, i);
        }
    }

    private UUID createSubmittableBrokerDraftWithImages() {
        Listing draft = crudService.createDraft(
                OWNER_ID, "house", "Cozy house near Manipal",
                "Manipal Photo Journey Fixture Locality", new BigDecimal("5000000"), "A cozy house");
        UUID id = draft.getId();

        listingRepository.flush();
        seedBrokerUploadedImages(id, 3);

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
    @DisplayName("#2359: broker create -> submit -> admin approve -> LIVE; the public "
            + "ListingResponseMapper (real bean, real DB row) resolves the photo to a loadable "
            + "local-storage URL, never the raw unresolvable placeholder")
    void approvedListingWithBrokerUploadedPhotos_publicMapperResolvesLoadableUrl() {
        UUID id = createSubmittableBrokerDraftWithImages();
        workflowService.submitListing(id, OWNER_ID, false);
        Listing approved = workflowService.approveListing(id, ADMIN_ID);

        assertThat(approved.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());

        // Anonymous path — exactly what PublicListingController.getById calls for an
        // unauthenticated visitor hitting /listing/:id (the reported repro: imageCount correct,
        // primaryImageUrl previously unresolvable).
        ListingTeaserResponse teaser = responseMapper.toTeaserResponse(approved);
        assertThat(teaser.imageCount()).isEqualTo(3);
        assertThat(teaser.primaryImageUrl())
                .as("primaryImageUrl must be the resolved local-storage URL, not the raw placeholder")
                .isNotNull()
                .startsWith(LOCAL_STORAGE_BASE_URL + "/public/listing-images/listings/" + OWNER_ID + "/" + id)
                .doesNotContain("placeholder.local.supabase.co");

        // Authenticated path — the full images[] gallery array.
        ListingResponse full = responseMapper.toPublicResponse(approved, true);
        assertThat(full.images()).hasSize(3);
        full.images().forEach(img -> assertThat(img.url())
                .as("every gallery image url must resolve through local dev storage, not stay a placeholder")
                .startsWith(LOCAL_STORAGE_BASE_URL + "/public/listing-images/listings/")
                .doesNotContain("placeholder.local.supabase.co"));
    }

    @Test
    @DisplayName("#2359: on a real approved listing, an external-CDN-shaped image row (mirroring "
            + "how scraped/imported listings persist into the shared listing_images table) is left "
            + "unchanged by the real mapper, even with local dev storage enabled — no regression")
    void externalStoragePathImageRow_publicMapperLeavesUrlUnchanged() {
        // Reuses the same real create -> submit -> approve journey helper as the test above to
        // get a fresh, fully-populated LIVE listing (each @Test method runs in its own
        // @DataJpaTest-rolled-back transaction, so this is a separate listing, not shared state)
        // rather than hand-building a second Listing row from scratch — that sidesteps
        // entity/version-lifecycle edge cases for a manually constructed row while still proving
        // the guard against a real DB row. What matters for this guard is the listing_images row
        // shape — data/imports/*/import.sql persists scraped rows into this exact same table with
        // an "external:"-prefixed storage_path, which is what's asserted below.
        UUID id = createSubmittableBrokerDraftWithImages();
        workflowService.submitListing(id, OWNER_ID, false);
        Listing approved = workflowService.approveListing(id, ADMIN_ID);

        String externalUrl = "https://is1-2.housingcdn.com/01c16c28/example-hall.jpg";
        jdbcTemplate.update(
                "INSERT INTO public.listing_images "
                        + "(id, listing_id, storage_path, url, position, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, now())",
                UUID.randomUUID(), approved.getId(), "external:" + externalUrl, externalUrl, 99);

        ListingResponse full = responseMapper.toPublicResponse(approved, true);

        // 3 broker-uploaded (local-dev-storage-resolved) + 1 external (unchanged) = 4.
        assertThat(full.images()).hasSize(4);
        assertThat(full.images())
                .filteredOn(img -> externalUrl.equals(img.url()))
                .as("the external-CDN image must pass through unchanged, never rewritten to a local-storage URL")
                .hasSize(1);
        assertThat(full.images())
                .extracting(ListingImageDTO::url)
                .noneMatch(url -> url.contains("placeholder.local.supabase.co"));
    }
}
