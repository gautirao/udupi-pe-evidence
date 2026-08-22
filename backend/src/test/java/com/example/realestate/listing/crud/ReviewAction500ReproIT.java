package com.example.realestate.listing.crud;

import com.example.realestate.booking.BookingCascadeService;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.area.ListingAreaResolutionService;
import com.example.realestate.listing.commercial.CommercialListingFields;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.duplicate.ProximityDuplicateService;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.residential.ListingAmenity;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.listing.residential.ResidentialListingFields;
import com.example.realestate.listing.typed.CommercialSpaceDetailRepository;
import com.example.realestate.listing.typed.ResidentialUnitDetailRepository;
import com.example.realestate.listing.workflow.ListingTransitionPolicy;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.example.realestate.trust.BadgeInvalidationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * REGRESSION HARNESS for issue #2038 (Stage B / hard-assertion conversion).
 *
 * <p><b>History</b>: Stage A introduced this class as an OBSERVE-AND-REPORT reproduction
 * harness — it captured whether an exception occurred but only ASSERTED on the disjoint-control
 * variant (variant3). Its green status proved nothing about the fix: it passed 6/6 both BEFORE
 * and AFTER the repository fix landed. Stage B (this revision) converts every variant to a HARD
 * assertion: the previously-failing overlapping-child-row PUTs must now SUCCEED, and the final
 * row state of every affected child-set table is asserted exactly via {@link JdbcTemplate}
 * (never via the JPA repositories/EntityManager — see AC12 rationale below).
 *
 * <p><b>Why JdbcTemplate-only for child-set assertions (AC12)</b>: the fix is a JPQL bulk
 * {@code @Modifying} delete that executes immediately against the database and BYPASSES the
 * Hibernate persistence context. A read-back through the same {@code EntityManager} (e.g. a
 * {@code ListingAmenityRepository.findByListingIdOrderByCodeAsc} call) could report a stale or
 * misleadingly "correct" result purely from first-level-cache bookkeeping while the database is
 * actually wrong. Every assertion on {@code listing_amenities}, {@code
 * listing_location_features}, {@code listing_preferred_tenants}, and {@code
 * listing_suitable_uses} state in this class goes through {@code jdbcTemplate} raw SQL against
 * the SAME {@link javax.sql.DataSource} the repositories use.
 *
 * <p><b>Harness choice, copied from {@code AgriListingBoundaryJourneyIT} (#1368 precedent)</b>:
 * {@code @DataJpaTest} + Testcontainers {@code postgis/postgis:15-3.4}, real Flyway, driving
 * {@link ListingCrudService#updateListing} directly (no {@code @SpringBootTest}/MockMvc harness
 * exists in this repo for the controller layer — the controller-boundary gap is covered
 * separately by {@code ListingControllerTest} PUT/500 tests, AC11).
 *
 * <p><b>Deliberate departure from the precedent's mocking choices</b>: the precedent mocks
 * {@code residentialUnitDetailRepository}, {@code listingAmenityRepository},
 * {@code listingLocationFeatureRepository}, {@code listingPreferredTenantRepository},
 * {@code listingSuitableUseRepository}, and {@code commercialSpaceDetailRepository} because its
 * agri-boundary journey doesn't touch them. THIS test wires all of them to REAL,
 * Testcontainers-backed beans instead, because the leading suspects for #2038
 * ({@code refreshTypedProjections}, the residential/commercial child-set REPLACE writes) live
 * exactly in those repositories, and a mock cannot surface a real constraint violation or
 * transaction failure. {@code BadgeInvalidationService}, {@code ListingDeduplicationService},
 * {@code ProximityDuplicateService}, {@code BookingCascadeService}, and the event publisher are
 * still mocked (peripheral to the child-set/typed-projection suspects; a known coverage gap —
 * see the final report).
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword=",
        // Follow-up experiment (orchestrator-directed): verbose Hibernate SQL so the actual
        // INSERT/DELETE ordering on listing_amenities is directly observable, scoped to this
        // test class only via @TestPropertySource (highest test property-source precedence).
        "spring.jpa.show-sql=true",
        "spring.jpa.properties.hibernate.format_sql=true",
        "logging.level.org.hibernate.SQL=DEBUG",
        "logging.level.org.hibernate.orm.jdbc.bind=TRACE"
})
@org.springframework.context.annotation.Import(ReviewAction500ReproIT.Ac6TransactionalConfig.class)
class ReviewAction500ReproIT {

    private static final Logger log = LoggerFactory.getLogger(ReviewAction500ReproIT.class);

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final UUID OWNER_ID = UUID.randomUUID();

    @Autowired private ListingRepository listingRepository;
    @Autowired private ListingImageRepository imageRepository;
    @Autowired private ListingStatusHistoryRepository statusHistoryRepository;
    @Autowired private PriceChangeLogRepository priceChangeLogRepository;
    @Autowired private ListingAmenityRepository listingAmenityRepository;
    @Autowired private ListingLocationFeatureRepository listingLocationFeatureRepository;
    @Autowired private ListingPreferredTenantRepository listingPreferredTenantRepository;
    @Autowired private ListingSuitableUseRepository listingSuitableUseRepository;
    @Autowired private CommercialSpaceDetailRepository commercialSpaceDetailRepository;
    @Autowired private ResidentialUnitDetailRepository residentialUnitDetailRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    // AC6 (Stage B, cycle 2) ONLY: a genuinely Spring-managed ListingCrudService bean, distinct
    // from the manually-`new`'d {@code crudService} field used by every other test in this class.
    // The manually-constructed instance is a plain POJO — Spring never creates a transactional AOP
    // proxy around it, so its @Transactional annotations are inert and it cannot demonstrate real
    // commit/rollback behaviour. This bean, defined in {@link Ac6TransactionalConfig} and pulled in
    // via @Import, IS proxied by Spring's transaction interceptor (the @DataJpaTest slice
    // auto-configures transaction management), so its @Transactional REQUIRED boundary is real —
    // required for AC6's rollback-completeness proof. Its peripheral collaborators (event
    // publisher, dedup service, badge invalidation, search outbox, quality recompute) are
    // test-only mock @Bean definitions; its repositories are the SAME real, Testcontainers-backed
    // repository beans already used everywhere else in this class.
    @Autowired private ListingCrudService ac6CrudService;
    @Autowired private BadgeInvalidationService ac6BadgeInvalidationService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ListingCrudService crudService;
    private ListingWorkflowService workflowService;

    // AC6: promoted to a field (Stage B, cycle 2) so a dedicated rollback test can arm this
    // already-mocked collaborator to throw AFTER child-set mutation begins, without touching
    // production code. Every other test in this class leaves it a no-op mock, matching Stage B
    // cycle-1 behaviour exactly.
    private BadgeInvalidationService badgeInvalidationService;

    @BeforeEach
    void setUp() {
        PolygonBoundaryValidator validator = new PolygonBoundaryValidator(listingRepository, objectMapper);
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);
        ListingTransitionPolicy policy = new ListingTransitionPolicy(
                listingRepository, imageRepository, objectMapper, 10);

        // Peripheral collaborators — mocked (known coverage gap, see class javadoc).
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup = mock(ListingDeduplicationService.class);
        badgeInvalidationService = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox = mock(SearchOutboxWriter.class);
        ProximityDuplicateService proximity = mock(ProximityDuplicateService.class);
        BookingCascadeService bookingCascade = mock(BookingCascadeService.class);
        QualityRecomputeService qualityRecompute = mock(QualityRecomputeService.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badgeInvalidationService, outbox, validator,
                qualityRecompute,
                listingAmenityRepository,           // REAL
                listingLocationFeatureRepository,   // REAL
                listingPreferredTenantRepository,   // REAL
                listingSuitableUseRepository,        // REAL
                commercialSpaceDetailRepository,     // REAL
                residentialUnitDetailRepository);    // REAL

