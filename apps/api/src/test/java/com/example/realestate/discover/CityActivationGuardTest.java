package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Testcontainers real-DB behavioural test for {@link CityActivationGuard#activeAreaKeysForCity}
 * (#1945 — the OpenSearch-path equivalent of the {@code areas -> cities} subselect mirrored
 * EXACTLY from {@link DiscoverListingPredicateBuilder#build}).
 *
 * <p>Fixture mirrors {@code CityActiveGating1935IT}'s two-city hierarchy: an ACTIVE city with two
 * areas (one of which is itself flagged inactive at the area level via a second, otherwise
 * identical, INACTIVE city — {@code areas} has no per-row {@code is_active} column, so an
 * "inactive area of an otherwise active city" is modelled the same way #1935 models it: a
 * separate city altogether), an INACTIVE city, and an UNKNOWN slug never inserted at all.
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
class CityActivationGuardTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String ACTIVE_CITY = "qa1945active";
    private static final String INACTIVE_CITY = "qa1945inactive";
    private static final String OTHER_ACTIVE_CITY = "qa1945otheractive";
    private static final String UNKNOWN_CITY = "qa1945unknown";

    private static final String ACTIVE_AREA_1 = "QA|QA|" + ACTIVE_CITY + "|Area1";
    private static final String ACTIVE_AREA_2 = "QA|QA|" + ACTIVE_CITY + "|Area2";
    private static final String INACTIVE_AREA = "QA|QA|" + INACTIVE_CITY + "|Area1";
    private static final String OTHER_ACTIVE_AREA = "QA|QA|" + OTHER_ACTIVE_CITY + "|Area1";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityActivationGuard guard;

    @BeforeEach
    void setUp() {
        guard = new CityActivationGuard(jdbcTemplate);

        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug LIKE 'qa1945%'");

        int activeCityId = insertCity(ACTIVE_CITY, true);
        int inactiveCityId = insertCity(INACTIVE_CITY, false);
        int otherActiveCityId = insertCity(OTHER_ACTIVE_CITY, true);

        insertArea(ACTIVE_AREA_1, activeCityId, "Area1");
        insertArea(ACTIVE_AREA_2, activeCityId, "Area2");
        insertArea(INACTIVE_AREA, inactiveCityId, "Area1");
        insertArea(OTHER_ACTIVE_AREA, otherActiveCityId, "Area1");
    }

    private int insertCity(String slug, boolean active) {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.0, ?)",
                slug, slug, active);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, slug);
    }

    private void insertArea(String areaKey, int cityId, String name) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, 13.0, 74.0, 12.99, 73.99, 13.01, 74.01)",
                areaKey, cityId, name);
    }

    // ── EC2/EC7/EC8: active city returns ONLY its own active areas ──────────

    @Test
    @DisplayName("activeAreaKeysForCity: active city returns exactly its own areas")
    void activeCity_returnsExactlyItsOwnAreas() {
        Set<String> result = guard.activeAreaKeysForCity(ACTIVE_CITY);

        assertThat(result).containsExactlyInAnyOrder(ACTIVE_AREA_1, ACTIVE_AREA_2);
    }

    // ── EC2: inactive city -> empty set (fail-closed) ────────────────────────

    @Test
    @DisplayName("activeAreaKeysForCity: inactive city -> empty set")
    void inactiveCity_returnsEmptySet() {
        Set<String> result = guard.activeAreaKeysForCity(INACTIVE_CITY);

        assertThat(result).isEmpty();
    }

    // ── EC3: unknown/typo slug -> empty set, identical shape to inactive ────

    @Test
    @DisplayName("activeAreaKeysForCity: unknown city -> empty set, identical to inactive city")
    void unknownCity_returnsEmptySet_identicalToInactive() {
        Set<String> unknown = guard.activeAreaKeysForCity(UNKNOWN_CITY);
        Set<String> inactive = guard.activeAreaKeysForCity(INACTIVE_CITY);

        assertThat(unknown).isEmpty();
        assertThat(unknown).isEqualTo(inactive);
    }

    // ── EC4/EC8: null/blank citySlug -> empty set WITHOUT a DB round-trip ──

    @Test
    @DisplayName("activeAreaKeysForCity: null citySlug -> empty set, no DB query issued")
    void nullCitySlug_returnsEmptySet_noDbQuery() {
        JdbcOperations spyJdbc = mock(JdbcOperations.class);
        CityActivationGuard spyGuard = new CityActivationGuard(spyJdbc);

        Set<String> result = spyGuard.activeAreaKeysForCity(null);

        assertThat(result).isEmpty();
        org.mockito.Mockito.verifyNoInteractions(spyJdbc);
    }

    @Test
    @DisplayName("activeAreaKeysForCity: blank citySlug -> empty set, no DB query issued")
    void blankCitySlug_returnsEmptySet_noDbQuery() {
        JdbcOperations spyJdbc = mock(JdbcOperations.class);
        CityActivationGuard spyGuard = new CityActivationGuard(spyJdbc);

        Set<String> result = spyGuard.activeAreaKeysForCity("   ");

        assertThat(result).isEmpty();
        org.mockito.Mockito.verifyNoInteractions(spyJdbc);
    }

    // ── EC7: an inactive area of an otherwise-active city is excluded ──────
    //
    // areas has no per-row is_active column — modelled (same as #1935) via a genuinely separate
    // INACTIVE city. The assertion that matters here is CROSS-CITY ISOLATION: querying for
    // ACTIVE_CITY never includes INACTIVE_AREA (which belongs to a different, inactive city),
    // and the areas table join correctly scopes by city_id, not by a global areas table scan.

    @Test
    @DisplayName("activeAreaKeysForCity: an area belonging to a DIFFERENT (inactive) city is excluded "
            + "from the requested active city's result")
    void inactiveAreaOfDifferentCity_excludedFromActiveCityResult() {
        Set<String> result = guard.activeAreaKeysForCity(ACTIVE_CITY);

        assertThat(result).doesNotContain(INACTIVE_AREA);
    }

    // ── EC5: cross-city non-leakage — another ACTIVE city's areas never leak in ──

    @Test
    @DisplayName("activeAreaKeysForCity: cross-city non-leakage — another active city's areas never "
            + "appear in this city's result")
    void crossCityNonLeakage_otherActiveCitysAreasNeverIncluded() {
        Set<String> result = guard.activeAreaKeysForCity(ACTIVE_CITY);

        assertThat(result).doesNotContain(OTHER_ACTIVE_AREA);

        Set<String> otherResult = guard.activeAreaKeysForCity(OTHER_ACTIVE_CITY);
        assertThat(otherResult).containsExactly(OTHER_ACTIVE_AREA);
        assertThat(otherResult).doesNotContainAnyElementsOf(result);
    }

    // ── EC10: guard load failure (DataAccessException) propagates — fail-closed, NOT swallowed ──

    @Test
    @DisplayName("activeAreaKeysForCity: a DataAccessException from the JDBC layer propagates "
            + "(fail-closed) — never silently swallowed to an empty set")
    void dataAccessExceptionFromJdbc_propagates_notSwallowed() {
        JdbcOperations failingJdbc = mock(JdbcOperations.class);
        DataAccessException dbFailure = new TransientDataAccessResourceException("simulated DB outage");
        when(failingJdbc.queryForList(any(String.class), eq(String.class), any()))
                .thenThrow(dbFailure);

        CityActivationGuard failingGuard = new CityActivationGuard(failingJdbc);

        assertThatThrownBy(() -> failingGuard.activeAreaKeysForCity(ACTIVE_CITY))
                .isSameAs(dbFailure);
    }

    // ── Immutability: returned Set cannot be mutated by the caller ──────────

    @Test
    @DisplayName("activeAreaKeysForCity: returned set is immutable")
    void returnedSet_isImmutable() {
        Set<String> result = guard.activeAreaKeysForCity(ACTIVE_CITY);

        assertThatThrownBy(() -> result.add("should-not-be-allowed"))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
