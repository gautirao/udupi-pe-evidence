package com.example.realestate.discover;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.event.Level;
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

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * #2151 PR B correction pass (B1 + B2): proves {@link AgriDestinationPortReadinessCheck} correctly
 * distinguishes an active city with ZERO {@code agri_destination_classification} rows (must
 * ERROR-log, by name) from one with rows (must NOT be flagged), against a real Testcontainers
 * Postgres database.
 *
 * <p><b>B2 (BLOCKING review finding on PR #2158).</b> The B1 startup check alone ERROR-logs the gap
 * but still lets the app start and serve a normal 200 {@code {"groups":[]}} for a never-promoted
 * active city — indistinguishable from a city that genuinely has zero Agri corridors. The tests
 * below prove {@link AgriDestinationPortPostgresAdapter#findDestinations} now fails CLOSED with a
 * distinguishable 503 for the never-promoted case (reusing this same class' row-count logic via
 * {@link AgriDestinationPortReadinessCheck#cityHasZeroAgriDestinationRows}), while a promoted city's
 * genuinely-empty-under-these-filters case still returns a normal 200 empty list — the honest-zero
 * behaviour established elsewhere in #2151 PR B is not broken by this correction.
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
class AgriDestinationPortReadinessCheckIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_WITH_ROWS = "readiness2151-withrows";
    private static final String CITY_WITHOUT_ROWS = "readiness2151-norows";
    private static final String AREA_KEY = "IN|KA|Readiness2151|North";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AgriDestinationPortReadinessCheck readinessCheck;
    private ListAppender<ILoggingEvent> listAppender;
    private Logger logbackLogger;

    @BeforeEach
    void setUp() {
        readinessCheck = new AgriDestinationPortReadinessCheck(jdbcTemplate);

        jdbcTemplate.update("DELETE FROM agri_destination_classification");
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN "
                + "(SELECT id FROM cities WHERE slug IN (?, ?))", CITY_WITH_ROWS, CITY_WITHOUT_ROWS);
        jdbcTemplate.update("DELETE FROM cities WHERE slug IN (?, ?)", CITY_WITH_ROWS, CITY_WITHOUT_ROWS);

        int cityWithRowsId = jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.0, true) RETURNING id",
                Integer.class, CITY_WITH_ROWS, CITY_WITH_ROWS);
        jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.0, true) RETURNING id",
                Integer.class, CITY_WITHOUT_ROWS, CITY_WITHOUT_ROWS);

        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, 13.02, 74.0, 'ACTIVE')",
                AREA_KEY, cityWithRowsId, AREA_KEY);
        jdbcTemplate.update(
                "INSERT INTO public.agri_destination_classification "
                        + "(city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, "
                        + " direction_key, distance_band_key, generator_version, generated_at) "
                        + "VALUES (?, ?, 13.0, 74.0, 5.0, 0.0, 'N', '0_10', 'test-generator-v1', now())",
                cityWithRowsId, AREA_KEY);
        // CITY_WITHOUT_ROWS intentionally gets no agri_destination_classification row — this is
        // the "promoted before V125/PR A existed" scenario B1 exists to catch.

        logbackLogger = (Logger) LoggerFactory.getLogger(AgriDestinationPortReadinessCheck.class);
        listAppender = new ListAppender<>();
        listAppender.start();
        logbackLogger.addAppender(listAppender);
    }

    @AfterEach
    void tearDown() {
        logbackLogger.detachAppender(listAppender);
    }

    @Test
    @DisplayName("findActiveCitiesMissingAgriDestinationRows: flags the zero-row city, not the with-rows city")
    void findActiveCitiesMissingAgriDestinationRows_flagsOnlyTheZeroRowCity() {
        List<String> missing = readinessCheck.findActiveCitiesMissingAgriDestinationRows();

        assertThat(missing).contains(CITY_WITHOUT_ROWS);
        assertThat(missing).doesNotContain(CITY_WITH_ROWS);
    }

    @Test
    @DisplayName("checkAgriDestinationClassificationCoverage: ERROR-logs the zero-row city by name, "
            + "never mentions the with-rows city at ERROR level")
    void checkAgriDestinationClassificationCoverage_errorLogsZeroRowCityOnly() {
        readinessCheck.checkAgriDestinationClassificationCoverage();

        List<ILoggingEvent> errorEvents = listAppender.list.stream()
                .filter(e -> e.getLevel().toString().equals(Level.ERROR.toString()))
                .toList();

        assertThat(errorEvents)
                .as("at least one ERROR log must name the zero-row city")
                .anyMatch(e -> e.getFormattedMessage().contains(CITY_WITHOUT_ROWS));
        assertThat(errorEvents)
                .as("the with-rows city must never be named in an ERROR log by this check")
                .noneMatch(e -> e.getFormattedMessage().contains(CITY_WITH_ROWS));
    }

    @Test
    @DisplayName("a city with rows is absent from the missing-rows list even when it is the only "
            + "test-fixture city active (isolated from whatever else Flyway seeded as active)")
    void cityWithRows_isolatedAsOnlyFixtureCityActive_neverInMissingRowsList() {
        jdbcTemplate.update("UPDATE cities SET is_active = false WHERE slug = ?", CITY_WITHOUT_ROWS);

        // NOTE: does not assert "zero ERROR logs overall" — Flyway seeds other active cities
        // (e.g. udupi, bangalore) that also have zero agri_destination_classification rows in
        // this fixture (nothing in this test promotes them), so this check will legitimately
        // ERROR-log THOSE too. The behaviour under test is narrower and unambiguous: the
        // with-rows city must never appear in the missing-rows list, regardless of what else is
        // active in the database.
        List<String> missing = readinessCheck.findActiveCitiesMissingAgriDestinationRows();
        assertThat(missing).doesNotContain(CITY_WITH_ROWS);
    }

    // ── B2: findDestinations fails closed for a never-promoted active city ─────────────────────

    @Test
    @DisplayName("findDestinations: an ACTIVE city with ZERO agri_destination_classification rows "
            + "at all gets a distinguishable 503 AGRI_DESTINATIONS_NOT_YET_PROMOTED, not a silent "
            + "200 empty groups list")
    void findDestinations_activeCityNeverPromoted_failsClosedWith503() {
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        AgriDestinationPort port = new AgriDestinationPortPostgresAdapter(jdbcTemplate, guard, readinessCheck);

        AgriDestinationPort.DestinationScopeQuery query = new AgriDestinationPort.DestinationScopeQuery(
                CITY_WITHOUT_ROWS, null, null, new AgriDestinationPort.AgriDestinationFilters(null), false);

        assertThatThrownBy(() -> port.findDestinations(query))
                .as("a never-promoted active city must fail closed, NOT return the same empty shape "
                        + "as a genuinely zero-corridor promoted city")
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .satisfies(ex -> {
                    org.springframework.web.server.ResponseStatusException rse =
                            (org.springframework.web.server.ResponseStatusException) ex;
                    assertThat(rse.getStatusCode().value()).isEqualTo(503);
                    assertThat(rse.getReason()).isEqualTo("AGRI_DESTINATIONS_NOT_YET_PROMOTED");
                });
    }

    @Test
    @DisplayName("findDestinations: an ACTIVE, PROMOTED city with a direction filter that legitimately "
            + "matches zero destinations still returns a normal 200 empty list — the honest-zero "
            + "behaviour is NOT broken by the B2 fail-closed guard")
    void findDestinations_promotedCityLegitimateZeroMatch_stillReturns200Empty() {
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        AgriDestinationPort port = new AgriDestinationPortPostgresAdapter(jdbcTemplate, guard, readinessCheck);

        // CITY_WITH_ROWS has exactly one classification row, direction_key='N' (see setUp). A
        // direction filter for 'S' is a legitimate zero-match query against a PROMOTED city — must
        // NOT be conflated with "never promoted at all".
        AgriDestinationPort.DestinationScopeQuery query = new AgriDestinationPort.DestinationScopeQuery(
                CITY_WITH_ROWS, "S", null, new AgriDestinationPort.AgriDestinationFilters(null), false);

        AgriDestinationPort.DestinationScope scope = port.findDestinations(query);

        assertThat(scope.destinations())
                .as("a promoted city's genuine zero-match-for-this-filter case must stay a normal "
                        + "empty 200, not be upgraded to a 503")
                .isEmpty();
    }
}
