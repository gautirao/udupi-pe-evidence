package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Integration test: proves that DiscoverQueryDsl.buildMarkersQuery(Filters)
 * correctly excludes AGRICULTURAL_LAND via the excludePropertyTypes filter
 * in a real OpenSearch instance.
 *
 * <p>Requires Docker. Skipped gracefully (assumeTrue) if Docker is unavailable.
 * Do NOT annotate with @Tag("integration") — this runs via surefire wildcard IT.java include
 * (pom.xml). @Tag("integration") would be EXCLUDED by surefire excludedGroups.
 *
 * <p>Uses java.net.http.HttpClient + Jackson for HTTP — no opensearch-java dependency needed.
 */
class MarkersExcludePropertyTypeIT {

    private static final String IMAGE = "opensearchproject/opensearch:2.13.0";
    private static final int OS_PORT = 9200;
    private static final String INDEX = "listings_excl_test";
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

    @BeforeAll
    static void startContainer() throws Exception {
        assumeTrue(DockerClientFactory.instance().isDockerAvailable(),
                "Docker not available — skipping OpenSearch integration test");

        CONTAINER.start();
        baseUrl = "http://" + CONTAINER.getHost() + ":" + CONTAINER.getMappedPort(OS_PORT);

        createIndex();
        indexDocuments();
        refreshIndex();
    }

    @AfterAll
    static void stopContainer() {
        if (CONTAINER.isRunning()) {
            CONTAINER.stop();
        }
    }

    // -----------------------------------------------------------------------
    // Tests
    // -----------------------------------------------------------------------

    /**
     * Casing-drift parity guard (#1541): the index stores lowercase {@code agricultural_land}
     * (the production case enforced by the {@code chk_listing_property_type} CHECK constraint,
     * V86, and copied verbatim by opensearch_rebuild.py). A MIXED-CASE exclude param must still
     * exclude the agri doc, because DiscoverQueryDsl lowercases excludePropertyTypes before
     * {@code terms()}, mirroring the Postgres {@code LOWER(property_type) NOT IN (...)} behaviour.
     * Only the non-agri (house) doc remains.
     *
     * <p>Before #1541 this would return 2 (no exclusion) because the un-lowercased mixed-case
     * term would not match the lowercase-stored doc — the exact adapter divergence #1541 closes.
     */
    @Test
    void excludeAgriLand_mixedCaseInput_returnsOnlyNonAgriDoc() throws Exception {
        DiscoverListingPredicateBuilder.Filters filters = filters(List.of("Agricultural_Land"));
        Map<String, Object> query = DiscoverQueryDsl.buildMarkersQuery(filters);

        int hits = countHits(query);

        assertThat(hits).isEqualTo(1);
    }

    /**
     * Without excludePropertyTypes, BOTH property types are returned.
     */
    @Test
    void noExclusion_returnsBothDocs() throws Exception {
        DiscoverListingPredicateBuilder.Filters filters = filters(null);
        Map<String, Object> query = DiscoverQueryDsl.buildMarkersQuery(filters);

        int hits = countHits(query);

        assertThat(hits).isEqualTo(2);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Build a minimal Filters with no city (avoids city_slug filter), only excludePropertyTypes. */
    private static DiscoverListingPredicateBuilder.Filters filters(List<String> excludePropertyTypes) {
        return new DiscoverListingPredicateBuilder.Filters(
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, excludePropertyTypes, null
        );
    }

    /** Create the test index with explicit keyword mapping for property_type and date for sort. */
    private static void createIndex() throws Exception {
        Map<String, Object> properties = new java.util.LinkedHashMap<>();
        properties.put("property_type", Map.of("type", "keyword"));
        properties.put("status", Map.of("type", "keyword"));
        properties.put("city_slug", Map.of("type", "keyword"));
        properties.put("created_at", Map.of("type", "date"));

        Map<String, Object> mapping = Map.of(
                "mappings", Map.of("properties", properties)
        );
        String body = MAPPER.writeValueAsString(mapping);
        put(baseUrl + "/" + INDEX, body);
    }

    /**
     * Index one agricultural_land doc and one house doc. Both have status=LIVE.
     *
     * <p>property_type values are LOWERCASE to mirror production: the
     * {@code chk_listing_property_type} CHECK constraint (V86) permits only lowercase
     * values ('house','apartment','land',...,'agricultural_land'), and the OpenSearch
     * indexer (opensearch_rebuild.py) copies the DB value verbatim. Seeding lowercase here
     * makes this a faithful parity test for the real adapter behaviour.
     */
    private static void indexDocuments() throws Exception {
        Map<String, Object> agriDoc = Map.of(
                "id", "test-agri-1",
                "status", "LIVE",
                "property_type", "agricultural_land"
        );
        Map<String, Object> houseDoc = Map.of(
                "id", "test-house-1",
                "status", "LIVE",
                "property_type", "house"
        );
        put(baseUrl + "/" + INDEX + "/_doc/test-agri-1", MAPPER.writeValueAsString(agriDoc));
        put(baseUrl + "/" + INDEX + "/_doc/test-house-1", MAPPER.writeValueAsString(houseDoc));
    }

    /** Force index refresh so documents are immediately searchable. */
    private static void refreshIndex() throws Exception {
        post(baseUrl + "/" + INDEX + "/_refresh", "");
    }

    /** Execute a DiscoverQueryDsl-built query against the test index; return hit count. */
    @SuppressWarnings("unchecked")
    private static int countHits(Map<String, Object> queryBody) throws Exception {
        String json = MAPPER.writeValueAsString(queryBody);
        String response = post(baseUrl + "/" + INDEX + "/_search", json);

        Map<String, Object> parsed = MAPPER.readValue(response, Map.class);
        Map<String, Object> hitsWrapper = (Map<String, Object>) parsed.get("hits");
        Object total = hitsWrapper.get("total");
        if (total instanceof Map<?, ?> totalMap) {
            return ((Number) totalMap.get("value")).intValue();
        }
        return ((Number) total).intValue();
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
