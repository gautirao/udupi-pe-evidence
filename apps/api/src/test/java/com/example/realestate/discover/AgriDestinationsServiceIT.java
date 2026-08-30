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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * #2151 PR C — endpoint-level IT for {@link AgriDestinationsService} (GET
 * /api/discover/agri-destinations, C-B1..C-B4), wired to the REAL {@link
 * AgriDestinationPortPostgresAdapter} (Testcontainers Postgres, no mocking) so the assertions
 * exercise the actual SQL, not a stub.
 *
 * <p><b>What this closes.</b> {@code AgriDestinationPortContractIT} proved AC7 parity at the PORT
 * level (Task 2, I1/I2). This class closes the disclosed endpoint-level gap: proving the SAME
 * parity holds when reached through {@link AgriDestinationsService#getDestinations}, i.e. through
 * the actual public HTTP contract's composition path, not just the port directly.
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
class AgriDestinationsServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "destinationsendpointtest";
    private static final String AREA_N_NEAR = "IN|KA|DestEndpoint|NNear";  // N, 5km
    private static final String AREA_N_FAR = "IN|KA|DestEndpoint|NFar";   // N, 15km
    private static final String AREA_E = "IN|KA|DestEndpoint|East";       // E, 8km

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AgriDestinationPortPostgresAdapter port;
    private AgriDestinationsService service;
    private int cityId;

    @BeforeEach
    void setUp() {
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        port = new AgriDestinationPortPostgresAdapter(
                jdbcTemplate, guard, new AgriDestinationPortReadinessCheck(jdbcTemplate));
        service = new AgriDestinationsService(port);

        jdbcTemplate.update("DELETE FROM property_listings");
        jdbcTemplate.update("DELETE FROM agri_destination_classification");
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY);

        cityId = insertCity(CITY, 13.0, 74.0);
        insertArea(AREA_N_NEAR, cityId, 13.02, 74.0);
        insertArea(AREA_N_FAR, cityId, 13.10, 74.0);
        insertArea(AREA_E, cityId, 13.0, 74.06);

        insertClassification(cityId, AREA_N_NEAR, 5.0, 0.0, "N");
        insertClassification(cityId, AREA_N_FAR, 15.0, 0.0, "N");
        insertClassification(cityId, AREA_E, 8.0, 90.0, "E");
    }

    // ── Test 1: endpoint projection equals a DIRECT port call for the same scope ──────────────────
    //    Proves no second query path exists — the service's response is a pure field-for-field
    //    projection of AgriDestinationPort.findDestinations, nothing else.

    @Test
    @DisplayName("endpoint response is a 1:1 projection of the direct AgriDestinationPort.findDestinations "
            + "call for the same scope — no second query path")
    void endpointResponse_equalsDirectPortCall_sameScope() {
        insertLiveAgriListing(AREA_N_NEAR, "sale");
        insertLiveAgriListing(AREA_N_NEAR, "sale");
        insertLiveAgriListing(AREA_N_FAR, "sale");

        AgriDestinationPort.DestinationScope direct = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(
                        CITY, null, null, new AgriDestinationPort.AgriDestinationFilters(null), true));

        AgriDestinationsResponse endpoint = service.getDestinations(CITY, null, null, null);

        assertThat(endpoint.city()).isEqualTo(direct.city());
        assertThat(endpoint.destinations()).hasSameSizeAs(direct.destinations());
        for (AgriDestinationPort.DestinationBucket db : direct.destinations()) {
            AgriDestinationBucketResponse eb = endpoint.destinations().stream()
                    .filter(b -> b.areaKey().equals(db.areaKey())).findFirst()
                    .orElseThrow(() -> new AssertionError("missing bucket for " + db.areaKey()));
            assertThat(eb.displayName()).isEqualTo(db.displayName());
            assertThat(eb.distanceKm()).isEqualTo(db.distanceKm());
            assertThat(eb.bearingDeg()).isEqualTo(db.bearingDeg());
            assertThat(eb.direction()).isEqualTo(db.direction());
            assertThat(eb.parcelCount()).isEqualTo(db.parcelCount());
            assertThat(eb.parcelAcreage()).isEqualTo(db.parcelAcreage());
        }
    }

    // ── Test 2: endpoint-level AC7 parity — sum of bucket parcelCounts == unique drill-down ids ───
    //    This is the gap PR B disclosed as residual (port-level only). Asserted on DISTINCT parcel
    //    ids from findParcels, not row counts, to prove no double counting.

    @Test
    @DisplayName("AC7 endpoint parity: sum of destination bucket parcelCounts == count of UNIQUE parcel "
            + "ids returned by drill-down across those destinations")
    void ac7_endpointParity_bucketSumEqualsUniqueDrillDownIdCount() {
        String p1 = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String p2 = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String p3 = insertLiveAgriListing(AREA_N_FAR, "sale");
        String p4 = insertLiveAgriListing(AREA_E, "sale");

        AgriDestinationsResponse endpoint = service.getDestinations(CITY, null, null, null);
        long bucketSum = endpoint.destinations().stream()
                .mapToLong(AgriDestinationBucketResponse::parcelCount).sum();

        List<String> allAreaKeys = endpoint.destinations().stream()
                .map(AgriDestinationBucketResponse::areaKey).toList();
        AgriDestinationPort.ParcelPage drillDown = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, allAreaKeys, new AgriDestinationPort.AgriDestinationFilters(null),
                new AgriDestinationPort.PageSpec(0, 250), null));

        Set<String> uniqueIds = drillDown.content().stream()
                .map(AgriDestinationPort.AgriParcel::id).collect(Collectors.toSet());

        assertThat(bucketSum).as("bucket parcelCount sum must equal the UNIQUE drill-down id count")
                .isEqualTo(uniqueIds.size()).isEqualTo(4L);
        assertThat(uniqueIds).as("must be exactly the 4 distinct parcels, no double counting")
                .containsExactlyInAnyOrder(p1, p2, p3, p4);
        assertThat(drillDown.totalMatching()).isEqualTo(bucketSum);
    }

    // ── Test 3: listingPurpose changes destination counts and parcel results IDENTICALLY ──────────

    @Test
    @DisplayName("listingPurpose filters destination bucket counts and drill-down parcels identically")
    void listingPurpose_changesBucketAndParcelResultsIdentically() {
        String saleId = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String rentId = insertLiveAgriListing(AREA_N_NEAR, "rent");

        AgriDestinationsResponse saleScope = service.getDestinations(CITY, null, null, "sale");
        AgriDestinationBucketResponse saleBucket = bucketFor(saleScope, AREA_N_NEAR);
        assertThat(saleBucket.parcelCount()).isEqualTo(1L);

        AgriDestinationPort.ParcelPage salePage = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), new AgriDestinationPort.AgriDestinationFilters("sale"),
                new AgriDestinationPort.PageSpec(0, 10), null));
        assertThat(salePage.content()).extracting(AgriDestinationPort.AgriParcel::id).containsExactly(saleId);
        assertThat(salePage.totalMatching()).isEqualTo(saleBucket.parcelCount());

        AgriDestinationsResponse rentScope = service.getDestinations(CITY, null, null, "rent");
        AgriDestinationBucketResponse rentBucket = bucketFor(rentScope, AREA_N_NEAR);
        AgriDestinationPort.ParcelPage rentPage = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), new AgriDestinationPort.AgriDestinationFilters("rent"),
                new AgriDestinationPort.PageSpec(0, 10), null));
        assertThat(rentBucket.parcelCount()).isEqualTo(1L);
        assertThat(rentPage.content()).extracting(AgriDestinationPort.AgriParcel::id).containsExactly(rentId);
        assertThat(rentPage.totalMatching()).isEqualTo(rentBucket.parcelCount());
    }

    // ── Test 3b: direction/maxKm scope params reach the port unchanged ─────────────────────────────

    @Test
    @DisplayName("direction and maxKm scope params are honoured identically to the port level")
    void directionAndMaxKm_scopeFiltering() {
        AgriDestinationsResponse nOnly = service.getDestinations(CITY, "N", null, null);
        assertThat(nOnly.destinations()).extracting(AgriDestinationBucketResponse::areaKey)
                .containsExactlyInAnyOrder(AREA_N_NEAR, AREA_N_FAR);

        AgriDestinationsResponse within10 = service.getDestinations(CITY, null, 10.0, null);
        assertThat(within10.destinations()).extracting(AgriDestinationBucketResponse::areaKey)
                .containsExactlyInAnyOrder(AREA_N_NEAR, AREA_E);
    }

    // ── Test 4: fail-closed — ACTIVE, never-promoted city → 503, NOT an empty 200 ──────────────────

    @Test
    @DisplayName("C-B3: active city never promoted through Agri City Launch returns 503 "
            + "AGRI_DESTINATIONS_NOT_YET_PROMOTED on the endpoint — NOT silently caught into an empty 200")
    void neverPromotedActiveCity_failsClosedWith503_notSilentEmpty200() {
        String neverPromotedCity = "never-promoted-endpoint-test";
        int neverPromotedCityId = insertCity(neverPromotedCity, 13.0, 74.0);
        // Deliberately NO agri_destination_classification row inserted for this city — simulates a
        // city that is ACTIVE but has never been promoted through Agri City Launch at all.
        try {
            assertThatThrownBy(() -> service.getDestinations(neverPromotedCity, null, null, null))
                    .as("must propagate the port's 503 unchanged, not swallow it into an empty 200")
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> {
                        ResponseStatusException rse = (ResponseStatusException) ex;
                        assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                        assertThat(rse.getReason()).isEqualTo("AGRI_DESTINATIONS_NOT_YET_PROMOTED");
                    });
        } finally {
            jdbcTemplate.update("DELETE FROM cities WHERE id = ?", neverPromotedCityId);
        }
    }

    // ── Test 5: #1935 three-way city behaviour (corrected) ─────────────────────────────────────────

    @Test
    @DisplayName("three-way city behaviour: inactive==unknown (empty 200); active-never-promoted=503; "
            + "active-promoted-no-match=empty 200 — all three distinguishable the RIGHT way")
    void threeWayCityBehaviour_inactiveEqualsUnknown_neverPromoted503_promotedNoMatchEmpty200() {
        // (a) inactive vs unknown — indistinguishable from EACH OTHER, both empty 200.
        jdbcTemplate.update("UPDATE cities SET is_active = false WHERE slug = ?", CITY);
        try {
            AgriDestinationsResponse inactive = service.getDestinations(CITY, null, null, null);
            AgriDestinationsResponse unknown = service.getDestinations("no-such-city-xyz", null, null, null);
            assertThat(inactive.destinations()).isEmpty();
            assertThat(unknown.destinations()).isEmpty();
            assertThat(inactive).isEqualTo(new AgriDestinationsResponse(CITY, List.of()));
            assertThat(unknown).isEqualTo(new AgriDestinationsResponse("no-such-city-xyz", List.of()));
        } finally {
            jdbcTemplate.update("UPDATE cities SET is_active = true WHERE slug = ?", CITY);
        }

        // (b) active, never promoted — 503, covered in detail by the dedicated test above; spot-check here.
        String neverPromoted = "never-promoted-threeway-test";
        int npId = insertCity(neverPromoted, 13.0, 74.0);
        try {
            assertThatThrownBy(() -> service.getDestinations(neverPromoted, null, null, null))
                    .isInstanceOf(ResponseStatusException.class);
        } finally {
            jdbcTemplate.update("DELETE FROM cities WHERE id = ?", npId);
        }

        // (c) active, promoted, genuinely no match for the scope (SW has no destinations seeded) —
        //     empty 200, NOT a 503 — this city IS promoted (it has classification rows for N/E).
        AgriDestinationsResponse genuineZero = service.getDestinations(CITY, "SW", null, null);
        assertThat(genuineZero.destinations()).isEmpty();
        // Sanity: unfiltered, the SAME city is non-empty — proves (c) is a genuine scoped zero,
        // not an accidental "not promoted" 503 being silently downgraded.
        AgriDestinationsResponse sameCity = service.getDestinations(CITY, null, null, null);
        assertThat(sameCity.destinations()).isNotEmpty();
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────────────

    private static AgriDestinationBucketResponse bucketFor(AgriDestinationsResponse resp, String areaKey) {
        return resp.destinations().stream().filter(b -> b.areaKey().equals(areaKey)).findFirst()
                .orElseThrow(() -> new AssertionError("no bucket for " + areaKey));
    }

    private int insertCity(String slug, double lat, double lon) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, slug, slug, lat, lon);
    }

    private void insertArea(String areaKey, int cityId, double lat, double lon) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                areaKey, cityId, areaKey, lat, lon);
    }

    private void insertClassification(int cityId, String areaKey, double distanceKm, double bearingDeg,
                                       String directionKey) {
        String bandKey = distanceKm <= 10 ? "0_10" : distanceKm <= 25 ? "10_25" : "25_50";
        jdbcTemplate.update(
                "INSERT INTO public.agri_destination_classification "
                        + "(city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, "
                        + " direction_key, distance_band_key, generator_version, generated_at) "
                        + "VALUES (?, ?, 13.0, 74.0, ?, ?, ?, ?, 'test-generator-v1', now())",
                cityId, areaKey, distanceKm, bearingDeg, directionKey, bandKey);
    }

    private String insertLiveAgriListing(String areaKey, String listingPurpose) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, listing_purpose, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', 3, 'acre', "
                        + " ?, 13.0, 74.0, ?, ?)",
                id, areaKey, listingPurpose, now, now);
        return id.toString();
    }
}
