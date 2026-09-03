package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
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

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Real Postgres + PostGIS Testcontainers proof for issue #2015 ("Search this area" viewport
 * narrowing on the anonymous-safe {@code GET /api/discover/cities/{city}/listings} path).
 *
 * <p>Mirrors the harness pattern of {@link ViewportScopeSpatialIT} (authenticated viewportScope
 * path) and the direct-service-invocation style of {@link Issue2051RentPriceReproIT}, applied to
 * {@link CityAreaListingsService#getAreaListings} / {@link CityAreaListingsController}, which is
 * the endpoint actually reachable by anonymous callers (unlike {@code DiscoverListingsController}
 * / {@code DiscoverMarkersController}, which are intentionally NOT permitAll).
 *
 * <p>Proves the four hard requirements that need a real spatially-indexed database:
 * <ul>
 *   <li>(a) a bbox request returns only intersecting rows and still respects the per-area cap</li>
 *   <li>(b) the anon bbox response has identical field visibility/values to the anon non-bbox
 *       response for the same underlying row (boundary/parity proof)</li>
 *   <li>(c) malformed / non-finite / oversized-span bounds are rejected with 400 by the real
 *       controller method (not just the isolated {@link BboxParser} unit under test elsewhere)</li>
 *   <li>(d) the existing non-bbox anon call path is unaffected — all rows still return when no
 *       bbox is supplied</li>
 * </ul>
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
class CityAreaListingsBboxSpatialIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // Real, already-seeded Udupi area (V71 seed) — reused by other Discover ITs in this package.
    private static final String CITY = "udupi";
    private static final String AREA_KEY = "IN|KA|Udupi|Manipal";

    // south, west, north, east — same rectangle/field order used by ViewportScopeSpatialIT for
    // the authenticated path, reused here so both suites exercise the same real-world footprint.
    private static final DiscoverListingPredicateBuilder.Bbox BBOX =
            new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityAreaListingsService service;
    private CityAreaListingsController controller;

    private UUID idInside1;
    private UUID idInside2;
    private UUID idInside3;
    private UUID idBoundary;
    private UUID idOutsideNorth;
    private UUID idOutsideWest;

    @BeforeEach
    void setUp() {
        service = new CityAreaListingsService(jdbcTemplate);
        controller = new CityAreaListingsController(service);

        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key = ?", AREA_KEY);

        Instant now = Instant.now();
        // Newest first (created_at DESC is the ROW_NUMBER ordering used to apply the per-area cap).
        idInside1 = insertListing(13.35, 74.75, now.minusSeconds(1));
        idInside2 = insertListing(13.36, 74.76, now.minusSeconds(2));
        idInside3 = insertListing(13.37, 74.77, now.minusSeconds(3));
        idBoundary = insertListing(13.30, 74.70, now.minusSeconds(4)); // exact SW corner — boundary-inclusive
        idOutsideNorth = insertListing(13.45, 74.75, now.minusSeconds(5)); // outside (north of bbox)
        idOutsideWest = insertListing(13.35, 74.65, now.minusSeconds(6));  // outside (west of bbox)
    }

    private UUID insertListing(double lat, double lon, Instant createdAt) {
        UUID id = UUID.randomUUID();
        Timestamp ts = Timestamp.from(createdAt);
        jdbcTemplate.update("""
                INSERT INTO property_listings
                    (id, area_key, status, archived_at, is_duplicate, is_valid, property_type,
                     listing_purpose, price_paise, trust_tier, title, latitude, longitude,
                     created_at, updated_at)
                VALUES (?, ?, 'LIVE', NULL, false, true, 'apartment', 'sale', 5000000000, 'A',
                        'Bbox Fixture', ?, ?, ?, ?)
                """, id, AREA_KEY, lat, lon, ts, ts);
        return id;
    }

    // ---------------------------------------------------------------------
    // (a) bbox-bounded results respect the per-area cap
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("#2015 (a): bbox request returns only intersecting rows, newest-first, "
            + "and still respects limitPerArea even though 4 rows intersect the rectangle")
    void bboxRequest_respectsCapAndOnlyReturnsIntersectingRows() {
        CityAreaListingsResponse resp = service.getAreaListings(
                CITY, List.of(AREA_KEY), 2, null, null, null, null, null, null, null, BBOX, false);

        List<AreaListingCard> cards = resp.areas().get(0).listings();

        // 4 rows intersect BBOX (idInside1/2/3 + idBoundary), but limitPerArea=2 caps the result —
        // proving the cap is applied to the bbox-narrowed set, not the pre-filter set.
        assertThat(cards).hasSize(2);
        assertThat(cards.stream().map(AreaListingCard::id).toList())
                .containsExactly(idInside1, idInside2); // newest-first among the intersecting set
        assertThat(cards.stream().map(AreaListingCard::id).toList())
                .doesNotContain(idInside3, idBoundary, idOutsideNorth, idOutsideWest);
    }

    @Test
    @DisplayName("#2015 (a): raising limitPerArea above the intersecting count surfaces every "
            + "intersecting row (including the exact-corner boundary row) and no others")
    void bboxRequest_higherLimit_returnsAllIntersectingIncludingBoundary() {
        CityAreaListingsResponse resp = service.getAreaListings(
                CITY, List.of(AREA_KEY), 10, null, null, null, null, null, null, null, BBOX, false);

        List<UUID> ids = resp.areas().get(0).listings().stream().map(AreaListingCard::id).toList();

        assertThat(ids).containsExactly(idInside1, idInside2, idInside3, idBoundary);
        assertThat(ids).doesNotContain(idOutsideNorth, idOutsideWest);
    }

    // ---------------------------------------------------------------------
    // (b) anon-bbox vs anon-non-bbox field-visibility parity
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("#2015 (b): for the same underlying row, the anon bbox-scoped card is "
            + "field-for-field identical to the anon non-bbox card — bbox narrows WHICH rows "
            + "come back, never WHAT fields are visible on a row")
    void anonBboxCard_isFieldForFieldIdenticalToAnonNonBboxCard() {
        CityAreaListingsResponse withoutBbox = service.getAreaListings(
                CITY, List.of(AREA_KEY), 10, null, null, null, null, null, null, null, null, false);
        CityAreaListingsResponse withBbox = service.getAreaListings(
                CITY, List.of(AREA_KEY), 10, null, null, null, null, null, null, null, BBOX, false);

        AreaListingCard cardWithoutBbox = withoutBbox.areas().get(0).listings().stream()
                .filter(c -> c.id().equals(idInside1)).findFirst().orElseThrow();
        AreaListingCard cardWithBbox = withBbox.areas().get(0).listings().stream()
                .filter(c -> c.id().equals(idInside1)).findFirst().orElseThrow();

        // Record equality — every field must match exactly, including the anon-safe projections
        // (pricePaise omitted/null, priceBand present, latitude/longitude coarsened, trustBadge
        // public-safe word). No field is added, removed, or changed by the bbox narrowing.
        assertThat(cardWithBbox).isEqualTo(cardWithoutBbox);

        // Explicit anon-contract spot checks on the bbox-scoped card (belt-and-braces vs the
        // record-equality assertion above): exact price never leaks, coarse band does.
        assertThat(cardWithBbox.pricePaise()).isNull();
        assertThat(cardWithBbox.priceBand()).isNotNull();
    }

    // ---------------------------------------------------------------------
    // (c) malformed / non-finite / oversized bounds -> 400, via the real controller method
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("#2015 (c): non-numeric bbox token -> 400 via the real controller path "
            + "(BboxParser.parse invoked from CityAreaListingsController)")
    void controller_nonNumericBbox_returns400() {
        assertThatThrownBy(() -> controller.getCityAreaListings(
                CITY, List.of(AREA_KEY), null, null, null, null, null, null, null, null,
                "13.30,not-a-number,13.40,74.80"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("#2015 (c): non-finite (NaN) bbox token -> 400 via the real controller path")
    void controller_nonFiniteBbox_returns400() {
        assertThatThrownBy(() -> controller.getCityAreaListings(
                CITY, List.of(AREA_KEY), null, null, null, null, null, null, null, null,
                "NaN,74.70,13.40,74.80"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("#2015 (c): bbox span exceeding MAX_BOUNDS_SPAN_DEGREES (10.0) -> 400 via the "
            + "controller's own span guard, distinct from BboxParser's own range checks")
    void controller_oversizedSpanBbox_returns400() {
        // 10.1 degree lat span, well within [-90,90]/[-180,180] range so BboxParser itself
        // accepts it — only the controller's local validateBoundsSpan should reject this.
        assertThatThrownBy(() -> controller.getCityAreaListings(
                CITY, List.of(AREA_KEY), null, null, null, null, null, null, null, null,
                "0.0,0.0,10.1,10.0"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    @DisplayName("#2015 (c): a bbox exactly at the 10.0 degree span cap is accepted (not rejected) "
            + "— proves the guard is a strict > check, not an off-by-one <= rejection")
    void controller_exactlyAtSpanCap_isAccepted() {
        CityAreaListingsResponse resp = controller.getCityAreaListings(
                CITY, List.of(AREA_KEY), null, null, null, null, null, null, null, null,
                "3.30,64.70,13.30,74.70").getBody();

        assertThat(resp).isNotNull();
        assertThat(resp.areas()).hasSize(1);
    }

    // ---------------------------------------------------------------------
    // (d) existing non-bbox anon call path is unaffected (regression)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("#2015 (d): omitting bbox entirely still returns every LIVE listing in the area, "
            + "including ones far outside the BBOX rectangle used elsewhere in this suite")
    void nullBbox_returnsAllListingsRegardlessOfBboxRectangle() {
        CityAreaListingsResponse resp = service.getAreaListings(
                CITY, List.of(AREA_KEY), 10, null, null, null, null, null, null, null, null, false);

        List<UUID> ids = resp.areas().get(0).listings().stream().map(AreaListingCard::id).toList();

        assertThat(ids).containsExactlyInAnyOrder(
                idInside1, idInside2, idInside3, idBoundary, idOutsideNorth, idOutsideWest);
    }
}
