package com.example.realestate.discover.navigation;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Objects;

/**
 * Response body for {@code GET /api/discover/cities/{city}/navigation/{nodeKey}} (#1955 Areas PR
 * A, SLICE 2e, AC8; ancestry labelling + {@code descendantAreaKeys} added #1956 AC16/AC19).
 * STRUCTURAL ONLY — deliberately carries no listing-count field; counts are a
 * separate endpoint ({@code /navigation/{nodeKey}/counts}, AC8b) so a structural read never pays
 * for (or accidentally staleness-couples to) a count query.
 *
 * <p>Public identity ONLY — {@code nodeKey}/{@code areaKey} everywhere, never a {@link
 * NavigationNode} surrogate {@code id} or {@code parentNodeId}.
 *
 * @param nodeKey        this node's public identity, or the literal {@code "root"} synthetic key
 * @param nodeType        {@code "ROOT"} (synthetic top-of-city), {@code "CLUSTER"}, or {@code "AREA"}
 * @param displayLabel    human label
 * @param depth           0 for a real root CLUSTER/AREA node; {@code -1} for the synthetic {@code "root"}
 * @param regionKey       owning macro-region key (structural metadata)
 * @param ancestry        root -> immediate-parent ancestor nodes, each with its own public
 *                        identity + label (#1956 AC16 — same {@link #childSummary} mapper {@code
 *                        NavigationPathResponse#ancestry} uses, over the SAME cached graph, so
 *                        guided-navigation and direct-search ancestry can never disagree)
 * @param nextLevelType   what following a child link leads to: {@code CLUSTER}, {@code AREA}, or
 *                        {@code LISTINGS} (this node is itself an AREA leaf — the next level down
 *                        is a listings page, not more navigation)
 * @param children        direct children, in display order
 * @param revisionId      the production revision this snapshot was built from
 * @param bounds          structural bounds; {@code null} for the synthetic {@code "root"} node
 * @param descendantAreaKeys every AREA leaf's area_key in this node's subtree (#1956 AC19) — OMITTED
 *                        ({@code null}) for the synthetic {@code "root"} node (unfiltered, needs no
 *                        area filter), EMPTY for an AREA node (no descendants below a leaf),
 *                        populated for a CLUSTER. One-round-trip filtering aid — a client never
 *                        needs to recursively union {@code children[]} to get this list.
 * @param areaKey         additive, fix-cycle-1 S6: the node's own {@code area_key} when it is an
 *                        AREA leaf, {@code null} (omitted, {@code @JsonInclude(NON_NULL)}) for
 *                        CLUSTER/ROOT. {@code descendantAreaKeys} is deliberately left empty on an
 *                        AREA leaf per AC19's letter, but that is exactly where a user lands to see
 *                        listings — without this field a PR-B consumer would need to reimplement
 *                        {@link NavigationKeys#areaNodeKey} client-side ({@code
 *                        nodeKey.slice(2)}) to recover the filter key, which is the key-minting
 *                        internals coupling this issue forbids. Mirrors the same AREA-vs-not fork
 *                        {@link AreaCountRollupService#countForNode} already resolves via {@code
 *                        node.getAreaKey()}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavigationNodeResponse(
        String nodeKey,
        String nodeType,
        String displayLabel,
        int depth,
        String regionKey,
        List<NavigationChildSummary> ancestry,
        String nextLevelType,
        List<NavigationChildSummary> children,
        long revisionId,
        NavigationBoundsResponse bounds,
        List<String> descendantAreaKeys,
        String areaKey
) {

    private static final Logger log = LoggerFactory.getLogger(NavigationNodeResponse.class);

    public record NavigationChildSummary(String nodeKey, String nodeType, String displayLabel, int displayOrder) {}

    /**
     * Fix-cycle-1 S4: {@code graph.ancestryOf}/{@code ancestorKeys} is the persisted {@code
     * ancestor_keys} column verbatim, and {@link NavigationGraph#build} validates only {@code
     * parent_node_id} — a dangling {@code ancestor_keys} entry is never rejected at build time. A
     * missing child returns {@code null} here (logged) rather than dereferencing it and turning a
     * public 200 into a 500; every caller filters the result with {@code Objects::nonNull} before
     * exposing it. Consistent with {@code NavigationController#resolveNode}'s existing explicit
     * null-check against this same class of dangling key.
     */
    static NavigationChildSummary childSummary(NavigationGraph graph, String childKey) {
        NavigationNode child = graph.nodeByKey(childKey);
        if (child == null) {
            log.warn("NavigationGraph dangling key reference: '{}' not found in the active graph — "
                    + "omitting it from the response instead of failing the whole request", childKey);
            return null;
        }
        return new NavigationChildSummary(
                child.getNodeKey(), child.getNodeType(), child.getDisplayLabel(), child.getDisplayOrder());
    }

    /** {@code "root"} synthetic city-top-level node — no real {@link NavigationNode} row backs it.
     * {@code descendantAreaKeys} is {@code null} (omitted, {@code @JsonInclude(NON_NULL)}): the
     * root view is unfiltered and needs no area filter (#1956 AC19). */
    static NavigationNodeResponse forRoot(String citySlug, NavigationGraph graph) {
        List<String> rootKeys = graph.childrenOf(null);
        List<NavigationChildSummary> children = rootKeys.stream()
                .map(k -> childSummary(graph, k))
                .filter(Objects::nonNull)
                .toList();
        String nextLevelType = children.isEmpty() ? null : children.get(0).nodeType();
        return new NavigationNodeResponse(
                "root", "ROOT", canonicalCityLabel(citySlug), -1, null, List.of(), nextLevelType, children,
                graph.revisionId(), null, null, null);
    }

    static NavigationNodeResponse forNode(NavigationGraph graph, NavigationNode node) {
        List<String> childKeys = graph.childrenOf(node.getNodeKey());
        List<NavigationChildSummary> children = childKeys.stream()
                .map(k -> childSummary(graph, k))
                .filter(Objects::nonNull)
                .toList();
        String nextLevelType;
        if ("AREA".equals(node.getNodeType())) {
            nextLevelType = "LISTINGS";
        } else {
            // Generator invariant: a CLUSTER's direct children are homogeneous in nodeType.
            nextLevelType = children.isEmpty() ? null : children.get(0).nodeType();
        }
        List<NavigationChildSummary> ancestry = graph.ancestryOf(node.getNodeKey()).stream()
                .map(k -> childSummary(graph, k))
                .filter(Objects::nonNull)
                .toList();
        // #1956 AC19: an AREA leaf gets an explicit empty list here rather than
        // NavigationGraph#descendantAreaKeysOf's raw return, which (correctly documented as of
        // fix-cycle-1 S8) includes the node's OWN area_key when it is an AREA leaf (see
        // NavigationGraphTest#build_ancestryDescendantsAndBounds, which asserts
        // descendantAreaKeysOf(<AREA nodeKey>) containsExactly its own area_key). This mapping-layer
        // branch mirrors the same AREA-vs-not fork AreaCountRollupService#countForNode already
        // resolves (never calls descendantAreaKeysOf for an AREA node either) rather than inventing
        // a new pattern — a deliberate seam choice, not a bug, so AC19's letter (empty on AREA) and
        // the underlying method's real contract can both stand without contradicting each other.
        List<String> descendantAreaKeys = "AREA".equals(node.getNodeType())
                ? List.of()
                : graph.descendantAreaKeysOf(node.getNodeKey());
        // Fix-cycle-1 S6 (additive): populate areaKey only for an AREA leaf, null (omitted) for
        // CLUSTER/ROOT — see the record javadoc for why this is needed alongside the empty
        // descendantAreaKeys above.
        String areaKey = "AREA".equals(node.getNodeType()) ? node.getAreaKey() : null;
        return new NavigationNodeResponse(
                node.getNodeKey(), node.getNodeType(), node.getDisplayLabel(), node.getDepth(),
                node.getRegionKey(), ancestry, nextLevelType, children,
                graph.revisionId(), NavigationBoundsResponse.from(graph.boundsOf(node.getNodeKey())),
                descendantAreaKeys, areaKey);
    }

    /**
     * Best in-scope canonical city display label (#1956 AC16): title-cases the {@code city_slug}'s
     * hyphen-separated tokens (e.g. {@code "bangalore"} -&gt; {@code "Bangalore"}). Fixes the
     * previously-shipped root crumb showing the raw slug verbatim (e.g. {@code "bangalore"}).
     *
     * <p>Fix-cycle-1 nit: {@code public.cities.name} DOES exist ({@code
     * V71__cities_and_areas.sql}) and is already read for a display name elsewhere in {@code
     * com.example.realestate.discover} (e.g. {@code CityRegionOnboardingService}) — no display name
     * is carried on {@link NavigationGraph} itself today, though. This pure title-case is kept as
     * the deliberate fix rather than reaching outside {@code discover.navigation} for a
     * cross-domain repository dependency (out of this issue's allowed globs): it matches {@code
     * cities.name} exactly for every seeded city, since all four seeded cities' {@code name} is the
     * title-cased slug verbatim. A future slice threading a real display name through {@link
     * NavigationGraph} would make this helper unnecessary, not wrong.
     */
    static String canonicalCityLabel(String citySlug) {
        if (citySlug == null || citySlug.isBlank()) {
            return citySlug;
        }
        StringBuilder label = new StringBuilder();
        for (String token : citySlug.split("-")) {
            if (token.isEmpty()) {
                continue;
            }
            if (label.length() > 0) {
                label.append(' ');
            }
            label.append(Character.toUpperCase(token.charAt(0))).append(token.substring(1));
        }
        return label.length() == 0 ? citySlug : label.toString();
    }
}
