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

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Regression guard for #2675: <b>every active city must have exactly one valid
 * {@code city_region_policy} row.</b>
 *
 * <p>Before V142 this invariant was violated by two of the four cities V71 seeds as
 * {@code is_active = true} (mangalore, kundapur), which made Admin City Launch's
 * prerequisite self-materialisation (#2163) fail permanently with
 * {@link RegionOnboardingBlockedException.Reason#MISSING_POLICY} — a state Retry/Rerun
 * could not repair, because retrying re-runs the identical check.
 *
 * <p>{@link #everyActiveCityHasExactlyOneValidPolicyRow()} is the guard proper: it is
 * schema-driven, not a list of city names, so adding a fifth active city in a future
 * migration without a policy row fails this test rather than failing silently in the
 * Admin UI. Run against current {@code main} minus V142 it fails, naming mangalore and
 * kundapur.
 *
 * <p>Mirrors {@link V113CityRegionGeometryMigrationIT}'s Testcontainers + raw-script-rerun
 * shape (that class is the V113-specific equivalent; this one is the cross-city invariant).
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
class CityRegionPolicyCoverageIT {

    /** The models {@code city_region_policy.region_model}'s CHECK constraint admits (V113). */
    private static final List<String> SUPPORTED_REGION_MODELS =
            List.of("CENTRAL_CARDINAL_4", "CENTRAL_CARDINAL_8", "DIRECTIONAL_8");

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("INVARIANT: every active city has exactly one city_region_policy row, with a "
            + "supported region_model and a positive central_radius_km")
    void everyActiveCityHasExactlyOneValidPolicyRow() {
        List<Map<String, Object>> uncovered = jdbcTemplate.queryForList("""
                SELECT c.id, c.slug, COUNT(p.city_id) AS policy_rows
                FROM public.cities c
                LEFT JOIN public.city_region_policy p ON p.city_id = c.id
                WHERE c.is_active
                GROUP BY c.id, c.slug
                HAVING COUNT(p.city_id) <> 1
                ORDER BY c.id
                """);

        assertThat(uncovered)
                .as("active cities without exactly one city_region_policy row — such a city fails "
                        + "Admin City Launch with MISSING_POLICY and cannot be repaired by Retry (#2675)")
                .isEmpty();

        List<Map<String, Object>> policies = jdbcTemplate.queryForList("""
                SELECT c.slug, p.region_model, p.central_radius_km
                FROM public.cities c
                JOIN public.city_region_policy p ON p.city_id = c.id
                WHERE c.is_active
                ORDER BY c.id
                """);

        // Guards the invariant's own preconditions: an empty result set would make the
        // assertions below vacuously true.
        assertThat(policies).as("active cities carrying a policy row").isNotEmpty();

        for (Map<String, Object> row : policies) {
            String slug = (String) row.get("slug");
            assertThat((String) row.get("region_model"))
                    .as("region_model for active city '%s'", slug)
                    .isIn(SUPPORTED_REGION_MODELS);
            assertThat(((Number) row.get("central_radius_km")).doubleValue())
                    .as("central_radius_km for active city '%s'", slug)
                    .isGreaterThan(0.0);
        }
    }

    @Test
    @DisplayName("V142 seeds mangalore and kundapur as CENTRAL_CARDINAL_4 / 4km with a NULL "
            + "fingerprint, and leaves the pre-existing bangalore/udupi rows untouched")
    void v142SeedsTheTwoMissingCitiesAndTouchesNoOther() {
        for (String slug : new String[] {"mangalore", "kundapur"}) {
            Map<String, Object> row = jdbcTemplate.queryForMap("""
                    SELECT p.region_model, p.central_radius_km, p.policy_fingerprint
                    FROM public.city_region_policy p
                    JOIN public.cities c ON c.id = p.city_id
                    WHERE c.slug = ?
                    """, slug);
            assertThat(row.get("region_model")).as("region_model for %s", slug).isEqualTo("CENTRAL_CARDINAL_4");
            assertThat(((Number) row.get("central_radius_km")).doubleValue())
                    .as("central_radius_km for %s", slug).isEqualTo(4.0);
            assertThat(row.get("policy_fingerprint"))
                    .as("fingerprint is stamped by CityRegionOnboardingService.apply(), not by the migration")
                    .isNull();
        }

        // V142 must not have rewritten what V113 seeded.
        Map<String, Object> udupi = jdbcTemplate.queryForMap(
                "SELECT p.region_model, p.central_radius_km FROM public.city_region_policy p "
                        + "JOIN public.cities c ON c.id = p.city_id WHERE c.slug = 'udupi'");
        assertThat(udupi.get("region_model")).isEqualTo("CENTRAL_CARDINAL_4");
        assertThat(((Number) udupi.get("central_radius_km")).doubleValue()).isEqualTo(4.0);

        Map<String, Object> bangalore = jdbcTemplate.queryForMap(
                "SELECT p.region_model, p.central_radius_km FROM public.city_region_policy p "
                        + "JOIN public.cities c ON c.id = p.city_id WHERE c.slug = 'bangalore'");
        assertThat(bangalore.get("region_model")).isEqualTo("CENTRAL_CARDINAL_8");
        assertThat(((Number) bangalore.get("central_radius_km")).doubleValue()).isEqualTo(8.0);
    }

    @Test
    @DisplayName("re-executing the V142 script against an already-migrated container is a no-op "
            + "(ON CONFLICT DO NOTHING) — no duplicate rows, no value drift, no exception")
    void v142IsIdempotentOnRerun() throws Exception {
        Integer rowsBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.city_region_policy", Integer.class);
        List<Map<String, Object>> before = jdbcTemplate.queryForList(
                "SELECT city_id, region_model, central_radius_km FROM public.city_region_policy ORDER BY city_id");

        String script;
        try (var in = new ClassPathResource(
                "db/migration/V142__seed_mangalore_kundapur_region_policy.sql").getInputStream()) {
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }

        assertDoesNotThrow(() -> {
            try (Connection conn = jdbcTemplate.getDataSource().getConnection();
                 var stmt = conn.createStatement()) {
                stmt.execute(script);
            }
        });

        Integer rowsAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.city_region_policy", Integer.class);
        assertThat(rowsAfter).isEqualTo(rowsBefore);

        List<Map<String, Object>> after = jdbcTemplate.queryForList(
                "SELECT city_id, region_model, central_radius_km FROM public.city_region_policy ORDER BY city_id");
        assertThat(after).isEqualTo(before);
    }
}
