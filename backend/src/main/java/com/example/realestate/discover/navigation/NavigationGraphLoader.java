package com.example.realestate.discover.navigation;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared load-validate-build routine (#1955 Areas PR A, SLICE 2d), the single implementation
 * behind:
 * <ul>
 *   <li>{@code NavigationCachePreloadRunner}'s eager startup preload (via {@link
 *       #validateAndBuild}, given an already-fetched cross-city batch — no per-city query);</li>
 *   <li>{@link NavigationGraphCache}'s request-time single-flight fallback and {@code
 *       refreshActiveRevision} (via {@link #loadValidated}, one city at a time);</li>
 *   <li>{@code NavigationHierarchySafetyPoller}'s mismatch-repair reload (also {@link
 *       #loadValidated}).</li>
 * </ul>
 *
 * <p>Re-runs the SAME {@link NavigationTreeValidationService} the generator/promotion path uses —
 * a production tree is validated again here (not just trusted from having once passed promotion)
 * so a load never silently caches a structurally-broken tree. A validation failure throws {@link
 * NavigationTreeValidationException} and callers MUST NOT catch-and-cache the result: {@link
 * com.github.benmanes.caffeine.cache.Cache#get(Object, java.util.function.Function)} never inserts
 * an entry when its mapping function throws, so a thrown validation failure here is, by
 * construction, never cached.
 */
@Service
public class NavigationGraphLoader {

    private final NavigationNodeRepository navigationNodeRepository;
    private final NavigationTreeValidationService validationService;

    public NavigationGraphLoader(
            NavigationNodeRepository navigationNodeRepository,
            NavigationTreeValidationService validationService) {
        this.navigationNodeRepository = navigationNodeRepository;
        this.validationService = validationService;
    }

    /** Single-city (re)load straight from the database, then validate and build. */
    public NavigationGraph loadValidated(String citySlug, int cityId, long revisionId) {
        List<NavigationNode> flatNodes = navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(cityId);
        return validateAndBuild(citySlug, cityId, revisionId, flatNodes);
    }

    /**
     * Validates and builds from an ALREADY-FETCHED flat node list — the variant the batch preload
     * path uses so loading N cities costs one cross-city query, not N single-city queries.
     */
    public NavigationGraph validateAndBuild(String citySlug, int cityId, long revisionId, List<NavigationNode> flatNodes) {
        if (flatNodes.isEmpty()) {
            throw new NavigationTreeValidationException(new ValidationReport(List.of(new ValidationError(
                    "EMPTY_TREE",
                    "city " + citySlug + " (id=" + cityId + ") has zero navigation_nodes rows — refusing to "
                            + "cache an empty tree for a public-active city",
                    null))));
        }

        Map<Long, String> idToKey = new HashMap<>();
        for (NavigationNode n : flatNodes) {
            idToKey.put(n.getId(), n.getNodeKey());
        }

        List<ValidationNode> validationNodes = new ArrayList<>(flatNodes.size());
        for (NavigationNode n : flatNodes) {
            String parentNodeKey = n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId());
            validationNodes.add(ValidationNode.fromNavigationNode((long) cityId, n, parentNodeKey));
        }

        ValidationReport report = validationService.validate(validationNodes);
        if (!report.isValid()) {
            throw new NavigationTreeValidationException(report);
        }

        return NavigationGraph.build(citySlug, revisionId, flatNodes);
    }
}
