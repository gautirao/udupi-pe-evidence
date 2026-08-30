package com.example.realestate.discover.navigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 *
 * <p><b>#2086 rework fix (PR #2111 cycle 1, availability regression):</b> this class is the ONLY
 * caller that validates via {@link NavigationTreeValidationService#validateForRuntimeLoad}, i.e.
 * {@link ValidationMode#LENIENT_RUNTIME_LOAD} — every check #1-14 still fails closed here exactly
 * as before, but checks #15 (breadth/Local Destination mandate) and #16 (label provenance), both
 * ADDITIVE in #2086, no longer block loading an already-PROMOTED pre-#2086-shaped revision (e.g.
 * Bangalore's currently-active revision, whose DIRECTION nodes have 36-86 direct AREA children).
 * Before this fix, every one of the three call sites above ran the SAME strict validation used for
 * brand-new candidate generation, which made that legacy revision fail to load on a fresh/restarted
 * instance — a real availability regression (the DB row was untouched, but nothing could serve it).
 * Generation ({@code NavigationTreeGenerationService}) and admin candidate/preview validation
 * ({@code CityLaunchNavigationOverrideService#getPreviewTree}) are UNCHANGED — both still call
 * {@link NavigationTreeValidationService#validate} overloads that default to {@link
 * ValidationMode#STRICT}, so a non-compliant newly-generated tree is still rejected exactly as
 * before.
 */
@Service
public class NavigationGraphLoader {

    private static final Logger log = LoggerFactory.getLogger(NavigationGraphLoader.class);

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

        ValidationReport report = validationService.validateForRuntimeLoad(validationNodes);
        if (!report.isValid()) {
            throw new NavigationTreeValidationException(report);
        }
        if (!report.lenientWarnings().isEmpty()) {
            log.warn("NavigationGraphLoader: citySlug={} cityId={} revisionId={} loaded under "
                            + "LENIENT_RUNTIME_LOAD — {} #2086 contract check(s) (breadth/Local Destination "
                            + "mandate #15 and/or label provenance #16) were NOT satisfied and were relaxed "
                            + "to serve this legacy revision; regenerate and promote a #2086-compliant "
                            + "revision for this city to clear this warning: {}",
                    citySlug, cityId, revisionId, report.lenientWarnings().size(), report.lenientWarnings());
        }

        return NavigationGraph.build(citySlug, revisionId, flatNodes);
    }
}
