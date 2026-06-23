package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit tests for {@link OpenSearchMarkersAdapter} using MockRestServiceServer
 * against a RestTemplate-backed RestClient.
 */
class OpenSearchMarkersAdapterTest {

    private static final String BASE_URL = "http://localhost:9200";
    private static final String ALIAS = "listings_read";

    private MockRestServiceServer server;
    private OpenSearchMarkersAdapter adapter;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        RestTemplate restTemplate = new RestTemplate();
        // Bind MockRestServiceServer BEFORE building RestClient so the interceptor is set
        server = MockRestServiceServer.bindTo(restTemplate).build();
        RestClient restClient = RestClient.builder(restTemplate).baseUrl(BASE_URL).build();

        OpenSearchProperties props = new OpenSearchProperties(true, BASE_URL, ALIAS, 500, 1000, "", "", "", false, 500, 1.0, 10);
        OpenSearchQueryMetrics queryMetrics = new OpenSearchQueryMetrics(new SimpleMeterRegistry());
        adapter = new OpenSearchMarkersAdapter(restClient, props, objectMapper, queryMetrics);
    }

    private static DiscoverListingPredicateBuilder.Filters simpleFilters() {
        return new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null
        );
    }

    private String buildHitsResponse(int count) {
        List<String> hits = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            hits.add("""
                    {
                        "_source": {
                            "id": "listing-%d",
                            "latitude": 13.3,
                            "longitude": 74.7,
                            "price_paise": 5000000,
                            "locality": "Test Locality",
                            "status": "LIVE"
                        }
                    }
                    """.formatted(i));
        }
        String hitsJson = String.join(",", hits);
        return """
                {
                    "hits": {
                        "total": { "value": %d, "relation": "eq" },
                        "hits": [%s]
                    }
                }
                """.formatted(count, hitsJson);
    }

    // -----------------------------------------------------------------------
    // Test 1: valid OS response with 5 hits → correct DiscoverMarkersResponse
    // -----------------------------------------------------------------------

    @Test
    void fiveHits_returnsCorrectMarkersResponse() {
        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_search"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(buildHitsResponse(5), MediaType.APPLICATION_JSON));

        DiscoverMarkersResponse result = adapter.getMarkers(simpleFilters());

        assertThat(result.markers()).hasSize(5);
        assertThat(result.truncated()).isFalse();
        assertThat(result.returnedElements()).isEqualTo(5);
        assertThat(result.totalFilteredElements()).isEqualTo(5);
        assertThat(result.limit()).isEqualTo(1000);
        assertThat(result.city()).isEqualTo("udupi");

        DiscoverMarker first = result.markers().get(0);
        assertThat(first.id()).isEqualTo("listing-0");
        assertThat(first.latitude()).isEqualTo(13.3);
        assertThat(first.longitude()).isEqualTo(74.7);
        assertThat(first.pricePaise()).isEqualTo(5_000_000L);

        server.verify();
    }

    // -----------------------------------------------------------------------
    // Test 2: 1001 hits → truncated=true, 1000 markers returned, count query run
    // -----------------------------------------------------------------------

    @Test
    void over1000Hits_truncatesAndRunsCountQuery() {
        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_search"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(buildHitsResponse(1001), MediaType.APPLICATION_JSON));

        String countResponse = """
                { "count": 1050, "_shards": { "total": 1, "successful": 1 } }
                """;
        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_count"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(countResponse, MediaType.APPLICATION_JSON));

        DiscoverMarkersResponse result = adapter.getMarkers(simpleFilters());

        assertThat(result.truncated()).isTrue();
        assertThat(result.markers()).hasSize(1000);
        assertThat(result.returnedElements()).isEqualTo(1000);
        assertThat(result.totalFilteredElements()).isEqualTo(1050L);

        server.verify();
    }

    // -----------------------------------------------------------------------
    // Test 3: 0 hits → empty markers, truncated=false
    // -----------------------------------------------------------------------

    @Test
    void zeroHits_returnsEmptyMarkersNotTruncated() {
        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_search"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(buildHitsResponse(0), MediaType.APPLICATION_JSON));

        DiscoverMarkersResponse result = adapter.getMarkers(simpleFilters());

        assertThat(result.markers()).isEmpty();
        assertThat(result.truncated()).isFalse();
        assertThat(result.returnedElements()).isEqualTo(0);
        assertThat(result.totalFilteredElements()).isEqualTo(0L);

        server.verify();
    }
}
