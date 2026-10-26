package com.example.realestate.discover;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Issue #2806 real PostGIS discriminating regression test for anonymous Area+School radius
 * pagination and monotonicity on {@code GET /api/discover/cities/{city}/school-radius-listings}.
 *
 * <p>Proves:
 * <ol>
 *   <li>Server-side canonical Area bounds ({@code schoolAreaKey}) are applied BEFORE the 50-row
 *       SQL page cap, so &gt;50 newer out-of-Area listings within 10 km cannot evict older
 *       in-Area listings at 3 km / 5 km / 10 km.</li>
 *   <li>When {@code areaBbox != null}, rows are ordered by
 *       {@code ST_Distance(pl.geog, ST_MakePoint(?, ?)::geography) ASC, pl.created_at DESC, pl.id ASC},
 *       keeping page-0 ID sets monotonic ({@code 3km ⊆ 5km ⊆ 10km}) even when more than 50
 *       in-Area listings match at 10 km.</li>
 *   <li>Invalid, duplicate, blank, other-city, and null-bounds {@code schoolAreaKey} values fail
 *       closed with HTTP 400 (never silently widening to unscoped city results).</li>
 * </ol>
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
class PublicSchoolRadiusAreaMonotonicity2806IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "qa2806coh";
    private static final String OTHER_CITY = "qa2806oth";
    private static final String KEY_KUNJIBETTU = "QA|QA|" + CITY + "|Kunjibettu";
    private static final String KEY_OUTER = "QA|QA|" + CITY + "|OuterArea";
    private static final String KEY_NULL_BOUNDS = "QA|QA|" + CITY + "|NullBounds";
    private static final String KEY_OTHER_CITY = "QA|QA|" + OTHER_CITY + "|OtherArea";

    // School at (13.000, 74.000).
    // Kunjibettu bounds: lat [12.940, 13.080], lon [73.960, 74.040].
    //   - 3 km in-Area point:  (13.005, 74.005) -> ~0.78 km from school, inside Kunjibettu
    //   - 5 km in-Area point:  (13.035, 74.000) -> ~3.89 km from school, inside Kunjibettu
    //   - 10 km in-Area point: (13.060, 74.000) -> ~6.67 km from school, inside Kunjibettu
    //   - Out-of-Area point:   (13.050, 74.060) -> ~8.65 km from school, lon 74.060 > 74.040 (outside Kunjibettu)
    private static final String SCHOOL_LAT = "13.000";
    private static final String SCHOOL_LON = "74.000";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper json = new ObjectMapper();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug IN (?, ?)", CITY, OTHER_CITY);

        int cityId = insertCity(CITY, true);
        int otherCityId = insertCity(OTHER_CITY, true);

        insertArea(KEY_KUNJIBETTU, cityId, 12.940, 73.960, 13.080, 74.040);
        insertArea(KEY_OUTER, cityId, 12.900, 73.900, 13.100, 74.100);
        insertArea(KEY_OTHER_CITY, otherCityId, 12.940, 73.960, 13.080, 74.040);
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon) VALUES (?, ?, ?, ?, ?)",
                KEY_NULL_BOUNDS, cityId, "Null bounds", 13.0, 74.0);

        PublicSchoolRadiusListingsService radiusService =
                new PublicSchoolRadiusListingsService(jdbcTemplate);
        AreaSummaryService areaSummaryService = new AreaSummaryService(jdbcTemplate);
        PublicSchoolRadiusListingsController controller =
                new PublicSchoolRadiusListingsController(radiusService, areaSummaryService);
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    @DisplayName("#2806: >50 newer out-of-Area rows within 10 km do not evict older in-Area 3km/5km/10km rows; 3km ⊆ 5km ⊆ 10km")
    void overFiftyNewerOutOfAreaListings_doNotEvictInAreaRows_andRadiiRemainMonotonic() throws Exception {
        OffsetDateTime baseTime = OffsetDateTime.of(2026, 6, 1, 12, 0, 0, 0, ZoneOffset.UTC);

        // 4 older in-Area LIVE listings at <= 3 km (~0.78 km)
        Set<UUID> inArea3Km = new LinkedHashSet<>();
        for (int i = 1; i <= 4; i++) {
            UUID id = UUID.fromString(String.format("b0002806-0003-0000-0000-%012d", i));
            inArea3Km.add(id);
            insertListing(id, KEY_KUNJIBETTU, 13.005, 74.005, baseTime.minusDays(10).plusMinutes(i));
        }

        // 2 older in-Area LIVE listings between 3 km and 5 km (~3.89 km)
        Set<UUID> inArea3To5Km = new LinkedHashSet<>();
        for (int i = 1; i <= 2; i++) {
            UUID id = UUID.fromString(String.format("b0002806-0005-0000-0000-%012d", i));
            inArea3To5Km.add(id);
            insertListing(id, KEY_KUNJIBETTU, 13.035, 74.000, baseTime.minusDays(5).plusMinutes(i));
        }

        // 2 older in-Area LIVE listings between 5 km and 10 km (~6.67 km)
        Set<UUID> inArea5To10Km = new LinkedHashSet<>();
        for (int i = 1; i <= 2; i++) {
            UUID id = UUID.fromString(String.format("b0002806-0010-0000-0000-%012d", i));
            inArea5To10Km.add(id);
            insertListing(id, KEY_KUNJIBETTU, 13.060, 74.000, baseTime.minusDays(3).plusMinutes(i));
        }

        // 55 NEWER out-of-Area LIVE listings within 10 km (~8.65 km, outside Kunjibettu bounds)
        Set<UUID> outOfArea10Km = new LinkedHashSet<>();
        for (int i = 1; i <= 55; i++) {
            UUID id = UUID.fromString(String.format("b0002806-9999-0000-0000-%012d", i));
            outOfArea10Km.add(id);
            insertListing(id, KEY_OUTER, 13.050, 74.060, baseTime.plusMinutes(i));
        }

        Resp r3 = callRadius(CITY, "3", "schoolAreaKey", KEY_KUNJIBETTU);
        Resp r5 = callRadius(CITY, "5", "schoolAreaKey", KEY_KUNJIBETTU);
        Resp r10 = callRadius(CITY, "10", "schoolAreaKey", KEY_KUNJIBETTU);

        Set<UUID> ids3 = listingIds(r3);
        Set<UUID> ids5 = listingIds(r5);
        Set<UUID> ids10 = listingIds(r10);

        Set<UUID> expected5Km = new LinkedHashSet<>(inArea3Km);
        expected5Km.addAll(inArea3To5Km);
        Set<UUID> expected10Km = new LinkedHashSet<>(expected5Km);
        expected10Km.addAll(inArea5To10Km);

        assertThat(ids3).as("3 km in-Area IDs").isEqualTo(inArea3Km);
        assertThat(ids5).as("5 km in-Area IDs").isEqualTo(expected5Km);
        assertThat(ids10).as("10 km in-Area IDs").isEqualTo(expected10Km);

        // Monotonicity: 3km ⊆ 5km ⊆ 10km
        assertThat(ids5).containsAll(ids3);
        assertThat(ids10).containsAll(ids5);

        // Out-of-Area rows are never returned
        assertThat(ids10).doesNotContainAnyElementsOf(outOfArea10Km);
        assertThat(r3.json.get("hasMore").asBoolean()).isFalse();
        assertThat(r5.json.get("hasMore").asBoolean()).isFalse();
        assertThat(r10.json.get("hasMore").asBoolean()).isFalse();
    }

    @Test
    @DisplayName("#2806: when >50 in-Area rows match at 10 km, distance-first ordering preserves 3km ⊆ 5km ⊆ 10km on page 0")
    void overFiftyInAreaListingsAt10Km_distanceOrderingPreservesMonotonicSubsetsAtPageCap() throws Exception {
        OffsetDateTime baseTime = OffsetDateTime.of(2026, 6, 1, 12, 0, 0, 0, ZoneOffset.UTC);

        // 5 OLDER in-Area rows at <= 3 km (~0.78 km)
        Set<UUID> inArea3Km = new LinkedHashSet<>();
        for (int i = 1; i <= 5; i++) {
            UUID id = UUID.fromString(String.format("c0002806-0003-0000-0000-%012d", i));
            inArea3Km.add(id);
            insertListing(id, KEY_KUNJIBETTU, 13.005, 74.005, baseTime.minusDays(20).plusMinutes(i));
        }

        // 5 OLDER in-Area rows between 3 km and 5 km (~3.89 km)
        Set<UUID> inArea3To5Km = new LinkedHashSet<>();
        for (int i = 1; i <= 5; i++) {
            UUID id = UUID.fromString(String.format("c0002806-0005-0000-0000-%012d", i));
            inArea3To5Km.add(id);
            insertListing(id, KEY_KUNJIBETTU, 13.035, 74.000, baseTime.minusDays(15).plusMinutes(i));
        }

        // 52 NEWER in-Area rows between 5 km and 10 km (~6.67 km).
        // Under created_at DESC these 52 rows would fill page 0 (size 50) and evict all 10 closer rows.
        for (int i = 1; i <= 52; i++) {
            UUID id = UUID.fromString(String.format("c0002806-0010-0000-0000-%012d", i));
            insertListing(id, KEY_KUNJIBETTU, 13.060, 74.000, baseTime.plusMinutes(i));
        }

        Resp r3 = callRadius(CITY, "3", "schoolAreaKey", KEY_KUNJIBETTU);
        Resp r5 = callRadius(CITY, "5", "schoolAreaKey", KEY_KUNJIBETTU);
        Resp r10 = callRadius(CITY, "10", "schoolAreaKey", KEY_KUNJIBETTU);

        List<UUID> list3 = listingIdsOrdered(r3);
        List<UUID> list5 = listingIdsOrdered(r5);
        List<UUID> list10 = listingIdsOrdered(r10);

        assertThat(list3).hasSize(5);
        assertThat(list5).hasSize(10);
        assertThat(list10).hasSize(50);
        assertThat(r10.json.get("hasMore").asBoolean()).isTrue();

        // Monotonic subset invariant even at the 50-row page cap: 3km ⊆ 5km ⊆ 10km
        assertThat(list5).containsAll(list3);
        assertThat(list10).containsAll(list5);
        assertThat(list10.subList(0, 5)).containsExactlyInAnyOrderElementsOf(inArea3Km);
        assertThat(list10.subList(5, 10)).containsExactlyInAnyOrderElementsOf(inArea3To5Km);
    }

    @Test
    @DisplayName("#2806: invalid, blank, duplicate, other-city, and null-bounds schoolAreaKey fail closed with 400")
    void invalidSchoolAreaKeys_failClosedWith400() throws Exception {
        assertThat(callRadius(CITY, "3", "schoolAreaKey", " ").status).isEqualTo(400);
        assertThat(callRadius(CITY, "3", "schoolAreaKey", KEY_KUNJIBETTU, "schoolAreaKey", KEY_OUTER).status)
                .isEqualTo(400);
        assertThat(callRadius(CITY, "3", "schoolAreaKey", KEY_OTHER_CITY).status).isEqualTo(400);
        assertThat(callRadius(CITY, "3", "schoolAreaKey", KEY_NULL_BOUNDS).status).isEqualTo(400);
        assertThat(callRadius(CITY, "3", "schoolAreaKey", "QA|QA|" + CITY + "|DoesNotExist").status)
                .isEqualTo(400);
    }

    private record Resp(int status, String reason, JsonNode json) {
    }

    private Resp callRadius(String city, String radiusKm, String... extra) throws Exception {
        MockHttpServletRequestBuilder req = get("/api/discover/cities/{city}/school-radius-listings", city)
                .param("schoolLat", SCHOOL_LAT)
                .param("schoolLon", SCHOOL_LON)
                .param("schoolRadiusKm", radiusKm)
                .param("size", "50");
        for (int i = 0; i < extra.length; i += 2) {
            req = req.param(extra[i], extra[i + 1]);
        }
        MockHttpServletResponse res = mvc.perform(req).andReturn().getResponse();
        JsonNode body = res.getStatus() == 200 ? json.readTree(res.getContentAsString()) : null;
        return new Resp(res.getStatus(), res.getErrorMessage(), body);
    }

    private static Set<UUID> listingIds(Resp r) {
        return new LinkedHashSet<>(listingIdsOrdered(r));
    }

    private static List<UUID> listingIdsOrdered(Resp r) {
        assertThat(r.status).as("status must be 200").isEqualTo(200);
        List<UUID> ids = new ArrayList<>();
        r.json.get("content").forEach(n -> ids.add(UUID.fromString(n.get("id").asText())));
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

    private void insertListing(UUID id, String areaKey, double lat, double lon, OffsetDateTime createdAt) {
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', ?, ?, 5000000, ?, ?)",
                id, areaKey, lat, lon, createdAt, createdAt);
    }
}
