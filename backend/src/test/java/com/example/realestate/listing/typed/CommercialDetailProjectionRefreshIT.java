package com.example.realestate.listing.typed;

import com.example.realestate.listing.commercial.CommercialListingFields;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
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
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.indexer.ListingIndexDocument;
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
 * Real-write-path seeded-data proof for #1734: creating/updating a typed listing refreshes
 * its {@code listing_commercial_space_details} / {@code listing_residential_unit_details}
 * projection row in the SAME transaction as the {@code property_listings} write, through
 * {@link ListingCrudService} against a real PostgreSQL/PostGIS container.
 *
 * <p><b>Level chosen — service layer over {@code @DataJpaTest}, mirroring
 * {@code CommercialTypedWritePathIT} (#1730).</b> {@link ListingCrudService} is constructed
 * directly with the REAL {@link CommercialSpaceDetailRepository} and
 * {@link ResidentialUnitDetailRepository} beans (the subject of this proof) so the actual
 * native upsert/delete queries run against Postgres; peripheral collaborators irrelevant to
 * the projection refresh (dedupe, search outbox, badge invalidation, quality recompute,
 * boundary validation, events) are mocked.
 *
 * <p>Per [[seeded-data-correctness-over-mocked]]: every assertion reads back values THROUGH
 * the real write path (repository {@code findById}) — never a direct INSERT of the expected
 * row, except where a test explicitly documents it is simulating a pre-existing/stale DB
 * state that predates this write path.
 *
 * <p>Coverage AC matrix (#1734):
 * <ul>
 *   <li>AC1: create commercial → projection row present with all V102-mirrored columns.</li>
 *   <li>AC2: update commercial → projection row refreshed; a second identical update
 *       converges idempotently (no duplicate row, no error).</li>
 *   <li>AC3: commercial_subtype switch within COMMERCIAL family → single row overwritten
 *       in place (never a second row).</li>
 *   <li>AC3: family switch COMMERCIAL → RESIDENTIAL → stale commercial row deleted,
 *       residential row created.</li>
 *   <li>AC4: V102 parity for the flat columns (floor_number, total_floors, furnishing_status,
 *       washrooms, parking_count, road_frontage_ft, commercial_usage) — sourced from the
 *       legacy columns, not the V104 split columns. {@code commercial_subtype} is a
 *       DELIBERATE, DOCUMENTED EXCEPTION to V102 parity: V102's backfill hardcodes it to
 *       {@code NULL} (ambiguous legacy data), but populating it for real is the entire point
 *       of #1734, so it is sourced from the listing's V104/#1730 {@code commercialSubtype}
 *       field instead. See {@link CommercialSpaceDetailRepository#upsertFromListing}.</li>
 *   <li>AC5: commercial_subtype may be null (legacy 'commercial', no subtype ever supplied
 *       through the write path) — upsert tolerates it, matching the V102 backfill-NULL state
 *       for rows that are never subsequently edited.</li>
 *   <li>Repository-level: {@code DO UPDATE} overwrites a previously non-null column with
 *       {@code null} — proves no {@code COALESCE} is silently preserving stale values.</li>
 *   <li>AC7: the poller's read path ({@link ListingIndexDocument#fromListing}) sees the
 *       refreshed values immediately after create (not null).</li>
 *   <li>Residential create — identical projection refresh for {@code listing_residential_unit_details}.</li>
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
class CommercialDetailProjectionRefreshIT {

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
    private CommercialSpaceDetailRepository commercialSpaceDetailRepository;

    @Autowired
    private ResidentialUnitDetailRepository residentialUnitDetailRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final UUID OWNER_ID = UUID.randomUUID();

    private ListingCrudService crudService;

    @BeforeEach
    void setUp() {
        ListingOwnershipGuard ownershipGuard = new ListingOwnershipGuard(listingRepository);
        PolygonBoundaryValidator validator =
                new PolygonBoundaryValidator(listingRepository, new ObjectMapper());

        // Peripheral collaborators irrelevant to the projection-refresh write path — mocked.
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        ListingDeduplicationService dedup = mock(ListingDeduplicationService.class);
        BadgeInvalidationService badge = mock(BadgeInvalidationService.class);
        SearchOutboxWriter outbox = mock(SearchOutboxWriter.class);
        QualityRecomputeService qualityRecompute = mock(QualityRecomputeService.class);

        crudService = new ListingCrudService(
                listingRepository, events, ownershipGuard, dedup,
                priceChangeLogRepository, badge, outbox, validator,
                qualityRecompute, listingAmenityRepository, listingLocationFeatureRepository,
                listingPreferredTenantRepository, listingSuitableUseRepository,
                commercialSpaceDetailRepository, residentialUnitDetailRepository);
    }

    private CommercialListingFields shopFields(String commercialSubtype) {
        return new CommercialListingFields(
                commercialSubtype, null, null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null, null, null,
                null, null, null,
                null, null,
                null, null,
                null, null, null,
                null, null);
    }

    @Test
    @DisplayName("AC1: create commercial listing — projection row present with all V102-mirrored columns")
    void createCommercialListing_upsertsProjectionRow_matchesV102Columns() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Shop near market", "Udupi",
                new BigDecimal("2000000"), "Retail shop", null, null, null, null, null, null,
                null, null, null, 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), "RETAIL",
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, shopFields("SHOP"));

        CommercialSpaceDetail detail = commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow();
        assertThat(detail.getCommercialSubtype()).isEqualTo("SHOP");
        assertThat(detail.getFloorNumber()).isEqualTo(1);
        assertThat(detail.getTotalFloors()).isEqualTo(3);
        assertThat(detail.getFurnishingStatus()).isEqualTo("FURNISHED");
        assertThat(detail.getWashrooms()).isEqualTo(2);
        assertThat(detail.getParkingCount()).isEqualTo(1);
        assertThat(detail.getRoadFrontageFt()).isEqualByComparingTo("30");
        assertThat(detail.getCommercialUsage()).isEqualTo("RETAIL");

        assertThat(residentialUnitDetailRepository.findById(saved.getId())).isEmpty();
    }

    @Test
    @DisplayName("AC2: update commercial listing — projection row refreshed; retry converges idempotently")
    void updateCommercialListing_refreshesProjectionRow_idempotentConvergence() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Shop", "Udupi",
                new BigDecimal("2000000"), "Retail shop", null, null, null, null, null, null,
                null, null, null, 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), "RETAIL",
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, shopFields("SHOP"));

        // Update: change furnishingStatus and washrooms.
        crudService.updateListing(
                saved.getId(), OWNER_ID, false,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                "SEMI_FURNISHED", 3, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        CommercialSpaceDetail afterUpdate =
                commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterUpdate.getFurnishingStatus()).isEqualTo("SEMI_FURNISHED");
        assertThat(afterUpdate.getWashrooms()).isEqualTo(3);
        // Unrelated columns untouched by this PUT survive.
        assertThat(afterUpdate.getCommercialSubtype()).isEqualTo("SHOP");

        // Retry: identical PUT — must converge without error or a duplicate row.
        crudService.updateListing(
                saved.getId(), OWNER_ID, false,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                "SEMI_FURNISHED", 3, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        assertThat(commercialSpaceDetailRepository.findAll().stream()
                .filter(d -> d.getListingId().equals(saved.getId())).count())
                .as("retry must not create a second row")
                .isEqualTo(1);
        CommercialSpaceDetail afterRetry =
                commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow();
        assertThat(afterRetry.getFurnishingStatus()).isEqualTo("SEMI_FURNISHED");
        assertThat(afterRetry.getWashrooms()).isEqualTo(3);
    }

    @Test
    @DisplayName("AC3: commercial_subtype switch within COMMERCIAL — single row overwritten in place")
    void subtypeSwitchWithinCommercial_singleRowOverwrittenInPlace() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "warehouse", "WH A", "Udupi",
                new BigDecimal("8000000"), "Warehouse", null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, shopFields("WAREHOUSE"));

        assertThat(commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow()
                .getCommercialSubtype()).isEqualTo("WAREHOUSE");

        crudService.updateListing(
                saved.getId(), OWNER_ID, false,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                ResidentialListingFields.EMPTY, shopFields("OFFICE"));

        assertThat(commercialSpaceDetailRepository.findAll().stream()
                .filter(d -> d.getListingId().equals(saved.getId())).count())
                .as("subtype switch must overwrite the single existing row, never add a second one")
                .isEqualTo(1);
        assertThat(commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow()
                .getCommercialSubtype()).isEqualTo("OFFICE");
    }

    @Test
    @DisplayName("Family switch COMMERCIAL -> RESIDENTIAL: stale commercial row deleted, residential row created")
    void familySwitchCommercialToResidential_deletesStaleCommercialRow_createsResidentialRow() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Shop", "Udupi",
                new BigDecimal("2000000"), "Retail shop", null, null, null, null, null, null,
                null, null, null, 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), "RETAIL",
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, shopFields("SHOP"));

        assertThat(commercialSpaceDetailRepository.findById(saved.getId())).isPresent();

        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null);

        crudService.updateListing(
                saved.getId(), OWNER_ID, false,
                "apartment", null, null,
                null, null,
                null, 3, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                2, 10,
                "SEMI_FURNISHED", null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                residentialFields, CommercialListingFields.EMPTY);

        assertThat(commercialSpaceDetailRepository.findById(saved.getId()))
                .as("stale commercial projection row must be deleted on family switch")
                .isEmpty();

        ResidentialUnitDetail residential =
                residentialUnitDetailRepository.findById(saved.getId()).orElseThrow();
        assertThat(residential.getFloorNumber()).isEqualTo(2);
        assertThat(residential.getTotalFloors()).isEqualTo(10);
        assertThat(residential.getFurnishingStatus()).isEqualTo("SEMI_FURNISHED");
    }

    /**
     * Documents the intentional {@code commercial_subtype} / V102-parity exception (cycle-2
     * fix): every OTHER column upserted here mirrors the V102 backfill's legacy-flat-column
     * source. {@code commercial_subtype} does NOT — V102 hardcodes it to {@code NULL}, but this
     * write path intentionally sources it from the listing's V104/#1730 {@code commercialSubtype}
     * field instead (populating it for real is the whole point of #1734). This test proves the
     * "never supplied" half of that contract: when the caller supplies no subtype (matching the
     * pre-#1730 legacy state), the upsert still stores {@code NULL} rather than fabricating one —
     * see {@link #createCommercialListing_upsertsProjectionRow_matchesV102Columns()} for the
     * contrasting case where a real subtype IS supplied and IS stored.
     */
    @Test
    @DisplayName("AC5: commercial_subtype null (legacy 'commercial', no subtype supplied) — upsert tolerates and "
            + "stores null (V104 field absent; NOT a V102-backfill-SELECT mirror for this one column)")
    void legacyNullCommercialSubtype_upsertToleratesNull_matchesV102Parity() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Legacy shop", "Udupi",
                new BigDecimal("1000000"), "Legacy retail shop", null, null, null, null, null, null,
                null, null, null, 1, 2, "UNFURNISHED", 1, 1, new BigDecimal("20"), "RETAIL",
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        CommercialSpaceDetail detail = commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow();
        assertThat(detail.getCommercialSubtype())
                .as("no subtype supplied through the write path -> stored as null, matching the "
                        + "V102 backfill-NULL state for never-edited legacy rows")
                .isNull();
        assertThat(detail.getFurnishingStatus()).isEqualTo("UNFURNISHED");
        assertThat(detail.getCommercialUsage()).isEqualTo("RETAIL");
    }

    @Test
    @DisplayName("Repository level: DO UPDATE overwrites a previously non-null column with null — no COALESCE")
    void repositoryUpsert_overwritesNonNullWithNull_noCoalesce() {
        UUID listingId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, created_at, updated_at, property_type, created_by, status, title, price) "
                        + "VALUES (?, now(), now(), 'commercial', ?, 'DRAFT', 'Raw row', 1000000)",
                listingId, OWNER_ID);

        commercialSpaceDetailRepository.upsertFromListing(
                listingId, "SHOP", 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), "RETAIL");
        CommercialSpaceDetail afterFirstUpsert =
                commercialSpaceDetailRepository.findById(listingId).orElseThrow();
        assertThat(afterFirstUpsert.getCommercialSubtype()).isEqualTo("SHOP");
        assertThat(afterFirstUpsert.getCommercialUsage()).isEqualTo("RETAIL");

        // Second upsert with null commercial_subtype / commercial_usage must clear them —
        // proves the DO UPDATE SET clause has no COALESCE silently preserving old values.
        commercialSpaceDetailRepository.upsertFromListing(
                listingId, null, 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), null);
        CommercialSpaceDetail afterSecondUpsert =
                commercialSpaceDetailRepository.findById(listingId).orElseThrow();
        assertThat(afterSecondUpsert.getCommercialSubtype())
                .as("null must overwrite the previously non-null commercial_subtype")
                .isNull();
        assertThat(afterSecondUpsert.getCommercialUsage())
                .as("null must overwrite the previously non-null commercial_usage")
                .isNull();
        assertThat(afterSecondUpsert.getFloorNumber())
                .as("unrelated column supplied again unchanged must remain correct")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("AC7: poller read path (ListingIndexDocument.fromListing) sees refreshed commercial values, not null")
    void indexDocumentAssembly_seesRefreshedCommercialValues_viaPollerReadPath() {
        Listing saved = crudService.createDraft(
                OWNER_ID, "commercial", "Shop near market", "Udupi",
                new BigDecimal("2000000"), "Retail shop", null, null, null, null, null, null,
                null, null, null, 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), "RETAIL",
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                ResidentialListingFields.EMPTY, shopFields("SHOP"));

        // Mirrors SearchOutboxPoller.processEntry: re-fetch the listing + typed detail via the
        // same repositories, then assemble the index document exactly as the poller does.
        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        CommercialSpaceDetail commercial =
                commercialSpaceDetailRepository.findById(saved.getId()).orElseThrow();

        ListingIndexDocument doc = ListingIndexDocument.fromListing(fromDb, null, commercial, null);

        assertThat(doc.getCommercialSubtype()).isEqualTo("SHOP");
        assertThat(doc.getFloorNumber()).isEqualTo(1);
        assertThat(doc.getTotalFloors()).isEqualTo(3);
        assertThat(doc.getFurnishingStatus()).isEqualTo("FURNISHED");
        assertThat(doc.getWashrooms()).isEqualTo(2);
        assertThat(doc.getParkingCount()).isEqualTo(1);
        assertThat(doc.getRoadFrontageFt()).isEqualByComparingTo("30");
        assertThat(doc.getCommercialUsage()).isEqualTo("RETAIL");
    }

    @Test
    @DisplayName("Residential create — identical projection refresh for listing_residential_unit_details")
    void createResidentialListing_upsertsProjectionRow_matchesV102Columns() {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null);

        Listing saved = crudService.createDraft(
                OWNER_ID, "apartment", "Flat", "Udupi",
                new BigDecimal("3000000"), "Nice flat", null, 3, null, null, null, null,
                null, null, null, 2, 10, "SEMI_FURNISHED", null, null, null, null,
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                residentialFields, CommercialListingFields.EMPTY);

        ResidentialUnitDetail detail =
                residentialUnitDetailRepository.findById(saved.getId()).orElseThrow();
        assertThat(detail.getFloorNumber()).isEqualTo(2);
        assertThat(detail.getTotalFloors()).isEqualTo(10);
        assertThat(detail.getFurnishingStatus()).isEqualTo("SEMI_FURNISHED");

        assertThat(commercialSpaceDetailRepository.findById(saved.getId())).isEmpty();
    }

    @Test
    @DisplayName("Cycle-2 fix: family switch RESIDENTIAL(house) -> land clears the stale listingFamily "
            + "stamp and deletes the residential row; a subsequent no-op update keeps it deleted")
    void familySwitchHouseToLand_clearsStaleFamilyStamp_projectionStaysDeletedOnNoOpUpdate() {
        ResidentialListingFields residentialFields = new ResidentialListingFields(
                2, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null);

        Listing saved = crudService.createDraft(
                OWNER_ID, "house", "Family Home", "Udupi",
                new BigDecimal("5000000"), "Nice house", null, 3, null, null, null, null,
                null, null, null, 1, 2, "FURNISHED", null, null, null, null,
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null,
                residentialFields, CommercialListingFields.EMPTY);

        assertThat(residentialUnitDetailRepository.findById(saved.getId())).isPresent();
        assertThat(listingRepository.findById(saved.getId()).orElseThrow().getListingFamily())
                .isEqualTo("RESIDENTIAL");

        // Switch propertyType to 'land' — matches neither the RESIDENTIAL nor COMMERCIAL typed
        // property-type sets, so listingFamily must be cleared (cycle-2 fix), not left stale.
        crudService.updateListing(
                saved.getId(), OWNER_ID, false,
                "land", null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        assertThat(listingRepository.findById(saved.getId()).orElseThrow().getListingFamily())
                .as("stale RESIDENTIAL stamp must not survive a switch to an untyped property type")
                .isNull();
        assertThat(residentialUnitDetailRepository.findById(saved.getId()))
                .as("residential projection row must be deleted once the listing is no longer RESIDENTIAL")
                .isEmpty();
        assertThat(commercialSpaceDetailRepository.findById(saved.getId())).isEmpty();

        // No-op follow-up update (all fields null/unchanged) — must not resurrect either row nor
        // re-stamp a family, proving the reset is stable across subsequent unrelated edits.
        crudService.updateListing(
                saved.getId(), OWNER_ID, false,
                null, "Family Home (renamed)", null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        assertThat(listingRepository.findById(saved.getId()).orElseThrow().getListingFamily()).isNull();
        assertThat(residentialUnitDetailRepository.findById(saved.getId())).isEmpty();
        assertThat(commercialSpaceDetailRepository.findById(saved.getId())).isEmpty();
    }

    @Test
    @DisplayName("Cycle-3 regression fix: title-only edit of a V102-backfilled AGRICULTURAL listing "
            + "must NOT clear the AGRICULTURAL family stamp")
    void titleOnlyEditOfAgriculturalLandListing_preservesV102BackfilledFamilyStamp() {
        // Seed the row the same way V102's backfill DML wrote it (raw JdbcTemplate INSERT with
        // listing_family='AGRICULTURAL' set directly) — this predates the #1734 write path and
        // is never (re-)stamped by ListingCrudService, which never populates AGRICULTURAL.
        UUID listingId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, created_at, updated_at, property_type, created_by, status, title, "
                        + " price, listing_family) "
                        + "VALUES (?, now(), now(), 'agricultural_land', ?, 'DRAFT', 'Farm plot', "
                        + " 1000000, 'AGRICULTURAL')",
                listingId, OWNER_ID);

        assertThat(listingRepository.findById(listingId).orElseThrow().getListingFamily())
                .isEqualTo("AGRICULTURAL");

        // Ordinary title-only edit: propertyType is NOT supplied (null), so the effective
        // propertyType stays 'agricultural_land' — outside both typed sets. Before the cycle-3
        // gate fix, this alone incorrectly triggered the family reset and nulled the stamp.
        crudService.updateListing(
                listingId, OWNER_ID, false,
                null, "Farm plot — renamed", null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null,
                ResidentialListingFields.EMPTY, CommercialListingFields.EMPTY);

        Listing afterUpdate = listingRepository.findById(listingId).orElseThrow();
        assertThat(afterUpdate.getTitle()).isEqualTo("Farm plot — renamed");
        assertThat(afterUpdate.getListingFamily())
                .as("a pre-existing AGRICULTURAL stamp (from V102 backfill) must survive an "
                        + "unrelated title-only edit — it is not owned/written by this class")
                .isEqualTo("AGRICULTURAL");
    }
}
