package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.CityActivationGuard;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverListingsAggregates;
import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsPort;
import com.example.realestate.discover.DiscoverListingsQuery;
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

/**
 * OpenSearch-backed implementation of {@link DiscoverListingsPort}.
 *
 * <p>Active when {@code discover.opensearch.enabled=true} (primary path) OR
 * {@code discover.opensearch.shadow-enabled=true} (shadow/parity path).
 */
@Component
@ConditionalOnExpression("'${discover.opensearch.enabled:false}'.equals('true') or '${discover.opensearch.shadow-enabled:false}'.equals('true')")
public class OpenSearchListingsAdapter implements DiscoverListingsPort {

    private static final Logger log = LoggerFactory.getLogger(OpenSearchListingsAdapter.class);

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    private final RestClient restClient;
    private final OpenSearchProperties props;
    private final ObjectMapper objectMapper;
    private final OpenSearchQueryMetrics queryMetrics;
    private final CityActivationGuard cityActivationGuard;

    public OpenSearchListingsAdapter(RestClient discoverOpenSearchRestClient,
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
    public DiscoverListingsPage getListings(DiscoverListingsQuery query) {
        OpenSearchQueryMetrics.QueryType queryType = resolveQueryType(query);
        Timer.Sample sample = queryMetrics.startSample();
        try {
            // Resolve the requested city's active area_key allow-list ONCE per request (#1945).
            // A DataAccessException here is intentionally NOT caught — it propagates to the
            // catch(Exception) block below and from there to RoutingDiscoverListingsService,
            // which falls back to the (independently gated) Postgres path. Returning empty is
            // reserved for the semantic "no active areas / unknown city" case, never for a DB
            // failure.
            Collection<String> activeAreaKeys = cityActivationGuard.activeAreaKeysForCity(query.city());
            if (activeAreaKeys.isEmpty()) {
                // Defense-in-depth: no active areas for the requested city means no OpenSearch
                // round-trip can return anything — short-circuit without hitting the cluster.
                queryMetrics.recordListingsQuery(queryType, OpenSearchQueryMetrics.ResultStatus.EMPTY, sample);
                return emptyPage(query);
            }

            Map<String, Object> queryBody = DiscoverQueryDsl.buildListingsQuery(query, activeAreaKeys);

            String responseBody = restClient.post()
                    .uri("/" + props.indexAlias() + "/_search")
                    .header("Content-Type", "application/json")
                    .body(queryBody)
                    .retrieve()
                    .body(String.class);

            Map<String, Object> response = parseJson(responseBody);

            // Extract total hits (track_total_hits: true)
            long totalElements = extractTotalHits(response);

            // Map hits to listing responses
            List<Map<String, Object>> hits = extractHits(response);
            List<DiscoverListingResponse> content = new ArrayList<>(hits.size());
            for (Map<String, Object> hit : hits) {
                @SuppressWarnings("unchecked")
                Map<String, Object> source = (Map<String, Object>) hit.get("_source");
                if (source == null) continue;
                content.add(OpenSearchHitMapper.toListing(source));
            }

            int effectiveSize = query.size();
            int totalPages = effectiveSize > 0 ? (int) Math.ceil((double) totalElements / effectiveSize) : 0;

            // Parse aggregates if requested
            DiscoverListingsAggregates aggregates = null;
            if (query.includeAggregates()) {
                aggregates = extractAggregates(response);
            }

            OpenSearchQueryMetrics.ResultStatus resultStatus = content.isEmpty()
                    ? OpenSearchQueryMetrics.ResultStatus.EMPTY
                    : OpenSearchQueryMetrics.ResultStatus.SUCCESS;
            queryMetrics.recordListingsQuery(queryType, resultStatus, sample);

            log.debug("OpenSearch listings city={} page={} size={} total={}",
                    query.city(), query.page(), effectiveSize, totalElements);

            return new DiscoverListingsPage(content, query.page(), effectiveSize, totalElements, totalPages, aggregates);

        } catch (ResourceAccessException e) {
            if (e.getCause() instanceof SocketTimeoutException) {
                queryMetrics.recordListingsQuery(queryType, OpenSearchQueryMetrics.ResultStatus.TIMEOUT, sample);
                queryMetrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.TIMEOUT);
            } else {
                queryMetrics.recordListingsQuery(queryType, OpenSearchQueryMetrics.ResultStatus.ERROR, sample);
                queryMetrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);
            }
            throw e;
        } catch (Exception e) {
            queryMetrics.recordListingsQuery(queryType, OpenSearchQueryMetrics.ResultStatus.ERROR, sample);
            queryMetrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);
            throw e;
        }
    }

    /**
     * Empty-result page returned by the active-city short-circuit (#1945) — same shape an
     * unknown/blank city yields via the normal query path, so the response is indistinguishable
     * from a query that legitimately matched zero documents.
     */
    private static DiscoverListingsPage emptyPage(DiscoverListingsQuery query) {
        DiscoverListingsAggregates aggregates = query.includeAggregates()
                ? new DiscoverListingsAggregates(List.of())
                : null;
        return new DiscoverListingsPage(List.of(), query.page(), query.size(), 0L, 0, aggregates);
    }

    /**
     * Derives the query type from field PRESENCE only — never from field values.
     * Keeps metric tag cardinality bounded regardless of user input.
     */
    private static OpenSearchQueryMetrics.QueryType resolveQueryType(DiscoverListingsQuery query) {
        boolean hasText   = query.q() != null && !query.q().isBlank();
        boolean hasRadius = query.schoolLat() != null && query.schoolLon() != null
                && query.schoolRadiusKm() != null;
        if (hasText && hasRadius) return OpenSearchQueryMetrics.QueryType.COMBINED;
        if (hasText)              return OpenSearchQueryMetrics.QueryType.TEXT;
        if (hasRadius)            return OpenSearchQueryMetrics.QueryType.RADIUS;
        return OpenSearchQueryMetrics.QueryType.BBOX;
    }

    @SuppressWarnings("unchecked")
    private long extractTotalHits(Map<String, Object> response) {
        try {
            Map<String, Object> hitsOuter = (Map<String, Object>) response.get("hits");
            if (hitsOuter == null) return 0L;
            Object total = hitsOuter.get("total");
            if (total instanceof Map<?, ?> totalMap) {
                Object value = totalMap.get("value");
                if (value instanceof Number n) return n.longValue();
            } else if (total instanceof Number n) {
                return n.longValue();
            }
        } catch (ClassCastException e) {
            log.warn("Unexpected OpenSearch hits.total structure", e);
        }
        return 0L;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractHits(Map<String, Object> response) {
        try {
            Map<String, Object> hitsOuter = (Map<String, Object>) response.get("hits");
            if (hitsOuter == null) return List.of();
            Object hitsArray = hitsOuter.get("hits");
            if (!(hitsArray instanceof List<?> list)) return List.of();
            List<Map<String, Object>> result = new ArrayList<>(list.size());
            for (Object item : list) {
                if (item instanceof Map<?, ?> m) {
                    result.add((Map<String, Object>) m);
                }
            }
            return result;
        } catch (ClassCastException e) {
            log.warn("Unexpected OpenSearch hits structure", e);
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private DiscoverListingsAggregates extractAggregates(Map<String, Object> response) {
        try {
            Object aggregations = response.get("aggregations");
            if (!(aggregations instanceof Map<?, ?> aggsMap)) return null;
            Object localityAgg = aggsMap.get("locality_agg");
            if (!(localityAgg instanceof Map<?, ?> localityMap)) return null;
            Object bucketsObj = localityMap.get("buckets");
            if (!(bucketsObj instanceof List<?> buckets)) return null;

            List<DiscoverListingsAggregates.LocalityCount> topLocalities = new ArrayList<>(buckets.size());
            for (Object bucket : buckets) {
                if (!(bucket instanceof Map<?, ?> b)) continue;
                Object key = b.get("key");
                Object count = b.get("doc_count");
                if (key != null && count instanceof Number n) {
                    topLocalities.add(new DiscoverListingsAggregates.LocalityCount(
                            key.toString(), n.intValue()));
                }
            }
            return new DiscoverListingsAggregates(topLocalities);
        } catch (ClassCastException e) {
            log.warn("Unexpected OpenSearch aggregations structure", e);
            return null;
        }
    }

    private Map<String, Object> parseJson(String json) {
        try {
            return objectMapper.readValue(json, MAP_TYPE);
        } catch (Exception e) {
            throw new OpenSearchQueryException("Failed to parse OpenSearch response", e);
        }
    }
}
