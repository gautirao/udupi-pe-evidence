package com.example.realestate.discover.navigation;

import com.example.realestate.discover.DiscoverFilterNormalizer;
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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Public (unauthenticated) read endpoints over the cached production navigation hierarchy (#1955
 * Areas PR A, SLICE 2e, AC8/AC8b; {@link #resolve} added #1956 AC17/AC18). permitAll — no auth —
 * like every other {@code /api/discover/*} GET (see {@code JwtConfig}'s permitAll matchers; {@code
 * /navigation/*} covers {@link #resolve} too — a single {@code *} segment matches the literal
 * {@code "resolve"} path segment, proven by {@code NavigationResolveIT}'s no-auth-header 200 test).
 *
 * <p>Every route is served from {@link NavigationGraphCache}'s cached, promotion-refreshed {@link
 * NavigationGraph} (SLICE 2d) — never a live per-request DB read of {@code navigation_nodes}. Node
 * identity is ALWAYS a public {@code node_key}/{@code area_key} — never a {@link NavigationNode}
 * surrogate {@code id}.
 *
 * <p><b>Structural vs counts split (AC8/AC8b).</b> {@link #getNode}, {@link #getAreaPath}, and
 * {@link #resolve} are pure structure — no listing counts, cacheable purely on the hierarchy's
 * revision+checksum (+ resolved node key for {@link #resolve}, see its javadoc). {@link #getCounts}
 * is the ONLY route that touches live listing volume, backed by {@link AreaCountRollupService}'s
 * separate short-TTL, revision-aware cache — so a structural read is never staleness-coupled to
 * (or slowed down by) a count query.
 */
@RestController
@RequestMapping("/api/discover/cities")
public class NavigationController {

    private static final Logger log = LoggerFactory.getLogger(NavigationController.class);

    private static final String ROOT_NODE_KEY = "root";
    private static final String AREA_NODE_KEY_PREFIX = "a:";
    private static final String CLUSTER_NODE_KEY_PREFIX = "c:";

    /** #1956 R10: bound on the {@code ?node=} query param so a pathological input can't burn CPU
     * in string matching/substring ops on this public, unauthenticated endpoint. Node keys are
     * structurally short ({@code "a:" + area_key}, {@code "c:" + slug + ":" + slug}) — 256 bytes
     * is generous headroom, not a tight fit. */
    private static final int MAX_RESOLVE_NODE_PARAM_BYTES = 256;

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
                .filter(Objects::nonNull)
                .toList();

        NavigationPathResponse body = new NavigationPathResponse(
                areaKey, areaNodeKey, node.getDisplayLabel(), ancestry, graph.revisionId());

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(structuralCacheMaxAgeSeconds, TimeUnit.SECONDS).cachePublic())
                .body(body);
    }

    /**
     * GET /api/discover/cities/{city}/navigation/resolve?node=&lt;key&gt; — server-side "canonical
     * node, where available" ladder (#1956 AC17/AC18): resolves a POSSIBLY-STALE client-held
     * {@code node} key (e.g. from a bookmark, share link, or client cache predating a
     * re-clustering revision) to whatever the CURRENT active graph can offer, in exactly one round
     * trip — the full {@link NavigationNodeResponse} is inlined in the body, never a reference
     * requiring a follow-up {@link #getNode} call.
     *
     * <p>Ladder (first rung that resolves wins): EXACT (still present, unchanged) -&gt; ALIAS
     * (reserved, see {@link NavigationResolution#ALIAS} — never returned by this build, no alias
     * store exists yet) -&gt; ANCESTOR (a stale {@code "a:"} area key re-clusters to its deepest
     * surviving ancestor via {@link NavigationGraph#ancestryOfArea}; a stale {@code "c:"} cluster
     * key resolves by CONTAINMENT — the DEEPEST node whose subtree contains EVERY surviving area
     * from the stale key's representative-area segment, preferring a CLUSTER-typed node over any
     * other type when one qualifies, see {@link #resolveClusterKeyByContainment} — NEVER a node
     * containing only SOME of the surviving representatives, and never by region alone) -&gt;
     * CITY_ROOT (nothing else resolved, including when the surviving representatives have split
     * across disjoint subtrees with no single containing node — the synthetic {@code "root"} node
     * is always a safe, honest fallback for an active city).
     *
     * <p>Always 200 for a city with an active hierarchy; 404 only when the city has none (same
     * {@link #activeGraphOrNotFound} every other route here uses).
     *
     * <p><b>ETag is OPAQUE, not parseable</b> (fix-cycle-1 S2, revised fix-cycle-2 S-A) — it is the
     * quoted hex SHA-256 digest of {@code revisionId + "|" + checksum + "|" + resolvedNodeKey +
     * "|" + resolution.name() + "|" + requested}, computed by {@link #computeResolveETag}, the same
     * "join with {@code |}, SHA-256, hex" idiom {@code DiscoverSummaryController#computeETag} and
     * {@code NavigationGraph}'s own {@code checksum()} use elsewhere in this codebase. Node keys
     * contain {@code :} and the digest is opaque binary-derived hex, so this was never splittable
     * or parseable to begin with — don't try.
     *
     * <p>{@code requested} (the raw client-supplied value) is folded ONLY into the SHA-256 input,
     * NEVER interpolated into the response header verbatim — it is user-controlled and must never
     * reach a header unescaped (a raw {@code "}, CR, or LF in the value would otherwise be a
     * header-injection vector). Hashing the full basis together (fix-cycle-2 S-A) — rather than
     * folding {@code requested} in separately via {@link String#hashCode()}, as fix-cycle-1 did —
     * is what makes the class's collision claim actually true: {@code String#hashCode()} is a
     * 32-bit non-cryptographic hash with trivial collisions (e.g. {@code "Aa"} and {@code "BB"}
     * both hash to {@code 2112}), and because both of those are unrecognized node keys that fall
     * through to {@code CITY_ROOT}, EVERY other basis component (revisionId, checksum, resolved
     * node key, resolution) was ALSO identical for that pair — so the fix-cycle-1 ETag was
     * byte-identical for two {@code requested} values whose response bodies genuinely differ (the
     * body echoes {@code requested}). A conditional request could then be answered {@code 304} for
     * a representation that was not the one the client actually cached. SHA-256 over the full
     * basis closes this — see the caveats below for exactly what the resulting claim rests on.
     *
     * <p><b>Claim, and what it actually rests on</b> (fix-cycle-6: stated precisely rather than as
     * an unconditional guarantee): two responses with different {@code requested} values are
     * SHA-256-collision-resistant against producing the same ETag at the same {@code
     * revisionId}+{@code checksum}, whether they differ because they resolve to different
     * nodes/resolutions (R1) or because they resolve to the identical node/resolution but via
     * different input strings (fix-cycle-2, e.g. {@code "Aa"} vs. {@code "BB"}, both -&gt; {@code
     * CITY_ROOT}/{@code "root"}). This rests on a property that holds today but is not enforced by
     * the encoding itself: the {@code |}-joined basis is joined unescaped, so the no-collision
     * property depends on the FIELDS' CONTENT — {@code revisionId} (a {@code long}) and {@code
     * checksum} (a hex digest) never contain {@code |} — not on the delimiter disambiguating them;
     * {@code resolvedNodeKey} provably contains {@code :} and, in production, {@code |} too (e.g.
     * {@code "a:" + area_key} where {@code area_key} is pipe-delimited, such as {@code
     * "a:IN|KA|Bengaluru|Electronic City"}) — this is NOT HTTP-reachable as an actual collision
     * vector because {@code requested} is the trailing field and so cannot shift an earlier field's
     * boundary, but the "unambiguous by construction" guarantee is really about node-key/enum-name
     * content, not about the {@code |} encoding itself. The {@link NoSuchAlgorithmException} branch
     * below no longer needs a carve-out from this claim: rather than returning one literal fallback
     * ETag shared by every response, it fails closed with an {@link IllegalStateException} (matching
     * {@code NavigationGraph#sha256Hex}'s handling of the identical, practically-unreachable
     * situation), so it never produces a shared-validator collision to begin with.
     *
     * <p><b>Cache-Control is deliberately non-cacheable</b> (fix-cycle-1 S3): {@code max-age=0} +
     * {@code must-revalidate} rather than the 5-minute structural TTL every other route here uses.
     * Two reasons this route is different: (1) it exists specifically to recover from a stale/
     * promoted-away key, so publicly caching ITS answer for minutes is exactly the wrong staleness
     * trade during the next promotion window; (2) {@code ?node=} is a client-supplied arbitrary
     * string — every distinct value is a distinct shared-cache entry, so cardinality (not just the
     * 256-byte size bound) is attacker-controlled; {@link #getNode} can't be abused this way because
     * an unknown path-variable key 404s instead of populating a cache entry. The ETag still makes
     * revalidation cheap (a conditional 304, not a graph rebuild), so this only costs a round trip.
     */
    @GetMapping("/{city}/navigation/resolve")
    public ResponseEntity<NavigationResolveResponse> resolve(
            @PathVariable("city") String city,
            @RequestParam("node") String node,
            WebRequest webRequest) {

        if (node.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "node query parameter is required");
        }
        if (node.getBytes(StandardCharsets.UTF_8).length > MAX_RESOLVE_NODE_PARAM_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "node query parameter exceeds " + MAX_RESOLVE_NODE_PARAM_BYTES + " bytes");
        }

        NavigationGraph graph = activeGraphOrNotFound(city);
        ResolvedNode resolved = resolveNode(city, graph, node);

        // S-A (fix cycle 2): SHA-256 the WHOLE basis (revisionId+checksum+resolved key+resolution+
        // requested) instead of folding requested in via String#hashCode() — see javadoc above for
        // why the hashCode() version could produce a byte-identical ETag for two genuinely
        // different `requested` values (the "Aa"/"BB" collision).
        String etag = computeResolveETag(graph, resolved, node);
        if (webRequest.checkNotModified(etag)) {
            return null; // Spring MVC completes the 304 for us once checkNotModified returns true.
        }

        NavigationResolveResponse body =
                new NavigationResolveResponse(node, resolved.resolution(), resolved.body(), graph.revisionId());

        return ResponseEntity.ok()
                // S3 (fix cycle 1): max-age=0 + must-revalidate, not the shared 5-minute structural
                // TTL — see javadoc above for why this recovery route is cache-hostile by design.
                .cacheControl(CacheControl.maxAge(0, TimeUnit.SECONDS).cachePublic().mustRevalidate())
                .eTag(etag)
                .body(body);
    }

    /**
     * SHA-256 hex digest of {@code revisionId + "|" + checksum + "|" + resolvedNodeKey + "|" +
     * resolution.name() + "|" + requested}, quoted for use as a strong ETag validator (see the
     * {@code resolve} javadoc's "ETag is OPAQUE" section for the full collision-resistance
     * rationale — the {@code requested} value must be part of this hashed basis for the class's
     * no-collision claim to hold, but must never reach a response header verbatim).
     *
     * <p>Same "join with {@code |}, SHA-256, hex" idiom as {@code
     * DiscoverSummaryController#computeETag} and {@code NavigationGraph#checksum}'s private {@code
     * sha256Hex} — duplicated here rather than shared, per this codebase's existing house
     * convention of one small private digest helper per class (see {@code RevisionChecksum}'s
     * javadoc for why checksum helpers are deliberately not centralised).
     */
    private static String computeResolveETag(NavigationGraph graph, ResolvedNode resolved, String requested) {
        String basis = graph.revisionId() + "|" + graph.checksum() + "|" + resolved.body().nodeKey()
                + "|" + resolved.resolution().name() + "|" + requested;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(basis.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return "\"" + hex + "\"";
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice. Fail closed
            // (matching NavigationGraph#sha256Hex's handling of the identical situation) rather
            // than falling back to a fixed literal, which would silently make every resolve
            // response across all cities/revisions/requested values share one strong validator —
            // a universal wrong-representation 304, strictly worse than the collision this class
            // otherwise guards against.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private record ResolvedNode(NavigationResolution resolution, NavigationNodeResponse body) {}

    private ResolvedNode resolveNode(String city, NavigationGraph graph, String requestedKey) {
        if (ROOT_NODE_KEY.equals(requestedKey)) {
            return new ResolvedNode(NavigationResolution.EXACT, NavigationNodeResponse.forRoot(city, graph));
        }

        NavigationNode exact = graph.nodeByKey(requestedKey);
        if (exact != null) {
            return new ResolvedNode(NavigationResolution.EXACT, NavigationNodeResponse.forNode(graph, exact));
        }

        // ALIAS rung (AC17) intentionally has no branch here — reserved, never reached, see
        // NavigationResolution#ALIAS javadoc.

        if (requestedKey.startsWith(AREA_NODE_KEY_PREFIX)) {
            String areaKey = requestedKey.substring(AREA_NODE_KEY_PREFIX.length());
            List<String> ancestry = graph.ancestryOfArea(areaKey);
            if (!ancestry.isEmpty()) {
                NavigationNode deepestSurvivingAncestor = graph.nodeByKey(ancestry.get(ancestry.size() - 1));
                if (deepestSurvivingAncestor != null) {
                    return new ResolvedNode(
                            NavigationResolution.ANCESTOR, NavigationNodeResponse.forNode(graph, deepestSurvivingAncestor));
                }
            }
        } else if (requestedKey.startsWith(CLUSTER_NODE_KEY_PREFIX)) {
            NavigationNode containingNode = resolveClusterKeyByContainment(graph, requestedKey);
            if (containingNode != null) {
                return new ResolvedNode(
                        NavigationResolution.ANCESTOR, NavigationNodeResponse.forNode(graph, containingNode));
            }
        }

        return new ResolvedNode(NavigationResolution.CITY_ROOT, NavigationNodeResponse.forRoot(city, graph));
    }

    /**
     * Fix-cycle-1 B1 / fix-cycle-3 S-1+S-2: resolves a stale {@code "c:"} cluster key by
     * CONTAINMENT, not by region — and now by exact-slug membership, not substring.
     *
     * <p>A stale key's segment 2 (per {@link NavigationKeys#clusterNodeKeyBase}) is {@code
     * slug(join("-", sortedRepresentativeAreaKeys))} — the representative areas the cluster was
     * minted from, lossily concatenated. Fix-cycle-1 matched candidates via {@code
     * segment.contains(slug(areaKey))}, which is UNSOUND: because the join delimiter and the
     * slugging alphabet are the same character ({@code '-'}), one area's slug can be a
     * {@code '-'}-bounded PREFIX of another's (e.g. {@code "hebbal"} is a {@code '-'}-delimited
     * prefix of {@code "hebbal-kempapura"} — wrapping both sides of the substring check in
     * {@code '-'} does NOT fix this, since the prefix boundary is itself a real {@code '-'} in the
     * segment). A candidate whose only genuine area is the shorter prefix would therefore falsely
     * "contain" the longer area too, and could win the shallowest/deepest comparison over the
     * TRUE match.
     *
     * <p>Fix-cycle-3 replaces the substring check with {@link
     * #parseKnownAreaSlugsLongestFirst}, which decomposes the segment into a set of KNOWN area
     * slugs by always preferring the LONGEST known slug at each position — so {@code
     * "hebbal-kempapura"} is recognised whole before {@code "hebbal"} is ever tried — and then
     * candidates are matched by SET MEMBERSHIP (equality) against that parsed set, never by
     * substring. This is what makes the {@code ANCESTOR} label true by construction: a candidate
     * only "contains" a surviving representative area when that exact area's slug was parsed out
     * of the stale segment, not merely a fragment of a longer neighbour's slug.
     *
     * <p>Fix-cycle-3 S-2 also changes WHICH matching node wins: it prefers the DEEPEST node whose
     * subtree contains EVERY surviving representative area, restricted to CLUSTER-typed candidates
     * — otherwise "contains all" would trivially degenerate to the surviving AREA leaf itself
     * whenever exactly one representative survives, since an AREA node's own subtree contains only
     * itself (see {@link NavigationGraph#descendantAreaKeysOf}'s javadoc) — defeating the
     * "reattach to a genuine cluster ancestor" intent this half of the ladder exists for.
     *
     * <p><b>Fix-cycle-5 (this cycle)</b> replaces the old "fall back to the SHALLOWEST node
     * containing ANY surviving representative" rung. That fallback was unsound: it happily
     * returned a node whose subtree contains only a STRICT SUBSET of the surviving representatives
     * — e.g. two disjoint depth-0 sibling clusters each holding exactly one of two surviving
     * representative areas — and still labelled it {@code ANCESTOR}, silently discarding the half
     * of the requested geography the winning candidate does NOT actually contain. An
     * {@code ANCESTOR} must mean "this node's subtree genuinely contains everything the stale key
     * still points at" — never "this node happens to contain a fragment of it."
     *
     * <p>The replacement keeps the SAME single scan over {@link NavigationGraph#allNodes()} (one
     * search, not two) but tracks two independent "contains ALL surviving representatives" bests
     * instead of one "contains all" + one "contains any": {@code deepestContainingAllCluster}
     * (CLUSTER-typed only, unchanged from fix-cycle-3 — this is what makes {@link
     * #resolve_staleClusterKey_representativeAreaStillPresent_resolvesToDeepestContainingAncestor}
     * still land on the CLUSTER {@code "mid"} rather than the AREA leaf when both genuinely contain
     * the single surviving representative) and {@code deepestContainingAllAnyType} (every node
     * type, including AREA — needed because {@link NavigationTreeGenerator#expand} can collapse an
     * entire region to depth-0 AREA leaves with zero CLUSTER nodes anywhere in it; when exactly one
     * representative survives in such a graph, that AREA node's own singleton subtree is the only
     * genuine, non-partial containing node). The CLUSTER-restricted best is preferred when it
     * exists (it is always at least as good a match, being cluster-shaped); the any-type best is
     * used only when no CLUSTER contains all of them. Both bests still require containing ALL
     * surviving representatives — neither is a partial/"any" match.
     *
     * <p>If neither best exists (no single node's subtree — of any type — contains every surviving
     * representative; e.g. they have since split across disjoint sibling subtrees, or every one of
     * them has left this region/city, or the whole segment fails to parse against any known area),
     * this returns {@code null} and the caller falls through to {@code CITY_ROOT} — an honest
     * "nothing to reattach to" is preferred over a false, partial {@code ANCESTOR}. No separate
     * {@code PARTIAL_MATCH} resolution was introduced for this: fix-cycle-5 does not need to ever
     * surface a partial match as a distinct successful rung, it only needs to stop mislabelling one
     * as {@code ANCESTOR} — so {@code CITY_ROOT} is the correct, already-existing rung for this
     * case, and adding new API surface for a case nothing calls for would be speculative.
     */
    private static NavigationNode resolveClusterKeyByContainment(NavigationGraph graph, String requestedKey) {
        String[] segments = requestedKey.split(":", -1);
        if (segments.length < 3 || segments[2].isEmpty()) {
            return null;
        }
        String representativeAreaSlugSegment = segments[2];

        // Precompute each AREA's slug once (not per candidate x descendant) — the parse below and
        // the per-node membership scan both reuse this map (#1956 fix-cycle-3 N-3).
        Map<String, String> areaKeyToSlug = new HashMap<>();
        for (NavigationNode n : graph.allNodes()) {
            if ("AREA".equals(n.getNodeType()) && n.getAreaKey() != null) {
                areaKeyToSlug.put(n.getAreaKey(), NavigationKeys.slug(n.getAreaKey()));
            }
        }

        Set<String> survivingRepresentativeSlugs = parseKnownAreaSlugsLongestFirst(
                representativeAreaSlugSegment, new HashSet<>(areaKeyToSlug.values()));
        if (survivingRepresentativeSlugs.isEmpty()) {
            return null;
        }

        NavigationNode deepestContainingAllCluster = null;
        NavigationNode deepestContainingAllAnyType = null;
        for (NavigationNode candidate : graph.allNodes()) {
            Set<String> candidateAreaSlugs = new HashSet<>();
            for (String areaKey : graph.descendantAreaKeysOf(candidate.getNodeKey())) {
                String slug = areaKeyToSlug.get(areaKey);
                if (slug != null) {
                    candidateAreaSlugs.add(slug);
                }
            }

            boolean containsAll = candidateAreaSlugs.containsAll(survivingRepresentativeSlugs);
            if (!containsAll) {
                continue;
            }

            // deepestContainingAllCluster is restricted to CLUSTER-typed nodes: a stale "c:" key
            // must resolve to a cluster-shaped ancestor when one genuinely contains every surviving
            // representative — see the class javadoc above for why this restriction exists and
            // must stay CLUSTER-only even though the any-type sibling below is deliberately
            // unrestricted.
            if ("CLUSTER".equals(candidate.getNodeType())
                    && (deepestContainingAllCluster == null
                            || candidate.getDepth() > deepestContainingAllCluster.getDepth()
                            || (candidate.getDepth().equals(deepestContainingAllCluster.getDepth())
                                    && candidate.getNodeKey().compareTo(deepestContainingAllCluster.getNodeKey()) < 0))) {
                deepestContainingAllCluster = candidate;
            }
            // deepestContainingAllAnyType has NO type restriction — it exists purely to cover the
            // collapsed-region case (zero CLUSTER nodes anywhere) where the only genuine
            // full-containment match left is an AREA node itself. It STILL requires containsAll,
            // never containsAny — unlike the fallback this replaces. Updating it here on a
            // CLUSTER candidate is provably effect-free on the final return value: whenever ANY
            // CLUSTER passes containsAll, deepestContainingAllCluster is non-null and the return
            // below always prefers it over this tracker, regardless of what this tracker holds.
            if (deepestContainingAllAnyType == null
                    || candidate.getDepth() > deepestContainingAllAnyType.getDepth()
                    || (candidate.getDepth().equals(deepestContainingAllAnyType.getDepth())
                            && candidate.getNodeKey().compareTo(deepestContainingAllAnyType.getNodeKey()) < 0)) {
                deepestContainingAllAnyType = candidate;
            }
        }

        return deepestContainingAllCluster != null ? deepestContainingAllCluster : deepestContainingAllAnyType;
    }

    /**
     * Greedily parses {@code segment} (a stale cluster key's lossily-joined representative-area
     * slug segment, see {@link #resolveClusterKeyByContainment}) into the set of KNOWN area slugs
     * it was built from, always preferring the LONGEST known slug that matches at the current
     * position, {@code '-'}-boundary-checked on both ends (#1956 fix-cycle-3 S-1). Trying the
     * longest candidate first at every position ensures {@code "hebbal-kempapura"} consumes itself
     * whole before the shorter {@code "hebbal"} is ever considered as a match there, so a stale
     * key's representative segment is decomposed into the SAME distinct areas it was minted from,
     * never a superset padded with false partial matches.
     *
     * <p>A fragment that matches no known slug (an area that has since left the graph entirely, or
     * an arbitrary test/garbage suffix like {@code "no-longer-a-real-cluster-suffix"}) is skipped
     * up to the next {@code '-'} boundary and does not poison the rest of the parse — the caller
     * treats an empty result as "nothing survived," not as a parse error.
     *
     * <p>This parse is greedy with NO backtracking: a segment whose true composition is {@code
     * S1 + "-" + S3} could mis-parse if some other known slug {@code S2 == S1 + "-" + prefix(S3)}
     * also matches at position 0 and wins the longest-first race, silently consuming into what
     * should have been {@code S3}'s territory. This is believed unreachable in practice against
     * fully-qualified {@code area_key}s (every joined neighbour shares the same country/state/city
     * path, so {@code S2} would have to be a real area whose own name embeds another area's full
     * path, e.g. literally containing "IN KA Bengaluru") — but this is not a proof, and a true
     * backtracking parser was deliberately not built for this fix.
     *
     * <p>The caller's contains-all preference only bounds the blast radius of a mis-parse that
     * ADDS a spurious extra slug to the surviving set (a stricter containment requirement over a
     * larger set pushes the result toward CITY_ROOT — safe, if coarser than ideal). It does NOT
     * bound the case this greedy parse actually risks: a true representative being REPLACED by one
     * spurious slug that wins the longest-first race. containsAll over that smaller, wrong set can
     * still find a confident match — a false ANCESTOR pointing at unrelated geography — so this
     * parser's soundness rests on the "believed unreachable in practice" argument above, not on any
     * downstream safety net.
     */
    private static Set<String> parseKnownAreaSlugsLongestFirst(String segment, Set<String> knownAreaSlugs) {
        List<String> byLengthDescending = new ArrayList<>(knownAreaSlugs);
        byLengthDescending.sort(Comparator.comparingInt(String::length).reversed());

        Set<String> matched = new LinkedHashSet<>();
        int pos = 0;
        int len = segment.length();
        while (pos < len) {
            String matchedSlug = null;
            for (String candidate : byLengthDescending) {
                int candidateLen = candidate.length();
                if (candidateLen == 0 || pos + candidateLen > len) {
                    continue;
                }
                if (!segment.regionMatches(pos, candidate, 0, candidateLen)) {
                    continue;
                }
                boolean atEnd = pos + candidateLen == len;
                boolean followedByBoundary = !atEnd && segment.charAt(pos + candidateLen) == '-';
                if (atEnd || followedByBoundary) {
                    matchedSlug = candidate;
                    break;
                }
            }

            if (matchedSlug != null) {
                matched.add(matchedSlug);
                pos += matchedSlug.length();
                if (pos < len && segment.charAt(pos) == '-') {
                    pos++;
                }
            } else {
                int nextDash = segment.indexOf('-', pos);
                if (nextDash < 0) {
                    break;
                }
                pos = nextDash + 1;
            }
        }
        return matched;
    }

    /**
     * GET /api/discover/cities/{city}/navigation/{nodeKey}/counts?purpose=&amp;propertyType=&amp;
     * propertyTypes=&amp;bedrooms=&amp;sellerTypes=&amp;readyToMove=&amp;reraRegistered=&amp;
     * newToMarket=&amp;backOnMarket= — display-time counts from {@link AreaCountRollupService}
     * (AC8b; filter widening + school counts #1956 PR1). {@code nodeKey="root"} returns the whole
     * city's total plus each top-level node's rolled-up total.
     *
     * <p>Every filter param is OPTIONAL — omitting all of them reproduces the pre-#1956 blended
     * behaviour byte-for-byte, since {@link AreaCountQuery}'s compact constructor normalises an
     * absent/unrecognised value to blended, never to an error. {@code propertyType} (singular) is
     * the pre-#1956 param, kept for backward compatibility; {@code propertyTypes} (plural, matching
     * {@link com.example.realestate.discover.DiscoverListingsController}'s convention) is preferred
     * when both are supplied.
     *
     * <p>{@code schoolCount} (node + each child) and the whole-city {@code areaCounts} map are new
     * response fields — see {@link NavigationCountsResponse}'s javadoc.
     *
     * <p><b>{@code priceMin}/{@code priceMax} are DELIBERATELY NOT BOUND on this endpoint —
     * contract, not oversight</b> (#1956 PR1 AC1.15), in the same register as {@link
     * AreaCountQuery}'s existing exclusion of {@code bbox}, {@code polygon}, {@code q}, school
     * lat/lon/radius, {@code dateFrom}/{@code dateTo} and {@code areaKeys}. Price is excluded here
     * because its value space is UNBOUNDED and CONTINUOUS: the app's price inputs are free-form
     * numeric fields ({@code step="any"}, no maximum) and no CHECK constraint bounds
     * {@code price_paise}, so every distinct rupee value would mint a distinct entry in this public,
     * unauthenticated endpoint's shared count cache. Coarsening the value to bound that cardinality
     * was rejected: it would widen the band a shopper actually asked for, and a performance budget
     * never authorises altered shopper semantics.
     *
     * <p><b>This is a DEFERRED DECISION with a named owner, NOT a product statement that counts
     * ignore price.</b> The PR that FIRST RENDERS these counts must reintroduce price together with
     * a cardinality answer derived from that surface's real input granularity (a discrete ladder the
     * UI itself emits makes bounded caching a provable no-op; a free-form input does not). Nothing
     * is lost in the interim: no shopper can currently reach this lever, because no mounted
     * component sends price to this endpoint.
     *
     * <p><b>Unbound, not rejected.</b> The params are simply absent from the method signature, so a
     * stale bookmark or client still carrying {@code ?priceMin=…} continues to return 200 with
     * blended-on-price counts rather than becoming a new 400. Spring ignores unmapped query params.
     * The fields REMAIN on {@link AreaCountQuery} (normalised, and folded into its cache-key hash) —
     * this narrows what the PUBLIC ENDPOINT accepts, not the record's type: callers that construct
     * {@code AreaCountQuery} directly keep full price support.
     */
    @GetMapping("/{city}/navigation/{nodeKey}/counts")
    public ResponseEntity<NavigationCountsResponse> getCounts(
            @PathVariable("city") String city,
            @PathVariable("nodeKey") String nodeKey,
            @RequestParam(name = "purpose", required = false) String purpose,
            @RequestParam(name = "propertyType", required = false) String propertyType,
            @RequestParam(name = "propertyTypes", required = false) List<String> propertyTypes,
            @RequestParam(name = "bedrooms", required = false) List<Integer> bedrooms,
            @RequestParam(name = "sellerTypes", required = false) List<String> sellerTypes,
            @RequestParam(name = "readyToMove", required = false) Boolean readyToMove,
            @RequestParam(name = "reraRegistered", required = false) Boolean reraRegistered,
            @RequestParam(name = "newToMarket", required = false) Boolean newToMarket,
            @RequestParam(name = "backOnMarket", required = false) Boolean backOnMarket) {

        // #1956 PR1: tightened node/city validation — the graph/city lookup and node existence
        // check both happen BEFORE any filter parsing/normalisation work below, so a request for an
        // unknown city or node 404s without ever constructing an AreaCountQuery or touching the
        // count cache.
        NavigationGraph graph = activeGraphOrNotFound(city);

        NavigationNode node = null;
        if (!ROOT_NODE_KEY.equals(nodeKey)) {
            node = graph.nodeByKey(nodeKey);
            if (node == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown navigation node");
            }
        }

        List<String> effectivePropertyTypes = (propertyTypes != null && !propertyTypes.isEmpty())
                ? propertyTypes
                : (propertyType != null ? List.of(propertyType) : null);

        // #1956 PR1 AC1.15 #5 — bound repeated filter params on this public, unauthenticated route.
        // These accept unbounded repetition by default, and an all-unrecognised list is PRESERVED
        // (so it can narrow to zero honestly rather than widening to the whole city), meaning each
        // repetition would otherwise become one more bind parameter — reaching PostgreSQL's 65535
        // ceiling as a 500 rather than a clean 400. Caps are derived from the vocabularies, never
        // hardcoded, so a new enum value raises them automatically.
        requireAtMost(effectivePropertyTypes, DiscoverFilterNormalizer.MAX_PROPERTY_TYPE_VALUES, "propertyTypes");
        requireAtMost(sellerTypes, DiscoverFilterNormalizer.MAX_SELLER_TYPE_VALUES, "sellerTypes");
        requireAtMost(bedrooms, DiscoverFilterNormalizer.MAX_BEDROOM_VALUES, "bedrooms");

        // #1956 PR1 AC1.15 — a NEGATIVE bedrooms value is rejected outright, rather than being
        // carried through as an unsatisfiable filter the way an unknown propertyTypes/sellerTypes
        // value is. The difference is load-bearing: property_type and seller_type are
        // CHECK-constrained, so an out-of-vocabulary value provably matches nothing;
        // property_listings.bedrooms carries NO CHECK constraint (a plain nullable INTEGER, V0:87),
        // so `IN (-5)` and `IN (-7)` are neither provably empty nor provably equal — collapsing them
        // onto a shared cached answer would be wrong-answer poisoning, not an optimisation.
        if (bedrooms != null && bedrooms.stream().anyMatch(b -> b != null && b < 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bedrooms must be non-negative");
        }

        AreaCountQuery query = AreaCountQuery.blended(city)
                .withListingPurpose(purpose)
                .withPropertyTypes(effectivePropertyTypes)
                .withBedrooms(bedrooms)
                .withSellerTypes(sellerTypes)
                .withReadyToMove(readyToMove)
                .withReraRegistered(reraRegistered)
                .withNewToMarket(newToMarket)
                .withBackOnMarket(backOnMarket);

        Map<String, Long> areaCounts = rollupService.areaCountsForCity(city, graph.revisionId(), query);
        AreaSchoolCoverage schoolCoverage = rollupService.schoolCoverageForCity(city, graph.revisionId());
        Map<String, Long> areaSchoolCounts = schoolCoverage.countsByAreaKey();

        long total = node == null
                ? areaCounts.values().stream().mapToLong(Long::longValue).sum()
                : rollupService.countForNode(graph, node, areaCounts);
        // The city-wide school total is a DISTINCT UNION over every area, not a sum of
        // areaSchoolCounts — a school covering two areas is one school. Listings sum because a
        // listing belongs to exactly one area; schools do not. See AreaSchoolCoverage.
        long schoolTotal = node == null
                ? schoolCoverage.totalDistinctSchoolCount()
                : rollupService.schoolCountForNode(graph, node, schoolCoverage);
        var children = rollupService.childCounts(graph, node == null ? null : nodeKey, areaCounts, schoolCoverage);

        NavigationCountsResponse body = new NavigationCountsResponse(
                nodeKey, total, schoolTotal, areaCounts, areaSchoolCounts, children, graph.revisionId());

        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(countsCacheMaxAgeSeconds, TimeUnit.SECONDS).cachePublic())
                .body(body);
    }

    /**
     * 400s when a repeated filter param carries more values than its vocabulary can meaningfully
     * hold (#1956 PR1 AC1.15 #5). Same style as the price validation above: a clean, explicit
     * BAD_REQUEST rather than letting an oversized list reach the database as a 500.
     */
    private static void requireAtMost(List<?> values, int maxValues, String paramName) {
        if (values != null && values.size() > maxValues) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    paramName + " accepts at most " + maxValues + " values");
        }
    }

    private NavigationGraph activeGraphOrNotFound(String city) {
        return graphCache.getActiveGraph(city)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "City has no active navigation hierarchy"));
    }
}
