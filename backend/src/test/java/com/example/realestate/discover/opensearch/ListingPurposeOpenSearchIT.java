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
 * produces a query that correctly filters listing_purpose in a real OpenSearch instance.
 *
 * <p>Requires Docker. Skipped gracefully (assumeTrue) if Docker is unavailable.
 * Do NOT annotate with @Tag("integration") - this runs via surefire wildcard IT.java include
 * (pom.xml:145). @Tag("integration") would be EXCLUDED by surefire excludedGroups (pom:147).
 *
 * <p>Uses java.net.http.HttpClient + Jackson for HTTP calls - no opensearch-java dependency needed.
 */
class ListingPurposeOpenSearchIT {

    private static final String IMAGE = "opensearchproject/opensearch:2.13.0";
    private static final int OS_PORT = 9200;
    private static final String INDEX = "listings_test";
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

    @Test
    void saleFilter_returnsOnlySaleDoc() throws Exception {
        DiscoverListingPredicateBuilder.Filters saleFilters = filters("sale");
        Map<String, Object> query = DiscoverQueryDsl.buildMarkersQuery(saleFilters);

        int hits = countHits(query);

        assertThat(hits).isEqualTo(1);
    }

    @Test
    void rentFilter_returnsOnlyRentDoc() throws Exception {
        DiscoverListingPredicateBuilder.Filters rentFilters = filters("rent");
        Map<String, Object> query = DiscoverQueryDsl.buildMarkersQuery(rentFilters);

        int hits = countHits(query);

        assertThat(hits).isEqualTo(1);
    }

    @Test
    void noFilter_returnsBothDocs() throws Exception {
        DiscoverListingPredicateBuilder.Filters noFilters = filters(null);
        Map<String, Object> query = DiscoverQueryDsl.buildMarkersQuery(noFilters);

        int hits = countHits(query);

        assertThat(hits).isEqualTo(2);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /** Build a minimal Filters with no city (avoids city_slug filter), only listingPurpose. */
    private static DiscoverListingPredicateBuilder.Filters filters(String listingPurpose) {
        return new DiscoverListingPredicateBuilder.Filters(
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                listingPurpose
        );
    }

    /** Create the test index with explicit keyword mapping for listing_purpose and date mapping for sort field. */
    private static void createIndex() throws Exception {
        Map<String, Object> properties = new java.util.LinkedHashMap<>();
        properties.put("listing_purpose", Map.of("type", "keyword"));
        properties.put("status", Map.of("type", "keyword"));
        properties.put("city_slug", Map.of("type", "keyword"));
        // buildMarkersQuery and buildListingsQuery both sort on created_at desc — must be mapped
        properties.put("created_at", Map.of("type", "date"));

        Map<String, Object> mapping = Map.of(
                "mappings", Map.of("properties", properties)
        );
        String body = MAPPER.writeValueAsString(mapping);
        put(baseUrl + "/" + INDEX, body);
    }

    /** Index a sale doc and a rent doc. Both have status=LIVE (required by buildBoolQuery). */
    private static void indexDocuments() throws Exception {
        Map<String, Object> saleDoc = Map.of(
                "id", "test-sale-1",
                "status", "LIVE",
                "listing_purpose", "sale"
        );
        Map<String, Object> rentDoc = Map.of(
                "id", "test-rent-1",
                "status", "LIVE",
                "listing_purpose", "rent"
        );
        put(baseUrl + "/" + INDEX + "/_doc/test-sale-1", MAPPER.writeValueAsString(saleDoc));
        put(baseUrl + "/" + INDEX + "/_doc/test-rent-1", MAPPER.writeValueAsString(rentDoc));
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