        workflowService = new ListingWorkflowService(
                listingRepository, events, ownershipGuard, proximity, policy,
                statusHistoryRepository, imageRepository, objectMapper,
                bookingCascade, false, outbox, qualityRecompute,
                mock(ListingAreaResolutionService.class));
    }

    // code-reviewer finding 3: ac6BadgeInvalidationService is a plain @Bean mock in the
    // @DataJpaTest cached Spring context (not @MockitoBean), so a doThrow(...) armed on it (see
    // updateListing_failureAfterChildSetMutationBegins_rollsBackCompletely) would otherwise
    // survive past that test method and could arm a future test sharing this cached context.
    // Resetting it after every test removes that cross-test leakage risk without touching any
    // production code.
    @AfterEach
    void resetAc6Mocks() {
        org.mockito.Mockito.reset(ac6BadgeInvalidationService);
    }

    private UUID seedDraftApartment(String title) {
        Listing draft = crudService.createDraft(
                OWNER_ID, "apartment", title, "Manipal",
                new BigDecimal("6500000"), "Spacious 2BHK apartment close to college");
        UUID id = draft.getId();
        listingRepository.flush();
        seedImages(id, 3);
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

    /**
     * Realistic full-form residential Apartment payload, as the in-form "Review" action would
     * PUT once the listing is 100% ("Strong") complete. {@code commercialFields} intentionally
     * carries a non-null EMPTY {@code utilities} list — mirroring a shared React form model that
     * initializes ALL multi-select fields to {@code []} rather than omitting/nulling fields that
     * don't apply to the current property type. Pre-fix, this non-null empty utilities list
     * unconditionally ran {@code writeCommercialChildSets} on the shared {@code listing_amenities}
     * table, silently wiping the residential amenities write that ran immediately before it — a
     * cross-family SILENT DATA LOSS the reviewer's blocking finding surfaced. Post-fix (#2038
     * rework), {@code writeCommercialChildSets} is family-gated and never runs at all for an
     * "apartment" listing (a {@code RESIDENTIAL_PROPERTY_TYPES} member), regardless of what this
     * empty utilities list contains, so the residential amenities rows survive.
     */
    private Listing applyCompleteApartmentPut(UUID id) {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                /* bathrooms */ 2, /* balconies */ 1, /* facing */ "EAST",
                /* availabilityTimeline */ null, /* superBuiltArea */ new BigDecimal("1200"),
                /* superBuiltAreaUnit */ "sqft", /* propertyAge */ null,
                /* residentialWaterSource */ null,
                /* parking2wCount */ 1, /* parking4wCount */ 1,
                /* roadWidthFt */ null, /* plotDimensions */ null,
                /* conversionStatus */ null, /* khataNumber */ null, /* propertyTaxPid */ null,
                /* approvingAuthority */ null, /* projectName */ "Sunrise Residency",
                /* builderName */ "ABC Builders", /* maintenancePaise */ null,
                /* hasLift */ true, /* hasPowerBackup */ true, /* isGated */ true,
                /* hasGarden */ null, /* hasTerrace */ null, /* hasCompound */ null,
                /* hasServantRoom */ null,
                /* isCornerPlot */ null, /* hasBoundaryWall */ null, /* isGatedLayout */ null,
                /* hasWaterConnection */ null, /* hasElectricityConnection */ null,
                /* hasDrainage */ null,
                /* priceNegotiable */ true, /* rentNegotiable */ null, /* petsAllowed */ null,
                /* maintenanceIncluded */ null,
                /* amenities */ List.of("LIFT", "POWER_BACKUP", "GATED_SECURITY"),
                /* specialLocationViews */ List.of(),
                /* preferredTenants */ List.of());

        // Shared-form-model quirk under test: non-null EMPTY utilities/suitableUses on a
        // RESIDENTIAL apartment PUT.
        CommercialListingFields commercialFields = new CommercialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ List.of(),
                /* utilities */ List.of());

        return crudService.updateListing(
                id, OWNER_ID, false,
                "apartment", "2BHK Apartment near Udupi (updated)", "Manipal",
                new BigDecimal("6500000"), "Spacious 2BHK apartment close to college, ready to move in",
                /* landArea */ null, /* bedrooms */ 2, /* builtArea */ new BigDecimal("1150"),
                /* addressConfirmed */ true, /* latitude */ 13.3494, /* longitude */ 74.7864,
                /* landAreaUnit */ null, /* builtAreaUnit */ "sqft",
                /* videoUrl */ null, /* applyVideoUrl */ false,
                /* reraNumber */ null,
                /* listingPurpose */ "sale",
                /* carpetArea */ new BigDecimal("1000"), /* carpetAreaUnit */ "sqft",
                /* floorNumber */ 3, /* totalFloors */ 5,
                /* furnishingStatus */ "SEMI_FURNISHED", /* washrooms */ 2, /* parkingCount */ 1,
                /* roadFrontageFt */ null, /* commercialUsage */ null, /* numberOfUnits */ null,
                /* monthlyRent */ null, /* securityDepositMonths */ null, /* lockInMonths */ null,
                /* possessionStatus */ "READY_TO_MOVE", /* expectedPossessionDate */ null,
                /* approvalsDeclared */ null,
                /* waterSource */ null, /* soilType */ null, /* roadAccess */ null,
                /* cultivationStatus */ null, /* ownershipType */ null, /* surveyNumber */ null,
                /* landCategory */ null, /* agriConversionStatus */ null,
                /* farmhouseAvailable */ null, /* fencingDone */ null,
                /* boundaryGeoJson */ null,
                residentialFields, commercialFields);
    }

    @Test
    @DisplayName("#2038 AC1/AC9: complete residential Apartment, re-PUT via 'Review' action path succeeds "
            + "and leaves listing_amenities in the exact expected final state")
    void reviewClick_rePutOnCompleteApartment_succeedsWithExactFinalAmenityState() {
        UUID id = seedDraftApartment("2BHK Apartment near Udupi");

        // Step 1: bring the listing to "complete" state — first PUT (this is what the broker's
        // earlier successful edits look like; matches production behaviour where the listing
        // reaches 100%/Strong via normal editing).
        Listing afterFirstPut = applyCompleteApartmentPut(id);
        assertThat(afterFirstPut.getListingFamily()).isEqualTo("RESIDENTIAL");

        // Step 2: the "Review" click — broker re-submits the same complete form. This fires the
        // SAME PUT /api/listings/{id} a second time with no material field changes (the reported
        // reproduction trigger).
        Listing afterReviewPut = applyCompleteApartmentPut(id);
        assertThat(afterReviewPut.getStatus()).isEqualTo(afterFirstPut.getStatus());

        // PR_REVIEW rework cycle 1 (blocking finding): pre-fix, applyCompleteApartmentPut's
        // commercialFields non-null EMPTY utilities list unconditionally ran
        // writeCommercialChildSets against the SAME listing_amenities table AFTER
        // writeResidentialChildSets, silently wiping the residential amenities rows just
        // inserted — the 500 was "fixed" by trading it for SILENT DATA LOSS, which is exactly
        // what this assertion used to bless as "pre-existing, documented behaviour". Post-fix
        // (#2038 rework), writeCommercialChildSets is family-gated: "apartment" belongs to
        // RESIDENTIAL_PROPERTY_TYPES, so the commercial writer never runs at all, regardless of
        // what the empty utilities list contains, and the residential amenities rows survive both
        // the first PUT and the identical Review re-PUT. AC4 requires the child-set rows exactly
        // equal the requested set after a successful update — this must now be non-empty.
        List<Map<String, Object>> amenitiesAfterReviewPut = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_amenities WHERE listing_id = ? ORDER BY code", id);
        assertThat(amenitiesAfterReviewPut)
                .as("final listing_amenities state after the Review double-PUT — the family gate "
                        + "keeps writeCommercialChildSets from ever running on this residential "
                        + "apartment, so the submitted amenities survive both PUTs, via JdbcTemplate "
                        + "raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");

        List<Map<String, Object>> residentialProjectionAfterReviewPut = jdbcTemplate.queryForList(
                "SELECT * FROM public.listing_residential_unit_details WHERE listing_id = ?", id);
        assertThat(residentialProjectionAfterReviewPut)
                .as("residential typed projection must survive the double-PUT with exactly one row")
                .hasSize(1);
    }

    @Test
    @DisplayName("#2038 comparison: SAME starting state via ListingWorkflowService.submitListing succeeds")
    void submitForReview_onIdenticallySeededListing_succeeds() {
        UUID id = seedDraftApartment("2BHK Apartment near Udupi (submit-path twin)");
        applyCompleteApartmentPut(id);

        Listing submitted = workflowService.submitListing(id, OWNER_ID, false);

        assertThat(submitted.getStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        log.info("Submit-for-Review path SUCCEEDED on identically-seeded listing id={} status={}",
                id, submitted.getStatus());
    }

    // =========================================================================================
    // FOLLOW-UP EXPERIMENT (orchestrator-directed, 2026-07-30): the first pass above never had
    // PRE-EXISTING listing_amenities rows at the moment writeResidentialChildSets ran, because
    // (a) the table started empty on the first PUT, and (b) writeCommercialChildSets's empty
    // utilities list then wiped it, so the second PUT ALSO started empty. Production reaches
    // this code with amenities rows already present (createDraft's OWN child-set write is
    // insert-only, so a broker who POSTs a draft with amenities has real rows before ever
    // hitting the update/"Review" PUT). These tests seed via the real createDraft path so
    // listing_amenities genuinely has rows before the PUT under test, matching production.
    // =========================================================================================

    private static final List<String> SEED_AMENITY_CODES = List.of("LIFT", "POWER_BACKUP", "GATED_SECURITY");

    /**
     * Seeds a residential Apartment via the REAL {@link ListingCrudService#createDraft} path
     * (not raw JDBC) with a non-empty amenities list, so {@code listing_amenities} has genuine
     * pre-existing rows before any PUT — this is the production precondition ("broker POSTs a
     * draft with amenities, then later edits/reviews it") that the first-pass test above missed.
     */
    private UUID seedApartmentWithAmenities(String title, List<String> amenityCodes) {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                /* bathrooms */ 2, /* balconies */ 1, /* facing */ "EAST",
                /* availabilityTimeline */ null, /* superBuiltArea */ new BigDecimal("1200"),
                /* superBuiltAreaUnit */ "sqft", /* propertyAge */ null,
                /* residentialWaterSource */ null,
                /* parking2wCount */ 1, /* parking4wCount */ 1,
                /* roadWidthFt */ null, /* plotDimensions */ null,
                /* conversionStatus */ null, /* khataNumber */ null, /* propertyTaxPid */ null,
                /* approvingAuthority */ null, /* projectName */ "Sunrise Residency",
                /* builderName */ "ABC Builders", /* maintenancePaise */ null,
                /* hasLift */ true, /* hasPowerBackup */ true, /* isGated */ true,
                /* hasGarden */ null, /* hasTerrace */ null, /* hasCompound */ null,
                /* hasServantRoom */ null,
                /* isCornerPlot */ null, /* hasBoundaryWall */ null, /* isGatedLayout */ null,
                /* hasWaterConnection */ null, /* hasElectricityConnection */ null,
                /* hasDrainage */ null,
                /* priceNegotiable */ true, /* rentNegotiable */ null, /* petsAllowed */ null,
                /* maintenanceIncluded */ null,
                /* amenities */ amenityCodes,
                /* specialLocationViews */ List.of(),
                /* preferredTenants */ List.of());

        Listing draft = crudService.createDraft(
                OWNER_ID, "apartment", title, "Manipal",
                new BigDecimal("6500000"), "Spacious 2BHK apartment close to college",
                /* landArea */ null, /* bedrooms */ 2, /* builtArea */ new BigDecimal("1150"),
                /* landAreaUnit */ null, /* builtAreaUnit */ "sqft", /* videoUrl */ null,
                /* listingPurpose */ "sale",
                /* carpetArea */ new BigDecimal("1000"), /* carpetAreaUnit */ "sqft",
                /* floorNumber */ 3, /* totalFloors */ 5,
                /* furnishingStatus */ "SEMI_FURNISHED", /* washrooms */ 2, /* parkingCount */ 1,
                /* roadFrontageFt */ null, /* commercialUsage */ null, /* numberOfUnits */ null,
                /* monthlyRent */ null, /* securityDepositMonths */ null, /* lockInMonths */ null,
                /* sellerType */ "dealer",
                /* waterSource */ null, /* soilType */ null, /* roadAccess */ null,
                /* cultivationStatus */ null, /* ownershipType */ null, /* surveyNumber */ null,
                /* landCategory */ null, /* agriConversionStatus */ null,
                /* farmhouseAvailable */ null, /* fencingDone */ null,
                residentialFields);

        UUID id = draft.getId();
        listingRepository.flush();
        seedImages(id, 3);
        return id;
    }

    /**
     * PUT (the "Review" action path) re-sending an amenities list and an explicit
     * {@code utilities} list — {@code utilities} left {@code null} means "not supplied, leave
     * unchanged" (real REPLACE semantics); a non-null empty {@code []} is the masking variant.
     * ownershipType is deliberately never set here — a separate, pre-existing bug (residential
     * ownership values fail ListingController's AGRICULTURAL-only enum check, L247) is out of
     * scope for #2038 per architect's note.
     */
    private Listing putWithAmenities(UUID id, List<String> amenities, List<String> utilities) {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, 1, "EAST", null, new BigDecimal("1200"), "sqft", null, null,
                1, 1, null, null, null, null, null, null, "Sunrise Residency", "ABC Builders", null,
                true, true, true, null, null, null, null,
                null, null, null, null, null, null,
                true, null, null, null,
                amenities, List.of(), List.of());

        CommercialListingFields commercialFields = new CommercialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ null,
                /* utilities */ utilities);

        return crudService.updateListing(
                id, OWNER_ID, false,
                "apartment", "2BHK Apartment near Udupi (updated)", "Manipal",
                new BigDecimal("6500000"), "Spacious 2BHK apartment close to college, ready to move in",
                null, 2, new BigDecimal("1150"),
                true, 13.3494, 74.7864,
                null, "sqft",
                null, false,
                null,
                "sale",
                new BigDecimal("1000"), "sqft",
                3, 5,
                "SEMI_FURNISHED", 2, 1,
                null, null, null,
                null, null, null,
                "READY_TO_MOVE", null,
                null,
                null, null, null,
                null, null, null,
                null, null, null, null,
                null,
                residentialFields, commercialFields);
    }

    private List<Map<String, Object>> amenityRows(UUID id) {
        return jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_amenities WHERE listing_id = ? ORDER BY code", id);
    }

    /**
     * Walks the full cause chain, logging class/message/SQLSTATE (if any) at each level, plus
     * the top application-code (com.example.realestate) frame of the OUTERMOST exception's own
     * stack trace — this pinpoints the exact file:line inside ListingCrudService where the
     * exception surfaces (as opposed to the innermost PSQLException, whose stack trace is JDBC
     * driver / Hibernate internals only).
     */
    private void logCauseChain(String label, Throwable t) {
        int depth = 0;
        Throwable cur = t;
        while (cur != null) {
            String sqlState = (cur instanceof java.sql.SQLException se) ? se.getSQLState() : null;
            log.error("{} — cause[{}]: class={} sqlState={} message={}",
                    label, depth, cur.getClass().getName(), sqlState, cur.getMessage());
            cur = cur.getCause();
            depth++;
        }
        log.error("{} — top com.example.realestate frames of outermost exception:", label);
        for (StackTraceElement frame : t.getStackTrace()) {
            if (frame.getClassName().startsWith("com.example.realestate")) {
                log.error("{} —   at {}", label, frame);
            }
        }
    }

    @Test
    @DisplayName("#2038 AC1/AC3 variant 1: pre-existing amenities + IDENTICAL re-PUT + utilities=null "
            + "(no masking) — must now SUCCEED with the same 3 codes surviving")
    void variant1_overlappingAmenities_nullUtilities_mustSucceedWithUnchangedRows() {
        UUID id = seedApartmentWithAmenities("Variant1 apartment", SEED_AMENITY_CODES);

        List<Map<String, Object>> before = amenityRows(id);
        assertThat(before).as("seed must produce real pre-existing amenity rows").hasSize(3);

        Throwable captured = null;
        try {
            putWithAmenities(id, SEED_AMENITY_CODES, null);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("VARIANT1 (overlapping + null utilities)", captured);
        }

        assertThat(captured)
                .as("#2038 fix: re-submitting an IDENTICAL overlapping amenities set must no longer throw "
                        + "a DataIntegrityViolationException (UNIQUE listing_id,code) — this is the exact "
                        + "reported 'Review' action 500")
                .isNull();

        List<Map<String, Object>> after = amenityRows(id);
        assertThat(after)
                .as("final listing_amenities state via JdbcTemplate raw SQL (AC12) — same 3 codes, no "
                        + "duplicates, no stale rows")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");
    }

    @Test
    @DisplayName("#2038 AC1/AC3 variant 2: pre-existing amenities + IDENTICAL re-PUT + utilities=[] "
            + "(masking control) — must now SUCCEED with the amenities rows intact, not silently wiped by "
            + "the cross-family masking control")
    void variant2_overlappingAmenities_emptyUtilities_mustSucceed() {
        UUID id = seedApartmentWithAmenities("Variant2 apartment", SEED_AMENITY_CODES);

        List<Map<String, Object>> before = amenityRows(id);
        assertThat(before).hasSize(3);

        Throwable captured = null;
        try {
            putWithAmenities(id, SEED_AMENITY_CODES, List.of());
        } catch (Throwable t) {
            captured = t;
            logCauseChain("VARIANT2 (overlapping + empty utilities)", captured);
        }

        assertThat(captured)
                .as("#2038 fix: overlapping amenities re-PUT must succeed regardless of the (irrelevant) "
                        + "commercial-utilities masking control")
                .isNull();

        // PR_REVIEW rework cycle 1 (blocking finding): the masking control (utilities=[]) used to
        // deliberately empty listing_amenities as a "documented" side effect of the shared table
        // (SQ1) — that was the bug, not documented behaviour: an unconditional writeCommercialChildSets
        // call silently deleting rows the residential writer had just inserted, on a listing that is
        // not even commercial-family. The family gate (#2038 rework) means writeCommercialChildSets
        // never runs at all for this residential apartment, so the "masking control" has no effect on
        // listing_amenities and the previously-seeded/re-submitted codes must survive intact.
        List<Map<String, Object>> after = amenityRows(id);
        assertThat(after)
                .as("final listing_amenities state via JdbcTemplate raw SQL (AC12) — the family gate "
                        + "blocks the commercial writer entirely, so utilities=[] has no effect and the "
                        + "same 3 amenity codes survive")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");
    }

    @Test
    @DisplayName("#2038 EXPERIMENT variant 3 (disjoint control): seeded [LIFT], PUT [POWER_BACKUP], utilities=null")
    void variant3_disjointAmenities_nullUtilities_expectSuccess() {
        UUID id = seedApartmentWithAmenities("Variant3 apartment", List.of("LIFT"));

        List<Map<String, Object>> before = amenityRows(id);
        log.info("VARIANT3 BEFORE PUT — listing_amenities rows={}", before);
        assertThat(before).hasSize(1);

        Throwable captured = null;
        try {
            putWithAmenities(id, List.of("POWER_BACKUP"), null);
        } catch (Throwable t) {
            captured = t;
        }

        List<Map<String, Object>> after = amenityRows(id);
        if (captured != null) {
            logCauseChain("VARIANT3 (disjoint, expected SUCCESS)", captured);
        }
        assertThat(captured)
                .as("disjoint amenity codes must not collide on the UNIQUE(listing_id, code) constraint")
                .isNull();
        assertThat(after)
                .as("final listing_amenities state via JdbcTemplate raw SQL (AC12) — old LIFT row replaced "
                        + "by the new POWER_BACKUP code")
                .extracting(row -> row.get("code"))
                .containsExactly("POWER_BACKUP");
    }

    @Test
    @DisplayName("#2038 AC4/AC5 variant 4: same overlap check on listing_location_features and "
            + "listing_preferred_tenants — must now SUCCEED with exact final row state")
    void variant4_locationFeaturesAndPreferredTenants_mustSucceed() {
        UUID id = seedApartmentWithAmenities("Variant4 apartment", List.of("LIFT"));

        // Seed specialLocationViews / preferredTenants rows directly via JDBC — NOT via a PUT,
        // because a PUT re-sending the identical "LIFT" amenities code here would itself risk
        // hitting the variant1 amenities collision before we ever reach the location-features/
        // preferred-tenants assertions below. This keeps the two concerns isolated.
        jdbcTemplate.update(
                "INSERT INTO public.listing_location_features (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "SEA_VIEW");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "FAMILY");

        List<Map<String, Object>> lfBefore = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id);
        List<Map<String, Object>> ptBefore = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id);
        log.info("VARIANT4 BEFORE PUT — listing_location_features={} listing_preferred_tenants={}",
                lfBefore, ptBefore);
        assertThat(lfBefore).hasSize(1);
        assertThat(ptBefore).hasSize(1);

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, 1, "EAST", null, new BigDecimal("1200"), "sqft", null, null,
                1, 1, null, null, null, null, null, null, "Sunrise Residency", "ABC Builders", null,
                true, true, true, null, null, null, null,
                null, null, null, null, null, null,
                true, null, null, null,
                /* amenities — null (not supplied), so this PUT's amenities are isolated from
                 * this variant's location_features/preferred_tenants check */ null,
                /* specialLocationViews — IDENTICAL to seeded row */ List.of("SEA_VIEW"),
                /* preferredTenants — IDENTICAL to seeded row */ List.of("FAMILY"));

        CommercialListingFields commercialFields = new CommercialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null);

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "apartment", "2BHK Apartment near Udupi (updated)", "Manipal",
                    new BigDecimal("6500000"), "Spacious 2BHK apartment close to college, ready to move in",
                    null, 2, new BigDecimal("1150"),
                    true, 13.3494, 74.7864,
                    null, "sqft",
                    null, false,
                    null,
                    "sale",
                    new BigDecimal("1000"), "sqft",
                    3, 5,
                    "SEMI_FURNISHED", 2, 1,
                    null, null, null,
                    null, null, null,
                    "READY_TO_MOVE", null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, commercialFields);
        } catch (Throwable t) {
            captured = t;
        }

        if (captured != null) {
            logCauseChain("VARIANT4 (location_features + preferred_tenants overlap)", captured);
        }
        assertThat(captured)
                .as("#2038 fix: overlapping location_features/preferred_tenants re-PUT must no longer throw")
                .isNull();

        List<Map<String, Object>> lfAfter = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ? ORDER BY code", id);
        List<Map<String, Object>> ptAfter = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ? ORDER BY code", id);
        assertThat(lfAfter)
                .as("final listing_location_features state via JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("SEA_VIEW");
        assertThat(ptAfter)
                .as("final listing_preferred_tenants state via JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("FAMILY");
    }

    // =========================================================================================
    // AC2/SQ3: listing_suitable_uses — the fourth child-set table sharing the defect shape, not
    // previously exercised by any variant. Uses a COMMERCIAL-family listing (property type
    // "commercial") so suitableUses/utilities are the applicable multi-select fields.
    // =========================================================================================

    private static final List<String> SEED_SUITABLE_USE_CODES = List.of("RETAIL", "OFFICE");

    /**
     * Seeds a COMMERCIAL-family listing via the REAL {@link ListingCrudService#createDraft} path
     * with a non-empty suitableUses list, so {@code listing_suitable_uses} has genuine
     * pre-existing rows before any PUT.
     */
    private UUID seedCommercialWithSuitableUses(String title, List<String> suitableUseCodes) {
        com.example.realestate.listing.commercial.CommercialListingFields commercialFields =
                new com.example.realestate.listing.commercial.CommercialListingFields(
                        "SHOP", null, null, null, null, null, null, null, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null, null, null, null,
                        /* suitableUses */ suitableUseCodes,
                        /* utilities */ null);

        Listing draft = crudService.createDraft(
                OWNER_ID, "commercial", title, "Manipal",
                new BigDecimal("9000000"), "Commercial space near market",
                /* landArea */ null, /* bedrooms */ null, /* builtArea */ new BigDecimal("2000"),
                /* landAreaUnit */ null, /* builtAreaUnit */ "sqft", /* videoUrl */ null,
                /* listingPurpose */ "sale",
                /* carpetArea */ null, /* carpetAreaUnit */ null,
                /* floorNumber */ 1, /* totalFloors */ 3,
                /* furnishingStatus */ "UNFURNISHED", /* washrooms */ null, /* parkingCount */ null,
                /* roadFrontageFt */ null, /* commercialUsage */ null, /* numberOfUnits */ null,
                /* monthlyRent */ null, /* securityDepositMonths */ null, /* lockInMonths */ null,
                /* sellerType */ "dealer",
                /* waterSource */ null, /* soilType */ null, /* roadAccess */ null,
                /* cultivationStatus */ null, /* ownershipType */ null, /* surveyNumber */ null,
                /* landCategory */ null, /* agriConversionStatus */ null,
                /* farmhouseAvailable */ null, /* fencingDone */ null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                commercialFields);

        UUID id = draft.getId();
        listingRepository.flush();
        seedImages(id, 3);
        return id;
    }

    private Listing putCommercialWithSuitableUses(UUID id, List<String> suitableUses) {
        com.example.realestate.listing.commercial.CommercialListingFields commercialFields =
                new com.example.realestate.listing.commercial.CommercialListingFields(
                        "SHOP", null, null, null, null, null, null, null, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null, null, null, null,
                        suitableUses, /* utilities */ null);

        return crudService.updateListing(
                id, OWNER_ID, false,
                "commercial", "Commercial space near market (updated)", "Manipal",
                new BigDecimal("9000000"), "Commercial space near market, ready to lease",
                null, null, new BigDecimal("2000"),
                true, 13.3494, 74.7864,
                null, "sqft",
                null, false,
                null,
                "sale",
                null, null,
                1, 3,
                "UNFURNISHED", null, null,
                null, null, null,
                null, null, null,
                null, null,
                null,
                null, null, null,
                null, null, null,
                null, null, null, null,
                null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY, commercialFields);
    }

    private List<Map<String, Object>> suitableUseRows(UUID id) {
        return jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_suitable_uses WHERE listing_id = ? ORDER BY code", id);
    }

    @Test
    @DisplayName("#2038 AC2/SQ3 variant 5: pre-existing suitable-uses + IDENTICAL re-PUT — must SUCCEED "
            + "with exact final listing_suitable_uses state (previously not exercised at all)")
    void variant5_overlappingSuitableUses_mustSucceedWithUnchangedRows() {
        UUID id = seedCommercialWithSuitableUses("Variant5 commercial", SEED_SUITABLE_USE_CODES);

        List<Map<String, Object>> before = suitableUseRows(id);
        assertThat(before)
                .as("seed must produce real pre-existing listing_suitable_uses rows via JdbcTemplate (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("OFFICE", "RETAIL");

        Throwable captured = null;
        try {
            putCommercialWithSuitableUses(id, SEED_SUITABLE_USE_CODES);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("VARIANT5 (listing_suitable_uses overlap)", captured);
        }

        assertThat(captured)
                .as("#2038 fix: re-submitting an IDENTICAL overlapping suitableUses set must no longer "
                        + "throw a DataIntegrityViolationException on listing_suitable_uses "
                        + "(UNIQUE listing_id,code) — the fourth child-set table sharing the defect shape")
                .isNull();

        List<Map<String, Object>> after = suitableUseRows(id);
        assertThat(after)
                .as("final listing_suitable_uses state via JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("OFFICE", "RETAIL");
    }

    @Test
    @DisplayName("#2038 review-followup: SAME code in residential amenities AND commercial utilities "
            + "on a single PUT — must SUCCEED with exactly one listing_amenities row (no duplicate, no loss)")
    void variant6_sameCodeInAmenitiesAndUtilities_mustSucceedWithSingleRow() {
        // Pre-existing row so this exercises a genuine delete-then-insert on each pass, not an
        // insert-only no-op (mirrors variant1's precondition).
        UUID id = seedApartmentWithAmenities("Variant6 apartment", List.of("LIFT"));

        List<Map<String, Object>> before = amenityRows(id);
        assertThat(before).as("seed must produce a real pre-existing amenity row").hasSize(1);

        // PR_REVIEW rework cycle 1 (Part A exhaustive re-check): this test's ORIGINAL comment
        // described BOTH writeResidentialChildSets and writeCommercialChildSets running against
        // listing_amenities on the same PUT, relying on flushAutomatically timing to avoid a
        // duplicate/23505. That framing no longer applies — with the family gate (#2038 rework),
        // "apartment" is RESIDENTIAL family only, so writeCommercialChildSets never runs at all
        // here; commercialFields.utilities=["LIFT"] below is inert. The single LIFT row this test
        // asserts is now produced entirely by the residential writer's own delete-then-insert, not
        // by any cross-writer interaction. Retained (not deleted) as a same-code regression guard
        // in case the family sets are ever widened to overlap.
        Throwable captured = null;
        try {
            putWithAmenities(id, List.of("LIFT"), List.of("LIFT"));
        } catch (Throwable t) {
            captured = t;
            logCauseChain("VARIANT6 (same code in amenities and utilities)", captured);
        }

        assertThat(captured)
                .as("#2038 fix: a single PUT with the same code in both residential amenities and "
                        + "commercial utilities must not throw")
                .isNull();

        List<Map<String, Object>> after = amenityRows(id);
        assertThat(after)
                .as("final listing_amenities state via JdbcTemplate raw SQL (AC12) — exactly one LIFT "
                        + "row, no duplicate from the double write and no loss")
                .extracting(row -> row.get("code"))
                .containsExactly("LIFT");
    }

    // =========================================================================================
    // PR_REVIEW rework cycle 1 (architect-specified T1-T10): exhaustive coverage of the
    // family-gated child-set writer dispatch. T1/T9/T10 pin the reviewer's exact scenario and the
    // original regression; T2/T3/T5 pin the REPLACE-contract sentinels (clear-all / not-supplied)
    // are unaffected by the family gate; T4 is the commercial-family mirror of T1; T6/T7 pin the
    // R5 family-switch cleanup; T8 pins the neither-family (AGRICULTURAL) no-op and the #1734
    // family-stamp gate.
    // =========================================================================================

    private Listing putCommercialWithUtilities(UUID id, List<String> utilities, List<String> residentialAmenities) {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities */ residentialAmenities, null, null);
        CommercialListingFields commercialFields = new CommercialListingFields(
                "SHOP", null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ null,
                /* utilities */ utilities);

        return crudService.updateListing(
                id, OWNER_ID, false,
                "commercial", "Commercial space near market (updated)", "Manipal",
                new BigDecimal("9000000"), "Commercial space near market, ready to lease",
                null, null, new BigDecimal("2000"),
                true, 13.3494, 74.7864,
                null, "sqft",
                null, false,
                null,
                "sale",
                null, null,
                1, 3,
                "UNFURNISHED", null, null,
                null, null, null,
                null, null, null,
                null, null,
                null,
                null, null, null,
                null, null, null,
                null, null, null, null,
                null,
                residentialFields, commercialFields);
    }

    private UUID seedAgriculturalListingWithFamilyStamp(String title) {
        Listing draft = crudService.createDraft(
                OWNER_ID, "agricultural_land", title, "Manipal",
                new BigDecimal("2000000"), "Agricultural land parcel",
                /* landArea */ new BigDecimal("2"), /* bedrooms */ null, /* builtArea */ null,
                /* landAreaUnit */ "acres", /* builtAreaUnit */ null, /* videoUrl */ null,
                /* listingPurpose */ "sale",
                /* carpetArea */ null, /* carpetAreaUnit */ null,
                /* floorNumber */ null, /* totalFloors */ null,
                /* furnishingStatus */ null, /* washrooms */ null, /* parkingCount */ null,
                /* roadFrontageFt */ null, /* commercialUsage */ null, /* numberOfUnits */ null,
                /* monthlyRent */ null, /* securityDepositMonths */ null, /* lockInMonths */ null,
                /* sellerType */ "dealer",
                /* waterSource */ null, /* soilType */ null, /* roadAccess */ null,
                /* cultivationStatus */ null, /* ownershipType */ null, /* surveyNumber */ null,
                /* landCategory */ null, /* agriConversionStatus */ null,
                /* farmhouseAvailable */ null, /* fencingDone */ null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        UUID id = draft.getId();
        listingRepository.flush();
        // Simulate the one-time V102 backfill DML that stamps listing_family='AGRICULTURAL' on
        // agricultural listings — ListingCrudService never writes this stamp itself (see the
        // family-reset gate javadoc in updateListing).
        jdbcTemplate.update(
                "UPDATE public.property_listings SET listing_family = 'AGRICULTURAL' WHERE id = ?", id);
        seedImages(id, 3);
        return id;
    }

    @Test
    @DisplayName("#2038 T1 (reviewer's exact scenario, red-then-green): residential PUT with "
            + "amenities=[LIFT,POWER_BACKUP,GATED_SECURITY] AND commercialFields.utilities=[] in the SAME "
            + "call — must succeed with listing_amenities containing EXACTLY those three codes")
    void t1_residentialAmenitiesWithEmptyUtilitiesSameCall_mustPersistExactSet() {
        UUID id = seedDraftApartment("T1 apartment");

        Throwable captured = null;
        try {
            putWithAmenities(id, SEED_AMENITY_CODES, List.of());
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T1 (amenities + same-call empty utilities)", captured);
        }

        assertThat(captured)
                .as("#2038 fix: must not throw for the reviewer's exact reported scenario")
                .isNull();

        List<Map<String, Object>> after = amenityRows(id);
        assertThat(after)
                .as("AC4: child-set rows exactly equal the requested set via JdbcTemplate raw SQL "
                        + "(AC12) — the family gate prevents commercialFields.utilities=[] from wiping "
                        + "the residential amenities write in the same request")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");
    }

    @Test
    @DisplayName("#2038 T2: legitimate clear-all preserved — residential PUT amenities=[] on a listing "
            + "with 3 pre-existing rows must empty listing_amenities (must not regress)")
    void t2_residentialEmptyAmenitiesNullUtilities_clearsAllRows() {
        UUID id = seedApartmentWithAmenities("T2 apartment", SEED_AMENITY_CODES);
        assertThat(amenityRows(id)).hasSize(3);

        Throwable captured = null;
        try {
            putWithAmenities(id, List.of(), null);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T2 (legitimate clear-all)", captured);
        }
        assertThat(captured).as("legitimate clear-all must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4: legitimate clear-all (non-null empty amenities) must still empty "
                        + "listing_amenities via JdbcTemplate raw SQL (AC12) — this must not regress")
                .isEmpty();
    }

    @Test
    @DisplayName("#2038 T3: not-supplied preserved — residential PUT amenities=null, "
            + "commercialFields.utilities=[] must leave listing_amenities UNCHANGED")
    void t3_residentialNullAmenitiesEmptyUtilities_leavesRowsUnchanged() {
        UUID id = seedApartmentWithAmenities("T3 apartment", SEED_AMENITY_CODES);
        List<Map<String, Object>> before = amenityRows(id);
        assertThat(before).hasSize(3);

        Throwable captured = null;
        try {
            putWithAmenities(id, null, List.of());
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T3 (amenities not supplied + empty utilities)", captured);
        }
        assertThat(captured).as("not-supplied + empty-utilities PUT must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4: amenities not supplied (null) must leave listing_amenities untouched; the "
                        + "family gate also blocks commercialFields.utilities=[] from running on this "
                        + "residential listing, via JdbcTemplate raw SQL (AC12)")
                .isEqualTo(before);
    }

    @Test
    @DisplayName("#2038 T4: symmetric commercial — commercial PUT utilities=[CCTV,INTERNET] + "
            + "residentialFields.amenities=[] in the SAME call — must persist EXACTLY the two utility "
            + "codes")
    void t4_commercialUtilitiesWithEmptyResidentialAmenitiesSameCall_mustPersistExactSet() {
        UUID id = seedCommercialWithSuitableUses("T4 commercial", List.of());

        Throwable captured = null;
        try {
            putCommercialWithUtilities(id, List.of("CCTV", "INTERNET"), List.of());
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T4 (commercial utilities + same-call empty residential amenities)", captured);
        }
        assertThat(captured).as("#2038 fix: symmetric commercial scenario must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4: the family gate prevents residentialFields.amenities=[] from running "
                        + "writeResidentialChildSets on this commercial listing, via JdbcTemplate raw "
                        + "SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("CCTV", "INTERNET");
    }

    @Test
    @DisplayName("#2038 T5: not-supplied preserved (commercial) — commercial PUT utilities=null, "
            + "residentialFields.amenities=[] must leave listing_amenities UNCHANGED")
    void t5_commercialNullUtilitiesEmptyResidentialAmenities_leavesRowsUnchanged() {
        UUID id = seedCommercialWithSuitableUses("T5 commercial", List.of());
        putCommercialWithUtilities(id, List.of("CCTV", "INTERNET"), null);
        List<Map<String, Object>> before = amenityRows(id);
        assertThat(before).extracting(row -> row.get("code")).containsExactly("CCTV", "INTERNET");

        Throwable captured = null;
        try {
            putCommercialWithUtilities(id, null, List.of());
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T5 (utilities not supplied + empty residential amenities)", captured);
        }
        assertThat(captured).as("not-supplied + empty-residential-amenities PUT must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4: utilities not supplied (null) must leave listing_amenities untouched; the "
                        + "family gate also blocks residentialFields.amenities=[] from running on this "
                        + "commercial listing, via JdbcTemplate raw SQL (AC12)")
                .isEqualTo(before);
    }

    @Test
    @DisplayName("#2038 T6 (R5 family switch residential -> commercial): PUT changing propertyType "
            + "apartment -> commercial with utilities=[CCTV] — must delete stale residential child rows "
            + "and persist exactly the new commercial utilities")
    void t6_familySwitchResidentialToCommercial_deletesStaleResidentialRowsAndWritesCommercial() {
        UUID id = seedApartmentWithAmenities("T6 apartment", SEED_AMENITY_CODES);
        jdbcTemplate.update(
                "INSERT INTO public.listing_location_features (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "SEA_VIEW");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "FAMILY");

        assertThat(amenityRows(id)).hasSize(3);
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id)).hasSize(1);
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id)).hasSize(1);

        CommercialListingFields commercialFields = new CommercialListingFields(
                "SHOP", null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ null, /* utilities */ List.of("CCTV"));

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "commercial", "Now a commercial listing", "Manipal",
                    new BigDecimal("9000000"), "Switched from apartment to commercial",
                    null, null, new BigDecimal("2000"),
                    true, 13.3494, 74.7864,
                    null, "sqft",
                    null, false,
                    null,
                    "sale",
                    null, null,
                    1, 3,
                    "UNFURNISHED", null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    com.example.realestate.listing.residential.ResidentialListingFields.EMPTY, commercialFields);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T6 (family switch residential->commercial)", captured);
        }
        assertThat(captured).as("#2038 R5: family-switch PUT must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4/R5: family-switch cleanup deletes the stale residential rows BEFORE the "
                        + "commercial writer runs, leaving exactly the new utilities code, via "
                        + "JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("CCTV");
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id))
                .as("R5: listing_location_features must be emptied on residential->commercial switch")
                .isEmpty();
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id))
                .as("R5: listing_preferred_tenants must be emptied on residential->commercial switch")
                .isEmpty();
    }

    @Test
    @DisplayName("#2038 T7 (R5 family switch commercial -> residential): PUT changing propertyType "
            + "commercial -> apartment with amenities=[LIFT] — must delete stale commercial suitable-use "
            + "rows and persist exactly the new residential amenities")
    void t7_familySwitchCommercialToResidential_deletesStaleCommercialRowsAndWritesResidential() {
        UUID id = seedCommercialWithSuitableUses("T7 commercial", SEED_SUITABLE_USE_CODES);
        assertThat(suitableUseRows(id)).hasSize(2);
        assertThat(amenityRows(id)).isEmpty();

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, 1, "EAST", null, new BigDecimal("1200"), "sqft", null, null,
                1, 1, null, null, null, null, null, null, "Sunrise Residency", "ABC Builders", null,
                true, true, true, null, null, null, null,
                null, null, null, null, null, null,
                true, null, null, null,
                /* amenities */ List.of("LIFT"), List.of(), List.of());

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "apartment", "Now a residential listing", "Manipal",
                    new BigDecimal("6500000"), "Switched from commercial to apartment",
                    null, 2, new BigDecimal("1150"),
                    true, 13.3494, 74.7864,
                    null, "sqft",
                    null, false,
                    null,
                    "sale",
                    new BigDecimal("1000"), "sqft",
                    3, 5,
                    "SEMI_FURNISHED", 2, 1,
                    null, null, null,
                    null, null, null,
                    "READY_TO_MOVE", null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T7 (family switch commercial->residential)", captured);
        }
        assertThat(captured).as("#2038 R5: family-switch PUT must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4/R5: family-switch writes exactly the new residential amenities, via "
                        + "JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("LIFT");
        assertThat(suitableUseRows(id))
                .as("R5: listing_suitable_uses must be emptied on commercial->residential switch")
                .isEmpty();
    }

    @Test
    @DisplayName("#2038 T8: neither family — PUT on an agricultural_land listing with utilities=[] and "
            + "amenities=[] must not throw, must not mutate any child-set table, and must not clobber the "
            + "#1734 AGRICULTURAL family stamp")
    void t8_agriculturalListing_neitherFamily_noChildSetMutationAndFamilyStampPreserved() {
        UUID id = seedAgriculturalListingWithFamilyStamp("T8 agricultural");

        assertThat(amenityRows(id)).as("no pre-existing amenity rows").isEmpty();
        assertThat(suitableUseRows(id)).as("no pre-existing suitable-use rows").isEmpty();

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities */ List.of(), List.of(), List.of());
        CommercialListingFields commercialFields = new CommercialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ List.of(), /* utilities */ List.of());

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    /* propertyType */ null, "Agricultural land near Manipal (updated)", "Manipal",
                    new BigDecimal("2000000"), "Agricultural land parcel, updated description",
                    null, null, null,
                    true, 13.3494, 74.7864,
                    null, null,
                    null, false,
                    null,
                    "sale",
                    null, null,
                    null, null,
                    null, null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, commercialFields);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T8 (agricultural, neither family)", captured);
        }
        assertThat(captured).as("neither-family PUT must not throw").isNull();

        assertThat(amenityRows(id))
                .as("AC4: neither writer runs on an AGRICULTURAL listing; listing_amenities must stay "
                        + "empty")
                .isEmpty();
        assertThat(suitableUseRows(id))
                .as("AC4: neither writer runs on an AGRICULTURAL listing; listing_suitable_uses must "
                        + "stay empty")
                .isEmpty();

        String familyAfter = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id = ?", String.class, id);
        assertThat(familyAfter)
                .as("#1734 gate: an ordinary edit of an already-agricultural listing must not clobber "
                        + "its AGRICULTURAL family stamp")
                .isEqualTo("AGRICULTURAL");
    }

    @Test
    @DisplayName("#2038 T9: create path — createDraft with amenities=[...] and "
            + "commercialFields.utilities=[] in the SAME call — must persist EXACTLY the amenity codes")
    void t9_createDraft_residentialAmenitiesWithEmptyUtilitiesSameCall_mustPersistExactSet() {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, 1, "EAST", null, new BigDecimal("1200"), "sqft", null, null,
                1, 1, null, null, null, null, null, null, "Sunrise Residency", "ABC Builders", null,
                true, true, true, null, null, null, null,
                null, null, null, null, null, null,
                true, null, null, null,
                /* amenities */ SEED_AMENITY_CODES, List.of(), List.of());
        CommercialListingFields commercialFields = new CommercialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ List.of(),
                /* utilities */ List.of());

        Listing draft = crudService.createDraft(
                OWNER_ID, "apartment", "T9 apartment", "Manipal",
                new BigDecimal("6500000"), "Spacious 2BHK apartment close to college",
                /* landArea */ null, /* bedrooms */ 2, /* builtArea */ new BigDecimal("1150"),
                /* landAreaUnit */ null, /* builtAreaUnit */ "sqft", /* videoUrl */ null,
                /* listingPurpose */ "sale",
                /* carpetArea */ new BigDecimal("1000"), /* carpetAreaUnit */ "sqft",
                /* floorNumber */ 3, /* totalFloors */ 5,
                /* furnishingStatus */ "SEMI_FURNISHED", /* washrooms */ 2, /* parkingCount */ 1,
                /* roadFrontageFt */ null, /* commercialUsage */ null, /* numberOfUnits */ null,
                /* monthlyRent */ null, /* securityDepositMonths */ null, /* lockInMonths */ null,
                /* sellerType */ "dealer",
                /* waterSource */ null, /* soilType */ null, /* roadAccess */ null,
                /* cultivationStatus */ null, /* ownershipType */ null, /* surveyNumber */ null,
                /* landCategory */ null, /* agriConversionStatus */ null,
                /* farmhouseAvailable */ null, /* fencingDone */ null,
                residentialFields, commercialFields);

        UUID id = draft.getId();
        listingRepository.flush();

        assertThat(amenityRows(id))
                .as("AC4: the family gate prevents writeCommercialChildSets from ever running on a "
                        + "newly-created residential apartment, via JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");
    }

    @Test
    @DisplayName("#2038 T10: original regression stays green — residential PUT re-sending an IDENTICAL "
            + "non-empty amenities set TWICE must not throw a 23505 and must persist exactly that set")
    void t10_identicalNonEmptyAmenitiesPutTwice_staysGreenNoUniqueViolation() {
        UUID id = seedDraftApartment("T10 apartment");

        Throwable firstCaptured = null;
        try {
            putWithAmenities(id, SEED_AMENITY_CODES, null);
        } catch (Throwable t) {
            firstCaptured = t;
            logCauseChain("T10 (first PUT)", firstCaptured);
        }
        assertThat(firstCaptured).as("first PUT must not throw").isNull();

        Throwable secondCaptured = null;
        try {
            putWithAmenities(id, SEED_AMENITY_CODES, null);
        } catch (Throwable t) {
            secondCaptured = t;
            logCauseChain("T10 (second, IDENTICAL PUT)", secondCaptured);
        }
        assertThat(secondCaptured)
                .as("#2038 original regression: re-submitting an IDENTICAL non-empty amenities set a "
                        + "second time must not throw a DataIntegrityViolationException (23505 UNIQUE "
                        + "listing_id,code)")
                .isNull();

        assertThat(amenityRows(id))
                .as("AC4: exact set present after the second identical PUT, via JdbcTemplate raw SQL "
                        + "(AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");
    }

    // =========================================================================================
    // PR_REVIEW rework cycle 1 (code-reviewer + security-reviewer BLOCKING finding, T11-T14):
    // R5's original predicate ("switched INTO the other typed family") only fired between
    // RESIDENTIAL and COMMERCIAL. Three property_type values — 'land', 'other',
    // 'agricultural_land' — belong to NEITHER typed set, so a residential/commercial listing
    // switched to one of them satisfied neither original branch: its child rows were never
    // deleted (a REGRESSION vs origin/main, AC4 violation), and switching back later with the
    // relevant multi-select OMITTED (null = "leave untouched") resurrected the stale codes as if
    // freshly re-selected. T11/T11b pin the residential->non-typed cleanup directly (the blocking
    // regression); T12 pins the specific no-resurrection-on-return-leg path the reviewer named;
    // T13 is the commercial mirror; T14 confirms the broadened predicate did NOT start deleting
    // rows on a same-family switch (a false-positive would be its own new regression).
    // =========================================================================================

    @Test
    @DisplayName("#2038 T11 (PR_REVIEW rework cycle 1, blocking regression): residential -> non-typed "
            + "family (land) — PUT changing propertyType apartment -> land with amenities=[] must delete "
            + "ALL THREE residential child-set tables, not leave them orphaned")
    void t11_residentialToLand_deletesAllThreeResidentialChildSets() {
        UUID id = seedApartmentWithAmenities("T11 land apartment", SEED_AMENITY_CODES);
        jdbcTemplate.update(
                "INSERT INTO public.listing_location_features (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "SEA_VIEW");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "FAMILY");

        assertThat(amenityRows(id)).hasSize(3);
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id)).hasSize(1);
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id)).hasSize(1);

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities */ List.of(), null, null);

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "land", "Now a plain land listing", "Manipal",
                    new BigDecimal("2000000"), "Switched from apartment to land",
                    new BigDecimal("2"), null, null,
                    true, 13.3494, 74.7864,
                    "acres", null,
                    null, false,
                    null,
                    "sale",
                    null, null,
                    null, null,
                    null, null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T11 (residential -> land)", captured);
        }
        assertThat(captured).as("#2038 T11: switching residential -> land must not throw").isNull();

        assertThat(amenityRows(id))
                .as("T11 (AC4, blocking regression): switching OUT of the residential family to a "
                        + "non-typed property type (land) must delete listing_amenities, not leave it "
                        + "orphaned, via JdbcTemplate raw SQL (AC12)")
                .isEmpty();
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id))
                .as("T11: listing_location_features must be deleted on residential -> land switch")
                .isEmpty();
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id))
                .as("T11: listing_preferred_tenants must be deleted on residential -> land switch")
                .isEmpty();
    }

    @Test
    @DisplayName("#2038 T11b (sibling case, both untyped values the reviewer named): residential -> "
            + "non-typed family (agricultural_land) — same blocking regression as T11")
    void t11b_residentialToAgriculturalLand_deletesAllThreeResidentialChildSets() {
        UUID id = seedApartmentWithAmenities("T11b agri apartment", SEED_AMENITY_CODES);
        jdbcTemplate.update(
                "INSERT INTO public.listing_location_features (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "SEA_VIEW");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "FAMILY");

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities */ List.of(), null, null);

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "agricultural_land", "Now an agricultural land listing", "Manipal",
                    new BigDecimal("2000000"), "Switched from apartment to agricultural_land",
                    new BigDecimal("2"), null, null,
                    true, 13.3494, 74.7864,
                    "acres", null,
                    null, false,
                    null,
                    "sale",
                    null, null,
                    null, null,
                    null, null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T11b (residential -> agricultural_land)", captured);
        }
        assertThat(captured)
                .as("#2038 T11b: switching residential -> agricultural_land must not throw")
                .isNull();

        assertThat(amenityRows(id)).as("T11b: listing_amenities must be deleted").isEmpty();
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id))
                .as("T11b: listing_location_features must be deleted")
                .isEmpty();
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id))
                .as("T11b: listing_preferred_tenants must be deleted")
                .isEmpty();
    }

    @Test
    @DisplayName("#2038 T12 (no resurrection on the return leg — the specific reviewer-flagged path): "
            + "residential -> land -> back to residential with amenities OMITTED (null) must NOT "
            + "resurrect the pre-land amenities")
    void t12_landBackToResidentialWithAmenitiesOmitted_noResurrectionOfStaleCodes() {
        UUID id = seedApartmentWithAmenities("T12 apartment", SEED_AMENITY_CODES);
        assertThat(amenityRows(id)).hasSize(3);

        // Leg 1: apartment -> land, amenities=[] (explicit clear, mirrors T11).
        ResidentialListingFields clearFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities */ List.of(), null, null);

        crudService.updateListing(
                id, OWNER_ID, false,
                "land", "Now a plain land listing", "Manipal",
                new BigDecimal("2000000"), "Switched from apartment to land",
                new BigDecimal("2"), null, null,
                true, 13.3494, 74.7864,
                "acres", null,
                null, false,
                null,
                "sale",
                null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null,
                null,
                null, null, null,
                null, null, null,
                null, null, null, null,
                null,
                clearFields, com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        assertThat(amenityRows(id))
                .as("pre-condition: leg 1 (residential -> land) must already have emptied "
                        + "listing_amenities (T11 behaviour)")
                .isEmpty();

        // Leg 2 (the specific reviewer-flagged path): land -> apartment, amenities OMITTED (null =
        // "not supplied, leave untouched"). A naive fix that only broadens the outbound predicate
        // but skips the return leg still passes T11 while failing here: if the earlier delete had
        // been skipped, the old codes would reappear as if freshly re-selected by the broker.
        ResidentialListingFields returnFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities OMITTED */ null, null, null);

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "apartment", "Back to apartment", "Manipal",
                    new BigDecimal("6500000"), "Switched back from land to apartment",
                    null, 2, new BigDecimal("1150"),
                    true, 13.3494, 74.7864,
                    null, "sqft",
                    null, false,
                    null,
                    "sale",
                    null, null,
                    null, null,
                    null, null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    returnFields, com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T12 (land -> apartment, amenities omitted)", captured);
        }
        assertThat(captured)
                .as("#2038 T12: switching land -> apartment with amenities omitted must not throw")
                .isNull();

        assertThat(amenityRows(id))
                .as("T12 (blocking regression, no-resurrection): listing_amenities must STILL be empty "
                        + "— no stale pre-land codes may reappear just because this PUT omitted "
                        + "amenities, via JdbcTemplate raw SQL (AC12)")
                .isEmpty();
    }

    /**
     * Seeds a COMMERCIAL-family listing via the REAL {@link ListingCrudService#createDraft} path with
     * BOTH a non-empty utilities list (shared {@code listing_amenities} table) and a non-empty
     * suitableUses list, so T13 has genuine pre-existing rows in both tables before its PUT. Additive
     * sibling of {@link #seedCommercialWithSuitableUses(String, List)}, which only seeds suitableUses.
     */
    private UUID seedCommercialWithUtilitiesAndSuitableUses(
            String title, List<String> utilities, List<String> suitableUseCodes) {
        com.example.realestate.listing.commercial.CommercialListingFields commercialFields =
                new com.example.realestate.listing.commercial.CommercialListingFields(
                        "SHOP", null, null, null, null, null, null, null, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null, null, null, null,
                        /* suitableUses */ suitableUseCodes,
                        /* utilities */ utilities);

        Listing draft = crudService.createDraft(
                OWNER_ID, "commercial", title, "Manipal",
                new BigDecimal("9000000"), "Commercial space near market",
                /* landArea */ null, /* bedrooms */ null, /* builtArea */ new BigDecimal("2000"),
                /* landAreaUnit */ null, /* builtAreaUnit */ "sqft", /* videoUrl */ null,
                /* listingPurpose */ "sale",
                /* carpetArea */ null, /* carpetAreaUnit */ null,
                /* floorNumber */ 1, /* totalFloors */ 3,
                /* furnishingStatus */ "UNFURNISHED", /* washrooms */ null, /* parkingCount */ null,
                /* roadFrontageFt */ null, /* commercialUsage */ null, /* numberOfUnits */ null,
                /* monthlyRent */ null, /* securityDepositMonths */ null, /* lockInMonths */ null,
                /* sellerType */ "dealer",
                /* waterSource */ null, /* soilType */ null, /* roadAccess */ null,
                /* cultivationStatus */ null, /* ownershipType */ null, /* surveyNumber */ null,
                /* landCategory */ null, /* agriConversionStatus */ null,
                /* farmhouseAvailable */ null, /* fencingDone */ null,
                com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                commercialFields);

        UUID id = draft.getId();
        listingRepository.flush();
        seedImages(id, 3);
        return id;
    }

    @Test
    @DisplayName("#2038 T13 (commercial mirror of T11): commercial -> non-typed family (land) — PUT "
            + "changing propertyType commercial -> land with utilities=[] must delete BOTH "
            + "listing_amenities and listing_suitable_uses, not leave them orphaned")
    void t13_commercialToLand_deletesAmenitiesAndSuitableUses() {
        UUID id = seedCommercialWithUtilitiesAndSuitableUses(
                "T13 commercial", List.of("CCTV", "INTERNET"), SEED_SUITABLE_USE_CODES);

        assertThat(amenityRows(id)).hasSize(2);
        assertThat(suitableUseRows(id)).hasSize(2);

        CommercialListingFields commercialFields = new CommercialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                /* suitableUses */ List.of(), /* utilities */ List.of());

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "land", "Now a plain land listing", "Manipal",
                    new BigDecimal("2000000"), "Switched from commercial to land",
                    new BigDecimal("2"), null, null,
                    true, 13.3494, 74.7864,
                    "acres", null,
                    null, false,
                    null,
                    "sale",
                    null, null,
                    null, null,
                    null, null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    com.example.realestate.listing.residential.ResidentialListingFields.EMPTY,
                    commercialFields);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T13 (commercial -> land)", captured);
        }
        assertThat(captured).as("#2038 T13: switching commercial -> land must not throw").isNull();

        assertThat(amenityRows(id))
                .as("T13 (AC4, blocking regression, commercial mirror): switching OUT of the commercial "
                        + "family to a non-typed property type (land) must delete listing_amenities "
                        + "(shared utilities table), via JdbcTemplate raw SQL (AC12)")
                .isEmpty();
        assertThat(suitableUseRows(id))
                .as("T13: listing_suitable_uses must be deleted on commercial -> land switch")
                .isEmpty();
    }

    @Test
    @DisplayName("#2038 T14 (same-family no-op confirmation): apartment -> villa (both RESIDENTIAL "
            + "family) with amenities OMITTED must NOT trigger R5 cleanup — pre-existing child-set rows "
            + "must survive untouched")
    void t14_sameFamilySwitchApartmentToVilla_doesNotTriggerR5Cleanup() {
        UUID id = seedApartmentWithAmenities("T14 apartment", SEED_AMENITY_CODES);
        jdbcTemplate.update(
                "INSERT INTO public.listing_location_features (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "SEA_VIEW");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "FAMILY");

        assertThat(amenityRows(id)).hasSize(3);

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                /* amenities OMITTED (leave untouched) */ null, null, null);

        Throwable captured = null;
        try {
            crudService.updateListing(
                    id, OWNER_ID, false,
                    "villa", "Now a villa (same residential family)", "Manipal",
                    new BigDecimal("7500000"), "Switched from apartment to villa, same family",
                    null, 2, new BigDecimal("1150"),
                    true, 13.3494, 74.7864,
                    null, "sqft",
                    null, false,
                    null,
                    "sale",
                    null, null,
                    null, null,
                    null, null, null,
                    null, null, null,
                    null, null, null,
                    null, null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);
        } catch (Throwable t) {
            captured = t;
            logCauseChain("T14 (apartment -> villa, same family)", captured);
        }
        assertThat(captured).as("#2038 T14: same-family propertyType switch must not throw").isNull();

        assertThat(amenityRows(id))
                .as("T14: same-family switch (apartment -> villa) must NOT trigger R5 cleanup; "
                        + "pre-existing listing_amenities rows must survive untouched since amenities "
                        + "was omitted, via JdbcTemplate raw SQL (AC12)")
                .extracting(row -> row.get("code"))
                .containsExactly("GATED_SECURITY", "LIFT", "POWER_BACKUP");
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ?", id))
                .as("T14: listing_location_features must survive a same-family switch")
                .hasSize(1);
        assertThat(jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ?", id))
                .as("T14: listing_preferred_tenants must survive a same-family switch")
                .hasSize(1);
    }

    // =========================================================================================
    // AC6 (Stage B, cycle 2): transaction-rollback completeness. The original UNIQUE-constraint
    // collision no longer occurs (that's the whole point of the fix), so a genuine in-transaction
    // failure has to be forced by some OTHER means to prove the bulk delete — which, per its own
    // javadoc, executes IMMEDIATELY against the database rather than being queued — still
    // participates correctly in rollback. The mechanism chosen here: badgeInvalidationService is
    // an already-mocked, already-peripheral collaborator (see class javadoc) called by
    // updateListing AFTER writeResidentialChildSets/writeCommercialChildSets,
    // refreshTypedProjections, updateBoundary, and the search-outbox write — i.e. genuinely late
    // in the SAME @Transactional boundary, with real mutation already applied ahead of it. Arming
    // it to throw is a test-only change (no production code touched) and forces a real failure
    // deep inside the transaction, exactly matching AC6's "failure occurring after mutation
    // begins" wording.
    //
    // To prove an ACTUAL rollback (not merely "we haven't committed yet so the DB still shows
    // whatever state happens to exist"), this test method is annotated
    // @Transactional(propagation = NOT_SUPPORTED). That suspends the Spring-test-framework's
    // default outer transaction (the one @DataJpaTest normally wraps every test method in and
    // rolls back at teardown), so updateListing's own @Transactional is the ONLY transaction
    // boundary in play. Its commit/rollback is therefore a REAL commit/rollback against the
    // Testcontainers Postgres instance, and every assertion below runs in a brand-new
    // connection/transaction reading genuinely-persisted (i.e. genuinely-reverted) state — not a
    // read-your-own-uncommitted-write artifact of a still-open outer transaction.
    // =========================================================================================

    @Test
    @DisplayName("#2038 AC6: a genuine failure AFTER child-set mutation begins (badge invalidation "
            + "collaborator throws), inside the SAME @Transactional boundary, rolls back completely — "
            + "no partial child-set state, no partial listing state transition, no duplicate listing "
            + "or dependent record")
    @org.springframework.transaction.annotation.Transactional(
            propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void updateListing_failureAfterChildSetMutationBegins_rollsBackCompletely() {
        UUID id = seedApartmentWithAmenities("AC6 rollback apartment", SEED_AMENITY_CODES);

        // Seed pre-existing listing_location_features / listing_preferred_tenants rows too (via
        // raw JDBC, mirroring variant4's technique) so ALL FOUR child-set tables named in AC6
        // have genuine pre-existing state to verify rollback against, not just listing_amenities.
        jdbcTemplate.update(
                "INSERT INTO public.listing_location_features (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "SEA_VIEW");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (id, listing_id, code, created_at) "
                        + "VALUES (?, ?, ?, now())",
                UUID.randomUUID(), id, "FAMILY");

        List<Map<String, Object>> amenitiesBefore = amenityRows(id);
        List<Map<String, Object>> lfBefore = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ? ORDER BY code", id);
        List<Map<String, Object>> ptBefore = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ? ORDER BY code", id);
        List<Map<String, Object>> listingRowBefore = jdbcTemplate.queryForList(
                "SELECT status, title, updated_at FROM public.property_listings WHERE id = ?", id);
        long listingCountBefore = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE id = ?", Long.class, id);

        assertThat(amenitiesBefore)
                .as("pre-condition: real pre-existing listing_amenities rows before the failing update")
                .hasSize(3);
        assertThat(lfBefore).as("pre-condition: real pre-existing listing_location_features row").hasSize(1);
        assertThat(ptBefore).as("pre-condition: real pre-existing listing_preferred_tenants row").hasSize(1);
        assertThat(listingRowBefore).as("pre-condition: exactly one listing row exists").hasSize(1);

        // Arm the Spring-managed AC6 badge-invalidation mock to throw — this is the in-transaction
        // failure point, occurring well AFTER writeResidentialChildSets / writeCommercialChildSets /
        // refreshTypedProjections / the search-outbox write have all already run inside this same
        // (real, Spring-managed) transaction.
        org.mockito.Mockito.doThrow(new RuntimeException("AC6 forced failure: badge invalidation collaborator"))
                .when(ac6BadgeInvalidationService)
                .invalidateOnEdit(org.mockito.ArgumentMatchers.eq(id),
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());

        // Different (disjoint) amenities/location-feature/preferred-tenant codes from the seeded
        // ones, so the child-set REPLACE writes genuinely delete-then-insert real rows ahead of
        // the forced failure — not a same-value no-op.
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, 1, "EAST", null, new BigDecimal("1200"), "sqft", null, null,
                1, 1, null, null, null, null, null, null, "Sunrise Residency", "ABC Builders", null,
                true, true, true, null, null, null, null,
                null, null, null, null, null, null,
                true, null, null, null,
                /* amenities */ List.of("POWER_BACKUP"),
                /* specialLocationViews */ List.of("SEA_VIEW"),
                /* preferredTenants */ List.of("FAMILY"));

        Throwable captured = null;
        try {
            ac6CrudService.updateListing(
                    id, OWNER_ID, false,
                    "apartment", "AC6 rollback apartment (MUST NOT PERSIST)", "Manipal",
                    new BigDecimal("7000000"), "This title/price change must roll back entirely",
                    null, 2, new BigDecimal("1150"),
                    true, 13.3494, 74.7864,
                    null, "sqft",
                    null, false,
                    null,
                    "sale",
                    new BigDecimal("1000"), "sqft",
                    3, 5,
                    "SEMI_FURNISHED", 2, 1,
                    null, null, null,
                    null, null, null,
                    "READY_TO_MOVE", null,
                    null,
                    null, null, null,
                    null, null, null,
                    null, null, null, null,
                    null,
                    residentialFields, CommercialListingFields.EMPTY);
        } catch (Throwable t) {
            captured = t;
        }

        assertThat(captured)
                .as("the forced badge-invalidation failure must propagate out of updateListing, not be "
                        + "swallowed")
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("AC6 forced failure");

        // Post-rollback verification. Because this test method runs with
        // propagation = NOT_SUPPORTED, updateListing's own @Transactional was the only real
        // transaction boundary; its rollback (triggered by the forced RuntimeException
        // propagating out of an @Transactional method) is a genuine database ROLLBACK. These
        // reads run in fresh connections/transactions against the Testcontainers Postgres
        // instance, so they observe truly-persisted (i.e. truly-reverted) state.
        List<Map<String, Object>> amenitiesAfter = amenityRows(id);
        List<Map<String, Object>> lfAfter = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_location_features WHERE listing_id = ? ORDER BY code", id);
        List<Map<String, Object>> ptAfter = jdbcTemplate.queryForList(
                "SELECT code FROM public.listing_preferred_tenants WHERE listing_id = ? ORDER BY code", id);
        List<Map<String, Object>> listingRowAfter = jdbcTemplate.queryForList(
                "SELECT status, title, updated_at FROM public.property_listings WHERE id = ?", id);
        long listingCountAfter = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE id = ?", Long.class, id);

        assertThat(amenitiesAfter)
                .as("AC6: no partial child-set state on listing_amenities — the bulk delete executes "
                        + "immediately against the DB but must still be undone by the rollback, exactly "
                        + "as it was before this attempted update")
                .isEqualTo(amenitiesBefore);
        assertThat(lfAfter)
                .as("AC6: no partial child-set state on listing_location_features")
                .isEqualTo(lfBefore);
        assertThat(ptAfter)
                .as("AC6: no partial child-set state on listing_preferred_tenants")
                .isEqualTo(ptBefore);
        assertThat(listingRowAfter)
                .as("AC6: no partial listing state transition — status/title/updated_at exactly as "
                        + "before the failed attempt (title must NOT read 'MUST NOT PERSIST')")
                .isEqualTo(listingRowBefore);
        assertThat(listingCountAfter)
                .as("AC6: no duplicate listing row created by the failed update")
                .isEqualTo(listingCountBefore);
    }

    /**
     * AC6 (Stage B, cycle 2) test-only support configuration. Provides a genuinely Spring-managed
     * {@link ListingCrudService} bean — proxied by Spring's transactional AOP interceptor, unlike
     * the manually-{@code new}'d instance every other test in this class uses — plus mock beans
     * for its peripheral collaborators. The repositories themselves are NOT redefined here; the
     * {@code @Bean} factory method below receives the SAME real, Testcontainers-backed repository
     * beans already present in the enclosing {@code @DataJpaTest} context via parameter injection.
     */
    @org.springframework.boot.test.context.TestConfiguration
    static class Ac6TransactionalConfig {

        @org.springframework.context.annotation.Bean
        ApplicationEventPublisher ac6EventPublisher() {
            return mock(ApplicationEventPublisher.class);
        }

        @org.springframework.context.annotation.Bean
        ListingDeduplicationService ac6DedupService() {
            return mock(ListingDeduplicationService.class);
        }

        @org.springframework.context.annotation.Bean
        BadgeInvalidationService ac6BadgeInvalidationService() {
            return mock(BadgeInvalidationService.class);
        }

        @org.springframework.context.annotation.Bean
        SearchOutboxWriter ac6SearchOutboxWriter() {
            return mock(SearchOutboxWriter.class);
        }

        @org.springframework.context.annotation.Bean
        QualityRecomputeService ac6QualityRecomputeService() {
            return mock(QualityRecomputeService.class);
        }

        @org.springframework.context.annotation.Bean
        PolygonBoundaryValidator ac6PolygonBoundaryValidator(ListingRepository listingRepository) {
            return new PolygonBoundaryValidator(listingRepository, new ObjectMapper());
        }

        @org.springframework.context.annotation.Bean
        ListingOwnershipGuard ac6OwnershipGuard(ListingRepository listingRepository) {
            return new ListingOwnershipGuard(listingRepository);
        }

        @org.springframework.context.annotation.Bean
        ListingCrudService ac6ListingCrudService(
                ListingRepository listingRepository,
                ApplicationEventPublisher ac6EventPublisher,
                ListingOwnershipGuard ac6OwnershipGuard,
                ListingDeduplicationService ac6DedupService,
                PriceChangeLogRepository priceChangeLogRepository,
                BadgeInvalidationService ac6BadgeInvalidationService,
                SearchOutboxWriter ac6SearchOutboxWriter,
                PolygonBoundaryValidator ac6PolygonBoundaryValidator,
                QualityRecomputeService ac6QualityRecomputeService,
                ListingAmenityRepository listingAmenityRepository,
                ListingLocationFeatureRepository listingLocationFeatureRepository,
                ListingPreferredTenantRepository listingPreferredTenantRepository,
                ListingSuitableUseRepository listingSuitableUseRepository,
                CommercialSpaceDetailRepository commercialSpaceDetailRepository,
                ResidentialUnitDetailRepository residentialUnitDetailRepository) {
            return new ListingCrudService(
                    listingRepository, ac6EventPublisher, ac6OwnershipGuard, ac6DedupService,
                    priceChangeLogRepository, ac6BadgeInvalidationService, ac6SearchOutboxWriter,
                    ac6PolygonBoundaryValidator, ac6QualityRecomputeService,
                    listingAmenityRepository, listingLocationFeatureRepository,
                    listingPreferredTenantRepository, listingSuitableUseRepository,
                    commercialSpaceDetailRepository, residentialUnitDetailRepository);
        }
    }
}
