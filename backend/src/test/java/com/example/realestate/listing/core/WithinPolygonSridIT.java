package com.example.realestate.listing.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression guard for issue #1705.
 *
 * <p>Root cause (now fixed): {@code findLiveListingsWithinPolygon} used
 * {@code ST_Point(longitude, latitude)} which produces SRID=0 (unknown),
 * while {@code ST_GeomFromText(:polygonWkt, 4326)} produces SRID=4326.
 * PostGIS {@code ST_Contains} raised "Operation on mixed SRID geometries".
 *
 * <p>Fix: {@code ST_SetSRID(ST_Point(longitude, latitude), 4326)} applied to both
 * the main query and the {@code countQuery} in {@link ListingRepository}.
 *
 * <p>This test PASSES after the fix. It exercises both the main query (content) and
 * the count query (totalElements) via {@code Page}.
 *
 * <p>Requires Docker — uses {@code postgis/postgis:15-3.4} image via Testcontainers.
 * Run with: {@code mvn -f backend/pom.xml -Pwithin-polygon-srid-it verify}
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Tag("integration")
@TestPropertySource(properties = {
        // Disable SSL — Testcontainers Postgres doesn't use SSL
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        // Allow Hibernate to send String values into Postgres enum columns
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // Include test stubs (auth schema) before real migrations
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        // Override to empty so V73's CREATE INDEX runs without CONCURRENTLY.
        "spring.flyway.placeholders.concurrently_keyword="
})
class WithinPolygonSridIT {

    // postgis/postgis:15-3.4 includes PostGIS extension — required for ST_SetSRID / ST_Contains / ST_GeomFromText.
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ListingRepository listingRepository;

    @Test
    @DisplayName("findLiveListingsWithinPolygon — enclosing polygon returns listing; non-enclosing returns empty (SRID fix regression guard)")
    void findLiveListingsWithinPolygon_sridFixed_enclosingReturnsListing_nonEnclosingReturnsEmpty() {
        // Arrange: a LIVE listing at (lat=13.35, lon=74.79).
        // The point is unambiguously inside the enclosing polygon below — not on any edge or vertex.
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, status, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, 'LIVE', ?, ?, now(), now())",
                id, 13.35, 74.79);

        // Enclosing polygon — ST_Contains is boundary-exclusive; point is strictly interior.
        // WKT uses (longitude latitude) order: lon=74.79, lat=13.35 is inside this box.
        String enclosing = "POLYGON((74.78 13.34, 74.80 13.34, 74.80 13.36, 74.78 13.36, 74.78 13.34))";

        // Act — exercises both main query (content) and countQuery (totalElements).
        Page<Listing> result = listingRepository.findLiveListingsWithinPolygon(
                enclosing, PageRequest.of(0, 10));

        // Assert: exactly one listing returned, no exception (proves SRID fix works).
        assertThat(result.getContent())
                .as("Enclosing polygon must return the inserted listing")
                .hasSize(1);
        assertThat(result.getTotalElements())
                .as("Count query must also return 1 (exercises the countQuery path)")
                .isEqualTo(1L);

        // Non-enclosing polygon far from the listing's coordinates — must return empty.
        String nonEnclosing = "POLYGON((10.0 10.0, 10.1 10.0, 10.1 10.1, 10.0 10.1, 10.0 10.0))";
        Page<Listing> empty = listingRepository.findLiveListingsWithinPolygon(
                nonEnclosing, PageRequest.of(0, 10));

        assertThat(empty.getContent())
                .as("Non-enclosing polygon must return no listings")
                .isEmpty();
        assertThat(empty.getTotalElements())
                .as("Count query for non-enclosing polygon must return 0")
                .isEqualTo(0L);
    }
}
