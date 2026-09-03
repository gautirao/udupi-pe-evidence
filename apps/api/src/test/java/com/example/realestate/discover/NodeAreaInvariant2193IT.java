package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationCacheProperties;
import com.example.realestate.discover.navigation.NavigationGraph;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import com.example.realestate.discover.navigation.NavigationGraphLoader;
import com.example.realestate.discover.navigation.NavigationNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Testcontainers real-DB proof for issue #2193 (AC1): a listing correctly attributed to a
 * canonical Area (matching {@code area_key}, coordinates genuinely inside the Area's geographic
 * boundary) is returned by BOTH {@code /api/discover/listings} and {@code /api/discover/markers}
 * query paths when the SAME canonical {@code nodeKey} (an AREA leaf) is selected.
 *
 * <p><b>Why this test exists.</b> While manually testing #2192, the owner found a real Kothanur
 * listing with a marker missing at its Area node despite the panel showing it. Investigation
 * proved #2192's own scoping code correct; the specific listing had bad historical coordinate
 * data. What had never been directly, deterministically proven: for a listing that IS correctly
 * attributed, does selecting its Area via {@code nodeKey} actually surface it in BOTH the panel
 * query AND the marker query. This test proves exactly that, by construction, against a fixture
 * whose correctness is guaranteed (not borrowed from possibly-mismatched production data).
 *
 * <p><b>"PostGIS boundary" caveat (read before assuming a schema change is needed).</b> The
 * {@code areas} table (V71) has no persisted polygon/geometry column today — only a bounding box
 * ({@code min_lat}/{@code min_lon}/{@code max_lat}/{@code max_lon}, the columns
 * {@code CityActiveGating1935IT} already populates for every fixture Area) plus reserved,
 * currently-NULL OSM provenance columns (V113) for a future real-geometry slice. This test does
 * NOT add a boundary column (forbidden — no Flyway migration in this issue's scope). Instead the
 * SQL precondition below builds a real PostGIS polygon AT QUERY TIME from the Area's own
 * min/max lat/lon columns and runs a genuine {@code ST_Contains} geometric containment check
 * against it — the only per-Area geometry the current schema provides, exercised honestly rather
 * than faked. A listing seeded outside that box (the negative control) fails this same check,
 * proving the assertion is not tautological.
 *
 * <p><b>Navigation graph.</b> Per this issue's plan (R1 mitigation, endorsed in the approved
 * execution handoff): the {@link NavigationGraph} is built directly via
 * {@link NavigationGraph#build} from in-memory {@link NavigationNode} fixture objects (reusing
 * the {@code node(...)} reflection-based id-injection helper pattern from
 * {@code NavigationControllerTest}), then installed via {@link NavigationGraphCache#seed}. This
 * deliberately bypasses {@link NavigationGraphLoader}/{@code NavigationTreeValidationService} —
 * the DB-backed load-and-validate path that R1 warns can reject a hand-seeded
 * {@code navigation_nodes} table row set for reasons unrelated to the invariant under test. The
 * graph shape itself (depth-ascending, single AREA leaf, real ancestor keys) still faithfully
 * exercises {@link NodeKeyResolver#resolveDescendantAreaKeys} exactly as production code calls
 * it from {@link DiscoverListingsController} and {@link DiscoverMarkersController}.
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
        "spring.flyway.placeholders.concurrently_keyword="
})
class NodeAreaInvariant2193IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // ── Fixture identity (N8 — centralised; frontend/E2E specialists reuse these SAME values) ──

    private static final String CITY_SLUG = "qa2193audit";

    /** The canonical Area the fixture listing genuinely belongs to. */
    private static final String TARGET_AREA_KEY = "QA|QA|" + CITY_SLUG + "|TargetArea";
    /** A DIFFERENT Area, used only by the negative-control listing (N1). */
    private static final String OUTSIDE_AREA_KEY = "QA|QA|" + CITY_SLUG + "|OutsideArea";

    /** The canonical Area's bounding box (also its ad hoc "boundary" for the ST_Contains check
     * below — see class javadoc). Centre (13.00, 74.00), box roughly 22km x 22km. */
    private static final double AREA_MIN_LAT = 12.90;
    private static final double AREA_MIN_LON = 73.90;
    private static final double AREA_MAX_LAT = 13.10;
    private static final double AREA_MAX_LON = 74.10;
    private static final double AREA_CENTRE_LAT = 13.00;
    private static final double AREA_CENTRE_LON = 74.00;

    /** N10: dead-centre of the box, well interior — never on the boundary, where ST_Contains
     * (boundary-exclusive) would spuriously fail. */
    private static final double INSIDE_LAT = 13.00;
    private static final double INSIDE_LON = 74.00;
    /** Nowhere near the box — the negative-control listing's coordinates. */
    private static final double OUTSIDE_LAT = 20.00;
    private static final double OUTSIDE_LON = 80.00;

    private static final UUID TARGET_LISTING_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID OUTSIDE_LISTING_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");

    /** The AREA leaf's nodeKey — what the frontend/E2E fixtures must select via {@code node=}. */
    private static final String LEAF_NODE_KEY = "a:2193-target";
    private static final String ROOT_NODE_KEY = "c:2193-root";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverListingsController listingsController;
    private DiscoverMarkersController markersController;
    private NavigationGraphCache navigationGraphCache;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity(CITY_SLUG, true);
        insertArea(TARGET_AREA_KEY, cityId, "Target Area",
                AREA_CENTRE_LAT, AREA_CENTRE_LON, AREA_MIN_LAT, AREA_MIN_LON, AREA_MAX_LAT, AREA_MAX_LON);
        insertArea(OUTSIDE_AREA_KEY, cityId, "Outside Area",
                OUTSIDE_LAT, OUTSIDE_LON, OUTSIDE_LAT - 0.05, OUTSIDE_LON - 0.05, OUTSIDE_LAT + 0.05, OUTSIDE_LON + 0.05);

        insertLiveListing(TARGET_LISTING_ID, TARGET_AREA_KEY, INSIDE_LAT, INSIDE_LON);
        insertLiveListing(OUTSIDE_LISTING_ID, OUTSIDE_AREA_KEY, OUTSIDE_LAT, OUTSIDE_LON);

        // ── N2/N6: fixture-authenticity preconditions, asserted BEFORE any query under test runs.
        // A bad fixture fails HERE, not as a misleading post-query assertion.

        assertThat(stContains(TARGET_LISTING_ID))
                .as("precondition: the target listing's point must genuinely lie inside the "
                        + "target Area's boundary box (ST_Contains) — if this fails, the fixture "
                        + "itself is broken, not the invariant under test")
                .isTrue();
        assertThat(stContains(OUTSIDE_LISTING_ID))
                .as("precondition (negative control): the outside listing's point must NOT lie "
                        + "inside the target Area's boundary — otherwise it is not a valid negative "
                        + "control")
                .isFalse();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT area_key FROM property_listings WHERE id = ?", String.class, TARGET_LISTING_ID))
                .as("precondition: target listing's area_key must equal the target Area's key")
                .isEqualTo(TARGET_AREA_KEY);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false "
                        + "FROM property_listings WHERE id = ?", Boolean.class, TARGET_LISTING_ID))
                .as("precondition: target listing must satisfy the canonical visibility predicate "
                        + "(DiscoverListingPredicateBuilder.java:78)")
                .isTrue();

        // ── Navigation graph: built in-memory (R1 mitigation — bypasses the DB-backed loader) ──

        Instant now = Instant.now();
        NavigationNode root = node(1L, null, "qa2193", "CLUSTER", ROOT_NODE_KEY, null,
                List.of(TARGET_AREA_KEY), "QA Root", 0, 0, List.of(), 1, now);
        NavigationNode leaf = node(2L, 1L, "qa2193", "AREA", LEAF_NODE_KEY, TARGET_AREA_KEY,
                List.of(TARGET_AREA_KEY), "Target Area", 0, 1, List.of(ROOT_NODE_KEY), 0, now);
        NavigationGraph graph = NavigationGraph.build(CITY_SLUG, 1L, List.of(root, leaf));

        navigationGraphCache = new NavigationGraphCache(mock(NavigationGraphLoader.class), new NavigationCacheProperties());
        navigationGraphCache.seed(CITY_SLUG, cityId, 1L, graph);

        // N6: the graph actually loads AND resolves the fixture nodeKey to a non-null node —
        // surfaces R1 explicitly (as a clear assertion failure here) rather than letting a bad
        // graph silently fail the real assertions below for the wrong reason.
        assertThat(navigationGraphCache.getActiveGraph(CITY_SLUG)).isPresent();
        NavigationGraph loaded = navigationGraphCache.getActiveGraph(CITY_SLUG).orElseThrow();
        assertThat(loaded.containsNodeKey(LEAF_NODE_KEY)).isTrue();
        // N7: the seeded node must be a genuine LEAF (no children) — a parent/cluster node would
        // return its whole subtree and pass this test for the wrong reason.
        assertThat(loaded.childrenOf(LEAF_NODE_KEY)).isEmpty();
        assertThat(loaded.nodeByKey(LEAF_NODE_KEY).getNodeType()).isEqualTo("AREA");

        DiscoverListingsService listingsService = new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        DiscoverMarkersService markersService = new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        ObjectMapper objectMapper = new ObjectMapper();
        PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy = new PolygonGeographicSafetyPolicy(jdbcTemplate);
        listingsController = new DiscoverListingsController(listingsService, objectMapper, navigationGraphCache, polygonGeographicSafetyPolicy);
        markersController = new DiscoverMarkersController(markersService, objectMapper, navigationGraphCache, polygonGeographicSafetyPolicy);
    }

    @Test
    @DisplayName("#2193 AC1: for the same canonical AREA-leaf nodeKey, both the listings query and "
            + "the markers query return the SAME correctly-attributed, validly-coordinated listing "
            + "— and both exclude a listing seeded in a different Area with out-of-boundary coordinates")
    void nodeAreaInvariant_bothQueryPathsAgreeOnSameListing_forCanonicalNode() {
        // (e) listings query for nodeKey=<leaf> contains the target listing id.
        ResponseEntity<DiscoverListingsPage> listingsResponse = listingsController.getListings(
                CITY_SLUG, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, 0, 20, false, null, null, LEAF_NODE_KEY,
                null, null);

        assertThat(listingsResponse.getStatusCode().is2xxSuccessful()).isTrue();
        DiscoverListingsPage listingsPage = listingsResponse.getBody();
        assertThat(listingsPage).isNotNull();
        List<String> listingIds = listingsPage.content().stream().map(DiscoverListingResponse::id).toList();

        assertThat(listingIds)
                .as("the panel/listings query for the target Area's nodeKey must return the "
                        + "correctly-attributed target listing")
                .contains(TARGET_LISTING_ID.toString());
        assertThat(listingIds)
                .as("N1 negative control: the listings query must NOT return a listing seeded in a "
                        + "different Area with out-of-boundary coordinates — an unscoped query would "
                        + "pass this test trivially without this check")
                .doesNotContain(OUTSIDE_LISTING_ID.toString());

        // (f) markers query for nodeKey=<leaf> contains a marker with the SAME listing id.
        ResponseEntity<DiscoverMarkersResponse> markersResponse = markersController.getMarkers(
                CITY_SLUG, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, LEAF_NODE_KEY, null, null);

        assertThat(markersResponse.getStatusCode().is2xxSuccessful()).isTrue();
        DiscoverMarkersResponse markersBody = markersResponse.getBody();
        assertThat(markersBody).isNotNull();
        List<String> markerIds = markersBody.markers().stream().map(DiscoverMarker::id).toList();

        assertThat(markerIds)
                .as("the map/markers query for the SAME target Area's nodeKey must return a marker "
                        + "for the SAME target listing id (never bare count — correlated by id since "
                        + "DiscoverMarker has no areaKey field)")
                .contains(TARGET_LISTING_ID.toString());
        assertThat(markerIds)
                .as("N1 negative control (markers side): the out-of-boundary/different-Area listing "
                        + "must not produce a marker for this nodeKey either")
                .doesNotContain(OUTSIDE_LISTING_ID.toString());
    }

    // ── Fixture helpers ──────────────────────────────────────────────────────

    private int insertCity(String slug, boolean active) {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, ?)",
                slug, slug, AREA_CENTRE_LAT, AREA_CENTRE_LON, active);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, slug);
    }

    private void insertArea(String areaKey, int cityId, String name,
                             double centreLat, double centreLon,
                             double minLat, double minLon, double maxLat, double maxLon) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                areaKey, cityId, name, centreLat, centreLon, minLat, minLon, maxLat, maxLon);
    }

    private void insertLiveListing(UUID id, String areaKey, double lat, double lon) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', ?, ?, 5000000, ?, ?)",
                id, areaKey, lat, lon, now, now);
    }

    /** Genuine ST_Contains check: is this listing's stored (lon,lat) point inside the target
     * Area's bounding-box-as-polygon, built at query time from the Area's own min/max columns
     * (see class javadoc — the schema has no persisted Area boundary column). */
    private boolean stContains(UUID listingId) {
        String boundaryWkt = String.format(
                "POLYGON((%1$f %2$f, %3$f %2$f, %3$f %4$f, %1$f %4$f, %1$f %2$f))",
                AREA_MIN_LON, AREA_MIN_LAT, AREA_MAX_LON, AREA_MAX_LAT);
        Boolean result = jdbcTemplate.queryForObject(
                "SELECT ST_Contains(ST_GeomFromText(?, 4326), "
                        + "ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326)) "
                        + "FROM property_listings pl WHERE pl.id = ?",
                Boolean.class, boundaryWkt, listingId);
        return Boolean.TRUE.equals(result);
    }

    /** Reflection-based id injection — reused from {@code NavigationControllerTest}'s {@code
     * node(...)} fixture helper pattern (id is {@code @GeneratedValue}, unsettable via the public
     * constructor). Builds an in-memory {@link NavigationNode}; never persisted to the DB. */
    private static NavigationNode node(long id, Long parentId, String regionKey, String nodeType, String nodeKey,
                                        String areaKey, List<String> representativeAreaKeys, String label,
                                        int displayOrder, int depth, List<String> ancestorKeys,
                                        int descendantAreaCount, Instant now) {
        BigDecimal z = BigDecimal.ZERO;
        NavigationNode n = new NavigationNode(1, regionKey, nodeType, parentId, nodeKey, areaKey,
                representativeAreaKeys, label, displayOrder, depth, ancestorKeys, descendantAreaCount,
                z, z, z, z, z, z, "fp", now);
        try {
            var f = NavigationNode.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(n, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        return n;
    }
}
