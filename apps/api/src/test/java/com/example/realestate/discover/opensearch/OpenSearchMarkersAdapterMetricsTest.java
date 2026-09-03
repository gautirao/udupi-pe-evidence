package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.CityActivationGuard;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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
 * Unit tests for {@link OpenSearchMarkersAdapter} metrics wiring.
 *
 * Uses {@link SimpleMeterRegistry} (not mocked) and {@link MockRestServiceServer}
 * against a real RestTemplate-backed RestClient (mirrors the existing AdapterTest approach).
 */
class OpenSearchMarkersAdapterMetricsTest {

    private static final String BASE_URL = "http://localhost:9200";
    private static final String ALIAS = "listings_read";

    private SimpleMeterRegistry registry;
    private OpenSearchQueryMetrics queryMetrics;
    private MockRestServiceServer server;
    private OpenSearchMarkersAdapter adapter;

    /** One-marker response with valid lat/lon. */
    private static final String ONE_MARKER_RESPONSE = """
            {"hits":{"total":{"value":1},"hits":[{"_source":{
              "id":"marker-1","listing_number":"LN1","property_type":"APARTMENT",
              "title":"Marker Listing","locality":"Udupi","area_key":"udupi-core",
              "price_paise":5000000,"bedrooms":2,
              "latitude":13.34,"longitude":74.74,
              "status":"LIVE","city_slug":"udupi",
              "listing_purpose":"SELL","seller_type":"OWNER",
              "trust_tier":"C","possession_status":"READY",
              "rera_number":null,"hero_image_url":null,
              "created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-01T00:00:00Z",
              "first_published_at":null,"last_updated_at":null,"back_to_market_at":null
            }}]}}""";

    /** Zero-markers response. */
    private static final String ZERO_MARKERS_RESPONSE = """
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
        // Compile/wiring fix only (#1945) — stubs a non-empty active-area_key set (matching the
        // "udupi-core" area_key on the canned response docs above) so these pre-existing metrics
        // tests keep exercising the real OpenSearch round-trip rather than short-circuiting empty.
        CityActivationGuard cityActivationGuard = Mockito.mock(CityActivationGuard.class);
        Mockito.when(cityActivationGuard.activeAreaKeysForCity(Mockito.anyString()))
                .thenReturn(Set.of("udupi-core"));
        adapter = new OpenSearchMarkersAdapter(restClient, props, new ObjectMapper(), queryMetrics, cityActivationGuard);
    }

    private String searchUrl() {
        return BASE_URL + "/" + ALIAS + "/_search";
    }

    private DiscoverListingPredicateBuilder.Filters bboxFilters() {
        return new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                new DiscoverListingPredicateBuilder.Bbox(13.0, 74.5, 13.5, 75.0),
                null, null, null, null, null);
    }

    // -----------------------------------------------------------------------
    // Success path — query_type is always "bbox"
    // -----------------------------------------------------------------------

    @Test
    void getMarkers_success_emitsSuccessTimer_queryTypeBbox() {
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(ONE_MARKER_RESPONSE, MediaType.APPLICATION_JSON));

        DiscoverMarkersResponse result = adapter.getMarkers(bboxFilters());

        assertThat(result.markers()).hasSize(1);

        Timer timer = registry.find("discover.opensearch.markers.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // Empty result
    // -----------------------------------------------------------------------

    @Test
    void getMarkers_emptyResult_emitsEmptyTimer() {
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(ZERO_MARKERS_RESPONSE, MediaType.APPLICATION_JSON));

        DiscoverMarkersResponse result = adapter.getMarkers(bboxFilters());

        assertThat(result.markers()).isEmpty();

        Timer timer = registry.find("discover.opensearch.markers.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "empty")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // Timeout path
    // -----------------------------------------------------------------------

    @Test
    void getMarkers_timeout_emitsTimeoutTimerAndFallbackCounter() {
        ResourceAccessException timeoutEx = new ResourceAccessException(
                "I/O error", new SocketTimeoutException("Read timed out"));
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(request -> { throw timeoutEx; });

        assertThatThrownBy(() -> adapter.getMarkers(bboxFilters()))
                .isInstanceOf(ResourceAccessException.class);

        Timer timer = registry.find("discover.opensearch.markers.query.latency.seconds")
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
    void getMarkers_error_emitsErrorTimerAndFallbackCounter() {
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("not-json{{{", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> adapter.getMarkers(bboxFilters()))
                .isInstanceOf(OpenSearchQueryException.class);

        Timer timer = registry.find("discover.opensearch.markers.query.latency.seconds")
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
        server.expect(once(), requestTo(searchUrl()))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(ONE_MARKER_RESPONSE, MediaType.APPLICATION_JSON));

        adapter.getMarkers(bboxFilters());

        Set<String> allTagValues = registry.getMeters().stream()
                .flatMap(m -> m.getId().getTags().stream())
                .map(Tag::getValue)
                .collect(Collectors.toSet());

        // No coordinate values, listing IDs, or area keys
        assertThat(allTagValues).doesNotContain("13.34");
        assertThat(allTagValues).doesNotContain("74.74");
        assertThat(allTagValues).doesNotContain("marker-1");   // listing ID from response
        assertThat(allTagValues).doesNotContain("udupi-core"); // area_key from response
        assertThat(allTagValues).doesNotContain("13.0");
        assertThat(allTagValues).doesNotContain("74.5");

        // All tag values must be lowercase enum-derived constants or app name
        for (String value : allTagValues) {
            assertThat(value)
                    .as("Tag value '%s' should be a known enum-derived constant", value)
                    .matches("[a-z0-9_. -]+");
        }
    }
}
