package com.example.realestate.intelligence;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Issue #2581 — E2E fixture-seeding harness, NOT a backend-correctness test.
 *
 * <p>{@link AreaIntelligenceSnapshotRollupJob} has no HTTP-reachable manual trigger, and the
 * E2E local stack (scripts/run-e2e-local.sh) deliberately disables {@code @Scheduled} execution
 * (SPRING_TASK_SCHEDULING_ENABLED=false, #2114/SchedulingSuppressionConfig) so the nightly cron
 * never fires during a Playwright run. Without this class there is no way for the Playwright
 * suite (e2e/journey/area-trends-2581.spec.ts) to get the REAL job to write REAL
 * area_intelligence_snapshot rows into the SAME database its backend/frontend are serving from.
 *
 * <p>This class connects to that same disposable local Postgres/PostGIS fixture — via the
 * SUPABASE_DB_HOST/PORT/NAME/USER/PASSWORD env vars that scripts/run-e2e-local.sh exports before
 * it starts the backend and, in the same shell, {@code npx playwright test} — seeds real LIVE
 * listings across three curated Udupi areas at the three {@link AreaConfidence} boundary bands,
 * and invokes {@link AreaIntelligenceSnapshotRollupJob#run()}: the real, unmodified job entry
 * point (mirrors the seeding style already established by {@link AreaIntelligenceSnapshotRollupJobIT}).
 *
 * <p>Invocation (documented in the Playwright spec's own beforeAll, which shells out to this
 * exact command from the same process tree that inherited those env vars):
 *
 * <pre>{@code cd apps/api && mvn test -Dtest=AreaIntelligenceSnapshotRollupJobE2ESeedIT}</pre>
 *
 * <p>If {@link AreaIntelligenceSnapshotRollupJob} were deleted or its {@code run()} entry point
 * broken, this class fails to compile or its assertions fail — the E2E fixture-seed step fails
 * closed rather than silently writing snapshot rows by hand.
 *
 * <p>Skips itself (not a failure) when SUPABASE_DB_HOST is unset — i.e. on every invocation of
 * {@code mvn test} OTHER than from inside the E2E local fixture this class targets, including
 * the ordinary backend test suite and CI.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // The E2E fixture's schema was already migrated by scripts/db/restore-test-fixture.sh;
        // re-running Flyway here (against a slice-test context with no migration classpath
        // configured) would either no-op incorrectly or fail outright.
        "spring.flyway.enabled=false"
})
@Import({AreaIntelligenceSnapshotService.class, AreaIntelligenceSnapshotRollupJob.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AreaIntelligenceSnapshotRollupJobE2ESeedIT {

    /** Within-90d recent timestamp — counted as active for every band. */
    private static final OffsetDateTime RECENT = OffsetDateTime.now(ZoneOffset.UTC).minusDays(10);

    // Real curated Udupi area_keys (already resolvable via the V127 area_alias seed — the same
    // reason e2e/global-setup.ts picks 'Manipal' for its own fixture listing, see that file's
    // comment on locality resolution). Using real, already-catalogued areas — rather than
    // sentinel synthetic keys like AreaIntelligenceSnapshotRollupJobIT uses — lets the Playwright
    // spec navigate to them exactly as a real buyer would (Discover area selection / URL
    // areaKey param), matching real production examples for this issue (Manipal=FULL,
    // Brahmavar-band=LIMITED, Kaup=INSUFFICIENT).
    static final String FULL_AREA_KEY = "IN|KA|Udupi|Manipal";
    static final String LIMITED_AREA_KEY = "IN|KA|Udupi|Brahmavar";
    static final String INSUFFICIENT_AREA_KEY = "IN|KA|Udupi|Kaup";

    static final int FULL_COUNT = 32;
    static final int LIMITED_COUNT = 15;
    static final int INSUFFICIENT_COUNT = 3;

    // Approximate area centers (real, already-used-elsewhere coordinates — e.g.
    // e2e/discover-to-trends.spec.ts uses 13.3525/74.7925 for Manipal). Listings need a
    // latitude/longitude so Discover's map-clustering query for the selected area does not
    // 500 ("We couldn't load this area of the map") when the Playwright spec navigates there.
    static final double FULL_LAT = 13.3525;
    static final double FULL_LON = 74.7864;
    static final double LIMITED_LAT = 13.4534;
    static final double LIMITED_LON = 74.7402;
    static final double INSUFFICIENT_LAT = 13.2244;
    static final double INSUFFICIENT_LON = 74.7423;

    @DynamicPropertySource
    static void e2eFixtureDatasource(DynamicPropertyRegistry registry) {
        String host = System.getenv("SUPABASE_DB_HOST");
        String port = System.getenv("SUPABASE_DB_PORT");
        String db   = System.getenv("SUPABASE_DB_NAME");
        String user = System.getenv("SUPABASE_DB_USER");
        String pass = System.getenv("SUPABASE_DB_PASSWORD");

        Assumptions.assumeTrue(host != null && !host.isBlank() && port != null && !port.isBlank(),
                "SUPABASE_DB_HOST/SUPABASE_DB_PORT not set — not running inside the E2E local "
                        + "fixture (scripts/run-e2e-local.sh); skipping #2581 E2E fixture seed.");

        registry.add("spring.datasource.url",
                () -> "jdbc:postgresql://" + host + ":" + port + "/" + (db == null || db.isBlank() ? "postgres" : db));
        registry.add("spring.datasource.username", () -> user == null || user.isBlank() ? "postgres" : user);
        registry.add("spring.datasource.password", () -> pass == null ? "" : pass);
    }

    @Autowired
    private AreaIntelligenceSnapshotRollupJob rollupJob;

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("#2581 E2E fixture seed: real LIVE listings at all three confidence bands, "
            + "then the real AreaIntelligenceSnapshotRollupJob.run() entry point")
    void seedAndRunRollupJob() {
        // Idempotent for local re-runs of the same fixture within one E2E session: only add
        // listings this run hasn't already created (identified by the locality sentinel below).
        removeAnyPreviousE2ESeedListings();

        seedLiveListings(FULL_AREA_KEY, FULL_COUNT, "manipal-e2e-2581", FULL_LAT, FULL_LON);
        seedLiveListings(LIMITED_AREA_KEY, LIMITED_COUNT, "brahmavar-e2e-2581", LIMITED_LAT, LIMITED_LON);
        seedLiveListings(INSUFFICIENT_AREA_KEY, INSUFFICIENT_COUNT, "kaup-e2e-2581", INSUFFICIENT_LAT, INSUFFICIENT_LON);

        rollupJob.run();

        assertThat(confidenceFor(FULL_AREA_KEY))
                .as(FULL_COUNT + " seeded LIVE listings (>=30) must classify as 'full'")
                .isEqualTo("full");
        assertThat(confidenceFor(LIMITED_AREA_KEY))
                .as(LIMITED_COUNT + " seeded LIVE listings (10-29) must classify as 'limited'")
                .isEqualTo("limited");
        assertThat(confidenceFor(INSUFFICIENT_AREA_KEY))
                .as(INSUFFICIENT_COUNT + " seeded LIVE listings (<10) must classify as 'insufficient'")
                .isEqualTo("insufficient");
    }

    private String confidenceFor(String areaKey) {
        return jdbcTemplate.queryForObject(
                "SELECT confidence FROM area_intelligence_snapshot WHERE city_slug = 'udupi' AND area_key = ?",
                String.class, areaKey);
    }

    private void removeAnyPreviousE2ESeedListings() {
        jdbcTemplate.execute(
                "DELETE FROM property_listings WHERE locality IN "
                        + "('manipal-e2e-2581', 'brahmavar-e2e-2581', 'kaup-e2e-2581')");
    }

    private void seedLiveListings(String areaKey, int count, String localityMarker, double lat, double lon) {
        for (int i = 0; i < count; i++) {
            Listing l = new Listing();
            l.setPropertyType("house");
            l.setStatus("LIVE");
            l.setDuplicate(false);
            l.setLocality(localityMarker);
            l.setAreaKey(areaKey);
            l.setCreatedAt(RECENT);
            // Small deterministic jitter so listings aren't all pinned to one exact point.
            l.setLatitude(lat + (i % 5) * 0.0008);
            l.setLongitude(lon + (i % 5) * 0.0008);
            listingRepository.saveAndFlush(l);
        }
    }
}
