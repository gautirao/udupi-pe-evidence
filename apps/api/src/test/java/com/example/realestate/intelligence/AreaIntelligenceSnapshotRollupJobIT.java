package com.example.realestate.intelligence;

import com.example.realestate.discover.CityActivationGuard;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link AreaIntelligenceSnapshotRollupJob} against a real PostgreSQL
 * (postgis/postgis:15-3.4) instance, mirroring the seeding style of {@link AreaIntelligenceSnapshotIT}.
 *
 * <p>Seeds real LIVE listings across three distinct areas at the three
 * {@link AreaConfidence} boundary bands, invokes the job's real {@link AreaIntelligenceSnapshotRollupJob#run()}
 * entry point (not the underlying service directly), and asserts the persisted
 * {@code area_intelligence_snapshot} rows land at the expected confidence tier — proving the job
 * actually drives {@code buildSnapshots()} end-to-end via listings the test itself created,
 * rather than asserting back an expected row inserted directly (per this repo's established
 * anti-fake-evidence pattern).
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
@Import({
        AreaIntelligenceSnapshotService.class,
        AreaIntelligenceSnapshotRollupJob.class,
        AdminIntelligenceService.class,
        BuyerAreaIntelligenceService.class,
        CityActivationGuard.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AreaIntelligenceSnapshotRollupJobIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** Within-90d recent timestamp — counted as active for every band in this test. */
    private static final OffsetDateTime RECENT =
            OffsetDateTime.now(ZoneOffset.UTC).minusDays(10);

    private static final String SENTINEL = "_snap_job_it_";

    private static final String FULL_AREA_KEY = SENTINEL + "Full";
    private static final String LIMITED_AREA_KEY = SENTINEL + "Limited";
    private static final String INSUFFICIENT_AREA_KEY = SENTINEL + "Insuff";

    @Autowired
    private AreaIntelligenceSnapshotRepository snapshotRepository;

    @Autowired
    private AreaDemandSignalRepository demandSignalRepository;

    @Autowired
    private AreaIntelligenceSnapshotRollupJob rollupJob;

    @Autowired
    private AdminIntelligenceService adminIntelligenceService;

    @Autowired
    private BuyerAreaIntelligenceService buyerAreaIntelligenceService;

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute(
                "DELETE FROM area_intelligence_snapshot WHERE area_key LIKE '_snap\\_job\\_it\\_%' ESCAPE '\\'");
        jdbcTemplate.execute(
                "DELETE FROM property_listings WHERE locality LIKE '_snap\\_job\\_it\\_%' ESCAPE '\\'");
        jdbcTemplate.execute(
                "DELETE FROM areas WHERE area_key LIKE '_snap\\_job\\_it\\_%' ESCAPE '\\'");
    }

    @Test
    @DisplayName("run() seeds real LIVE listings across full/limited/insufficient bands "
            + "and persists three distinct confidence outcomes via the real job entry point")
    void run_seedsThreeBands_persistsDistinctConfidenceOutcomes() {
        seedArea(FULL_AREA_KEY, "TestFull");
        seedArea(LIMITED_AREA_KEY, "TestLimited");
        seedArea(INSUFFICIENT_AREA_KEY, "TestInsuff");

        seedLiveListings(FULL_AREA_KEY, 36);
        seedLiveListings(LIMITED_AREA_KEY, 15);
        seedLiveListings(INSUFFICIENT_AREA_KEY, 3);

        // Exercise the real, separately-callable job entry point — not snapshotService directly.
        rollupJob.run();

        List<AreaIntelligenceSnapshot> snaps =
                snapshotRepository.findByCitySlugOrderByActiveListingCountDesc("udupi");

        AreaIntelligenceSnapshot fullSnap = findByAreaKey(snaps, FULL_AREA_KEY);
        assertThat(fullSnap.getActiveListingCount()).isEqualTo(36);
        assertThat(fullSnap.getConfidence())
                .as("36 LIVE listings (>=30) must classify as 'full'")
                .isEqualTo("full");

        AreaIntelligenceSnapshot limitedSnap = findByAreaKey(snaps, LIMITED_AREA_KEY);
        assertThat(limitedSnap.getActiveListingCount()).isEqualTo(15);
        assertThat(limitedSnap.getConfidence())
                .as("15 LIVE listings (10-29) must classify as 'limited'")
                .isEqualTo("limited");

        AreaIntelligenceSnapshot insufficientSnap = findByAreaKey(snaps, INSUFFICIENT_AREA_KEY);
        assertThat(insufficientSnap.getActiveListingCount()).isEqualTo(3);
        assertThat(insufficientSnap.getConfidence())
                .as("3 LIVE listings (<10) must classify as 'insufficient'")
                .isEqualTo("insufficient");

        // L192 Arm 9 real-DB cross-path parity: Admin live aggregate confidence
        // (AdminIntelligenceService -> AreaIntelligenceRepository.findLive90dAggregates)
        // must agree with Buyer cached snapshot confidenceLabel
        // (BuyerAreaIntelligenceService -> AreaIntelligenceSnapshotRepository) across all 3 bands.
        Map<String, AreaIntelligenceResponse> adminByAreaKey =
                adminIntelligenceService.getAreaIntelligence(null).stream()
                        .collect(Collectors.toMap(AreaIntelligenceResponse::areaKey, Function.identity()));

        AreaIntelligenceResponse adminFull = adminByAreaKey.get(FULL_AREA_KEY);
        BuyerAreaIntelligenceResponse buyerFull =
                buyerAreaIntelligenceService.getAreaIntelligence("udupi", FULL_AREA_KEY);
        assertThat(adminFull).isNotNull();
        assertThat(adminFull.live90dCount()).isEqualTo(36);
        assertThat(adminFull.confidence()).isEqualTo("full");
        assertThat(buyerFull.available()).isTrue();
        assertThat(buyerFull.confidenceLabel())
                .isEqualTo(BuyerConfidenceLabel.ofLabel(adminFull.confidence()).getDisplayLabel())
                .isEqualTo("Enough data");

        AreaIntelligenceResponse adminLimited = adminByAreaKey.get(LIMITED_AREA_KEY);
        BuyerAreaIntelligenceResponse buyerLimited =
                buyerAreaIntelligenceService.getAreaIntelligence("udupi", LIMITED_AREA_KEY);
        assertThat(adminLimited).isNotNull();
        assertThat(adminLimited.live90dCount()).isEqualTo(15);
        assertThat(adminLimited.confidence()).isEqualTo("limited");
        assertThat(buyerLimited.available()).isTrue();
        assertThat(buyerLimited.confidenceLabel())
                .isEqualTo(BuyerConfidenceLabel.ofLabel(adminLimited.confidence()).getDisplayLabel())
                .isEqualTo("Limited data");

        AreaIntelligenceResponse adminInsuff = adminByAreaKey.get(INSUFFICIENT_AREA_KEY);
        BuyerAreaIntelligenceResponse buyerInsuff =
                buyerAreaIntelligenceService.getAreaIntelligence("udupi", INSUFFICIENT_AREA_KEY);
        assertThat(adminInsuff).isNotNull();
        assertThat(adminInsuff.live90dCount()).isEqualTo(3);
        assertThat(adminInsuff.confidence()).isEqualTo("insufficient");
        assertThat(buyerInsuff.available()).isTrue();
        assertThat(buyerInsuff.confidenceLabel())
                .isEqualTo(BuyerConfidenceLabel.ofLabel(adminInsuff.confidence()).getDisplayLabel())
                .isEqualTo("Not enough data yet");
    }

    /**
     * Overrides the class-level {@code NOT_SUPPORTED} propagation: {@code updateDemandScore}
     * is a {@code @Modifying} native query and requires an active transaction to execute.
     * All writes made here (including via {@code rollupJob.run()}, which joins this
     * transaction) are visible to each other within the test and are rolled back afterward,
     * which is fine since the whole scenario — seed, both rollup runs, and the assertion —
     * happens within this one test method.
     */
    @Test
    @Transactional
    @DisplayName("run() does not clobber an existing row's demand_score written via the real "
            + "hourly demand-signal UPDATE path (regression for the full-column-merge bug)")
    void run_preservesExistingDemandScoreAcrossRerun() {
        String areaKey = SENTINEL + "Demand";
        seedArea(areaKey, "TestDemand");
        seedLiveListings(areaKey, 15);

        // First nightly run creates the row; demand_score correctly starts null (no demand
        // signal has been computed for this brand-new bucket yet).
        rollupJob.run();

        // Simulate the hourly AreaDemandSignalRollupJob's real write path — a targeted,
        // additive UPDATE via the actual repository method — NOT a direct row insert.
        BigDecimal demandScore = new BigDecimal("42.50");
        int updated = demandSignalRepository.updateDemandScore(demandScore, "udupi", areaKey);
        assertThat(updated)
                .as("updateDemandScore must find and update the row the first run() created")
                .isEqualTo(1);

        // Second nightly run must NOT null out the demand_score the hourly job just wrote.
        rollupJob.run();

        AreaIntelligenceSnapshot snap = findByAreaKey(
                snapshotRepository.findByCitySlugOrderByActiveListingCountDesc("udupi"), areaKey);

        assertThat(snap.getDemandScore())
                .as("demand_score written by the hourly demand-signal job must survive the "
                        + "nightly snapshot rollup's full-column merge")
                .isNotNull()
                .isEqualByComparingTo(demandScore);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private void seedArea(String areaKey, String name) {
        jdbcTemplate.execute(String.format("""
                INSERT INTO areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon)
                SELECT '%s', c.id, '%s', 'Udupi', 13.35, 74.79
                FROM cities c WHERE c.slug = 'udupi'
                ON CONFLICT (area_key) DO NOTHING
                """, areaKey, name));
    }

    private void seedLiveListings(String areaKey, int count) {
        for (int i = 0; i < count; i++) {
            listingRepository.saveAndFlush(liveListing(areaKey, "house", RECENT));
        }
    }

    private AreaIntelligenceSnapshot findByAreaKey(List<AreaIntelligenceSnapshot> snaps, String areaKey) {
        return snaps.stream()
                .filter(s -> areaKey.equals(s.getAreaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Snapshot for " + areaKey + " not found"));
    }

    /**
     * Build a minimal LIVE, non-archived, non-duplicate listing for the given area_key,
     * using the sentinel locality prefix so {@code @AfterEach} cleanup targets it.
     * Does NOT call saveAndFlush — caller must do that.
     */
    private Listing liveListing(String areaKey, String propertyType, OffsetDateTime createdAt) {
        Listing l = new Listing();
        l.setPropertyType(propertyType);
        l.setStatus("LIVE");
        l.setDuplicate(false);
        l.setLocality(SENTINEL + (areaKey.length() > 20 ? areaKey.substring(areaKey.length() - 20) : areaKey));
        l.setAreaKey(areaKey);
        l.setCreatedAt(createdAt);
        return l;
    }
}
