package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit tests for {@link OpenSearchListingsAdapter} using MockRestServiceServer
 * against a RestTemplate-backed RestClient.
 */
class OpenSearchListingsAdapterTest {

    private static final String BASE_URL = "http://localhost:9200";
    private static final String ALIAS = "listings_read";

    private MockRestServiceServer server;
    private OpenSearchListingsAdapter adapter;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        RestTemplate restTemplate = new RestTemplate();
        // Bind MockRestServiceServer BEFORE building RestClient so the interceptor is installed
        server = MockRestServiceServer.bindTo(restTemplate).build();
        RestClient restClient = RestClient.builder(restTemplate).baseUrl(BASE_URL).build();

        OpenSearchProperties props = new OpenSearchProperties(true, BASE_URL, ALIAS, 500, 1000, "", "", "", false, 500, 1.0, 10);
        OpenSearchQueryMetrics queryMetrics = new OpenSearchQueryMetrics(new SimpleMeterRegistry());
        adapter = new OpenSearchListingsAdapter(restClient, props, objectMapper, queryMetrics);
    }

    private static DiscoverListingsQuery basicQuery(boolean includeAggregates) {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, includeAggregates, null, null
        );
    }

    private static String buildListingsResponse(int count, long total) {
        StringBuilder hits = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) hits.append(",");
            hits.append("""
                    {
                        "_source": {
                            "id": "listing-%d",
                            "property_type": "APARTMENT",
                            "title": "Test Apartment %d",
                            "locality": "Test Locality",
                            "area_key": "test-area",
                            "price_paise": 5000000,
                            "latitude": 13.3,
                            "longitude": 74.7,
                            "status": "LIVE",
                            "created_at": "2024-01-15T10:00:00Z"
                        }
                    }
                    """.formatted(i, i));
        }
        return """
                {
                    "hits": {
                        "total": { "value": %d, "relation": "eq" },
                        "hits": [%s]
                    }
                }
                """.formatted(total, hits);
    }

    // -----------------------------------------------------------------------
    // Test 1: valid OS response → DiscoverListingsPage with correct fields
    // -----------------------------------------------------------------------

    @Test
    void validResponse_returnsMappedListingsPage() {
        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_search"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(buildListingsResponse(3, 30L), MediaType.APPLICATION_JSON));

        DiscoverListingsPage page = adapter.getListings(basicQuery(false));

        assertThat(page.content()).hasSize(3);
        assertThat(page.totalElements()).isEqualTo(30L);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(page.page()).isEqualTo(0);
        assertThat(page.size()).isEqualTo(20);
        assertThat(page.aggregates()).isNull();

        assertThat(page.content().get(0).id()).isEqualTo("listing-0");
        assertThat(page.content().get(0).propertyType()).isEqualTo("APARTMENT");
        assertThat(page.content().get(0).latitude()).isEqualTo(13.3);

        server.verify();
    }

    // -----------------------------------------------------------------------
    // Test 2: includeAggregates=true → DiscoverListingsAggregates populated
    // -----------------------------------------------------------------------

    @Test
    void withAggregates_populatesTopLocalities() {
        String responseWithAggs = """
                {
                    "hits": {
                        "total": { "value": 10, "relation": "eq" },
                        "hits": []
                    },
                    "aggregations": {
                        "locality_agg": {
                            "buckets": [
                                { "key": "Udupi Town", "doc_count": 5 },
                                { "key": "Manipal", "doc_count": 3 },
                                { "key": "Karkala", "doc_count": 2 }
                            ]
                        }
                    }
                }
                """;

        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_search"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(responseWithAggs, MediaType.APPLICATION_JSON));

        DiscoverListingsPage page = adapter.getListings(basicQuery(true));

        assertThat(page.aggregates()).isNotNull();
        assertThat(page.aggregates().topLocalities()).hasSize(3);
        assertThat(page.aggregates().topLocalities().get(0).locality()).isEqualTo("Udupi Town");
        assertThat(page.aggregates().topLocalities().get(0).count()).isEqualTo(5);

        server.verify();
    }

    // -----------------------------------------------------------------------
    // Test 3: empty results
    // -----------------------------------------------------------------------

    @Test
    void emptyResults_returnsEmptyPage() {
        server.expect(requestTo(BASE_URL + "/" + ALIAS + "/_search"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(buildListingsResponse(0, 0L), MediaType.APPLICATION_JSON));

        DiscoverListingsPage page = adapter.getListings(basicQuery(false));

        assertThat(page.content()).isEmpty();
        assertThat(page.totalElements()).isEqualTo(0L);
        assertThat(page.totalPages()).isEqualTo(0);

        server.verify();
    }
}
