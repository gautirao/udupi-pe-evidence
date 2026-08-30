package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Testcontainers integration test for the V113 migration itself (#1882 Track A PR1) —
 * proves it is expand-only, creates the four new tables + five OSM provenance columns, and
 * seeds exactly the two per-city policy rows (never {@code city_regions}/
 * {@code city_region_memberships}, which stay job-populated / empty).
 *
 * <p>Mirrors {@code DiscoverSummaryServiceIT}'s V106-idempotency-via-raw-script-rerun pattern
 * for {@link #policySeedIsIdempotentOnRerun()}.
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
class V113CityRegionGeometryMigrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V113 creates city_region_policy, city_regions, city_region_memberships, "
            + "regional_area_overrides, and five nullable OSM provenance columns on areas")
    void createsAllFourTablesAndOsmProvenanceColumns() {
        for (String table : new String[] {
                "city_region_policy", "city_regions", "city_region_memberships", "regional_area_overrides"
        }) {
            Integer exists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?",
                    Integer.class, table);
            assertThat(exists).as("table %s exists", table).isEqualTo(1);
        }

        for (String column : new String[] {
                "osm_element_type", "osm_element_id", "osm_version", "osm_extract_date", "geometry_source"
        }) {
            String nullable = jdbcTemplate.queryForObject(
                    "SELECT is_nullable FROM information_schema.columns "
                            + "WHERE table_schema = 'public' AND table_name = 'areas' AND column_name = ?",
                    String.class, column);
            assertThat(nullable).as("areas.%s is nullable", column).isEqualTo("YES");
        }
    }

    @Test
    @DisplayName("migration is expand-only: city_regions and city_region_memberships are empty "
            + "immediately after Flyway — no region reindex job runs as part of the migration")
    void migrationIsExpandOnly_noRegionReindexJob() {
        Integer regionRows = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_regions", Integer.class);
        Integer membershipRows = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_region_memberships", Integer.class);

        assertThat(regionRows).isEqualTo(0);
        assertThat(membershipRows).isEqualTo(0);
    }

    @Test
    @DisplayName("seeds bangalore city_region_policy row: CENTRAL_CARDINAL_8, radius 8km, fingerprint NULL")
    void seedsBangalorePolicyRow_cardinal8_radius8() {
        var row = jdbcTemplate.queryForMap(
                "SELECT p.region_model, p.central_radius_km, p.policy_fingerprint "
                        + "FROM city_region_policy p JOIN cities c ON c.id = p.city_id WHERE c.slug = 'bangalore'");

        assertThat(row.get("region_model")).isEqualTo("CENTRAL_CARDINAL_8");
        assertThat(((Number) row.get("central_radius_km")).doubleValue()).isEqualTo(8.0);
        assertThat(row.get("policy_fingerprint")).isNull();
    }

    @Test
    @DisplayName("seeds udupi city_region_policy row: CENTRAL_CARDINAL_4, radius 4km, fingerprint NULL")
    void seedsUdupiPolicyRow_cardinal4_radius4() {
        var row = jdbcTemplate.queryForMap(
                "SELECT p.region_model, p.central_radius_km, p.policy_fingerprint "
                        + "FROM city_region_policy p JOIN cities c ON c.id = p.city_id WHERE c.slug = 'udupi'");

        assertThat(row.get("region_model")).isEqualTo("CENTRAL_CARDINAL_4");
        assertThat(((Number) row.get("central_radius_km")).doubleValue()).isEqualTo(4.0);
        assertThat(row.get("policy_fingerprint")).isNull();
    }

    @Test
    @DisplayName("re-executing the V113 script against an already-migrated container is a no-op "
            + "(ON CONFLICT DO NOTHING) — no duplicate policy rows, no exception")
    void policySeedIsIdempotentOnRerun() throws Exception {
        Integer policyRowsBefore = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_region_policy", Integer.class);

        String script;
        try (var in = new ClassPathResource("db/migration/V113__city_region_geometry_foundation.sql").getInputStream()) {
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertDoesNotThrow(() -> {
            try (Connection conn = jdbcTemplate.getDataSource().getConnection();
                 var stmt = conn.createStatement()) {
                stmt.execute(script);
            }
        });

        Integer policyRowsAfter = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_region_policy", Integer.class);
        assertThat(policyRowsAfter).isEqualTo(policyRowsBefore);

        Integer bangaloreRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_policy p JOIN cities c ON c.id = p.city_id WHERE c.slug = 'bangalore'",
                Integer.class);
        assertThat(bangaloreRows).isEqualTo(1);

        Integer regionRowsAfter = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_regions", Integer.class);
        Integer membershipRowsAfter = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_region_memberships", Integer.class);
        assertThat(regionRowsAfter).isEqualTo(0);
        assertThat(membershipRowsAfter).isEqualTo(0);
    }
}
