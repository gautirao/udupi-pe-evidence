package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.CityActivationGuard;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Integration test: proves the #1945 active-{@code area_key} gate is enforced end-to-end through
 * the REAL production {@link OpenSearchListingsAdapter} / {@link OpenSearchMarkersAdapter} against
 * a REAL {@code opensearchproject/opensearch:2.13.0} instance (Testcontainers, in-CI, not
 * env-gated — mirrors {@link ListingPurposeOpenSearchIT} / {@link MarkersExcludePropertyTypeIT}'s
 * container setup and the gate-semantics style of {@code CityActiveGating1935IT}).
 *
 * <p>{@link CityActivationGuard} is exercised as the REAL production class, backed by a MOCKED
 * {@link JdbcOperations} (its own real-DB behaviour is covered separately by
 * {@code CityActivationGuardTest}, a Testcontainers-Postgres suite) — this IT's job is to prove
 * the OpenSearch query/adapter wiring, not to re-prove the guard's SQL.
 *
 * <p>Requires Docker. Skipped gracefully (assumeTrue) if Docker is unavailable.
 */
class CityActiveGatingOpenSearchIT {

    private static final String IMAGE = "opensearchproject/opensearch:2.13.0";
    private static final int OS_PORT = 9200;
    private static final String INDEX = "listings_1945_gate_test";
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @SuppressWarnings("resource")
    private static final GenericContainer<?> CONTAINER =
            new GenericContainer<>(IMAGE)
                    .withEnv("OPENSEARCH_JAVA_OPTS", "-Xms512m -Xmx512m")
                    .withEnv("DISABLE_SECURITY_PLUGIN", "true")
                    .withEnv("discovery.type", "single-node")
                    .withExposedPorts(OS_PORT)
                    .waitingFor(Wait.forHttp("/_cluster/health")
                            .forPort(OS_PORT)
                            .withStartupTimeout(Duration.ofSeconds(120)));

    private static String baseUrl;

    // ── Fixture: cities / areas ─────────────────────────────────────────────

    private static final String ACTIVE_CITY = "osgateactive";
    private static final String INACTIVE_CITY = "osgateinactive";
    private static final String OTHER_ACTIVE_CITY = "osgateother";
    private static final String UNKNOWN_CITY = "osgateunknown";

    private static final String AREA_A1 = "OS|QA|" + ACTIVE_CITY + "|Area1";
    private static final String AREA_A2 = "OS|QA|" + ACTIVE_CITY + "|Area2";
    // Belongs to ACTIVE_CITY but deliberately EXCLUDED from the guard's returned active set below
    // — models "an inactive area of an otherwise active city" (EC7), the same way #1935 does.
    private static final String AREA_INACTIVE_WITHIN_ACTIVE_CITY = "OS|QA|" + ACTIVE_CITY + "|Area3";
    private static final String AREA_TRUNC = "OS|QA|" + ACTIVE_CITY + "|Bulk";
    private static final String AREA_OTHER_ACTIVE = "OS|QA|" + OTHER_ACTIVE_CITY + "|Area1";
    private static final String AREA_INACTIVE_CITY = "OS|QA|" + INACTIVE_CITY + "|Area1";
    private static final String AREA_ORPHAN = "OS|QA|orphan|Area1";

    private static final int BULK_DOC_COUNT = 1005; // > MARKERS_FETCH_LIMIT(1001) and CAP(1000)

    /** The guard's active set for ACTIVE_CITY — NOTE: AREA_INACTIVE_WITHIN_ACTIVE_CITY is NOT in it. */
    private static final Set<String> ACTIVE_CITY_AREA_KEYS = Set.of(AREA_A1, AREA_A2, AREA_TRUNC);

    // ── Shared adapter wiring ────────────────────────────────────────────────

    private static AtomicInteger httpRequestCount;
    private static OpenSearchListingsAdapter listingsAdapter;
    private static OpenSearchMarkersAdapter markersAdapter;

    @BeforeAll
    static void startContainerAndWireAdapters() throws Exception {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable(),
                "Docker not available — skipping OpenSearch integration test");

