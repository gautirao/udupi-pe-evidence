package com.example.realestate.discover.navigation;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Rolls per-area listing counts up through the cached production {@link NavigationGraph} into
 * CLUSTER/region totals (#1955 Areas PR A, SLICE 2e, AC12/AC8b).
 *
 * <p><b>No double counting.</b> {@link NavigationGraph#descendantAreaKeysOf} returns each subtree
 * AREA leaf's {@code area_key} exactly once per node (see that class's build-time invariant), so
 * summing {@code areaCounts.getOrDefault(areaKey, 0L)} over that list is a UNIQUE-leaf-area sum by
 * construction — a CLUSTER's total is never inflated by an area appearing under more than one of
 * its own descendant paths.
 *
 * <p><b>One query per (city, revision, filter context), reused across every node/child lookup.</b>
 * {@link #areaCountsForCity} wraps a SINGLE whole-city {@link AreaCountProvider} call behind a
 * short-TTL Caffeine cache keyed on {@code city + revisionId + purpose + normalizedFilterHash +
 * exposure} — every subsequent counts-endpoint call for the same city/filter context within the
 * TTL window reuses the identical cached map; rolling it up to any node or its children is a cheap
 * in-memory sum over {@link NavigationGraph}, never a second database round trip.
 *
 * <p><b>Revision-aware, not hierarchy-checksummed.</b> The cache key includes {@code revisionId}
 * so a promotion (which swaps the active {@link NavigationGraph}) never serves a stale count map
 * past the TTL, but display-time counts are deliberately NOT folded into {@code RevisionChecksum}
 * or the structural hierarchy diff — see {@link NavigationNode} class javadoc: live listing volume
 * is a read-path concern, orthogonal to the generated tree's structural identity.
 */
@Component
public class AreaCountRollupService {

    private final PostgresAreaCountProvider postgresProvider;
    private final AreaCountProvider openSearchProvider;
    private final boolean openSearchEnabled;
    private final Cache<CountCacheKey, Map<String, Long>> countCache;

    @Autowired
    public AreaCountRollupService(
            PostgresAreaCountProvider postgresProvider,
            @Qualifier("openSearchAreaCountProvider") @Autowired(required = false) AreaCountProvider openSearchProvider,
            @Value("${discover.opensearch.enabled:false}") boolean openSearchEnabled,
            @Value("${discover.navigation.counts.cache.ttl-seconds:30}") long ttlSeconds,
            @Value("${discover.navigation.counts.cache.max-size:500}") long maxSize) {
        this(postgresProvider, openSearchProvider, openSearchEnabled, ttlSeconds, maxSize, Ticker.systemTicker());
    }

    /** Package-private constructor with an injectable {@link Ticker} for deterministic tests. */
    AreaCountRollupService(
            PostgresAreaCountProvider postgresProvider,
            AreaCountProvider openSearchProvider,
            boolean openSearchEnabled,
            long ttlSeconds,
            long maxSize,
            Ticker ticker) {
        this.postgresProvider = postgresProvider;
        this.openSearchProvider = openSearchProvider;
        this.openSearchEnabled = openSearchEnabled;
        this.countCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(ttlSeconds))
                .maximumSize(maxSize)
                .ticker(ticker)
                .build();
    }

    /** Whole-city {@code area_key -> count} map for one (revision, filter context), short-TTL cached. */
    public Map<String, Long> areaCountsForCity(String citySlug, long revisionId, AreaCountQuery query) {
        CountCacheKey key = new CountCacheKey(citySlug, revisionId, query.normalizedFilterHash());
        return countCache.get(key, k -> activeProvider().countsByAreaKey(query));
    }

    /**
     * Rolled-up total for one node: its own area's count if it's an AREA leaf (an AREA node has no
     * descendants below it — see {@link NavigationGraph#descendantAreaKeysOf}), else the sum over
     * every UNIQUE descendant AREA leaf's count.
     */
    public long countForNode(NavigationGraph graph, NavigationNode node, Map<String, Long> areaCounts) {
        if ("AREA".equals(node.getNodeType())) {
            return areaCounts.getOrDefault(node.getAreaKey(), 0L);
        }
        long total = 0L;
        for (String areaKey : graph.descendantAreaKeysOf(node.getNodeKey())) {
            total += areaCounts.getOrDefault(areaKey, 0L);
        }
        return total;
    }

    /** Direct children of {@code nodeKey} (or the city's roots when {@code nodeKey} is {@code
     *  null}), each with its rolled-up count, in display_order. */
    public List<NodeCount> childCounts(NavigationGraph graph, String nodeKey, Map<String, Long> areaCounts) {
        List<NodeCount> result = new ArrayList<>();
        for (String childKey : graph.childrenOf(nodeKey)) {
            NavigationNode child = graph.nodeByKey(childKey);
            result.add(new NodeCount(childKey, countForNode(graph, child, areaCounts)));
        }
        return result;
    }

    private AreaCountProvider activeProvider() {
        return (openSearchEnabled && openSearchProvider != null) ? openSearchProvider : postgresProvider;
    }

    /** Exposed for tests only. */
    long estimatedCacheSize() {
        return countCache.estimatedSize();
    }

    public record NodeCount(String nodeKey, long count) {}

    private record CountCacheKey(String citySlug, long revisionId, String filterHash) {}
}
