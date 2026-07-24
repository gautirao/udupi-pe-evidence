package com.example.realestate.discover;

import com.example.realestate.discover.navigation.PostgresAreaCountProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Scale/perf evidence IT for {@link DiscoverSummaryService} (#1760) — bulk-loads ~100k synthetic
 * {@code property_listings} rows for one city (Udupi, reusing V71/V101-seeded 4-segment area_keys
 * and area_groups) and captures {@code EXPLAIN (ANALYZE, BUFFERS)} plans + wall-clock timings for
 * all 3 query shapes (total / area_group regions / hotspots) under 3 filter scenarios (blended,
 * propertyType filter, listingPurpose=sale) — 9 combinations total.
 *
 * <p>This is an EVIDENCE-CAPTURE test, not a hard perf gate: printed timings and plans are pasted
 * into {@code docs/audit/evidence/issue-1760-summary-scale/README.md} by hand after a real run,
 * and are the basis for the evidence-gated decision on whether an additional {@code listing_purpose}
 * partial index (V105) is warranted. The only HARD assertions here are structural: queries
 * complete without error, and {@code sum(regions[].listingCount) == totalActiveListings} holds at
 * 100k scale (a correctness regression net, not a perf gate — hard-asserting a specific millisecond
 * budget in CI would make this test flaky on shared/slow runners).
 *
 * <p>Mirrors {@link DiscoverSummaryServiceIT}'s harness (Testcontainers postgis/postgis:15-3.4,
 * {@code @DataJpaTest}, Flyway through the latest migration, {@code concurrently_keyword} blanked).
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
class DiscoverSummaryScaleIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "udupi";
    private static final int ROW_COUNT = 100_000;
    private static final int HOTSPOT_LIMIT = 8;

    // Perf budget guidance (#1760) — NOT hard-asserted (see class javadoc); logged as PASS/BREACH.
    private static final long BUDGET_MS = 100;

    // 10 area_keys already seeded by V71 and mapped into area_groups by V101 (university-belt,
    // coastal-strip, city-centre, north-udupi, south-udupi) — bulk data reuses real geography
    // rather than inventing unmapped area_keys, so the area_group regions query shape is exercised
    // exactly as it would be in production.
    private static final String AREA_KEYS_SQL_ARRAY = "ARRAY["
            + "'IN|KA|Udupi|Manipal','IN|KA|Udupi|Katapadi','IN|KA|Udupi|Malpe','IN|KA|Udupi|Kaup',"
            + "'IN|KA|Udupi|Udupi','IN|KA|Udupi|Kunjibettu','IN|KA|Udupi|Amoghapura','IN|KA|Udupi|Brahmavar',"
            + "'IN|KA|Udupi|Shirva','IN|KA|Udupi|Padubidri']";

    private static final String PROPERTY_TYPES_SQL_ARRAY =
            "ARRAY['house','apartment','land','commercial','villa','agricultural_land']";

    private static final String FOUR_SEGMENT_GUARD =
            "array_length(string_to_array(pl.area_key, '|'), 1) = 4";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverSummaryService service;

    @BeforeEach
    void setUp() {
        service = new DiscoverSummaryService(
                jdbcTemplate, new CityActivationGuard(jdbcTemplate), new PostgresAreaCountProvider(jdbcTemplate));
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    @Test
    @DisplayName("100k synthetic listings: 3 query shapes x 3 filter scenarios complete, "
            + "sum(regions)==total holds, EXPLAIN plans + timings captured")
    void bulk100k_perfEvidenceAndCorrectnessInvariant() {
        long insertStart = System.nanoTime();
        bulkLoad();
        long insertMs = (System.nanoTime() - insertStart) / 1_000_000;
        jdbcTemplate.execute("ANALYZE property_listings");

        long totalRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings", Long.class);
        assertThat(totalRows).isEqualTo(ROW_COUNT);

        StringBuilder evidence = new StringBuilder();
        evidence.append("=== #1760 DiscoverSummaryScaleIT evidence ===\n");
        evidence.append("rows inserted: ").append(ROW_COUNT)
                .append(" (bulk INSERT ... SELECT generate_series in ").append(insertMs).append("ms)\n\n");

        // scenario: {label, propertyType, listingPurpose}
        String[][] scenarios = {
                {"blended", null, null},
                {"propertyType=house", "house", null},
                {"listingPurpose=sale", null, "sale"},
        };

        for (String[] scenario : scenarios) {
            String label = scenario[0];
            String propertyType = scenario[1];
            String listingPurpose = scenario[2];

            evidence.append("---- scenario: ").append(label).append(" ----\n");

            // Correctness + end-to-end timing via the real service (assembles all 3 shapes).
            long t0 = System.nanoTime();
            DiscoverSummaryResponse response = service.getSummary(
                    new SummaryQuery(CITY, propertyType, "area_group", HOTSPOT_LIMIT, listingPurpose));
            long elapsedMs = (System.nanoTime() - t0) / 1_000_000;

            long regionSum = response.regions().stream()
                    .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount)
                    .sum();
            assertThat(regionSum)
                    .as("sum(regions[].listingCount) must equal totalActiveListings for scenario: %s", label)
                    .isEqualTo(response.totalActiveListings());
            assertThat(response.totalActiveListings()).isGreaterThan(0L);

            String verdict = elapsedMs <= BUDGET_MS ? "PASS" : "BREACH";
            evidence.append(String.format(
                    "getSummary() end-to-end: %dms (budget %dms) -> %s; total=%d, regions=%d, hotspots=%d%n",
                    elapsedMs, BUDGET_MS, verdict, response.totalActiveListings(),
                    response.regions().size(), response.hotspots().size()));

            // Raw EXPLAIN (ANALYZE, BUFFERS) per shape, mirroring DiscoverSummaryService's exact SQL.
            DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                    CITY, null, null, null, null, null, null, null,
                    null, null, null, null, null,
                    null, null, null,
                    null, null, listingPurpose, null, null);
            DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(filters);

            evidence.append("-- shape: total --\n")
                    .append(explainTotal(sql, propertyType)).append('\n');
            evidence.append("-- shape: regions (area_group) --\n")
                    .append(explainAreaGroupRegions(sql, propertyType)).append('\n');
            evidence.append("-- shape: hotspots --\n")
                    .append(explainHotspots(sql, propertyType, HOTSPOT_LIMIT)).append('\n');
        }

        // Printed to stdout for capture into docs/audit/evidence/issue-1760-summary-scale/.
        System.out.println(evidence);
    }

    // ── Bulk load ────────────────────────────────────────────────────────────────

    /**
     * Inserts {@link #ROW_COUNT} rows in a single set-based statement (fast — no 100k JDBC
     * round-trips). Mixed noise: ~10% excluded (DRAFT status / archived_at set / is_duplicate)
     * spread evenly so the guarded predicate still has real work to do at scale; ~50/50
     * sale/rent; 6 property types; all area_keys are real 4-segment V71 seeds mapped into
     * V101 area_groups.
     */
    private void bulkLoad() {
        jdbcTemplate.execute(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "SELECT "
                        + "  ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, "
                        + "  (" + AREA_KEYS_SQL_ARRAY + ")[1 + (i % 10)], "
                        + "  CASE WHEN i % 30 = 9 THEN 'DRAFT' ELSE 'LIVE' END, "
                        + "  CASE WHEN i % 30 = 19 THEN now() ELSE NULL END, "
                        + "  (i % 30 = 29), "
                        + "  true, "
                        + "  (" + PROPERTY_TYPES_SQL_ARRAY + ")[1 + (i % 6)], "
                        + "  CASE WHEN i % 2 = 0 THEN 'sale' ELSE 'rent' END, "
                        + "  13.30 + (i % 1000) * 0.0001, "
                        + "  74.70 + (i % 1000) * 0.0001, "
                        + "  now(), now() "
                        + "FROM generate_series(1, " + ROW_COUNT + ") AS i");
    }

    // ── EXPLAIN builders — mirror DiscoverSummaryService's private query construction exactly ──

    private String explainTotal(DiscoverListingPredicateBuilder.Sql sql, String normalizedType) {
        StringBuilder sb = new StringBuilder(
                "EXPLAIN (ANALYZE, BUFFERS) SELECT COUNT(*) FROM property_listings pl WHERE ")
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);
        List<Object> params = new ArrayList<>(sql.params());
        appendTypeFilter(sb, params, normalizedType);
        return runExplain(sb.toString(), params);
    }

    private String explainAreaGroupRegions(DiscoverListingPredicateBuilder.Sql sql, String normalizedType) {
        StringBuilder sb = new StringBuilder("EXPLAIN (ANALYZE, BUFFERS) SELECT ag.slug AS region_key, "
                + "ag.name AS region_label, COUNT(pl.id) AS listing_count "
                + "FROM area_groups ag "
                + "JOIN cities c ON c.id = ag.city_id "
                + "JOIN area_group_members agm ON agm.area_group_id = ag.id "
                + "LEFT JOIN property_listings pl ON pl.area_key = agm.area_key AND ")
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);
        List<Object> params = new ArrayList<>(sql.params());
        appendTypeFilter(sb, params, normalizedType);
        sb.append(" WHERE c.slug = ? AND ag.is_active = true "
                + "GROUP BY ag.slug, ag.name ORDER BY listing_count DESC, ag.name ASC");
        params.add(CITY);
        return runExplain(sb.toString(), params);
    }

    private String explainHotspots(DiscoverListingPredicateBuilder.Sql sql, String normalizedType, int limit) {
        StringBuilder sb = new StringBuilder("EXPLAIN (ANALYZE, BUFFERS) SELECT pl.area_key AS area_key, "
                + "a.name AS name, a.geo_center_lat AS geo_center_lat, a.geo_center_lon AS geo_center_lon, "
                + "COUNT(*) AS listing_count "
                + "FROM property_listings pl "
                + "JOIN areas a ON a.area_key = pl.area_key "
                + "WHERE ")
                .append(sql.whereFragment())
                .append(" AND ").append(FOUR_SEGMENT_GUARD);
        List<Object> params = new ArrayList<>(sql.params());
        appendTypeFilter(sb, params, normalizedType);
        sb.append(" GROUP BY pl.area_key, a.name, a.geo_center_lat, a.geo_center_lon "
                + "ORDER BY listing_count DESC, a.name ASC, pl.area_key ASC LIMIT ?");
        params.add(limit);
        return runExplain(sb.toString(), params);
    }

    private static void appendTypeFilter(StringBuilder sb, List<Object> params, String normalizedType) {
        if (normalizedType != null) {
            sb.append(" AND LOWER(pl.property_type) = LOWER(?)");
            params.add(normalizedType);
        }
    }

    private String runExplain(String explainSql, List<Object> params) {
        List<String> lines = jdbcTemplate.query(explainSql,
                (rs, rowNum) -> rs.getString(1), params.toArray());
        return String.join("\n", lines);
    }
}