        CONTAINER.start();
        baseUrl = "http://" + CONTAINER.getHost() + ":" + CONTAINER.getMappedPort(OS_PORT);

        createIndex();
        indexFixtureDocuments();
        bulkIndexTruncationDocuments();
        refreshIndex();

        httpRequestCount = new AtomicInteger(0);
        RestTemplate restTemplate = new RestTemplate();
        restTemplate.getInterceptors().add(countingInterceptor(httpRequestCount));
        RestClient restClient = RestClient.builder(restTemplate).baseUrl(baseUrl).build();

        OpenSearchProperties props = new OpenSearchProperties(
                true, baseUrl, INDEX, 5000, 5000, "", "", "", false, 500, 1.0, 10);
        OpenSearchQueryMetrics queryMetrics = new OpenSearchQueryMetrics(new io.micrometer.core.instrument.simple.SimpleMeterRegistry());

        // Real CityActivationGuard, backed by a MOCKED JdbcOperations — see class javadoc.
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        when(jdbcOperations.queryForList(any(String.class), eq(String.class), eq(ACTIVE_CITY)))
                .thenReturn(new ArrayList<>(ACTIVE_CITY_AREA_KEYS));
        when(jdbcOperations.queryForList(any(String.class), eq(String.class), eq(INACTIVE_CITY)))
                .thenReturn(List.of());
        when(jdbcOperations.queryForList(any(String.class), eq(String.class), eq(UNKNOWN_CITY)))
                .thenReturn(List.of());
        when(jdbcOperations.queryForList(any(String.class), eq(String.class), eq(OTHER_ACTIVE_CITY)))
                .thenReturn(List.of(AREA_OTHER_ACTIVE));
        CityActivationGuard guard = new CityActivationGuard(jdbcOperations);

