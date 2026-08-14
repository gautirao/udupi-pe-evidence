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

/**
 * #2151 PR B correction pass (B1): proves {@link AgriDestinationPortReadinessCheck} correctly
 * distinguishes an active city with ZERO {@code agri_destination_classification} rows (must
 * ERROR-log, by name) from one with rows (must NOT be flagged), against a real Testcontainers
 * Postgres database.
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
}
