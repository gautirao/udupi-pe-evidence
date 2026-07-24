package com.example.realestate.discover.navigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) read endpoints over the cached production navigation hierarchy (#1955
 * Areas PR A, SLICE 2e, AC8/AC8b). permitAll — no auth — like every other {@code /api/discover/*}
 * GET (see {@code JwtConfig}'s permitAll matchers for these three routes).
 *
 * <p>Every route is served from {@link NavigationGraphCache}'s cached, promotion-refreshed {@link
 * NavigationGraph} (SLICE 2d) — never a live per-request DB read of {@code navigation_nodes}. Node
 * identity is ALWAYS a public {@code node_key}/{@code area_key} — never a {@link NavigationNode}
 * surrogate {@code id}.
 *
 * <p><b>Structural vs counts split (AC8/AC8b).</b> {@link #getNode} and {@link #getAreaPath} are
 * pure structure — no listing counts, cacheable purely on the hierarchy's revision+checksum.
 * {@link #getCounts} is the ONLY route that touches live listing volume, backed by {@link
 * AreaCountRollupService}'s separate short-TTL, revision-aware cache — so a structural read is
 * never staleness-coupled to (or slowed down by) a count query.
 */
@RestController
@RequestMapping("/api/discover/cities")
public class NavigationController {

    private static final Logger log = LoggerFactory.getLogger(NavigationController.class);

    private static final Set<String> ALLOWED_LISTING_PURPOSES = Set.of("sale", "rent");
    private static final String ROOT_NODE_KEY = "root";

    private final NavigationGraphCache graphCache;
    private final AreaCountRollupService rollupService;
    private final long structuralCacheMaxAgeSeconds;
    private final long countsCacheMaxAgeSeconds;

    public NavigationController(
            NavigationGraphCache graphCache,
            AreaCountRollupService rollupService,
            @Value("${discover.navigation.structural.cache.max-age-seconds:300}") long structuralCacheMaxAgeSeconds,
            @Value("${discover.navigation.counts.cache.ttl-seconds:30}") long countsCacheMaxAgeSeconds) {
        this.graphCache = graphCache;
        this.rollupService = rollupService;
        this.structuralCacheMaxAgeSeconds = structuralCacheMaxAgeSeconds;
        this.countsCacheMaxAgeSeconds = countsCacheMaxAgeSeconds;
    }

    /**
     * GET /api/discover/cities/{city}/navigation/{nodeKey} — structural node + ancestry + direct
     * children + explicit {@code nextLevelType}. {@code nodeKey="root"} resolves to the city's
     * synthetic top level. NO counts in the body (AC8).
     */
    @GetMapping("/{city}/navigation/{nodeKey}")
    public ResponseEntity<NavigationNodeResponse> getNode(
            @PathVariable("city") String city,
            @PathVariable("nodeKey") String nodeKey,
            WebRequest webRequest) {

        NavigationGraph graph = activeGraphOrNotFound(city);
        String etag = "\"" + graph.revisionId() + ":" + graph.checksum() + "\"";
        if (webRequest.checkNotModified(etag)) {
            return null; // Spring MVC completes the 304 for us once checkNotModified returns true.
        }

        NavigationNodeResponse body;
        if (ROOT_NODE_KEY.equals(nodeKey)) {
            body = NavigationNodeResponse.forRoot(city, graph);
        } else {
            NavigationNode node = graph.nodeByKey(nodeKey);
            if (node == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown navigation node");
            }
            body = NavigationNodeResponse.forNode(graph, node);
        }

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(structuralCacheMaxAgeSeconds, TimeUnit.SECONDS).cachePublic())
                .eTag(etag)
                .body(body);
    }

    /**
     * GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path — the AREA leaf + full
     * ancestry, resolved from the SAME cached graph {@link #getNode} reads, so direct-search
     * ancestry and guided-navigation ancestry can never disagree.
     */
    @GetMapping("/{city}/areas/{areaKey}/navigation-path")
    public ResponseEntity<NavigationPathResponse> getAreaPath(
            @PathVariable("city") String city,
            @PathVariable("areaKey") String areaKey) {

        NavigationGraph graph = activeGraphOrNotFound(city);
        String areaNodeKey = NavigationKeys.areaNodeKey(areaKey);
        NavigationNode node = graph.nodeByKey(areaNodeKey);
        if (node == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Area not found in navigation hierarchy");
        }

        var ancestry = graph.ancestryOf(areaNodeKey).stream()
                .map(k -> NavigationNodeResponse.childSummary(graph, k))
                .toList();

        NavigationPathResponse body = new NavigationPathResponse(
                areaKey, areaNodeKey, node.getDisplayLabel(), ancestry, graph.revisionId());

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(structuralCacheMaxAgeSeconds, TimeUnit.SECONDS).cachePublic())
                .body(body);
    }

    /**
     * GET /api/discover/cities/{city}/navigation/{nodeKey}/counts?purpose=&amp;propertyType= —
     * display-time counts from {@link AreaCountRollupService} (AC8b). {@code nodeKey="root"}
     * returns the whole city's total plus each top-level node's rolled-up total.
     */
    @GetMapping("/{city}/navigation/{nodeKey}/counts")
    public ResponseEntity<NavigationCountsResponse> getCounts(
            @PathVariable("city") String city,
            @PathVariable("nodeKey") String nodeKey,
            @RequestParam(name = "purpose", required = false) String purpose,
            @RequestParam(name = "propertyType", required = false) String propertyType) {

        NavigationGraph graph = activeGraphOrNotFound(city);

        NavigationNode node = null;
        if (!ROOT_NODE_KEY.equals(nodeKey)) {
            node = graph.nodeByKey(nodeKey);
            if (node == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown navigation node");
            }
        }

        AreaCountQuery query = new AreaCountQuery(city, normalizePurpose(purpose), normalizePropertyType(propertyType), "public");
        Map<String, Long> areaCounts = rollupService.areaCountsForCity(city, graph.revisionId(), query);

        long total = node == null
                ? areaCounts.values().stream().mapToLong(Long::longValue).sum()
                : rollupService.countForNode(graph, node, areaCounts);
        var children = rollupService.childCounts(graph, node == null ? null : nodeKey, areaCounts);

        NavigationCountsResponse body = new NavigationCountsResponse(nodeKey, total, children, graph.revisionId());

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(countsCacheMaxAgeSeconds, TimeUnit.SECONDS).cachePublic())
                .body(body);
    }

    private NavigationGraph activeGraphOrNotFound(String city) {
        return graphCache.getActiveGraph(city)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "City has no active navigation hierarchy"));
    }

    private static String normalizePurpose(String listingPurpose) {
        if (listingPurpose == null) {
            return null;
        }
        String trimmed = listingPurpose.trim();
        return ALLOWED_LISTING_PURPOSES.contains(trimmed) ? trimmed : null;
    }

    private static String normalizePropertyType(String propertyType) {
        if (propertyType == null) {
            return null;
        }
        String trimmed = propertyType.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
