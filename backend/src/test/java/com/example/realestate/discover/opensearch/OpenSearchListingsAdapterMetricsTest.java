package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

import java.net.SocketTimeoutException;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit tests for {@link OpenSearchListingsAdapter} metrics wiring.
 *
 * Uses {@link SimpleMeterRegistry} (not mocked) and {@link MockRestServiceServer}
 * against a real RestTemplate-backed RestClient (mirrors the existing AdapterTest approach).
 */
class OpenSearchListingsAdapterMetricsTest {

    private static final String BASE_URL = "http://localhost:9200";
    private static final String ALIAS = "listings_read";

    private SimpleMeterRegistry registry;
    private OpenSearchQueryMetrics queryMetrics;
    private MockRestServiceServer server;
    private OpenSearchListingsAdapter adapter;

    /** Minimal OpenSearch hits response with one result. */
    private static final String ONE_HIT_RESPONSE = """
            {"hits":{"total":{"value":1},"hits":[{"_source":{
              "id":"abc","listing_number":"LN1","property_type":"APARTMENT",
              "title":"Sea View Apartment","locality":"Udupi","area_key":"udupi-core",
              "price_paise":5000000,"land_area":null,"land_area_unit":null,
              "built_area":1200.0,"built_area_unit":"sqft","bedrooms":2,
              "latitude":13.34,"longitude":74.74,"hero_image_url":null,
              "created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z",
              "first_published_at":null,"last_updated_at":null,"back_to_market_at":null,
              "rera_number":null,"trust_tier":"C","possession_status":"READY",
              "seller_type":"OWNER","listing_purpose":"SELL","status":"LIVE","city_slug":"udupi"
            }}]}}""";

    /** OpenSearch response with zero hits. */
    private static final String ZERO_HITS_RESPONSE = """
            {"hits":{"total":{"value":0},"hits":[]}}""";

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        queryMetrics = new OpenSearchQueryMetrics(registry);

        RestTemplate restTemplate = new RestTemplate();
        server = MockRestServiceServer.bindTo(restTemplate).build();
        RestClient restClient = RestClient.builder(restTemplate).baseUrl(BASE_URL).build();

        OpenSearchProperties props = new OpenSearchProperties(
                true, BASE_URL, ALIAS, 500, 1000, "", "", "", false, 500, 1.0, 10);
        adapter = new OpenSearchListingsAdapter(restClient, props, new ObjectMapper(), queryMetrics);
    }

    private String searchUrl() {
        return BASE_URL + "/" + ALIAS + "/_search";
    }

    private void expectSearchReturning(String json) {
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(json, MediaType.APPLICATION_JSON));
    }

    private DiscoverListingsQuery bboxQuery() {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,   // no school radius
                null,               // no FTS q
                new com.example.realestate.discover.DiscoverListingPredicateBuilder.Bbox(13.0, 74.5, 13.5, 75.0),
                0, 20, false, null, null);
    }

    private DiscoverListingsQuery textQuery() {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                "sea view apartment",   // FTS q — must NEVER appear in metric tag values
                null,
                0, 20, false, null, null);
    }

    private DiscoverListingsQuery radiusQuery() {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null,
                13.34, 74.74, 2.0,
                null,
                null,
                0, 20, false, null, null);
    }

    private DiscoverListingsQuery combinedQuery() {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null,
                13.34, 74.74, 2.0,
                "school near apartment",  // MUST NOT appear in tags
                null,
                0, 20, false, null, null);
    }

    // -----------------------------------------------------------------------
    // Success path — various query types
    // -----------------------------------------------------------------------

    @Test
    void getListings_success_emitsSuccessTimer_queryTypeBbox() {
        expectSearchReturning(ONE_HIT_RESPONSE);

        DiscoverListingsPage result = adapter.getListings(bboxQuery());

        assertThat(result.content()).hasSize(1);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void getListings_success_emitsSuccessTimer_queryTypeText() {
        expectSearchReturning(ONE_HIT_RESPONSE);

        adapter.getListings(textQuery());

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "text")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void getListings_success_queryTypeRadius() {
        expectSearchReturning(ONE_HIT_RESPONSE);

        adapter.getListings(radiusQuery());

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "radius")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void getListings_success_queryTypeCombined() {
        expectSearchReturning(ONE_HIT_RESPONSE);

        adapter.getListings(combinedQuery());

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "combined")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // Empty result
    // -----------------------------------------------------------------------

    @Test
    void getListings_emptyResult_emitsEmptyTimer() {
        expectSearchReturning(ZERO_HITS_RESPONSE);

        DiscoverListingsPage result = adapter.getListings(bboxQuery());

        assertThat(result.content()).isEmpty();

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "empty")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // Timeout path — RestTemplate throws ResourceAccessException wrapping SocketTimeoutException
    // -----------------------------------------------------------------------

    @Test
    void getListings_timeout_emitsTimeoutTimerAndFallbackCounter() {
        // Simulate a timeout by throwing directly via a failing RestTemplate
        ResourceAccessException timeoutEx = new ResourceAccessException(
                "I/O error", new SocketTimeoutException("Read timed out"));
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(request -> { throw timeoutEx; });

        assertThatThrownBy(() -> adapter.getListings(bboxQuery()))
                .isInstanceOf(ResourceAccessException.class);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "timeout")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);

        assertThat(registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "timeout")
                .counter().count()).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // Error path — malformed JSON causes OpenSearchQueryException
    // -----------------------------------------------------------------------

    @Test
    void getListings_error_emitsErrorTimerAndFallbackCounter() {
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("not-json{{{", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> adapter.getListings(bboxQuery()))
                .isInstanceOf(OpenSearchQueryException.class);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "error")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);

        assertThat(registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "error")
                .counter().count()).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // PRIVACY: no raw user input in tag values
    // -----------------------------------------------------------------------

    @Test
    void noTagValue_containsUserInputStrings() {
        // Two requests with user-supplied text — these must NEVER appear in tags
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(ONE_HIT_RESPONSE, MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(ONE_HIT_RESPONSE, MediaType.APPLICATION_JSON));

        adapter.getListings(textQuery());    // q = "sea view apartment"
        adapter.getListings(combinedQuery()); // q = "school near apartment"

        Set<String> allTagValues = registry.getMeters().stream()
                .flatMap(m -> m.getId().getTags().stream())
                .map(Tag::getValue)
                .collect(Collectors.toSet());

        assertThat(allTagValues).doesNotContain("sea view apartment");
        assertThat(allTagValues).doesNotContain("school near apartment");
        assertThat(allTagValues).doesNotContain("13.34");
        assertThat(allTagValues).doesNotContain("74.74");
        assertThat(allTagValues).doesNotContain("abc");       // listing ID from response
        assertThat(allTagValues).doesNotContain("udupi-core"); // area_key from response

        // All tag values must be lowercase enum-derived constants or app name
        for (String value : allTagValues) {
            assertThat(value)
                    .as("Tag value '%s' should be a known enum-derived constant", value)
                    .matches("[a-z0-9_. -]+");
        }
    }
}
