package com.example.realestate.discover;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
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

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test (#2015) for the real spatial {@code viewportScope} bbox predicate
 * (VIEWPORT result scope) against a real PostGIS instance, across both the listings and
 * markers service paths.
 *
 * <p>Seeds five listings within the same city (Udupi, per the V71 seed): three inside or on
 * the boundary of a fixed viewport bbox, and two deliberately outside it (one north, one
 * west). Value-distinct latitude/longitude/{@code created_at} per row so a boundary bug,
 * an ordering bug, or a duplicate-row bug each produce a distinguishable failure rather than
 * a bare count mismatch.
 *
 * <p>Mirrors the {@code @DataJpaTest} + {@code postgis/postgis:15-3.4} Testcontainers harness
 * established by {@link GroupAreaKeyFilterIT} (empty {@code concurrently_keyword} placeholder
 * so V73's {@code CREATE INDEX CONCURRENTLY} runs inside Flyway's transaction). Uses the
 * CURRENT 24-arg {@link DiscoverListingsQuery} backward-compat constructor and the current
 * 22-field {@link DiscoverListingPredicateBuilder.Filters} record (both re-confirmed against
 * the live source for this test, since {@code GroupAreaKeyFilterIT}'s own helpers are stale
 * relative to the #2016 {@code viewportScope} field addition and are not usable as a literal
 * source of the constructor arities here).
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
class ViewportScopeSpatialIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // Udupi seed (V71) — same area_key/city used by GroupAreaKeyFilterIT.
    private static final String AREA_KEY = "IN|KA|Udupi|Manipal";
    private static final String CITY = "udupi";

    // Fixed viewport bbox: south=13.30, west=74.70, north=13.40, east=74.80.
    private static final DiscoverListingPredicateBuilder.Bbox VIEWPORT =
            new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverListingsService listingsService;
    private DiscoverMarkersService markersService;

    private String idA;         // inside, oldest
    private String idBoundary;  // exactly on the SW corner — boundary-inclusive proof
    private String idB;         // inside, newest
    private String idOutsideNorth;
    private String idOutsideWest;

    @BeforeEach
    void setUp() {
        listingsService = new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        markersService = new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        jdbcTemplate.update("DELETE FROM property_listings");

        OffsetDateTime base = OffsetDateTime.now();
        idA = insertListing(13.35, 74.75, base);                    // inside, oldest
        idBoundary = insertListing(13.30, 74.70, base.plusSeconds(1)); // on SW boundary corner
        idB = insertListing(13.39, 74.79, base.plusSeconds(2));        // inside, newest
        idOutsideNorth = insertListing(13.45, 74.75, base.plusSeconds(3)); // north of bbox
        idOutsideWest = insertListing(13.35, 74.65, base.plusSeconds(4));  // west of bbox
    }

    @Test
    @DisplayName("listings: viewportScope is boundary-inclusive, excludes out-of-bounds rows, "
            + "orders by created_at DESC, and returns no duplicates")
    void listings_viewportScope_boundaryInclusive_ordersDesc_noDuplicates() {
        DiscoverListingsPage page = listingsService.getListings(listingsQuery(VIEWPORT, 0, 10));

        List<String> ids = page.content().stream().map(DiscoverListingResponse::id).toList();

        assertThat(ids)
                .as("boundary-inclusive match, ordered by created_at DESC (newest first)")
                .containsExactly(idB, idBoundary, idA);
        assertThat(new HashSet<>(ids)).as("no duplicate rows").hasSize(3);
        assertThat(ids)
                .as("rows outside the bbox must never appear")
                .doesNotContain(idOutsideNorth, idOutsideWest);
        assertThat(page.totalElements()).isEqualTo(3);
    }

    @Test
    @DisplayName("listings: viewportScope pagination is correct across pages")
    void listings_viewportScope_paginatesCorrectlyAcrossPages() {
        DiscoverListingsPage pageOne = listingsService.getListings(listingsQuery(VIEWPORT, 0, 2));
        assertThat(pageOne.content().stream().map(DiscoverListingResponse::id).toList())
                .containsExactly(idB, idBoundary);
        assertThat(pageOne.totalElements()).isEqualTo(3);
        assertThat(pageOne.totalPages()).isEqualTo(2);

        DiscoverListingsPage pageTwo = listingsService.getListings(listingsQuery(VIEWPORT, 1, 2));
        assertThat(pageTwo.content().stream().map(DiscoverListingResponse::id).toList())
                .containsExactly(idA);
        assertThat(pageTwo.totalElements()).isEqualTo(3);
        assertThat(pageTwo.totalPages()).isEqualTo(2);
    }

    /**
     * Anon vs auth parity proof. Neither {@link DiscoverListingsService#getListings} nor
     * {@link DiscoverMarkersService#getMarkers} accept any identity/auth parameter — mirroring
     * the structural argument established by {@code AgriDestinationPortContractIT}
     * ("port always returns EXACT coordinates and price — anon coarsening/withholding has ...
     * no anon branch exists at this layer"). Calling both services directly with the same
     * {@code viewportScope} and asserting they resolve to the identical ID set IS the parity
     * proof: there is no code path in either service that could diverge by caller identity.
     */
    @Test
    @DisplayName("viewportScope: listings and markers paths agree on the same matching ID set "
            + "(anon/auth parity — no identity branch exists at the service layer)")
    void viewportScope_listingsAndMarkersAgree_onSameIdSet_noAnonBranch() {
        DiscoverListingsPage page = listingsService.getListings(listingsQuery(VIEWPORT, 0, 10));
        Set<String> listingIds = page.content().stream()
                .map(DiscoverListingResponse::id)
                .collect(Collectors.toSet());

        DiscoverMarkersResponse markers = markersService.getMarkers(markersFilters(VIEWPORT));
        Set<String> markerIds = markers.markers().stream()
                .map(DiscoverMarker::id)
                .collect(Collectors.toSet());

        assertThat(listingIds).hasSize(3);
        assertThat(markerIds)
                .as("markers and listings must resolve the same viewportScope to the same rows")
                .isEqualTo(listingIds);
    }

    @Test
    @DisplayName("listings: viewportScope=null is backward-compatible and applies no spatial filter")
    void listings_viewportScopeNull_returnsAllListings_backwardCompat() {
        DiscoverListingsPage page = listingsService.getListings(listingsQuery(null, 0, 10));

        assertThat(page.content()).hasSize(5);
        assertThat(page.totalElements()).isEqualTo(5);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private DiscoverListingsQuery listingsQuery(
            DiscoverListingPredicateBuilder.Bbox viewportScope, int page, int size) {
        return new DiscoverListingsQuery(
                CITY,
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null,
                page, size, false, null,
                null,
                viewportScope
        );
    }

    private DiscoverListingPredicateBuilder.Filters markersFilters(
            DiscoverListingPredicateBuilder.Bbox viewportScope) {
        return new DiscoverListingPredicateBuilder.Filters(
                CITY,
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, null, null,
                null,
                viewportScope
        );
    }

    private String insertListing(double lat, double lon, OffsetDateTime createdAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, "
                        + " 'house', ?, ?, ?, ?)",
                id, AREA_KEY, lat, lon, createdAt, createdAt);
        return id.toString();
    }
}
