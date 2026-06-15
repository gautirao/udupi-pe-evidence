package com.example.realestate.listing.api;

import com.example.realestate.booking.BookingCascadeService;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.duplicate.ProximityDuplicateService;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.trust.BadgeInvalidationService;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.workflow.ListingTransitionPolicy;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * AC6 integration journey for #1368: agricultural plot boundary survives the
 * create-draft → PUT-boundary → submit lifecycle through a REAL PostGIS database.
 *
 * <p><b>Level chosen — service layer over {@code @DataJpaTest}.</b> The repo has no
 * existing {@code @SpringBootTest}+MockMvc listing test with an auth/CallerInfo stub
 * (in fact no {@code @SpringBootTest} at all), and a full-context boot is unproven and
 * external-config dependent. So per the qa-fast fallback guidance this IT drives
 * {@link ListingCrudService#updateListing} + {@link ListingWorkflowService#submitListing}
 * directly with a hand-built {@code userId} UUID and {@code isAdmin=false}. The real
 * {@link PolygonBoundaryValidator} + real {@link ListingRepository} still exercise the
 * validator and PostGIS write/read — the AC6 essence. Peripheral collaborators
 * (events, dedup, search outbox, booking cascade, badge invalidation, proximity dup)
 * are mocked because they are irrelevant to the boundary journey.
 *
 * <p><b>Harness — copied from {@code V85BoundaryMigrationIT}.</b> {@code @DataJpaTest}
 * with {@code postgis/postgis:15-3.4}, real Flyway through V86, no DB replacement, and
 * the {@code concurrently_keyword} placeholder emptied so V73's CONCURRENTLY index
 * creation runs inside Flyway's transaction.
 *
 * <p><b>Add-only assertions</b> (do not duplicate PolygonBoundaryValidatorTest's 9
 * mocked rules nor V85BoundaryMigrationIT's raw round-trip):
 * <ul>
 *   <li>(a) after submit, {@code findBoundaryGeoJson} returns non-null GeoJSON containing
 *       {@code "Polygon"} — the boundary survives create→PUT→submit through real PostGIS;</li>
 *   <li>(b) status == PENDING_REVIEW after submit (works only because Part 1 made
 *       {@code agricultural_land} submittable);</li>
 *   <li>(c) a self-intersecting bowtie polygon (passes validator rules 1–7, forcing REAL
 *       PostGIS {@code ST_IsValid}) → {@link ListingValidationException} with code
 *       {@code BOUNDARY_INVALID_GEOMETRY}, un-mocked;</li>
 *   <li>(d) a non-agri listing + boundary → {@code BOUNDARY_NON_AGRI_TYPE}.</li>
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
        // V73's CREATE INDEX ... CONCURRENTLY cannot run in Flyway's transaction mode;
        // empty the placeholder so the index is created non-concurrently (safe on a fresh container).
        "spring.flyway.placeholders.concurrently_keyword="
})
class AgriListingBoundaryJourneyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** Valid Udupi polygon, ~30 km² (under the 100 km² cap). */
    private static final String VALID_POLYGON =
            "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.05,13.0],[74.05,13.05],[74.0,13.05],[74.0,13.0]]]}";

    /** Self-intersecting "bowtie" — passes validator rules 1–7 but fails PostGIS ST_IsValid. */
    private static final String BOWTIE_POLYGON =
            "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.1],[74.1,13.0],[74.0,13.1],[74.0,13.0]]]}";

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

    private static final UUID OWNER_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        // Real beans that touch PostGIS / persistence.
        PolygonBoundaryValidator validator =
                new PolygonBoundaryValidator(listingRepository, objectMapper);
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);
        ListingTransitionPolicy policy = new ListingTransitionPolicy(
                listingRepository, imageRepository, objectMapper, 10);

        // Peripheral collaborators irrelevant to the boundary journey — mocked.
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup = mock(ListingDeduplicationService.class);
        BadgeInvalidationService badge = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox = mock(SearchOutboxWriter.class);
        ProximityDuplicateService proximity = mock(ProximityDuplicateService.class);
        BookingCascadeService bookingCascade = mock(BookingCascadeService.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator);

        workflowService = new ListingWorkflowService(
                listingRepository, events, ownershipGuard, proximity, policy,
                statusHistoryRepository, imageRepository, objectMapper,
                bookingCascade, false, outbox);
    }

    /**
     * Seeds a DRAFT agricultural_land listing that is complete enough to submit:
     * locality, address confirmed, price, land area + unit (Part 1 completeness),
     * and the minimum 3 images.
     */
    private UUID seedSubmittableAgriDraft() {
        Listing draft = crudService.createDraft(
                OWNER_ID, "agricultural_land", "Agri plot near Udupi",
                "Udupi", new BigDecimal("5000000"), "Fertile agricultural land",
                new BigDecimal("5"), null, null, "acre", null, null);
        UUID id = draft.getId();

        // Flush so the listing row is visible to the native (JdbcTemplate) image INSERT,
        // which checks the listing_images -> property_listings foreign key.
        listingRepository.flush();
        seedImages(id, 3);

        // Confirm address (required for submission) via the update path.
        crudService.updateListing(id, OWNER_ID, false,
                null, null, null, null, null, null, null, null, true);
        return id;
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

    @Test
    @DisplayName("AC6: agri draft → PUT valid boundary → submit; boundary survives, status PENDING_REVIEW")
    void agriBoundaryJourney_survivesCreatePutSubmit() {
        UUID id = seedSubmittableAgriDraft();

        // PUT the boundary (boundary is PUT-only — not on the create request).
        crudService.updateListing(
                id, OWNER_ID, false,
                "agricultural_land", "Agri plot near Udupi", "Udupi",
                new BigDecimal("5000000"), "Fertile agricultural land",
                new BigDecimal("5"), null, null,
                /* addressConfirmed */ true, /* lat */ null, /* lon */ null,
                "acre", null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                VALID_POLYGON);

        // Submit for review (works only because Part 1 made agricultural_land submittable).
        Listing submitted = workflowService.submitListing(id, OWNER_ID, false);

        // (b) status PENDING_REVIEW after submit.
        assertThat(submitted.getStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());

        // (a) boundary survives the journey through real PostGIS.
        String boundaryGeoJson = listingRepository.findBoundaryGeoJson(id).orElse(null);
        assertThat(boundaryGeoJson)
                .as("boundary must survive create→PUT→submit through real PostGIS")
                .isNotNull()
                .contains("Polygon");
    }

    @Test
    @DisplayName("AC6: self-intersecting bowtie → un-mocked PostGIS ST_IsValid → BOUNDARY_INVALID_GEOMETRY")
    void agriBoundaryJourney_bowtie_throwsInvalidGeometryFromRealPostgis() {
        UUID id = seedSubmittableAgriDraft();

        assertThatThrownBy(() -> crudService.updateListing(
                id, OWNER_ID, false,
                "agricultural_land", "Agri plot near Udupi", "Udupi",
                new BigDecimal("5000000"), "Fertile agricultural land",
                new BigDecimal("5"), null, null,
                true, null, null, "acre", null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                BOWTIE_POLYGON))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> assertThat(((ListingValidationException) ex).getErrors())
                        .anySatisfy(e -> assertThat(e.get("code")).isEqualTo("BOUNDARY_INVALID_GEOMETRY")));

        // Boundary must remain unset after the rejected update.
        assertThat(listingRepository.findBoundaryGeoJson(id)).isEmpty();
    }

    @Test
    @DisplayName("AC6: non-agri type + boundary → BOUNDARY_NON_AGRI_TYPE (no PostGIS call)")
    void nonAgriType_withBoundary_throwsNonAgriType() {
        Listing draft = crudService.createDraft(
                OWNER_ID, "house", "A house", "Udupi",
                new BigDecimal("5000000"), "A nice house");
        UUID id = draft.getId();

        assertThatThrownBy(() -> crudService.updateListing(
                id, OWNER_ID, false,
                "house", "A house", "Udupi",
                new BigDecimal("5000000"), "A nice house",
                null, null, null,
                true, null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                VALID_POLYGON))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> assertThat(((ListingValidationException) ex).getErrors())
                        .anySatisfy(e -> assertThat(e.get("code")).isEqualTo("BOUNDARY_NON_AGRI_TYPE")));
    }
}
