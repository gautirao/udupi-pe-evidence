package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersPort;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * OpenSearch-backed implementation of {@link DiscoverMarkersPort}.
 *
 * <p>Active only when {@code discover.opensearch.enabled=true}.
 * Uses the {@code listings_read} alias to query the current index.
 */
@Component
@ConditionalOnProperty(name = "discover.opensearch.enabled", havingValue = "true", matchIfMissing = false)
public class OpenSearchMarkersAdapter implements DiscoverMarkersPort {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchMarkersAdapter.class);

    private static final int CAP = 1000;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final RestClient restClient;
    private final OpenSearchProperties props;
    private final ObjectMapper objectMapper;

    public OpenSearchMarkersAdapter(RestClient discoverOpenSearchRestClient,
                                    OpenSearchProperties props,
                                    ObjectMapper objectMapper) {
        this.restClient = discoverOpenSearchRestClient;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    @Override
    public DiscoverMarkersResponse getMarkers(DiscoverListingPredicateBuilder.Filters filters) {
        Map<String, Object> queryBody = DiscoverQueryDsl.buildMarkersQuery(filters);
        boolean boundsApplied = filters.bbox() != null;

        String responseBody = restClient.post()
                .uri("/" + props.indexAlias() + "/_search")
                .header("Content-Type", "application/json")
                .body(queryBody)
                .retrieve()
                .body(String.class);

        Map<String, Object> response = parseJson(responseBody);
        List<Map<String, Object>> rawHits = extractHits(response);
        int rawHitCount = rawHits.size();

        List<DiscoverMarker> markers = rawHits.stream()
                .map(hit -> {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> source = (Map<String, Object>) hit.get("_source");
                    if (source == null) return null;
                    return OpenSearchHitMapper.toMarker(source);
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(ArrayList::new));

        // Truncation is determined by the raw hit count (before null-filtering) so that
        // missing lat/lon on a boundary hit does not cause under-reporting.
        boolean truncated = rawHitCount > CAP;
        if (truncated) {
            log.warn("OpenSearch markers cap hit for city {}: {} raw hits (capped at {})",
                    filters.city(), rawHitCount, CAP);
            markers = markers.stream().limit(CAP).collect(Collectors.toCollection(ArrayList::new));
        }

        int returnedElements = markers.size();

        long totalFilteredElements;
        if (truncated) {
            // Run a _count query with the same DSL to get the true total
            totalFilteredElements = runCountQuery(filters);
            log.debug("OpenSearch markers city={} truncated, totalFilteredElements={}", filters.city(), totalFilteredElements);
        } else {
            totalFilteredElements = rawHitCount;
        }

        log.debug("OpenSearch markers city={} returned={} total={} truncated={} boundsApplied={}",
                filters.city(), returnedElements, totalFilteredElements, truncated, boundsApplied);

        return new DiscoverMarkersResponse(
                filters.city(),
                markers,
                truncated,
                returnedElements,
                totalFilteredElements,
                CAP,
                boundsApplied
        );
    }

    private long runCountQuery(DiscoverListingPredicateBuilder.Filters filters) {
        Map<String, Object> queryBody = DiscoverQueryDsl.buildMarkersQuery(filters);
        // Use only the query portion for _count
        Map<String, Object> countBody = Map.of("query", queryBody.get("query"));

        String responseBody = restClient.post()
                .uri("/" + props.indexAlias() + "/_count")
                .header("Content-Type", "application/json")
                .body(countBody)
                .retrieve()
                .body(String.class);

        Map<String, Object> response = parseJson(responseBody);
        Object count = response.get("count");
        if (count instanceof Number n) return n.longValue();
        return 0L;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractHits(Map<String, Object> response) {
        Object hitsOuter = response.get("hits");
        if (!(hitsOuter instanceof Map<?, ?> hitsMap)) return List.of();
        Object hitsArray = hitsMap.get("hits");
        if (!(hitsArray instanceof List<?> list)) return List.of();
        List<Map<String, Object>> result = new ArrayList<>(list.size());
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                result.add((Map<String, Object>) m);
            }
        }
        return result;
    }

    private Map<String, Object> parseJson(String json) {
        try {
            return objectMapper.readValue(json, MAP_TYPE);
        } catch (Exception e) {
            throw new OpenSearchQueryException("Failed to parse OpenSearch response", e);
        }
    }
}
