package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.CityActivationGuard;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersPort;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.net.SocketTimeoutException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * OpenSearch-backed implementation of {@link DiscoverMarkersPort}.
 *
 * <p>Active when {@code discover.opensearch.enabled=true} (primary path) OR
 * {@code discover.opensearch.shadow-enabled=true} (shadow/parity path).
 * Uses the {@code listings_read} alias to query the current index.
 */
@Component
@ConditionalOnExpression("'${discover.opensearch.enabled:false}'.equals('true') or '${discover.opensearch.shadow-enabled:false}'.equals('true')")
public class OpenSearchMarkersAdapter implements DiscoverMarkersPort {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchMarkersAdapter.class);

    private static final int CAP = 1000;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final RestClient restClient;
    private final OpenSearchProperties props;
    private final ObjectMapper objectMapper;
    private final OpenSearchQueryMetrics queryMetrics;
    private final CityActivationGuard cityActivationGuard;

    public OpenSearchMarkersAdapter(RestClient discoverOpenSearchRestClient,
                                    OpenSearchProperties props,
                                    ObjectMapper objectMapper,
                                    OpenSearchQueryMetrics queryMetrics,
                                    CityActivationGuard cityActivationGuard) {
        this.restClient = discoverOpenSearchRestClient;
        this.props = props;
        this.objectMapper = objectMapper;
        this.queryMetrics = queryMetrics;
        this.cityActivationGuard = cityActivationGuard;
    }

    @Override
    public DiscoverMarkersResponse getMarkers(DiscoverListingPredicateBuilder.Filters filters) {
        Timer.Sample sample = queryMetrics.startSample();
        // Default to ERROR so the finally block records even on unexpected paths.
        OpenSearchQueryMetrics.ResultStatus resultStatus = OpenSearchQueryMetrics.ResultStatus.ERROR;
        try {
            // Resolve the requested city's active area_key allow-list ONCE per request (#1945),
            // reused for both the hits query and the count re-query below so they can never
            // drift. A DataAccessException here is intentionally NOT caught — it propagates to
            // the catch(Exception) block below and from there to RoutingDiscoverMarkersService,
            // which falls back to the (independently gated) Postgres path.
            Collection<String> activeAreaKeys = cityActivationGuard.activeAreaKeysForCity(filters.city());
            if (activeAreaKeys.isEmpty()) {
                // Defense-in-depth: no active areas for the requested city means no OpenSearch
                // round-trip can return anything — short-circuit without hitting the cluster.
                resultStatus = OpenSearchQueryMetrics.ResultStatus.EMPTY;
                return emptyMarkersResponse(filters);
            }

            Map<String, Object> queryBody = DiscoverQueryDsl.buildMarkersQuery(filters, activeAreaKeys);
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
                // Run a _count query with the same DSL AND the same activeAreaKeys set to get
                // the true total — using a different (or no) set here would over/under-report
                // totalFilteredElements relative to the gated hits (#1945 AC5/EC17).
                totalFilteredElements = runCountQuery(filters, activeAreaKeys);
                log.debug("OpenSearch markers city={} truncated, totalFilteredElements={}", filters.city(), totalFilteredElements);
            } else {
                totalFilteredElements = rawHitCount;
            }

            resultStatus = returnedElements == 0
                    ? OpenSearchQueryMetrics.ResultStatus.EMPTY
                    : OpenSearchQueryMetrics.ResultStatus.SUCCESS;

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

        } catch (ResourceAccessException e) {
            if (e.getCause() instanceof SocketTimeoutException) {
                resultStatus = OpenSearchQueryMetrics.ResultStatus.TIMEOUT;
                queryMetrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.TIMEOUT);
            } else {
                resultStatus = OpenSearchQueryMetrics.ResultStatus.ERROR;
                queryMetrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);
            }
            throw e;
        } catch (Exception e) {
            resultStatus = OpenSearchQueryMetrics.ResultStatus.ERROR;
            queryMetrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);
            throw e;
        } finally {
            // Always called exactly once — eliminates the double-stop risk when runCountQuery
            // or any code after the success recordMarkersQuery call throws.
            queryMetrics.recordMarkersQuery(resultStatus, sample);
        }
    }

    /**
     * Empty-result response returned by the active-city short-circuit (#1945) — same shape an
     * unknown/blank city yields via the normal query path.
     */
    private static DiscoverMarkersResponse emptyMarkersResponse(DiscoverListingPredicateBuilder.Filters filters) {
        return new DiscoverMarkersResponse(
                filters.city(),
                List.of(),
                false,
                0,
                0L,
                CAP,
                filters.bbox() != null
        );
    }

    private long runCountQuery(DiscoverListingPredicateBuilder.Filters filters, Collection<String> activeAreaKeys) {
        Map<String, Object> queryBody = DiscoverQueryDsl.buildMarkersQuery(filters, activeAreaKeys);
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
