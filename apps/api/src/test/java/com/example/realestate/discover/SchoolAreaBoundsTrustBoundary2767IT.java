package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationCacheProperties;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import com.example.realestate.discover.navigation.NavigationGraphLoader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * #2767 trust-boundary regression against real PostGIS: the School + Area constraint is derived
 * SERVER-SIDE from a canonical Area key ({@code schoolAreaKey}); a client-sent {@code areaBbox}
 * is not a request parameter any more and must never influence results.
 *
 * <p>Requests go through a standalone {@link MockMvc} wired to the REAL controllers + services
 * over the Testcontainers database, so Spring's request binding is exercised: an {@code areaBbox}
 * query parameter is actually put on the wire, and re-adding a binding for it would be observable.
 *
 * <p>Fixture (school at 13.000/74.000, radius 1.5 km covers the first three listings below):
 * <ul>
 *   <li>Area K — bounds B = (12.998,73.998)-(13.004,74.004)</li>
 *   <li>Area J — same city, a different Area</li>
 *   <li>{@code L_GEO}    in area J, geometrically INSIDE B (membership would exclude it)</li>
 *   <li>{@code L_MEMBER} in area K, geometrically OUTSIDE B (membership would include it)</li>
 *   <li>{@code L_FAR}    in area J, outside B, INSIDE the attacker rectangle R</li>
 *   <li>{@code L_NONE}   outside the radius, and outside B and R</li>
 * </ul>
 * With {@code schoolAreaKey=K} the only correct answer is {@code {L_GEO}}.
 *
 * <p>Deliberately NOT {@code @Tag("integration")}: pom.xml sets surefire excludedGroups=integration,
 * so a tag would make this run nowhere by default.
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
class SchoolAreaBoundsTrustBoundary2767IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "qa2767coh";
    private static final String OTHER_CITY = "qa2767oth";
    private static final String INACTIVE_CITY = "qa2767off";

    private static final String KEY_K = "QA|QA|" + CITY + "|AreaK";
    private static final String KEY_J = "QA|QA|" + CITY + "|AreaJ";
    private static final String KEY_NULL_BOUNDS = "QA|QA|" + CITY + "|AreaNullBounds";
    private static final String KEY_EMPTY_REGION = "QA|QA|" + CITY + "|AreaEmptyRegion";
    private static final String KEY_FIVE_SEGMENTS = "QA|QA|" + CITY + "|AreaK|Sub";
    private static final String KEY_OTHER_CITY = "QA|QA|" + OTHER_CITY + "|AreaO";
    private static final String KEY_INACTIVE_CITY = "QA|QA|" + INACTIVE_CITY + "|AreaX";
    private static final String KEY_UNKNOWN = "QA|QA|" + CITY + "|NoSuchArea";

    // School at (13.000, 74.000), radius 1.5 km (~0.0135 deg).
    private static final String SCHOOL_LAT = "13.000";
    private static final String SCHOOL_LON = "74.000";
    private static final String RADIUS_KM = "1.5";

    // Attacker rectangle R "south,west,north,east": contains L_FAR, NOT L_GEO, NOT L_MEMBER.
    private static final String ATTACKER_RECT_R = "12.990,74.005,13.010,74.015";
    // A real drawn polygon [[lat,lon],...] (~7 km2, under the 12 km2 ceiling).
    private static final String REAL_POLYGON =
            "[[12.988,73.995],[12.988,74.020],[13.012,74.020],[13.012,73.995]]";

    private static final UUID L_GEO = UUID.fromString("a0000000-2767-0000-0000-000000000001");
    private static final UUID L_MEMBER = UUID.fromString("a0000000-2767-0000-0000-000000000002");
    private static final UUID L_FAR = UUID.fromString("a0000000-2767-0000-0000-000000000003");
    private static final UUID L_NONE = UUID.fromString("a0000000-2767-0000-0000-000000000004");
    // Inserted per-test by the membership/viewport arms only (not in setUp), so the original arms'
    // exact expected sets are unaffected.
    private static final UUID L_GEO_K = UUID.fromString("a0000000-2767-0000-0000-000000000005");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper json = new ObjectMapper();
    private MockMvc listingsMvc;
    private MockMvc markersMvc;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug IN (?, ?, ?)", CITY, OTHER_CITY, INACTIVE_CITY);

        int cityId = insertCity(CITY, true);
        int otherCityId = insertCity(OTHER_CITY, true);
        int inactiveCityId = insertCity(INACTIVE_CITY, false);

        insertArea(KEY_K, cityId, 12.998, 73.998, 13.004, 74.004);
        insertArea(KEY_J, cityId, 12.980, 73.980, 13.020, 74.020);
        insertArea(KEY_EMPTY_REGION, cityId, 12.900, 73.900, 12.910, 73.910);
        insertArea(KEY_FIVE_SEGMENTS, cityId, 12.998, 73.998, 13.004, 74.004);
        insertArea(KEY_OTHER_CITY, otherCityId, 12.998, 73.998, 13.004, 74.004);
        insertArea(KEY_INACTIVE_CITY, inactiveCityId, 12.998, 73.998, 13.004, 74.004);
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon) VALUES (?, ?, ?, ?, ?)",
                KEY_NULL_BOUNDS, cityId, "Null bounds", 13.0, 74.0);

        insertListing(L_GEO, KEY_J, 13.001, 74.001);
        insertListing(L_MEMBER, KEY_K, 12.992, 74.000);
        insertListing(L_FAR, KEY_J, 13.000, 74.010);
        insertListing(L_NONE, KEY_J, 13.050, 74.050);

        // Precondition for the polygon fail-closed arm: this city has NO VALID canonical CITY boundary.
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM public.canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'CITY' AND status = 'VALID'",
                Integer.class, cityId))
                .as("precondition: fixture city has no VALID CITY boundary")
                .isZero();

        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class), new NavigationCacheProperties());
        PolygonGeographicSafetyPolicy policy = new PolygonGeographicSafetyPolicy(jdbcTemplate);
        AreaSummaryService areaSummaryService = new AreaSummaryService(jdbcTemplate);
        listingsMvc = MockMvcBuilders.standaloneSetup(new DiscoverListingsController(
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry()),
                json, cache, policy, areaSummaryService)).build();
        markersMvc = MockMvcBuilders.standaloneSetup(new DiscoverMarkersController(
                new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry()),
                json, cache, policy, areaSummaryService)).build();
    }

    // ── 0. the fixture discriminates ─────────────────────────────────────────

    @Test
    @DisplayName("#2767 baseline: radius alone keeps L_GEO, L_MEMBER and L_FAR; membership (areaKeys=K) alone keeps "
            + "only L_MEMBER — so neither alternative equals the server-bounds answer {L_GEO}")
    void fixtureDiscriminates_radiusOnlyAndMembershipOnly() throws Exception {
        Set<UUID> radiusOnly = Set.of(L_GEO, L_MEMBER, L_FAR);
        assertThat(listingIds(call(listingsMvc, CITY, school()))).isEqualTo(radiusOnly);
        assertThat(markerIds(call(markersMvc, CITY, school()))).isEqualTo(radiusOnly);

        Set<UUID> membershipPlusRadius = Set.of(L_MEMBER);
        assertThat(listingIds(call(listingsMvc, CITY, school("areaKeys", KEY_K)))).isEqualTo(membershipPlusRadius);
        assertThat(markerIds(call(markersMvc, CITY, school("areaKeys", KEY_K)))).isEqualTo(membershipPlusRadius);
    }

    // ── 1. server-derived bounds ─────────────────────────────────────────────

    @Test
    @DisplayName("#2767: schoolAreaKey=K yields exactly {L_GEO} on listings ids, totalElements AND markers")
    void schoolAreaKey_yieldsExactlyLGeo_onListingsCountAndMarkers() throws Exception {
        Resp listings = call(listingsMvc, CITY, school("schoolAreaKey", KEY_K));
        Resp markers = call(markersMvc, CITY, school("schoolAreaKey", KEY_K));

        assertThat(listings.status).isEqualTo(200);
        assertThat(markers.status).isEqualTo(200);

        Set<UUID> fromListings = listingIds(listings);
        Set<UUID> fromMarkers = markerIds(markers);
        assertThat(fromListings).as("listings ids").isEqualTo(Set.of(L_GEO));
        assertThat(fromMarkers).as("markers ids").isEqualTo(Set.of(L_GEO));
        assertThat(listings.json.get("totalElements").asLong()).as("listings totalElements").isEqualTo(1L);
        assertThat(markers.json.get("totalFilteredElements").asLong()).as("markers totalFilteredElements")
                .isEqualTo(1L);

        // Negative assertions: each wrong answer is excluded for its own reason.
        assertThat(fromListings).doesNotContain(L_MEMBER, L_FAR, L_NONE);
        assertThat(fromMarkers).doesNotContain(L_MEMBER, L_FAR, L_NONE);
    }

    // ── 1b. owner rule: schoolAreaKey bounds are ANDed with membership / viewportScope ──

    @Test
    @DisplayName("#2767 owner rule: schoolAreaKey + areaKeys is bounds AND radius AND membership, unchanged, on "
            + "listings and markers; each arm's literal set differs from the no-membership answer")
    void schoolAreaKey_isAndedWithAreaKeysMembership_onBothEndpoints() throws Exception {
        // Extra row: in area K, inside bounds B, inside the radius. Makes membership narrow to a
        // NON-empty set that differs from both {L_GEO, L_GEO_K} (no membership) and {L_GEO}.
        insertListing(L_GEO_K, KEY_K, 13.002, 74.002);

        Set<UUID> noMembership = Set.of(L_GEO, L_GEO_K);
        Set<UUID> memberK = Set.of(L_GEO_K);   // bounds ∩ radius = {L_GEO, L_GEO_K}; K membership drops L_GEO (in J)
        Set<UUID> memberJ = Set.of(L_GEO);     // J membership drops L_GEO_K (in K); L_FAR is outside the bounds

        Resp none = call(listingsMvc, CITY, school("schoolAreaKey", KEY_K));
        assertThat(listingIds(none)).isEqualTo(noMembership);
        assertThat(markerIds(call(markersMvc, CITY, school("schoolAreaKey", KEY_K)))).isEqualTo(noMembership);

        Resp k = call(listingsMvc, CITY, school("schoolAreaKey", KEY_K, "areaKeys", KEY_K));
        assertThat(listingIds(k)).isEqualTo(memberK);
        assertThat(k.json.get("totalElements").asLong()).isEqualTo(1L);
        assertThat(markerIds(call(markersMvc, CITY, school("schoolAreaKey", KEY_K, "areaKeys", KEY_K))))
                .isEqualTo(memberK);

        Resp j = call(listingsMvc, CITY, school("schoolAreaKey", KEY_K, "areaKeys", KEY_J));
        assertThat(listingIds(j)).isEqualTo(memberJ);
        assertThat(j.json.get("totalElements").asLong()).isEqualTo(1L);
        assertThat(markerIds(call(markersMvc, CITY, school("schoolAreaKey", KEY_K, "areaKeys", KEY_J))))
                .isEqualTo(memberJ);

        // Membership can never widen past the bounds: L_MEMBER (area K, outside B) is never returned.
        assertThat(listingIds(k)).doesNotContain(L_MEMBER, L_FAR, L_NONE);
    }

    @Test
    @DisplayName("#2767: schoolAreaKey + viewportScope only narrows — never widens past the Area bounds")
    void schoolAreaKey_withViewportScope_onlyNarrows_onBothEndpoints() throws Exception {
        insertListing(L_GEO_K, KEY_K, 13.002, 74.002);

        // Viewport much larger than B (contains L_MEMBER and L_FAR too): result stays the bounds answer.
        String wide = "12.980,73.980,13.020,74.020";
        Set<UUID> boundsAnswer = Set.of(L_GEO, L_GEO_K);
        assertThat(listingIds(call(listingsMvc, CITY, school("schoolAreaKey", KEY_K, "viewportScope", wide))))
                .isEqualTo(boundsAnswer);
        assertThat(markerIds(call(markersMvc, CITY, school("schoolAreaKey", KEY_K, "viewportScope", wide))))
                .isEqualTo(boundsAnswer);

        // Viewport containing only L_GEO_K narrows to it.
        String narrow = "13.0015,74.0015,13.0025,74.0025";
        Set<UUID> narrowed = Set.of(L_GEO_K);
        assertThat(listingIds(call(listingsMvc, CITY, school("schoolAreaKey", KEY_K, "viewportScope", narrow))))
                .isEqualTo(narrowed);
        assertThat(markerIds(call(markersMvc, CITY, school("schoolAreaKey", KEY_K, "viewportScope", narrow))))
                .isEqualTo(narrowed);
    }

    // ── 2. a client areaBbox is not a parameter any more ─────────────────────

    @Test
    @DisplayName("#2767: the same request plus areaBbox=R is identical — L_FAR is never returned, on both endpoints")
    void clientSuppliedAreaBbox_neverChangesTheResult() throws Exception {
        Resp listings = call(listingsMvc, CITY, school("schoolAreaKey", KEY_K, "areaBbox", ATTACKER_RECT_R));
        Resp markers = call(markersMvc, CITY, school("schoolAreaKey", KEY_K, "areaBbox", ATTACKER_RECT_R));

        assertThat(listings.status).isEqualTo(200);
        assertThat(markers.status).isEqualTo(200);
        assertThat(listingIds(listings)).isEqualTo(Set.of(L_GEO));
        assertThat(markerIds(markers)).isEqualTo(Set.of(L_GEO));
        assertThat(listingIds(listings)).doesNotContain(L_FAR, L_MEMBER, L_NONE);
        assertThat(markerIds(markers)).doesNotContain(L_FAR, L_MEMBER, L_NONE);
        assertThat(listings.json.get("totalElements").asLong()).isEqualTo(1L);

        // Without a key, areaBbox alone must not narrow anything either: radius-only answer.
        Set<UUID> radiusOnly = Set.of(L_GEO, L_MEMBER, L_FAR);
        assertThat(listingIds(call(listingsMvc, CITY, school("areaBbox", ATTACKER_RECT_R)))).isEqualTo(radiusOnly);
        assertThat(markerIds(call(markersMvc, CITY, school("areaBbox", ATTACKER_RECT_R)))).isEqualTo(radiusOnly);
        // ...and a malformed/oversized one is not even parsed (it would be 400 if it were bound).
        assertThat(call(listingsMvc, CITY, school("areaBbox", "-90,-180,90,180")).status).isEqualTo(200);
        assertThat(call(markersMvc, CITY, school("areaBbox", "garbage")).status).isEqualTo(200);
    }

    // ── 3. fail-closed key validation ────────────────────────────────────────

    @Test
    @DisplayName("#2767: unknown, other-city, inactive-city and non-locality keys are 400 invalid_school_area_key")
    void invalidKeys_are400_onBothEndpoints() throws Exception {
        assertBadRequest(CITY, "invalid_school_area_key", "schoolAreaKey", KEY_UNKNOWN);
        assertBadRequest(CITY, "invalid_school_area_key", "schoolAreaKey", KEY_OTHER_CITY);
        assertBadRequest(CITY, "invalid_school_area_key", "schoolAreaKey", KEY_FIVE_SEGMENTS);
        // Same key, but the city is inactive: the Area exists, the city is not searchable.
        assertBadRequest(INACTIVE_CITY, "invalid_school_area_key", "schoolAreaKey", KEY_INACTIVE_CITY);
    }

    @Test
    @DisplayName("#2767: an Area row with NULL bounds is 400 school_area_bounds_unavailable, never radius-only")
    void areaWithNullBounds_is400_onBothEndpoints() throws Exception {
        assertBadRequest(CITY, "school_area_bounds_unavailable", "schoolAreaKey", KEY_NULL_BOUNDS);
    }

    @Test
    @DisplayName("#2767: schoolAreaKey without school is 400 school_area_key_requires_school; blank/multiple is "
            + "400 school_area_key_must_be_single")
    void requiresSchool_andMustBeSingle_are400() throws Exception {
        for (MockMvc mvc : new MockMvc[] {listingsMvc, markersMvc}) {
            Resp noSchool = call(mvc, CITY, new String[] {"schoolAreaKey", KEY_K});
            assertThat(noSchool.status).isEqualTo(400);
            assertThat(noSchool.reason).isEqualTo("school_area_key_requires_school");

            Resp two = call(mvc, CITY, school("schoolAreaKey", KEY_K, "schoolAreaKey", KEY_J));
            assertThat(two.status).isEqualTo(400);
            assertThat(two.reason).isEqualTo("school_area_key_must_be_single");

            Resp blank = call(mvc, CITY, school("schoolAreaKey", " "));
            assertThat(blank.status).isEqualTo(400);
            assertThat(blank.reason).isEqualTo("school_area_key_must_be_single");
        }
    }

    // ── 4. valid key, nothing matches ────────────────────────────────────────

    @Test
    @DisplayName("#2767: a valid key whose bounds contain no listing is an empty 200 on both endpoints")
    void validKeyWithZeroMatches_isEmpty200() throws Exception {
        Resp listings = call(listingsMvc, CITY, school("schoolAreaKey", KEY_EMPTY_REGION));
        Resp markers = call(markersMvc, CITY, school("schoolAreaKey", KEY_EMPTY_REGION));

        assertThat(listings.status).isEqualTo(200);
        assertThat(markers.status).isEqualTo(200);
        assertThat(listingIds(listings)).isEmpty();
        assertThat(markerIds(markers)).isEmpty();
        assertThat(listings.json.get("totalElements").asLong()).isZero();
        assertThat(markers.json.get("totalFilteredElements").asLong()).isZero();
    }

    // ── 5. polygon behaviour unchanged ───────────────────────────────────────

    @Test
    @DisplayName("#2767: a real polygon still reaches PolygonGeographicSafetyPolicy and fails closed on both "
            + "endpoints, with or without schoolAreaKey (policy runs first)")
    void realPolygon_stillFailsClosedViaThePolicy() throws Exception {
        for (MockMvc mvc : new MockMvc[] {listingsMvc, markersMvc}) {
            Resp polygonOnly = call(mvc, CITY, school("polygon", REAL_POLYGON));
            assertThat(polygonOnly.status).isEqualTo(400);
            assertThat(polygonOnly.reason).isEqualTo("polygon_outside_searchable_city");

            Resp polygonAndKey = call(mvc, CITY, school("polygon", REAL_POLYGON, "schoolAreaKey", KEY_K));
            assertThat(polygonAndKey.status).isEqualTo(400);
            assertThat(polygonAndKey.reason).isEqualTo("polygon_outside_searchable_city");
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private record Resp(int status, String reason, JsonNode json) {
    }

    private void assertBadRequest(String city, String reason, String... extra) throws Exception {
        for (MockMvc mvc : new MockMvc[] {listingsMvc, markersMvc}) {
            Resp r = call(mvc, city, school(extra));
            assertThat(r.status).as("%s %s", city, reason).isEqualTo(400);
            assertThat(r.reason).isEqualTo(reason);
        }
    }

    private static String[] school(String... extra) {
        String[] base = {"schoolLat", SCHOOL_LAT, "schoolLon", SCHOOL_LON, "schoolRadiusKm", RADIUS_KM};
        String[] all = new String[base.length + extra.length];
        System.arraycopy(base, 0, all, 0, base.length);
        System.arraycopy(extra, 0, all, base.length, extra.length);
        return all;
    }

    private Resp call(MockMvc mvc, String city, String[] kv) throws Exception {
        String path = mvc == listingsMvc ? "/api/discover/listings" : "/api/discover/markers";
        MockHttpServletRequestBuilder req = get(path).param("city", city);
        for (int i = 0; i < kv.length; i += 2) {
            req = req.param(kv[i], kv[i + 1]);
        }
        MockHttpServletResponse res = mvc.perform(req).andReturn().getResponse();
        JsonNode body = res.getStatus() == 200 ? json.readTree(res.getContentAsString()) : null;
        return new Resp(res.getStatus(), res.getErrorMessage(), body);
    }

    private static Set<UUID> listingIds(Resp r) {
        assertThat(r.status).as("listings must be 200 to read ids").isEqualTo(200);
        Set<UUID> ids = new HashSet<>();
        r.json.get("content").forEach(n -> ids.add(UUID.fromString(n.get("id").asText())));
        return ids;
    }

    private static Set<UUID> markerIds(Resp r) {
        assertThat(r.status).as("markers must be 200 to read ids").isEqualTo(200);
        Set<UUID> ids = new HashSet<>();
        r.json.get("markers").forEach(n -> ids.add(UUID.fromString(n.get("id").asText())));
        return ids;
    }

    private int insertCity(String slug, boolean active) {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, ?)", slug, slug, 13.0, 74.0, active);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, slug);
    }

    private void insertArea(String key, int cityId, double minLat, double minLon, double maxLat, double maxLon) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                key, cityId, key, (minLat + maxLat) / 2, (minLon + maxLon) / 2, minLat, minLon, maxLat, maxLon);
    }

    private void insertListing(UUID id, String areaKey, double lat, double lon) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', ?, ?, 5000000, ?, ?)",
                id, areaKey, lat, lon, now, now);
    }
}
