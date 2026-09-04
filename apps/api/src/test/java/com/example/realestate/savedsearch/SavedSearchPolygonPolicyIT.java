package com.example.realestate.savedsearch;

import com.example.realestate.discover.PolygonGeographicSafetyPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * #2019 Slice A, review ruling 4: POLYGON rejection through the REAL
 * {@link PolygonGeographicSafetyPolicy} (real PostGIS via Testcontainers), surfacing the
 * discover/listings reason codes ({@code polygon_scope_too_broad},
 * {@code polygon_outside_searchable_city}) unchanged through {@link SavedSearchService}, and
 * persisting nothing on rejection. {@code SavedSearchServiceIT} covers the service's
 * delegation with a mock; this class proves the wiring against the policy's actual geometry
 * arithmetic so a saved search can never commit a polygon the listings endpoint would refuse.
 *
 * <p>Synthetic geography is copied from {@code PolygonGeographicSafetyPolicyIT} (#2420): one
 * rectangular city and four contiguous ~4.6 km^2 wards laid out west-to-east.
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword="
})
class SavedSearchPolygonPolicyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private SavedSearchRepository savedSearchRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final UUID USER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-0000000000a1");

    private static final String CITY_WKT =
            "POLYGON((79.50 19.50,80.50 19.50,80.50 20.50,79.50 20.50,79.50 19.50))";
    private static final String AREA_1_WKT =
            "POLYGON((80.00 20.00,80.02 20.00,80.02 20.02,80.00 20.02,80.00 20.00))";
    private static final String AREA_2_WKT =
            "POLYGON((80.02 20.00,80.04 20.00,80.04 20.02,80.02 20.02,80.02 20.00))";
    private static final String AREA_3_WKT =
            "POLYGON((80.04 20.00,80.06 20.00,80.06 20.02,80.04 20.02,80.04 20.00))";
    private static final String AREA_4_WKT =
            "POLYGON((80.06 20.00,80.08 20.00,80.08 20.02,80.06 20.02,80.06 20.00))";

    private String citySlug;
    private int cityId;
    private SavedSearchService service;

    @BeforeEach
    void seedGeographyAndWireRealPolicy() {
        citySlug = "savedsearchpolygontest";
        cityId = jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, citySlug, citySlug, 20.01, 80.04);
        insertBoundary("CITY", null, CITY_WKT);
        insertBoundary("AREA", "TEST|AREA|1", AREA_1_WKT);
        insertBoundary("AREA", "TEST|AREA|2", AREA_2_WKT);
        insertBoundary("AREA", "TEST|AREA|3", AREA_3_WKT);
        insertBoundary("AREA", "TEST|AREA|4", AREA_4_WKT);

        // The real policy, not a mock.
        service = new SavedSearchService(
                savedSearchRepository,
                new PolygonGeographicSafetyPolicy(jdbcTemplate),
                new SavedSearchInserter(savedSearchRepository)); // un-proxied: joins the test tx
    }

    private void insertBoundary(String entityType, String areaKey, String wkt) {
        jdbcTemplate.update(
                "INSERT INTO public.canonical_boundary_geometry "
                        + "(city_id, entity_type, area_key, status, geom, geometry_source) "
                        + "VALUES (?, ?, ?, 'VALID', ST_Multi(ST_GeomFromText(?, 4326)), 'SYNTHETIC_TEST')",
                cityId, entityType, areaKey, wkt);
    }

    /** [lat, lon] corners for an axis-aligned rectangle, the wire format the policy expects. */
    private static List<List<Double>> rect(double latMin, double lonMin, double latMax, double lonMax) {
        return List.of(
                List.of(latMin, lonMin),
                List.of(latMin, lonMax),
                List.of(latMax, lonMax),
                List.of(latMax, lonMin));
    }

    private SavedSearchService.CreateOutcome createPolygon(String slug, List<List<Double>> polygon) {
        return service.create(
                USER_A, slug, ResultScopeKind.POLYGON,
                null, polygon,
                null, null, null, null,
                Map.of(), null, null);
    }

    @Test
    @DisplayName("a polygon contained within one area is accepted by the real policy and persisted")
    void containedPolygon_acceptedAndPersisted() {
        List<List<Double>> polygon = rect(20.005, 80.005, 20.015, 80.015);

        SavedSearchService.CreateOutcome outcome = createPolygon(citySlug, polygon);

        assertThat(outcome.created()).isTrue();
        assertThat(outcome.savedSearch().getResultScopeKind()).isEqualTo(ResultScopeKind.POLYGON);
        assertThat(outcome.savedSearch().getPolygon()).isEqualTo(polygon);
        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).hasSize(1);
    }

    @Test
    @DisplayName("a polygon materially spanning four areas is rejected with the listings reason polygon_scope_too_broad")
    void spansFourAreas_rejectedTooBroad_nothingPersisted() {
        // Same geometry as PolygonGeographicSafetyPolicyIT.materiallySpansFourAreas_rejected:
        // ~4.1 km^2 (under the 12 km^2 size ceiling), overlapping all four wards materially.
        List<List<Double>> polygon = rect(20.00, 80.005, 20.005, 80.075);

        assertThatThrownBy(() -> createPolygon(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST))
                .hasMessageContaining("polygon_scope_too_broad");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }

    @Test
    @DisplayName("a polygon over the absolute size ceiling is rejected as too broad even with zero area overlap")
    void exceedsSizeCeiling_rejectedTooBroad() {
        List<List<Double>> polygon = rect(19.60, 79.60, 19.64, 79.64); // ~18.7 km^2, away from all wards

        assertThatThrownBy(() -> createPolygon(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_scope_too_broad");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }

    @Test
    @DisplayName("a polygon outside the city boundary is rejected with polygon_outside_searchable_city")
    void outsideCity_rejected() {
        List<List<Double>> polygon = rect(25.000, 85.000, 25.005, 85.005);

        assertThatThrownBy(() -> createPolygon(citySlug, polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_outside_searchable_city");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }

    @Test
    @DisplayName("an unresolvable city slug fails closed: the polygon is never accepted")
    void unresolvableCitySlug_failsClosed() {
        List<List<Double>> polygon = rect(20.005, 80.005, 20.015, 80.015);

        assertThatThrownBy(() -> createPolygon("no-such-city-" + UUID.randomUUID(), polygon))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_outside_searchable_city");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }

    @Test
    @DisplayName("polygon fingerprint is vertex-order sensitive (ruling 3 reversible default): same ring, rotated start -> distinct rows")
    void polygonFingerprint_isVertexOrderSensitive() {
        List<List<Double>> ring = rect(20.005, 80.005, 20.015, 80.015);
        List<List<Double>> rotated = List.of(ring.get(1), ring.get(2), ring.get(3), ring.get(0));

        SavedSearchService.CreateOutcome first = createPolygon(citySlug, ring);
        SavedSearchService.CreateOutcome second = createPolygon(citySlug, rotated);

        assertThat(second.created()).isTrue();
        assertThat(second.savedSearch().getFingerprint()).isNotEqualTo(first.savedSearch().getFingerprint());
        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).hasSize(2);
    }

    @Test
    @DisplayName("VIEWPORT rejection uses the shared BboxParser rules through the real service path")
    void viewportOutOfRange_rejectedWithRemappedBboxReason() {
        assertThatThrownBy(() -> service.create(
                USER_A, citySlug, ResultScopeKind.VIEWPORT,
                null, null,
                12.0, 74.0, 13.0, 181.0,
                Map.of(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_viewport_lon_out_of_range");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }
}
