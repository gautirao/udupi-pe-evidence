package com.example.realestate.intelligence;

import com.example.realestate.booking.ViewingRequestRepository;
import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test for {@link BrokerAreaInsightsService}.
 *
 * <p>Exercises the real {@code @Query} methods in {@link ListingRepository}
 * and {@link ViewingRequestRepository} against an ephemeral PostGIS Postgres
 * instance with Flyway applying all migrations. Proves AC7, AC12, AC13, and
 * city-aware / needs-attention correctness at the SQL WHERE clause level —
 * mock tests in {@link BrokerAreaInsightsServiceTest} cannot exercise the actual predicates.
 *
 * <h2>Coverage</h2>
 * <ul>
 *   <li>AC12 IDOR — {@code it_idor_brokerA_excludesBrokerB_areaCounts}: seed listings +
 *       viewing_requests for broker A and B in the same area; assert counts are scoped
 *       exclusively to the JWT-derived brokerId.</li>
 *   <li>AC7 scraped-exclusion — {@code it_scrapedExclusion_notCounted}: seed SCRAPED and
 *       raw_post_id-not-null rows; assert neither appears in any broker-visible count.</li>
 *   <li>AC13 suppression — {@code it_suppression_sharedNullVsBrokerTrueZero}: seed a
 *       sub-threshold snapshot; assert SHARED Metric values are null (not 0) while
 *       BROKER-OWN counts are primitive int 0 (true zero).</li>
 *   <li>City-aware — {@code it_cityAware_distinctSnapshotPerCity}: same area_key under two
 *       city_slug values resolves distinct snapshots via composite key.</li>
 *   <li>Needs-attention — {@code it_needsAttention_nullQualityExcluded}: NULL quality_score
 *       rows are unscored and excluded from listingsNeedingAttention.</li>
 * </ul>
 *
 * <h2>Harness notes</h2>
 * <ul>
 *   <li>Mirrors {@link com.example.realestate.broker.demand.BrokerDemandGapStateIT} exactly:
 *       same {@code @DataJpaTest + @Testcontainers + @AutoConfigureTestDatabase(replace=NONE)}
 *       + same Flyway placeholders ({@code flyway.mixed=true}, empty {@code concurrently_keyword}).</li>
 *   <li>NEVER runs against the shared hosted Supabase — Docker-managed ephemeral DB only.</li>
 *   <li>Disabled automatically when Docker is unavailable ({@code disabledWithoutDocker=true}).</li>
 *   <li>{@code viewing_requests.requester_id} references {@code auth.users} (stubbed by
 *       {@code db/test-stubs/beforeMigrate.sql}); a fixed requester UUID is pre-inserted.</li>
 * </ul>
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword="
})
@Import({BrokerAreaInsightsService.class})
class BrokerAreaInsightsIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AreaIntelligenceSnapshotRepository snapshotRepository;

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private ViewingRequestRepository viewingRequestRepository;

    @Autowired
    private BrokerAreaInsightsService service;

    // ── Fixed test identities ────────────────────────────────────────────────

    private static final UUID BROKER_A    = UUID.fromString("aaaaaaaa-1530-0000-0000-000000000001");
    private static final UUID BROKER_B    = UUID.fromString("bbbbbbbb-1530-0000-0000-000000000002");
    /** A fixed auth.users requester seeded in beforeEach for viewing_request FK. */
    private static final UUID REQUESTER   = UUID.fromString("cccccccc-1530-0000-0000-000000000003");

    private static final String MALPE_KEY  = "IN|KA|Udupi|Malpe";
    private static final String MANIPAL_KEY = "IN|KA|Udupi|Manipal";
    private static final String CITY_UDUPI = "udupi";
    /** Second city slug for city-aware test — snapshot only, no FK constraint on city_slug. */
    private static final String CITY_ALT   = "mangalore";

    // ── Setup / teardown ─────────────────────────────────────────────────────

    @BeforeEach
    void cleanTables() {
        // Clean in FK-safe order:
        // viewing_requests → property_listings → raw_posts → feed_runs
        // Also clean snapshot + demand signal tables used by this test.
        jdbcTemplate.update(
                "DELETE FROM viewing_requests WHERE broker_id IN (?, ?)", BROKER_A, BROKER_B);
        // ON DELETE SET NULL for raw_post_id, ON DELETE CASCADE doesn't apply here —
        // we delete listings first so raw_posts rows can be cleaned up safely after.
        jdbcTemplate.update(
                "DELETE FROM property_listings WHERE created_by IN (?, ?)", BROKER_A, BROKER_B);
        jdbcTemplate.update(
                "DELETE FROM area_intelligence_snapshot WHERE area_key IN (?, ?)",
                MALPE_KEY, MANIPAL_KEY);
        jdbcTemplate.update(
                "DELETE FROM area_demand_signal WHERE area_key IN (?, ?)",
                MALPE_KEY, MANIPAL_KEY);
        // Ensure the fixed requester exists in auth.users for viewing_request FK
        jdbcTemplate.update(
                "INSERT INTO auth.users (id) VALUES (?) ON CONFLICT DO NOTHING", REQUESTER);
    }

    // =========================================================================
    // AC12 IDOR: broker A cannot see broker B's counts (and vice versa)
    // =========================================================================

    /**
     * AC12 — IDOR at the SQL layer.
     *
     * <p>Seeds property_listings + viewing_requests for both broker A and broker B
     * in the SAME area_key. Asserts that the service's counts for A include ONLY A's
     * rows and B's counts include ONLY B's rows. Proves that the {@code created_by = :brokerId}
     * and {@code broker_id = :brokerId} WHERE predicates in the {@code @Query} methods
     * actually enforce isolation at the real DB level — a scope widening would cause the
     * wrong count and fail the assertion.
     */
    @Test
    @DisplayName("AC12 IDOR: broker A's area counts include only broker A's rows — broker B's rows excluded at SQL layer")
    void it_idor_brokerA_excludesBrokerB_areaCounts() {
        // Broker A: 3 LIVE listings in MALPE_KEY; 2 with quality < threshold (needs attention)
        insertLiveListing(BROKER_A, MALPE_KEY, null);           // unscored (NULL quality)
        insertLiveListing(BROKER_A, MALPE_KEY, 40);             // below threshold → needs attention
        insertLiveListing(BROKER_A, MALPE_KEY, 40);             // below threshold → needs attention
        // Broker A: 1 LIVE listing used for the viewing_request
        UUID brokerAListing = insertLiveListingReturnId(BROKER_A, MALPE_KEY, 85);
        insertViewingRequest(BROKER_A, brokerAListing);         // 1 enquiry for broker A

        // Broker B: 5 LIVE listings in same MALPE_KEY (only 1 with score below threshold)
        UUID brokerBListing = insertLiveListingReturnId(BROKER_B, MALPE_KEY, 40); // below threshold
        insertLiveListing(BROKER_B, MALPE_KEY, 85);  // above threshold
        insertLiveListing(BROKER_B, MALPE_KEY, 85);
        insertLiveListing(BROKER_B, MALPE_KEY, 85);
        insertLiveListing(BROKER_B, MALPE_KEY, 85);
        // Broker B: 3 enquiries
        insertViewingRequest(BROKER_B, brokerBListing);
        insertViewingRequest(BROKER_B, brokerBListing);
        insertViewingRequest(BROKER_B, brokerBListing);

        // Call service as BROKER_A
        BrokerAreaInsightsResponse responseA = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_A);
        // 4 total LIVE (3 explicit + 1 used for enquiry), 2 needing attention (score=40), 1 enquiry
        assertThat(responseA.broker().liveListingsInArea())
                .as("Broker A's liveListingsInArea must count only A's 4 LIVE listings")
                .isEqualTo(4);
        assertThat(responseA.broker().listingsNeedingAttention())
                .as("Broker A's needsAttention: 2 rows (score=40 < 60); NULL and 85 excluded")
                .isEqualTo(2);
        assertThat(responseA.broker().enquiriesOnBrokerListings())
                .as("Broker A's enquiries must count only A's 1 viewing_request")
                .isEqualTo(1);

        // Call service as BROKER_B — should see B's counts only
        BrokerAreaInsightsResponse responseB = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_B);
        assertThat(responseB.broker().liveListingsInArea())
                .as("Broker B's liveListingsInArea must count only B's 5 LIVE listings")
                .isEqualTo(5);
        assertThat(responseB.broker().listingsNeedingAttention())
                .as("Broker B's needsAttention: 1 row (score=40 < 60)")
                .isEqualTo(1);
        assertThat(responseB.broker().enquiriesOnBrokerListings())
                .as("Broker B's enquiries must count only B's 3 viewing_requests")
                .isEqualTo(3);

        // Cross-isolation: A's and B's counts must differ (distinct populations)
        assertThat(responseA.broker().liveListingsInArea())
                .isNotEqualTo(responseB.broker().liveListingsInArea());
        assertThat(responseA.broker().enquiriesOnBrokerListings())
                .isNotEqualTo(responseB.broker().enquiriesOnBrokerListings());
    }

    // =========================================================================
    // AC7 Scraped-supply exclusion
    // =========================================================================

    /**
     * AC7 — Scraped and raw_post_id-not-null listings must not appear in any broker count.
     *
     * <p>Seeds one {@code status='SCRAPED'} listing and one LIVE listing with
     * {@code raw_post_id IS NOT NULL} owned by broker A. Neither qualifies.
     * Also seeds one genuinely LIVE non-scraped listing (must be counted = 1).
     */
    @Test
    @DisplayName("AC7 scraped-exclusion: status=SCRAPED and raw_post_id NOT NULL listings not counted in any broker-visible field")
    void it_scrapedExclusion_notCounted() {
        // 1 genuinely LIVE, non-scraped listing — the only one that should count
        insertLiveListing(BROKER_A, MALPE_KEY, 85);

        // status='SCRAPED' — must be excluded by status='LIVE' predicate
        insertListingWithStatus(BROKER_A, MALPE_KEY, "SCRAPED", null);

        // LIVE but raw_post_id IS NOT NULL — scraped supply, excluded by raw_post_id IS NULL predicate
        insertListingWithStatus(BROKER_A, MALPE_KEY, "LIVE", UUID.randomUUID());

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_A);

        assertThat(response.broker().liveListingsInArea())
                .as("Only 1 genuine LIVE non-scraped listing; SCRAPED and raw_post_id!=NULL excluded by SQL predicates")
                .isEqualTo(1);
        assertThat(response.broker().listingsNeedingAttention())
                .as("No below-threshold non-null quality rows among the qualifying listing (score=85)")
                .isEqualTo(0);
        assertThat(response.broker().enquiriesOnBrokerListings())
                .as("No viewing_requests seeded — enquiries must be 0")
                .isEqualTo(0);
    }

    // =========================================================================
    // AC13 Suppression: SHARED Metric null vs BROKER-OWN int true-zero
    // =========================================================================

    /**
     * AC13 — Two-tier suppression model at the real-DB layer.
     *
     * <p>Seeds an area_intelligence_snapshot below the k-anonymity threshold
     * ({@code price_comparison_supported=false}) so SHARED area Metric values must be null.
     * The broker has zero LIVE listings, so BROKER-OWN counts must be primitive int 0.
     * Proves these two are handled differently: null (suppressed-shared) vs 0 (true-broker-zero).
     *
     * <p>Also seeds one area_demand_signal with confidence='insufficient_data' (must be
     * excluded) and one with confidence='enough_data' (must be counted) to verify
     * opportunitiesToAct = 1 (signal present, but broker has 0 capturing listings).
     */
    @Test
    @DisplayName("AC13 suppression: sub-threshold SHARED snapshot → Metric.value=null; broker with 0 listings → int 0 (true-zero)")
    void it_suppression_sharedNullVsBrokerTrueZero() {
        // Seed a snapshot that is sub-threshold: active_listing_count=3 < K_ANON_MIN(10)
        // price_comparison_supported=false → median/dominantType suppressed
        insertSnapshot(CITY_UDUPI, MALPE_KEY, "Malpe",
                /* activeListingCount */ 3,
                /* priceComparisonSupported */ false,
                /* confidence */ "insufficient");

        // Seed an area_demand_signal with confidence='insufficient_data' — must be EXCLUDED
        insertDemandSignal(CITY_UDUPI, MALPE_KEY, "apartment", "insufficient_data");

        // Seed a qualifying demand signal — confidence != 'insufficient_data', must be COUNTED
        insertDemandSignal(CITY_UDUPI, MALPE_KEY, "land", "enough_data");

        // Broker A has ZERO live listings in this area — true-zero
        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_A);

        assertThat(response.available())
                .as("Snapshot row exists → available=true (not 404 or available=false)")
                .isTrue();

        // SHARED suppressed metrics: value MUST be null — never 0 or raw sub-threshold count
        assertThat(response.area().medianPricePaise().value())
                .as("Suppressed SHARED median must be null — never 0 or a raw sub-threshold surrogate")
                .isNull();
        assertThat(response.area().dominantPropertyType().value())
                .as("Suppressed SHARED dominant property type must be null")
                .isNull();

        // SHARED count metrics: also suppressed when priceComparisonSupported=false
        assertThat(response.area().activeListingCount().value())
                .as("activeListingCount Metric.value must be null (suppressed), not the raw count 3")
                .isNull();
        assertThat(response.area().activeListingCount().confidenceLabel())
                .as("Suppressed count must carry a non-null confidence label (not null)")
                .isNotNull();

        // BROKER-OWN: primitive int 0 — TRUE ZERO (broker has no live listings here)
        // These must be 0, not null — the two suppression categories are TYPE-DISTINCT
        assertThat(response.broker().liveListingsInArea())
                .as("Broker with no live listings → int 0 (true-zero, NOT suppressed-null)")
                .isEqualTo(0);
        assertThat(response.broker().listingsNeedingAttention())
                .as("True-zero: broker has no listings in the area at all")
                .isEqualTo(0);
        assertThat(response.broker().enquiriesOnBrokerListings())
                .as("True-zero: no viewing_requests for broker in this area")
                .isEqualTo(0);

        // opportunitiesToAct: 1 qualifying signal (enough_data) minus 0 broker live listings = 1
        // The insufficient_data signal must be excluded from the count
        assertThat(response.broker().opportunitiesToAct())
                .as("1 qualifying demand signal (enough_data) minus 0 broker capturing = 1; insufficient_data excluded")
                .isEqualTo(1);
    }

    // =========================================================================
    // City-aware: same area_key under two city_slugs resolves distinct snapshots
    // =========================================================================

    /**
     * City-aware composite-key resolution.
     *
     * <p>Seeds two snapshot rows with the SAME area_key but different city_slug values.
     * Asserts that querying each city slug returns the correct distinct snapshot.
     * Proves the endpoint uses the {@code (city_slug, area_key)} composite key and
     * never string-splits or conflates the two dimensions.
     */
    @Test
    @DisplayName("City-aware: same area_key under two city_slugs resolves distinct snapshots via composite key")
    void it_cityAware_distinctSnapshotPerCity() {
        // Seed snapshot for (udupi, MALPE_KEY) — above threshold, supported
        insertSnapshot(CITY_UDUPI, MALPE_KEY, "Malpe (Udupi)",
                /* activeListingCount */ 25,
                /* priceComparisonSupported */ true,
                /* confidence */ "full");

        // Seed snapshot for (mangalore, MALPE_KEY) — below threshold, suppressed
        insertSnapshot(CITY_ALT, MALPE_KEY, "Malpe (Mangalore)",
                /* activeListingCount */ 5,
                /* priceComparisonSupported */ false,
                /* confidence */ "insufficient");

        BrokerAreaInsightsResponse udupiResponse = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_A);
        BrokerAreaInsightsResponse mangaloreResponse = service.getAreaInsights(CITY_ALT, MALPE_KEY, BROKER_A);

        // Udupi snapshot: 25 listings, supported → activeListingCount visible (not suppressed)
        assertThat(udupiResponse.available()).isTrue();
        assertThat(udupiResponse.area().activeListingCount().value())
                .as("Udupi snapshot (25 listings, supported=true) → activeListingCount=25 (not suppressed)")
                .isEqualTo(25);

        // Mangalore snapshot: 5 listings, not supported → suppressed
        assertThat(mangaloreResponse.available()).isTrue();
        assertThat(mangaloreResponse.area().activeListingCount().value())
                .as("Mangalore snapshot (5 listings, supported=false) → activeListingCount suppressed → null")
                .isNull();

        // The snapshots must be distinct — composite key resolved correctly
        assertThat(udupiResponse.areaLabel())
                .as("Udupi snapshot label must not bleed into mangalore response")
                .isNotEqualTo(mangaloreResponse.areaLabel());
        assertThat(udupiResponse.area().activeListingCount().value())
                .isNotEqualTo(mangaloreResponse.area().activeListingCount().value());
    }

    // =========================================================================
    // Needs-attention: NULL quality_score is unscored and excluded
    // =========================================================================

    /**
     * Needs-attention SQL predicate correctness.
     *
     * <p>Seeds three LIVE listings for broker A:
     * <ol>
     *   <li>quality_score = NULL → unscored; excluded (NOT needs-attention)</li>
     *   <li>quality_score = 40 (below threshold 60) → counted as needs-attention</li>
     *   <li>quality_score = 80 (above threshold 60) → NOT counted</li>
     * </ol>
     * Asserts only the below-threshold non-null listing is counted (result = 1).
     */
    @Test
    @DisplayName("Needs-attention: NULL quality_score (unscored) excluded; only below-threshold non-null counted")
    void it_needsAttention_nullQualityExcluded() {
        // Unscored (NULL quality_score) — must NOT count as needs-attention
        insertLiveListing(BROKER_A, MALPE_KEY, null);

        // Below threshold (40 < 60) — must count as needs-attention
        insertLiveListing(BROKER_A, MALPE_KEY, 40);

        // Above threshold (80 >= 60) — must NOT count as needs-attention
        insertLiveListing(BROKER_A, MALPE_KEY, 80);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_A);

        assertThat(response.broker().liveListingsInArea())
                .as("3 LIVE listings (all non-scraped, non-archived) = liveListingsInArea")
                .isEqualTo(3);

        assertThat(response.broker().listingsNeedingAttention())
                .as("Only 1 listing (score=40) qualifies: NULL excluded (unscored), 80 excluded (above threshold)")
                .isEqualTo(1);
    }

    // =========================================================================
    // No-snapshot path: opportunitiesToAct must be 0 when snapshot is absent
    // =========================================================================

    /**
     * Honesty/consistency guard for the no-snapshot (available=false) path.
     *
     * <p>Seeds qualifying area_demand_signal rows for the area but NO
     * area_intelligence_snapshot row. The service must NOT query demand signals in
     * the absent-snapshot branch — returning a non-zero {@code opportunitiesToAct}
     * while every shared metric reads as unavailable would be inconsistent.
     *
     * <p>Broker-own first-party counts (liveListingsInArea etc.) are still returned
     * because they are independent of the snapshot.
     */
    @Test
    @DisplayName("No-snapshot path: qualifying demand signals present but no snapshot → available=false AND opportunitiesToAct==0")
    void it_noSnapshot_opportunitiesToActIsZero_demandSignalsNotLeaked() {
        // NO area_intelligence_snapshot row for (CITY_UDUPI, MALPE_KEY)
        // Seed qualifying demand signals (confidence != 'insufficient_data') that would produce
        // a non-zero count if the query were allowed to fire on the no-snapshot path.
        insertDemandSignal(CITY_UDUPI, MALPE_KEY, "apartment", "enough_data");
        insertDemandSignal(CITY_UDUPI, MALPE_KEY, "land",      "limited_data");

        // Broker A has 1 live listing (first-party data — must still be returned)
        insertLiveListing(BROKER_A, MALPE_KEY, 85);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, MALPE_KEY, BROKER_A);

        assertThat(response.available())
                .as("No snapshot → available=false")
                .isFalse();

        // opportunitiesToAct must be 0 — shared signal query must NOT fire in the no-snapshot branch
        assertThat(response.broker().opportunitiesToAct())
                .as("opportunitiesToAct must be 0 when no snapshot exists — demand signals must not leak into available=false path")
                .isEqualTo(0);

        // Broker-own first-party counts are still returned (independent of snapshot)
        assertThat(response.broker().liveListingsInArea())
                .as("Broker-own liveListingsInArea still returned on no-snapshot path")
                .isEqualTo(1);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Inserts a LIVE, non-scraped, non-archived, non-duplicate listing for the given broker.
     * {@code qualityScore} may be null (unscored state).
     * No {@code city_slug} column on property_listings — area is identified by area_key.
     */
    private void insertLiveListing(UUID ownerId, String areaKey, Integer qualityScore) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO property_listings "
                + "(id, created_by, area_key, property_type, listing_purpose, status, "
                + " price_paise, quality_score, is_duplicate, is_valid, archived_at, raw_post_id, "
                + " created_at, updated_at) "
                + "VALUES (gen_random_uuid(), ?, ?, 'apartment', 'sale', 'LIVE', "
                + "        50000000, ?, false, true, NULL, NULL, ?, ?)",
                ownerId, areaKey, qualityScore, now, now);
    }

    /**
     * Inserts a LIVE listing and returns its generated UUID for use in viewing_request FK.
     */
    private UUID insertLiveListingReturnId(UUID ownerId, String areaKey, Integer qualityScore) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO property_listings "
                + "(id, created_by, area_key, property_type, listing_purpose, status, "
                + " price_paise, quality_score, is_duplicate, is_valid, archived_at, raw_post_id, "
                + " created_at, updated_at) "
                + "VALUES (?, ?, ?, 'apartment', 'sale', 'LIVE', "
                + "        50000000, ?, false, true, NULL, NULL, ?, ?)",
                id, ownerId, areaKey, qualityScore, now, now);
        return id;
    }

    /**
     * Inserts a listing with the given status and raw_post_id. Used to seed scraped rows.
     * {@code rawPostId} null = genuinely broker-created; non-null = scraped supply.
     *
     * <p>When rawPostId is non-null, a corresponding row is pre-inserted into raw_posts to
     * satisfy the {@code property_listings_raw_post_id_fkey} FK constraint from V0.
     */
    private void insertListingWithStatus(UUID ownerId, String areaKey,
                                          String status, UUID rawPostId) {
        OffsetDateTime now = OffsetDateTime.now();
        if (rawPostId != null) {
            // Satisfy the FK: raw_posts requires a feed_run_id, which in turn has no FK in V0
            // (feed_runs.id is a PK; we seed feed_runs first to satisfy raw_posts.feed_run_id).
            UUID feedRunId = UUID.randomUUID();
            jdbcTemplate.update(
                    "INSERT INTO feed_runs (id, status) VALUES (?, 'success') ON CONFLICT DO NOTHING",
                    feedRunId);
            jdbcTemplate.update(
                    "INSERT INTO raw_posts (id, feed_run_id, content) VALUES (?, ?, 'test') "
                    + "ON CONFLICT DO NOTHING",
                    rawPostId, feedRunId);
        }
        jdbcTemplate.update(
                "INSERT INTO property_listings "
                + "(id, created_by, area_key, property_type, listing_purpose, status, "
                + " price_paise, quality_score, is_duplicate, is_valid, archived_at, raw_post_id, "
                + " created_at, updated_at) "
                + "VALUES (gen_random_uuid(), ?, ?, 'apartment', 'sale', ?, "
                + "        50000000, NULL, false, true, NULL, ?, ?, ?)",
                ownerId, areaKey, status, rawPostId, now, now);
    }

    /**
     * Inserts a viewing_request for the given broker and listing.
     * {@code broker_id} pins the broker identity (defense-in-depth alongside {@code pl.created_by}).
     * {@code requester_id} references {@code auth.users} (stubbed; uses the fixed REQUESTER UUID).
     */
    private void insertViewingRequest(UUID brokerId, UUID listingId) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO viewing_requests "
                + "(id, listing_id, requester_id, broker_id, requested_date, requested_time_slot, "
                + " status, created_at, updated_at) "
                + "VALUES (gen_random_uuid(), ?, ?, ?, ?, 'MORNING', 'pending', ?, ?)",
                listingId, REQUESTER, brokerId, LocalDate.now(), now, now);
    }

    /**
     * Inserts an area_intelligence_snapshot row for the composite (citySlug, areaKey) key.
     * {@code demand_score} is always NULL (reserved for #1532).
     * When {@code priceComparisonSupported=true}: seeds non-null median and dominant type.
     * When {@code priceComparisonSupported=false}: both are NULL (suppressed state).
     */
    private void insertSnapshot(String citySlug, String areaKey, String areaLabel,
                                 int activeListingCount, boolean priceComparisonSupported,
                                 String confidence) {
        Long medianPricePaise    = priceComparisonSupported ? 50_000_000L : null;
        String dominantType      = priceComparisonSupported ? "apartment" : null;
        int freshCount           = Math.min(activeListingCount, 5);
        OffsetDateTime now       = OffsetDateTime.now();  // Instant not bindable via JdbcTemplate; use OffsetDateTime

        // Use named constraint for ON CONFLICT — unambiguous with the V94 PK name.
        jdbcTemplate.update(
                "INSERT INTO area_intelligence_snapshot "
                + "(city_slug, area_key, area_label, computed_at, "
                + " active_listing_count, fresh_listing_count, "
                + " median_price_paise, dominant_property_type, "
                + " avg_listing_quality, price_comparison_sample_count, "
                + " price_comparison_supported, confidence, demand_score) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL) "
                + "ON CONFLICT ON CONSTRAINT pk_area_intelligence_snapshot DO UPDATE SET "
                + "  active_listing_count       = EXCLUDED.active_listing_count, "
                + "  fresh_listing_count        = EXCLUDED.fresh_listing_count, "
                + "  median_price_paise         = EXCLUDED.median_price_paise, "
                + "  dominant_property_type     = EXCLUDED.dominant_property_type, "
                + "  price_comparison_supported = EXCLUDED.price_comparison_supported, "
                + "  confidence                 = EXCLUDED.confidence, "
                + "  area_label                 = EXCLUDED.area_label, "
                + "  computed_at                = EXCLUDED.computed_at",
                citySlug, areaKey, areaLabel, now,
                activeListingCount, freshCount,
                medianPricePaise, dominantType,
                activeListingCount, priceComparisonSupported, confidence);
    }

    /**
     * Inserts an area_demand_signal row for the given area and confidence value.
     * Used to test opportunitiesToAct derivation and insufficient_data exclusion.
     * {@code signal_type='supply_gap'} satisfies the CHECK constraint in V96.
     */
    private void insertDemandSignal(String citySlug, String areaKey,
                                     String propertyType, String confidence) {
        OffsetDateTime periodStart = OffsetDateTime.now().minusHours(1);
        OffsetDateTime periodEnd   = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO area_demand_signal "
                + "(city_slug, area_key, property_type, listing_purpose, budget_band, "
                + " period_start, period_end, window_days, "
                + " search_count, panel_open_count, lead_intent_count, listing_count, "
                + " gap_score, signal_type, confidence, computed_at) "
                + "VALUES (?, ?, ?, 'sale', '5L_20L', ?, ?, 7, 15, 0, 5, 8, 0.7, 'supply_gap', ?, now())",
                citySlug, areaKey, propertyType,
                periodStart, periodEnd,
                confidence);
    }
}