        listingsAdapter = new OpenSearchListingsAdapter(restClient, props, MAPPER, queryMetrics, guard);
        markersAdapter = new OpenSearchMarkersAdapter(restClient, props, MAPPER, queryMetrics, guard);
    }

    @AfterAll
    static void stopContainer() {
        if (CONTAINER.isRunning()) {
            CONTAINER.stop();
        }
    }

    private static ClientHttpRequestInterceptor countingInterceptor(AtomicInteger counter) {
        return (org.springframework.http.HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
                -> {
            counter.incrementAndGet();
            ClientHttpResponse response = execution.execute(request, body);
            return response;
        };
    }

    // -----------------------------------------------------------------------
    // Case 1 (EC1, EC2, EC11): active city -> its LIVE docs, INCLUDING a doc indexed with
    // citySlug=null (proves the gate keys on area_key, not the dead city_slug field).
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case1: active city returns its LIVE docs including a citySlug=null doc (EC1/EC2/EC11)")
    void activeCity_returnsLiveDocs_includingCitySlugNullDoc() {
        DiscoverListingsQuery query = listingsQuery(ACTIVE_CITY, List.of(AREA_A1, AREA_A2), 0, 20, false);

        DiscoverListingsPage page = listingsAdapter.getListings(query);

        List<String> ids = page.content().stream().map(DiscoverListingResponse::id).toList();
        assertThat(ids).containsExactlyInAnyOrder("active-1-citySlugNull", "active-2");
        assertThat(page.totalElements()).isEqualTo(2L);
    }

    // -----------------------------------------------------------------------
    // Case 2 (EC2): inactive city -> empty, byte-identical shape to unknown city.
    // Case 3 (EC3): unknown/typo city -> empty, identical to case 2.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case2+3: inactive city == unknown city, both empty (EC2/EC3)")
    void inactiveCity_emptyIdenticalToUnknownCity() {
        DiscoverListingsQuery inactiveQuery = listingsQuery(INACTIVE_CITY, null, 0, 20, false);
        DiscoverListingsQuery unknownQuery = listingsQuery(UNKNOWN_CITY, null, 0, 20, false);

        DiscoverListingsPage inactivePage = listingsAdapter.getListings(inactiveQuery);
        DiscoverListingsPage unknownPage = listingsAdapter.getListings(unknownQuery);

        assertThat(inactivePage.content()).isEmpty();
        assertThat(inactivePage.totalElements()).isEqualTo(0L);
        assertThat(unknownPage.content()).isEmpty();
        assertThat(unknownPage.totalElements()).isEqualTo(0L);
        assertThat(inactivePage).usingRecursiveComparison().isEqualTo(unknownPage);
    }

    // -----------------------------------------------------------------------
    // Case 4 (EC4): blank/absent city -> empty; must NOT fall through to all-cities.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case4: blank/absent city -> empty, NOT all-cities (EC4)")
    void blankCity_returnsEmpty_notAllCities() {
        DiscoverListingsQuery blankQuery = listingsQuery(null, null, 0, 2000, false);

        DiscoverListingsPage page = listingsAdapter.getListings(blankQuery);

        assertThat(page.content()).isEmpty();
        assertThat(page.totalElements())
                .as("blank city must NEVER return the full corpus (1007+ docs across all fixtures)")
                .isEqualTo(0L);
    }

    // -----------------------------------------------------------------------
    // Case 5 (EC5, EC6, EC7): cross-city non-leakage — an active-city query returns ONLY that
    // city's active area_key docs; orphaned and inactive-area-of-active-city docs are excluded.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case5: active-city query returns ONLY its own active area_key docs — explicit "
            + "ID-set assertion excluding cross-city, orphan, and inactive-area docs (EC5/EC6/EC7)")
    void activeCity_returnsOnlyItsOwnActiveAreaDocs_explicitIdSet() {
        DiscoverListingsQuery query = listingsQuery(ACTIVE_CITY, null, 0, 2000, false);

        DiscoverListingsPage page = listingsAdapter.getListings(query);

        Set<String> ids = page.content().stream().map(DiscoverListingResponse::id).collect(Collectors.toSet());

        // Expected: the 2 discrete active docs + all BULK_DOC_COUNT truncation docs (all under
        // AREA_TRUNC, also in the active set).
        assertThat(ids).contains("active-1-citySlugNull", "active-2");
        assertThat(ids).hasSize(2 + BULK_DOC_COUNT);
        assertThat(page.totalElements()).isEqualTo(2L + BULK_DOC_COUNT);

        // Explicit exclusions:
        assertThat(ids)
                .as("EC7: a doc whose area belongs to ACTIVE_CITY but is NOT in the guard's active set must be excluded")
                .doesNotContain("inactive-area-in-active-city");
        assertThat(ids)
                .as("EC5: another active city's docs must never leak in")
                .doesNotContain("other-active-city-1");
        assertThat(ids)
                .as("EC2: the inactive city's docs must never leak in")
                .doesNotContain("inactive-city-1");
        assertThat(ids)
                .as("EC6: an orphaned area_key doc must never leak in")
                .doesNotContain("orphan-1");
    }

    // -----------------------------------------------------------------------
    // Case 6 (EC17): truncated markers _count respects the gate — totalFilteredElements reflects
    // ONLY the active-in-city set, proving runCountQuery reuses the same activeAreaKeys.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case6: truncated markers _count query respects the same active-area_key gate as "
            + "the hits query (EC17)")
    void truncatedMarkers_countQuery_respectsGate() {
        DiscoverListingPredicateBuilder.Filters filters = markersFilters(ACTIVE_CITY, null);

        DiscoverMarkersResponse response = markersAdapter.getMarkers(filters);

        assertThat(response.truncated()).isTrue();
        assertThat(response.markers()).hasSize(1000); // CAP
        assertThat(response.returnedElements()).isEqualTo(1000);
        assertThat(response.totalFilteredElements())
                .as("count re-query must use the SAME active-area_key set as the hits query — "
                        + "2 discrete active docs + BULK_DOC_COUNT bulk docs, NEVER inflated by "
                        + "inactive/cross-city/orphan docs")
                .isEqualTo(2L + BULK_DOC_COUNT);
    }

    // -----------------------------------------------------------------------
    // Case 7 (EC19): shadow parity — inactive/unknown city yields zero OS-only ids (extraCount==0).
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case7: shadow parity — inactive and unknown city markers are empty (no OS-only "
            + "inactive-city id could ever surface in a shadow comparison; extraCount==0) (EC19)")
    void shadowParity_inactiveAndUnknownCity_zeroMarkers() {
        DiscoverMarkersResponse inactiveResponse = markersAdapter.getMarkers(markersFilters(INACTIVE_CITY, null));
        DiscoverMarkersResponse unknownResponse = markersAdapter.getMarkers(markersFilters(UNKNOWN_CITY, null));

        assertThat(inactiveResponse.markers()).isEmpty();
        assertThat(inactiveResponse.returnedElements()).isEqualTo(0);
        assertThat(inactiveResponse.totalFilteredElements()).isEqualTo(0L);

        assertThat(unknownResponse.markers()).isEmpty();
        assertThat(unknownResponse.returnedElements()).isEqualTo(0);
        assertThat(unknownResponse.totalFilteredElements()).isEqualTo(0L);
    }

    // -----------------------------------------------------------------------
    // Case 8 (EC12, EC8): empty active-set short-circuits — NO OpenSearch round-trip at all.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("case8: empty active-area_key set short-circuits BOTH listings and markers — "
            + "NO OpenSearch HTTP call is ever issued (EC12/EC8)")
    void emptyActiveSet_shortCircuits_noOpenSearchRoundTrip() {
        int before = httpRequestCount.get();

        DiscoverListingsPage listingsPage = listingsAdapter.getListings(listingsQuery(INACTIVE_CITY, null, 0, 20, false));
        DiscoverMarkersResponse markersResponse = markersAdapter.getMarkers(markersFilters(INACTIVE_CITY, null));

        int after = httpRequestCount.get();

        assertThat(listingsPage.content()).isEmpty();
        assertThat(markersResponse.markers()).isEmpty();
        assertThat(after)
                .as("neither getListings nor getMarkers should have issued any HTTP request to "
                        + "OpenSearch when the active-area_key set is empty")
                .isEqualTo(before);
    }

    // -----------------------------------------------------------------------
    // EC15/EC16: pagination + aggregation reconcile with the active-only set.
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("EC15/EC16: hits.total and locality aggregation reconcile exactly with the "
            + "active-in-city doc set — pre-pagination/pre-aggregation gating")
    void paginationAndAggregation_reconcileWithActiveOnlySet() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                ACTIVE_CITY, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, true, null, List.of(AREA_A1, AREA_A2), null);

        DiscoverListingsPage page = listingsAdapter.getListings(query);

        assertThat(page.totalElements())
                .as("hits.total must reflect ONLY the active-in-city set (2 discrete docs, "
                        + "narrowed further by the areaKeys param to exclude the bulk-truncation docs)")
                .isEqualTo(2L);
        assertThat(page.aggregates()).isNotNull();
        int totalAggBuckets = page.aggregates().topLocalities().stream()
                .mapToInt(com.example.realestate.discover.DiscoverListingsAggregates.LocalityCount::count)
                .sum();
        assertThat(totalAggBuckets)
                .as("aggregation doc_count sum must reconcile with the gated (not the full-corpus) set")
                .isEqualTo(2);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static DiscoverListingsQuery listingsQuery(String city, List<String> areaKeys, int page, int size,
                                                        boolean includeAggregates) {
        return new DiscoverListingsQuery(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, page, size, includeAggregates, null, areaKeys, null);
    }

    private static DiscoverListingPredicateBuilder.Filters markersFilters(String city, List<String> areaKeys) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, areaKeys, null);
    }

    /** Create the test index with explicit keyword mapping for area_key/city_slug/status, geo_point location, date for sort. */
    private static void createIndex() throws Exception {
        Map<String, Object> properties = new java.util.LinkedHashMap<>();
        properties.put("area_key", Map.of("type", "keyword"));
        properties.put("city_slug", Map.of("type", "keyword"));
        properties.put("status", Map.of("type", "keyword"));
        // "locality.keyword" sub-field mirrors production's mapping so buildAggregations()'s
        // terms agg on "locality.keyword" (DiscoverQueryDsl) resolves against this test index too.
        properties.put("locality", Map.of(
                "type", "text",
                "fields", Map.of("keyword", Map.of("type", "keyword"))));
        properties.put("latitude", Map.of("type", "double"));
        properties.put("longitude", Map.of("type", "double"));
        properties.put("created_at", Map.of("type", "date"));

        Map<String, Object> mapping = Map.of(
                "settings", Map.of("index", Map.of("max_result_window", 20000)),
                "mappings", Map.of("properties", properties)
        );
        put(baseUrl + "/" + INDEX, MAPPER.writeValueAsString(mapping));
    }

    private static void indexFixtureDocuments() throws Exception {
        // Active city, discrete docs — one with city_slug=null (EC11 dead-field regression guard).
        indexDoc("active-1-citySlugNull", doc(AREA_A1, null, "LocalityA"));
        indexDoc("active-2", doc(AREA_A2, ACTIVE_CITY, "LocalityB"));

        // An area belonging to ACTIVE_CITY but NOT in the guard's returned active set (EC7).
        indexDoc("inactive-area-in-active-city", doc(AREA_INACTIVE_WITHIN_ACTIVE_CITY, ACTIVE_CITY, "LocalityC"));

        // A different, genuinely active city's doc (EC5 cross-city non-leakage).
        indexDoc("other-active-city-1", doc(AREA_OTHER_ACTIVE, OTHER_ACTIVE_CITY, "LocalityD"));

        // The inactive city's doc (EC2).
        indexDoc("inactive-city-1", doc(AREA_INACTIVE_CITY, INACTIVE_CITY, "LocalityE"));

        // Orphaned area_key, belongs to no city in the guard's world (EC6).
        indexDoc("orphan-1", doc(AREA_ORPHAN, null, "LocalityF"));
    }

    private static Map<String, Object> doc(String areaKey, String citySlug, String locality) {
        Map<String, Object> d = new java.util.LinkedHashMap<>();
        d.put("id", "doc-placeholder"); // overwritten by caller-visible _id; kept for _source completeness
        d.put("status", "LIVE");
        d.put("area_key", areaKey);
        d.put("city_slug", citySlug);
        d.put("locality", locality);
        d.put("latitude", 13.3);
        d.put("longitude", 74.7);
        d.put("created_at", OffsetDateTime.now().toString());
        return d;
    }

    private static void indexDoc(String id, Map<String, Object> body) throws Exception {
        Map<String, Object> withId = new java.util.LinkedHashMap<>(body);
        withId.put("id", id);
        put(baseUrl + "/" + INDEX + "/_doc/" + id, MAPPER.writeValueAsString(withId));
    }

    /** Bulk-index BULK_DOC_COUNT docs under AREA_TRUNC (all active) for the truncation/count cases. */
    private static void bulkIndexTruncationDocuments() throws Exception {
        StringBuilder bulk = new StringBuilder();
        for (int i = 0; i < BULK_DOC_COUNT; i++) {
            String id = "bulk-" + i;
            Map<String, Object> action = Map.of("index", Map.of("_index", INDEX, "_id", id));
            Map<String, Object> source = doc(AREA_TRUNC, ACTIVE_CITY, "LocalityBulk");
            source.put("id", id);
            bulk.append(MAPPER.writeValueAsString(action)).append("\n");
            bulk.append(MAPPER.writeValueAsString(source)).append("\n");
        }
        postNdjson(baseUrl + "/_bulk", bulk.toString());
    }

    private static void refreshIndex() throws Exception {
        post(baseUrl + "/" + INDEX + "/_refresh", "");
    }

    private static String post(String url, String body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(30))
                .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new RuntimeException("OpenSearch request failed [" + response.statusCode() + "]: " + response.body());
        }
        return response.body();
    }

    private static String postNdjson(String url, String body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/x-ndjson")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(60))
                .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new RuntimeException("OpenSearch bulk request failed [" + response.statusCode() + "]: " + response.body());
        }
        if (response.body().contains("\"errors\":true")) {
            throw new RuntimeException("OpenSearch bulk request reported per-item errors: " + response.body());
        }
        return response.body();
    }

    private static void put(String url, String body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(30))
                .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new RuntimeException("OpenSearch PUT failed [" + response.statusCode() + "]: " + response.body());
        }
    }
}
