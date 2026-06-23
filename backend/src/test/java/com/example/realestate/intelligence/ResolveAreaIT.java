package com.example.realestate.intelligence;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration tests for {@link BuyerAreaIntelligenceService#resolveArea}.
 *
 * <p>Follows the same structure as {@link BuyerAreaIntelligenceSeededMedianIT}: real Postgres
 * via Testcontainers, Flyway migrations applied on startup, direct snapshot seeding via
 * JdbcTemplate (no listing seeding needed — we test the resolver, not the aggregation pipeline).
 *
 * <p>We seed {@code area_intelligence_snapshot} rows directly (avoiding the ListingRepository
 * aggregation path) because we are testing slug resolution against existing snapshot rows,
 * not the snapshot computation itself. This is the correct anti-fake approach: the resolver
 * reads whatever rows are in the snapshot table, and we need precise control over the
 * (area_key, area_label, activeListingCount) combinations to exercise collision/sort logic.
 *
 * <p>Scenarios:
 * <ul>
 *   <li>IT-R01 – Known slug → 200 matched=true with exact stored area_key.</li>
 *   <li>IT-R02 – Unknown slug → 200 matched=false.</li>
 *   <li>IT-R03 – Collision pair with equal activeListingCount → deterministic winner (area_key ASC).</li>
 *   <li>IT-R04 – k-anon-suppressed area (activeListingCount=1) still resolves matched=true.</li>
 *   <li>IT-R05 – Null area_label → slug derived from area_key last segment.</li>
 * </ul>
 *
 * <h3>Transaction strategy</h3>
 * {@code NOT_SUPPORTED}: tests are not rolled back (mirrors sibling ITs). Cleanup in
 * {@code @AfterEach} deletes all rows with the sentinel area_key prefix.
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
@Import({BuyerAreaIntelligenceService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ResolveAreaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** Sentinel prefix for all area_keys seeded in this IT. Used by @AfterEach cleanup. */
    private static final String SENTINEL = "_rait_";

    /** City slug present in the Flyway seed data (cities table). */
    private static final String CITY = "udupi";

    @Autowired
    private BuyerAreaIntelligenceService service;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute(
                "DELETE FROM area_intelligence_snapshot WHERE area_key LIKE '\\_rait\\_%' ESCAPE '\\'");
    }

    // ── IT-R01: known slug → matched=true ─────────────────────────────────────

    @Test
    @DisplayName("IT-R01: seeded snapshot row matches slug → matched=true, exact area_key returned")
    void it_r01_knownSlug_matchedTrue() {
        seedSnapshot(CITY, SENTINEL + "Malpe", "Malpe", 20);

        ResolveAreaResponse resp = service.resolveArea(CITY, "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo(SENTINEL + "Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe");
        assertThat(resp.citySlug()).isEqualTo(CITY);
        assertThat(resp.areaSlug()).isEqualTo("malpe");
    }

    // ── IT-R02: unknown slug → matched=false ──────────────────────────────────

    @Test
    @DisplayName("IT-R02: no row matches slug → matched=false, areaKey null, params echoed")
    void it_r02_unknownSlug_matchedFalse() {
        // Seed a row that does NOT match the requested slug
        seedSnapshot(CITY, SENTINEL + "Malpe", "Malpe", 20);

        ResolveAreaResponse resp = service.resolveArea(CITY, "no-such-area");

        assertThat(resp.matched()).isFalse();
        assertThat(resp.areaKey()).isNull();
        assertThat(resp.areaLabel()).isNull();
        assertThat(resp.citySlug()).isEqualTo(CITY);
        assertThat(resp.areaSlug()).isEqualTo("no-such-area");
    }

    // ── IT-R03: collision pair, equal count → deterministic winner ────────────

    /**
     * Two snapshot rows with the same slugified area_label ("malpe-beach") and the SAME
     * activeListingCount (10). The resolver must return the one with the lexicographically
     * smaller area_key every time (stable across repeated calls).
     *
     * <p>area_key A (lexicographically smaller) must win over B.
     */
    @RepeatedTest(5)
    @DisplayName("IT-R03 (repeated): collision with equal activeListingCount → area_key ASC winner is stable")
    void it_r03_collision_equalCount_areaKeyAscWins() {
        // Both area_labels slugify to "malpe-beach"
        seedSnapshot(CITY, SENTINEL + "MalpeBeach-B", "Malpe Beach", 10);
        seedSnapshot(CITY, SENTINEL + "MalpeBeach-A", "Malpe Beach", 10);

        ResolveAreaResponse resp = service.resolveArea(CITY, "malpe-beach");

        assertThat(resp.matched()).isTrue();
        // Deterministic winner: area_key ASC → SENTINEL + "MalpeBeach-A" < SENTINEL + "MalpeBeach-B"
        assertThat(resp.areaKey()).isEqualTo(SENTINEL + "MalpeBeach-A");
    }

    // ── IT-R04: k-anon-suppressed area still resolves ─────────────────────────

    /**
     * An area with activeListingCount=1 is below the k-anonymity threshold
     * (AggregationConstants.K_ANON_MIN=10). Its metrics are suppressed in the
     * BuyerAreaIntelligenceService path, but the row EXISTS in the snapshot table.
     * Slug resolution MUST still return matched=true — existence is not suppressed,
     * only metric values.
     */
    @Test
    @DisplayName("IT-R04: k-anon suppressed area (activeListingCount=1) still resolves matched=true")
    void it_r04_suppressedArea_stillResolves() {
        seedSnapshot(CITY, SENTINEL + "TinyVillage", "Tiny Village", 1);

        ResolveAreaResponse resp = service.resolveArea(CITY, "tiny-village");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo(SENTINEL + "TinyVillage");
    }

    // ── IT-R05: null area_label → slug from area_key last segment ────────────

    @Test
    @DisplayName("IT-R05: null area_label -> slug derived from area_key last segment")
    void it_r05_nullLabel_slugFromAreaKeyLastSegment() {
        // Realistic pipe-form area_key: last segment "Padubidri" slugifies to "padubidri".
        // Sentinel "_rait_" is the first segment so the @AfterEach LIKE cleanup still matches.
        String areaKey = SENTINEL + "IN|KA|Udupi|Padubidri";
        seedSnapshotNullLabel(CITY, areaKey, 8);

        ResolveAreaResponse resp = service.resolveArea(CITY, "padubidri");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo(areaKey);
        assertThat(resp.areaLabel()).isNull();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Insert a minimal snapshot row with the given area_label (non-null).
     * confidence='insufficient' satisfies the CHECK constraint regardless of activeListingCount.
     */
    private void seedSnapshot(String citySlug, String areaKey, String areaLabel, int activeListingCount) {
        jdbcTemplate.update("""
                INSERT INTO area_intelligence_snapshot
                    (city_slug, area_key, area_label, computed_at,
                     active_listing_count, fresh_listing_count,
                     price_comparison_sample_count, price_comparison_supported, confidence)
                VALUES (?, ?, ?, now(), ?, 0, ?, false, 'insufficient')
                ON CONFLICT (city_slug, area_key) DO UPDATE
                    SET area_label = EXCLUDED.area_label,
                        active_listing_count = EXCLUDED.active_listing_count
                """,
                citySlug, areaKey, areaLabel, activeListingCount, activeListingCount);
    }

    /**
     * Insert a minimal snapshot row with area_label = NULL (triggers area_key-based slug fallback).
     */
    private void seedSnapshotNullLabel(String citySlug, String areaKey, int activeListingCount) {
        jdbcTemplate.update("""
                INSERT INTO area_intelligence_snapshot
                    (city_slug, area_key, area_label, computed_at,
                     active_listing_count, fresh_listing_count,
                     price_comparison_sample_count, price_comparison_supported, confidence)
                VALUES (?, ?, NULL, now(), ?, 0, ?, false, 'insufficient')
                ON CONFLICT (city_slug, area_key) DO UPDATE
                    SET area_label = NULL,
                        active_listing_count = EXCLUDED.active_listing_count
                """,
                citySlug, areaKey, activeListingCount, activeListingCount);
    }
}
