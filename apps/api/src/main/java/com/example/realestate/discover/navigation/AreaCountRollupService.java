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
 * Rolls per-area listing AND school counts up through the cached production {@link
 * NavigationGraph} into CLUSTER/region totals (#1955 Areas PR A, SLICE 2e, AC12/AC8b; school counts
 * added #1956 PR1 Decision 1).
 *
 * <p><b>No double counting — but the two dimensions fold DIFFERENTLY.</b> {@link
 * NavigationGraph#descendantAreaKeysOf} returns each subtree AREA leaf's {@code area_key} exactly
 * once per node (see that class's build-time invariant), so a CLUSTER's total is never inflated by
 * an area appearing under more than one of its own descendant paths. Beyond that shared guarantee:
 *
 * <ul>
 *   <li><b>Listings SUM.</b> A listing belongs to exactly one {@code area_key}, so
 *       {@link #countForNode} adding up the descendant areas' counts is correct and
 *       {@code sum(children) == parent} genuinely holds.</li>
 *   <li><b>Schools UNION.</b> A school can hold qualifying coverage in SEVERAL areas, and each of
 *       those areas legitimately counts it. Summing them would count one school twice under a
 *       parent that contains both, so {@link #schoolCountForNode} takes the DISTINCT UNION of the
 *       descendants' school sets instead. <b>{@code sum(children) == parent} is NOT an invariant
 *       for school counts and must not be asserted anywhere.</b></li>
 * </ul>
 *
 * <p>An earlier revision reused the SUM fold for both, which was only sound because {@link
 * PostgresAreaSchoolCountProvider} then globally partitioned each school to ONE area via
 * {@code DISTINCT ON (school_id)} — convenient arithmetic bought by making an individual area's
 * count factually wrong. See {@link AreaSchoolCoverage} for why the union is the correct shape.
 *
 * <p><b>One query per (dimension, city, revision, filter context), reused across every node/child
 * lookup.</b> {@link #areaCountsForCity} (listing) and {@link #schoolCoverageForCity} (school) each
 * wrap a SINGLE whole-city provider call behind a short-TTL Caffeine cache keyed on {@code
 * (Dimension, citySlug, revisionId, filterHash)}. School coverage is NOT filter-sensitive (unlike
 * listing counts), so {@link #schoolCoverageForCity} always uses an EMPTY filter hash — one cache
 * entry per city/revision, never multiplied per filter permutation.
 *
 * <p><b>The school roll-up adds NO extra queries</b> (AC1.11). Every node and child total is derived
 * in memory from that one cached pair set over descendant sets the graph has already materialised —
 * never one query per node, which for a Direction with 65 children would be 66 round trips.
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
    private final PostgresAreaSchoolCountProvider schoolCountProvider;
    private final Cache<CountCacheKey, Map<String, Long>> countCache;

    /**
     * School coverage is cached SEPARATELY from listing counts rather than sharing one
     * {@code Cache<CountCacheKey, Object>}: the two dimensions hold different value types
     * ({@link AreaSchoolCoverage} vs the listing count map), and a shared cache would need an
     * unchecked cast on every read — one that a future key-construction slip could turn into a
     * ClassCastException at runtime instead of a compile error. Both caches use the SAME TTL and
     * max-size settings, and the {@link Dimension} tag stays on the key so the two key spaces remain
     * self-describing.
     */
    private final Cache<CountCacheKey, AreaSchoolCoverage> schoolCoverageCache;

    @Autowired
    public AreaCountRollupService(
            PostgresAreaCountProvider postgresProvider,
            @Qualifier("openSearchAreaCountProvider") @Autowired(required = false) AreaCountProvider openSearchProvider,
            @Value("${discover.opensearch.enabled:false}") boolean openSearchEnabled,
            PostgresAreaSchoolCountProvider schoolCountProvider,
            @Value("${discover.navigation.counts.cache.ttl-seconds:30}") long ttlSeconds,
            @Value("${discover.navigation.counts.cache.max-size:500}") long maxSize) {
        this(postgresProvider, openSearchProvider, openSearchEnabled, schoolCountProvider, ttlSeconds, maxSize,
                Ticker.systemTicker());
    }

    /** Package-private constructor with an injectable {@link Ticker} for deterministic tests. */
    AreaCountRollupService(
            PostgresAreaCountProvider postgresProvider,
            AreaCountProvider openSearchProvider,
            boolean openSearchEnabled,
            PostgresAreaSchoolCountProvider schoolCountProvider,
            long ttlSeconds,
            long maxSize,
            Ticker ticker) {
        this.postgresProvider = postgresProvider;
        this.openSearchProvider = openSearchProvider;
        this.openSearchEnabled = openSearchEnabled;
        this.schoolCountProvider = schoolCountProvider;
        this.countCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(ttlSeconds))
                .maximumSize(maxSize)
                .ticker(ticker)
                .build();
        this.schoolCoverageCache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(ttlSeconds))
                .maximumSize(maxSize)
                .ticker(ticker)
                .build();
    }

    /**
     * Whole-city {@code area_key -> listing count} map for one (revision, filter context), short-TTL
     * cached.
     *
     * <p>A provably-empty filter set returns BEFORE the cache is consulted (#1956 PR1 AC1.15 #7/#8):
     * no query runs AND no cache entry is minted. This matters because the values that make a filter
     * unsatisfiable are arbitrary attacker-supplied strings on a public unauthenticated endpoint —
     * caching one entry per distinct garbage value would let a caller churn the bounded cache and
     * evict live entries. Collapsing them to zero entries removes the lever entirely rather than
     * merely bounding it. See {@link AreaCountQuery#isProvablyEmpty}.
     */
    public Map<String, Long> areaCountsForCity(String citySlug, long revisionId, AreaCountQuery query) {
        if (query.isProvablyEmpty()) {
            return Map.of();
        }
        CountCacheKey key = new CountCacheKey(Dimension.LISTING, citySlug, revisionId, query.normalizedFilterHash());
        return countCache.get(key, k -> activeProvider().countsByAreaKey(query));
    }

    /**
     * Whole-city counted school coverage for one revision, short-TTL cached. NOT filter-sensitive
     * (see class javadoc) — always cached under an empty filter hash, one entry per city/revision
     * regardless of how many distinct listing-filter permutations are also cached for the SAME
     * city/revision under {@link #areaCountsForCity}.
     *
     * <p>Returns the {@code (area_key, school_id)} PAIRS rather than per-area counts, because the
     * roll-up needs school identity to de-duplicate across descendant areas — see {@link
     * AreaSchoolCoverage}. Per-area counts come from {@link AreaSchoolCoverage#countsByAreaKey()} on
     * the same snapshot, so the two can never be computed from drifting sources.
     */
    public AreaSchoolCoverage schoolCoverageForCity(String citySlug, long revisionId) {
        CountCacheKey key = new CountCacheKey(Dimension.SCHOOL, citySlug, revisionId, "");
        return schoolCoverageCache.get(key, k -> schoolCountProvider.schoolCoverageForCity(citySlug));
    }

    /**
     * Rolled-up LISTING total for one node: its own area's count if it's an AREA leaf (an AREA node
     * has no descendants below it — see {@link NavigationGraph#descendantAreaKeysOf}), else the SUM
     * over every UNIQUE descendant AREA leaf's count.
     *
     * <p><b>Listings only — do NOT pass a school-count map to this.</b> It was dimension-agnostic
     * when school counts were globally partitioned to one area each; they no longer are, and summing
     * per-area school counts would double-count any school covering two descendant areas. Use
     * {@link #schoolCountForNode}, which unions on school identity.
     */
    public long countForNode(NavigationGraph graph, NavigationNode node, Map<String, Long> counts) {
        if ("AREA".equals(node.getNodeType())) {
            return counts.getOrDefault(node.getAreaKey(), 0L);
        }
        long total = 0L;
        for (String areaKey : graph.descendantAreaKeysOf(node.getNodeKey())) {
            total += counts.getOrDefault(areaKey, 0L);
        }
        return total;
    }

    /**
     * Rolled-up SCHOOL total for one node: its own area's distinct school count if it's an AREA
     * leaf, else the DISTINCT UNION over every descendant AREA leaf's school set — a school covering
     * several of them counts ONCE for the parent while still counting for EACH of those areas
     * individually.
     */
    public long schoolCountForNode(NavigationGraph graph, NavigationNode node, AreaSchoolCoverage coverage) {
        if ("AREA".equals(node.getNodeType())) {
            return coverage.countForArea(node.getAreaKey());
        }
        return coverage.distinctSchoolCountOver(graph.descendantAreaKeysOf(node.getNodeKey()));
    }

    /**
     * Direct children of {@code nodeKey} (or the city's roots when {@code nodeKey} is {@code null}),
     * each carrying BOTH its rolled-up listing total and school total, in display_order — a single
     * walk over {@link NavigationGraph#childrenOf} zips the two dimensions together per child rather
     * than building two separate lists and zipping them afterward. Listings SUM, schools UNION (see
     * class javadoc); both are in-memory folds over already-fetched snapshots, never extra queries.
     */
    public List<NodeCount> childCounts(
            NavigationGraph graph, String nodeKey, Map<String, Long> areaCounts, AreaSchoolCoverage coverage) {
        List<NodeCount> result = new ArrayList<>();
        for (String childKey : graph.childrenOf(nodeKey)) {
            NavigationNode child = graph.nodeByKey(childKey);
            long count = countForNode(graph, child, areaCounts);
            long schoolCount = schoolCountForNode(graph, child, coverage);
            result.add(new NodeCount(childKey, count, schoolCount));
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

    /** Which count this cache entry holds — see class javadoc for why school counts get their own
     *  dimension rather than being folded into the filter-hashed listing-count entries. */
    enum Dimension {
        LISTING,
        SCHOOL
    }

    public record NodeCount(String nodeKey, long count, long schoolCount) {}

    private record CountCacheKey(Dimension dimension, String citySlug, long revisionId, String filterHash) {}
}
