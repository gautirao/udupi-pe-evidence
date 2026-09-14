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

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC18 seeded-median integration test for {@link BuyerAreaIntelligenceService}.
 *
 * <p>Proves end-to-end correctness of the median-price pipeline:
 * <ol>
 *   <li>Seeds real {@code property_listings} rows via {@link ListingRepository}.</li>
 *   <li>Runs the real {@link AreaIntelligenceSnapshotService#buildSnapshots()} to populate
 *       {@code area_intelligence_snapshot}.</li>
 *   <li>Calls the real {@link BuyerAreaIntelligenceService#getAreaIntelligence(String, String)}
 *       and asserts on the returned DTO.</li>
 * </ol>
 *
 * <p><b>Anti-fake guard:</b> this test NEVER inserts directly into
 * {@code area_intelligence_snapshot}. The expected answer is derived only by running
 * the real aggregation pipeline against real listing rows. Inserting the expected answer
 * and reading it back is not median-computation coverage — it is forbidden.
 *
 * <h3>Paise scale</h3>
 * {@code 1 rupee = 100 paise}; {@code 1 lakh rupees = 1,00,000 rupees = 1,00,00,000 paise = 10_000_000L}.
 * Confirmed against {@link AreaIntelligenceSnapshotIT} T2 which seeds {@code 10_000_000L} for ₹1L
 * and T5 which seeds {@code 8_000_000L} for ₹0.8L / 8L.
 * Therefore:
 * <ul>
 *   <li>₹40L = 400_000_000L paise</li>
 *   <li>₹55L = 550_000_000L paise</li>
 *   <li>₹70L = 700_000_000L paise</li>
 * </ul>
 *
 * <h3>K-anonymity seeding arithmetic</h3>
 * {@link AggregationConstants#K_ANON_MIN} = 10. We must seed ≥ 10 LIVE priced listings
 * to clear suppression. We seed <b>4 × ₹40L + 4 × ₹55L + 4 × ₹70L = 12 listings</b>.
 * <p>Sorted price array (12 values):
 * [40L, 40L, 40L, 40L, 55L, 55L, 55L, 55L, 70L, 70L, 70L, 70L] (in units of ₹L).
 * <p>PERCENTILE_CONT(0.5 ORDER BY price_paise) with N=12 (even): interpolates between
 * the 6th and 7th values (1-indexed). Both are 55L (₹55L = 550_000_000 paise).
 * Interpolated result = (550_000_000 + 550_000_000) / 2 = 550_000_000L. Median = ₹55L.
 *
 * <h3>Transaction strategy</h3>
 * {@code NOT_SUPPORTED}: tests are not rolled back. {@code buildSnapshots()} uses
 * {@code saveAllAndFlush} which must see committed rows from the seed. Cleanup runs in
 * {@code @AfterEach} via sentinel locality prefix — mirrors {@link AreaIntelligenceSnapshotIT}.
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
@Import({AreaIntelligenceSnapshotService.class, BuyerAreaIntelligenceService.class,
        AdminIntelligenceService.class, CityActivationGuard.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class BuyerAreaIntelligenceSeededMedianIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // ── Paise constants ────────────────────────────────────────────────────────

    /**
     * ₹1L in paise = 1,00,000 rupees × 100 paise/rupee = 10_000_000 paise.
     * (Confirmed via AreaIntelligenceSnapshotIT T2: pricePaise=10_000_000L = ₹1L.)
     */
    private static final long LAKH_IN_PAISE = 10_000_000L;

    /** ₹40L in paise = 400_000_000L */
    private static final long PRICE_40L_PAISE = 40L * LAKH_IN_PAISE;

    /** ₹55L in paise = 550_000_000L — expected median */
    private static final long PRICE_55L_PAISE = 55L * LAKH_IN_PAISE;

    /** ₹70L in paise = 700_000_000L */
    private static final long PRICE_70L_PAISE = 70L * LAKH_IN_PAISE;

    // ── Timestamps ────────────────────────────────────────────────────────────

    /** Within-90d and within-30d: counts as active AND fresh. */
    private static final OffsetDateTime RECENT =
            OffsetDateTime.now(ZoneOffset.UTC).minusDays(5);

    // ── Sentinel ──────────────────────────────────────────────────────────────

    /**
     * Sentinel prefix for locality field. {@code @AfterEach} uses this to delete all
     * seeded listings without touching production-like rows from Flyway seed migrations.
     */
    private static final String SENTINEL = "_smit_";

    // ── City and area keys ────────────────────────────────────────────────────

    /** City slug for udupi — present in seeded cities table via Flyway. */
    private static final String CITY_SLUG = "udupi";

    /** Sentinel area key scoped to this IT. Mapped to the udupi city_id via INSERT ... SELECT. */
    private static final String AREA_KEY = "_smit_MedianPriceArea";

    /** A second sentinel area key in a different city (kundapur) for isolation assertion. */
    private static final String OTHER_CITY_AREA_KEY = "_smit_OtherCityArea";

    // ── Spring beans ──────────────────────────────────────────────────────────

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private AreaIntelligenceSnapshotService snapshotService;

    @Autowired
    private BuyerAreaIntelligenceService buyerIntelligenceService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @AfterEach
    void cleanup() {
        // Delete snapshot rows for all sentinel area keys
        jdbcTemplate.execute(
                "DELETE FROM area_intelligence_snapshot WHERE area_key LIKE '_smit\\_%' ESCAPE '\\'");
        // Delete seeded listings via sentinel locality prefix
        jdbcTemplate.execute(
                "DELETE FROM property_listings WHERE locality LIKE '_smit\\_%' ESCAPE '\\'");
        // Delete sentinel areas (FK order: snapshot rows deleted first above)
        jdbcTemplate.execute(
                "DELETE FROM areas WHERE area_key LIKE '_smit\\_%' ESCAPE '\\'");
    }

    // ── AC18 test: seeded-median pipeline ─────────────────────────────────────

    /**
     * Main scenario: 12 LIVE listings (4×₹40L + 4×₹55L + 4×₹70L) produce median=₹55L
     * after the full snapshot + read pipeline.
     *
     * <p>Arithmetic:
     * Sorted prices (paise): [400M, 400M, 400M, 400M, 550M, 550M, 550M, 550M, 700M, 700M, 700M, 700M]
     * N=12 (even) → PERCENTILE_CONT(0.5) = (value[6] + value[7]) / 2 = (550M + 550M) / 2 = 550M.
     * Expected medianPricePaise = 550_000_000L.
     */
    @Test
    @DisplayName("AC18a — 12 seeded LIVE listings (4×₹40L + 4×₹55L + 4×₹70L): median resolves to ₹55L via real snapshot pipeline")
    void ac18a_seededMedian_resolvesToFiftyFiveLakh() {
        // Arrange: seed area mapping
        seedArea(AREA_KEY, CITY_SLUG);

        // Seed 4 listings at each price point → 12 total (≥ K_ANON_MIN=10)
        seedLiveListings(AREA_KEY, 4, PRICE_40L_PAISE);
        seedLiveListings(AREA_KEY, 4, PRICE_55L_PAISE);
        seedLiveListings(AREA_KEY, 4, PRICE_70L_PAISE);

        // Act: run the REAL aggregation
        snapshotService.buildSnapshots();

        // Act: call the REAL read service
        BuyerAreaIntelligenceResponse response =
                buyerIntelligenceService.getAreaIntelligence(CITY_SLUG, AREA_KEY);

        // Assert: response is available (not suppressed)
        assertThat(response.available())
                .as("available must be true: snapshot row exists and activeListingCount >= K_ANON_MIN")
                .isTrue();

        // Assert: confidenceLabel is present (not "Not enough data yet")
        assertThat(response.confidenceLabel())
                .as("confidenceLabel must be non-null and not the suppression sentinel when data is present")
                .isNotNull()
                .isNotEqualTo(BuyerConfidenceLabel.NOT_ENOUGH_DATA.getDisplayLabel());

        // Assert: median is exactly ₹55L in paise (550_000_000L)
        // Arithmetic: sorted 12-value array has 6th and 7th elements both = 550_000_000 paise.
        // PERCENTILE_CONT(0.5) = (550_000_000 + 550_000_000) / 2 = 550_000_000L exactly.
        BuyerAreaIntelligenceResponse.Metric<Long> medianMetric =
                response.metrics().medianPricePaise();

        assertThat(medianMetric.value())
                .as("medianPricePaise.value must equal ₹55L = 550_000_000 paise exactly (Long equality)")
                .isNotNull()
                .isEqualTo(PRICE_55L_PAISE);
    }

    /**
     * AC18b: non-LIVE listings (PENDING_REVIEW) in the same area do NOT skew the median.
     *
     * <p>Seeds the same 12 LIVE listings as ac18a PLUS 10 PENDING_REVIEW listings at ₹100L.
     * If non-LIVE rows were accidentally included, the median would shift upward.
     * Expected: median still exactly ₹55L.
     */
    @Test
    @DisplayName("AC18b — PENDING_REVIEW listings in same area do NOT change the median")
    void ac18b_nonLiveListings_doNotAffectMedian() {
        seedArea(AREA_KEY, CITY_SLUG);

        // 12 LIVE listings → median = ₹55L
        seedLiveListings(AREA_KEY, 4, PRICE_40L_PAISE);
        seedLiveListings(AREA_KEY, 4, PRICE_55L_PAISE);
        seedLiveListings(AREA_KEY, 4, PRICE_70L_PAISE);

        // 10 PENDING_REVIEW listings at ₹100L — must NOT be included
        long price100L = 100L * LAKH_IN_PAISE;
        for (int i = 0; i < 10; i++) {
            Listing l = liveListing(AREA_KEY);
            l.setStatus("PENDING_REVIEW");
            l.setPricePaise(price100L);
            listingRepository.saveAndFlush(l);
        }

        snapshotService.buildSnapshots();

        BuyerAreaIntelligenceResponse response =
                buyerIntelligenceService.getAreaIntelligence(CITY_SLUG, AREA_KEY);

        assertThat(response.metrics().medianPricePaise().value())
                .as("PENDING_REVIEW listings must be excluded: median must still be ₹55L = 550_000_000 paise")
                .isNotNull()
                .isEqualTo(PRICE_55L_PAISE);
    }

    /**
     * AC18c: listings in a DIFFERENT city/area do NOT affect this area's median.
     *
     * <p>Seeds the 12 LIVE listings in the udupi sentinel area PLUS 10 LIVE listings at ₹100L
     * in a separate kundapur area. Expected: udupi area median still exactly ₹55L.
     */
    @Test
    @DisplayName("AC18c — listings in another city/area do NOT affect this area's median")
    void ac18c_otherCityArea_doesNotAffectMedian() {
        seedArea(AREA_KEY, CITY_SLUG);
        seedArea(OTHER_CITY_AREA_KEY, "kundapur");

        // Primary area: 12 LIVE listings → median = ₹55L
        seedLiveListings(AREA_KEY, 4, PRICE_40L_PAISE);
        seedLiveListings(AREA_KEY, 4, PRICE_55L_PAISE);
        seedLiveListings(AREA_KEY, 4, PRICE_70L_PAISE);

        // Other city area: 10 LIVE listings at ₹100L — must NOT affect the primary area
        long price100L = 100L * LAKH_IN_PAISE;
        seedLiveListings(OTHER_CITY_AREA_KEY, 10, price100L);

        snapshotService.buildSnapshots();

        BuyerAreaIntelligenceResponse response =
                buyerIntelligenceService.getAreaIntelligence(CITY_SLUG, AREA_KEY);

        assertThat(response.metrics().medianPricePaise().value())
                .as("Other-city listings must be isolated: udupi area median must be ₹55L = 550_000_000 paise")
                .isNotNull()
                .isEqualTo(PRICE_55L_PAISE);
    }

    /**
     * AC18d: a city+areaKey with NO seeded snapshot returns available=false
     * with medianPricePaise.value == null (NOT 0).
     *
     * <p>No listing seeding; no buildSnapshots() call for this key. The service must
     * return the coherent UNAVAILABLE response shape.
     */
    @Test
    @DisplayName("AC18d — city+areaKey with no snapshot: available=false, medianPricePaise.value==null (not 0)")
    void ac18d_noSnapshot_returnsUnavailable() {
        // Deliberately do NOT seed any listings or run buildSnapshots for this key.
        // The area key is novel — guaranteed no pre-existing snapshot from Flyway.
        String ghostAreaKey = "_smit_GhostArea_NoData";

        BuyerAreaIntelligenceResponse response =
                buyerIntelligenceService.getAreaIntelligence(CITY_SLUG, ghostAreaKey);

        assertThat(response.available())
                .as("available must be false when no snapshot row exists")
                .isFalse();

        assertThat(response.metrics().medianPricePaise().value())
                .as("medianPricePaise.value must be null (not 0) for the no-snapshot case")
                .isNull();

        assertThat(response.confidenceLabel())
                .as("confidenceLabel must be the 'Not enough data yet' sentinel for unavailable response")
                .isEqualTo(BuyerConfidenceLabel.NOT_ENOUGH_DATA.getDisplayLabel());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Insert a real {@code areas} row mapping {@code areaKey} to the city with the given slug.
     * Uses INSERT ... SELECT so it works regardless of the city's numeric PK.
     * {@code ON CONFLICT DO NOTHING} makes it safe to call multiple times in the same container.
     */
    private void seedArea(String areaKey, String citySlug) {
        jdbcTemplate.execute(String.format("""
                INSERT INTO areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon)
                SELECT '%s', c.id, 'SeededMedianTestArea', 'Udupi', 13.35, 74.78
                FROM cities c WHERE c.slug = '%s'
                ON CONFLICT (area_key) DO NOTHING
                """, areaKey, citySlug));
    }

    /**
     * Seed {@code count} LIVE, non-archived, non-duplicate listings in {@code areaKey},
     * all with the given {@code pricePaise}. Uses {@link ListingRepository#saveAndFlush}
     * so each row is visible to the subsequent native aggregate query in buildSnapshots().
     */
    private void seedLiveListings(String areaKey, int count, long pricePaise) {
        for (int i = 0; i < count; i++) {
            Listing l = liveListing(areaKey);
            l.setPricePaise(pricePaise);
            listingRepository.saveAndFlush(l);
        }
    }

    /**
     * Build a minimal LIVE, non-archived, non-duplicate listing for the given area key.
     * Uses the sentinel locality prefix so {@code @AfterEach} cleanup targets it.
     * Mirrors the {@code liveListing} helper in {@link AreaIntelligenceSnapshotIT}.
     * Does NOT call saveAndFlush — caller must do that.
     */
    private Listing liveListing(String areaKey) {
        Listing l = new Listing();
        l.setPropertyType("house");
        l.setStatus("LIVE");
        l.setDuplicate(false);
        // Locality uses sentinel prefix so @AfterEach DELETE catches it
        l.setLocality(SENTINEL + (areaKey.length() > 20
                ? areaKey.substring(areaKey.length() - 20) : areaKey));
        l.setAreaKey(areaKey);
        l.setCreatedAt(RECENT);
        return l;
    }
}
