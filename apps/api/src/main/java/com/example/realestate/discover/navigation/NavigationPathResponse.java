package com.example.realestate.discover.navigation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Response body for {@code GET /api/discover/cities/{city}/areas/{areaKey}/navigation-path}
 * (#1955 Areas PR A, SLICE 2e, AC8). Resolved from the SAME cached {@link NavigationGraph} {@link
 * NavigationController#getNode} reads, so direct-search ancestry and guided-navigation ancestry
 * can never disagree for a given revision.
 *
 * @param areaKey       the AREA leaf's public identity
 * @param nodeKey       the AREA leaf's node_key ({@code "a:" + areaKey}, D5)
 * @param displayLabel  the AREA leaf's display label
 * @param ancestry      root -> immediate-parent ancestor nodes, each with its own public identity
 * @param revisionId    the production revision this snapshot was built from
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavigationPathResponse(
        String areaKey,
        String nodeKey,
        String displayLabel,
        List<NavigationNodeResponse.NavigationChildSummary> ancestry,
        long revisionId
) {
}
