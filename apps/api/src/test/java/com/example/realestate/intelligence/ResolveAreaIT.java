package com.example.realestate.intelligence;

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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration tests for {@link BuyerAreaIntelligenceService#resolveArea}.
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
        jdbcTemplate.execute("DELETE FROM area_intelligence_snapshot");
    }

    // ── IT-R01: known static area slug -> matched=true ─────────────────────────

    @Test
    @DisplayName("IT-R01: known static area slug resolves matched=true")
    void it_r01_knownSlug_matchedTrue() {
        // 'malpe' slug resolves to IN|KA|Udupi|Malpe from V71 static areas seed
        ResolveAreaResponse resp = service.resolveArea(CITY, "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe");
        assertThat(resp.citySlug()).isEqualTo(CITY);
        assertThat(resp.areaSlug()).isEqualTo("malpe");
    }

    // ── IT-R02: unknown slug -> matched=false ──────────────────────────────────

    @Test
    @DisplayName("IT-R02: unknown slug -> matched=false")
    void it_r02_unknownSlug_matchedFalse() {
        ResolveAreaResponse resp = service.resolveArea(CITY, "no-such-area");

        assertThat(resp.matched()).isFalse();
        assertThat(resp.areaKey()).isNull();
        assertThat(resp.areaLabel()).isNull();
        assertThat(resp.citySlug()).isEqualTo(CITY);
        assertThat(resp.areaSlug()).isEqualTo("no-such-area");
    }

    // ── IT-R03: snapshot missing + static area present -> matched=true ─────────

    @Test
    @DisplayName("IT-R03: snapshot missing but area exists in static tables -> matched=true")
    void it_r03_snapshotMissing_staticAreaPresent_matchedTrue() {
        // No snapshot seeded, resolves directly to IN|KA|Udupi|Malpe
        ResolveAreaResponse resp = service.resolveArea(CITY, "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe");
    }

    // ── IT-R04: snapshot present + static area present -> matched=true & enriched ──

    @Test
    @DisplayName("IT-R04: snapshot present -> returns snapshot area_label")
    void it_r04_snapshotPresent_staticAreaPresent_enriched() {
        // Seed snapshot with custom label for the static area key
        seedSnapshot(CITY, "IN|KA|Udupi|Malpe", "Malpe Custom Label", 25);

        ResolveAreaResponse resp = service.resolveArea(CITY, "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe Custom Label");
    }

    // ── IT-R05: null area_label in snapshot -> fallback to null ────────────────

    @Test
    @DisplayName("IT-R05: null area_label in snapshot -> falls back to null")
    void it_r05_nullLabelInSnapshot_fallsBack() {
        // Seed snapshot with null label
        seedSnapshotNullLabel(CITY, "IN|KA|Udupi|Malpe", 10);

        ResolveAreaResponse resp = service.resolveArea(CITY, "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isNull();
    }

    // ── IT-R06: migration/backfill creates and populates area_slug ─────────────

    @Test
    @DisplayName("IT-R06: migration/backfill creates and populates area_slug")
    void it_r06_migrationBackfill_populatesAreaSlug() {
        String slug = jdbcTemplate.queryForObject(
                "SELECT area_slug FROM areas WHERE area_key = 'IN|KA|Udupi|Malpe'", String.class);
        assertThat(slug).isEqualTo("malpe");
    }

    // ── IT-R07: trigger behaviour on name update (slug stability) ─────────────

    @Test
    @DisplayName("IT-R07: trigger keeps area_slug stable on name update, only regenerates if explicitly set to NULL")
    void it_r07_triggerSlugStability() {
        // Confirm initial state
        String initialSlug = jdbcTemplate.queryForObject(
                "SELECT area_slug FROM areas WHERE area_key = 'IN|KA|Udupi|Malpe'", String.class);
        assertThat(initialSlug).isEqualTo("malpe");

        // Update display name of Malpe
        jdbcTemplate.update("UPDATE areas SET name = 'Malpe New Port' WHERE area_key = 'IN|KA|Udupi|Malpe'");

        // Verify area_slug remains unchanged to protect public URL routes
        String unchangedSlug = jdbcTemplate.queryForObject(
                "SELECT area_slug FROM areas WHERE area_key = 'IN|KA|Udupi|Malpe'", String.class);
        assertThat(unchangedSlug).isEqualTo("malpe");

        // Explicitly trigger regeneration by setting it to NULL
        jdbcTemplate.update("UPDATE areas SET area_slug = NULL WHERE area_key = 'IN|KA|Udupi|Malpe'");

        // Verify slug regenerates dynamically based on the updated name
        String regeneratedSlug = jdbcTemplate.queryForObject(
                "SELECT area_slug FROM areas WHERE area_key = 'IN|KA|Udupi|Malpe'", String.class);
        assertThat(regeneratedSlug).isEqualTo("malpe-new-port");

        // Restore original data to leave clean DB state
        jdbcTemplate.update("UPDATE areas SET name = 'Malpe', area_slug = 'malpe' WHERE area_key = 'IN|KA|Udupi|Malpe'");
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
