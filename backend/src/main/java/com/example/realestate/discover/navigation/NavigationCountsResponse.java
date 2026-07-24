package com.example.realestate.discover.navigation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Response body for {@code GET /api/discover/cities/{city}/navigation/{nodeKey}/counts} (#1955
 * Areas PR A, SLICE 2e, AC8b) — display-time counts ONLY, deliberately separate from the
 * structural {@link NavigationNodeResponse} (see that record's javadoc).
 *
 * @param nodeKey      the node this count is for (or the literal {@code "root"})
 * @param count        this node's own rolled-up total (unique-leaf-area sum; see {@link
 *                     AreaCountRollupService})
 * @param children     each direct child's own rolled-up total, in display order
 * @param revisionId   the production revision the counts' structural fold was computed against
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavigationCountsResponse(
        String nodeKey,
        long count,
        List<AreaCountRollupService.NodeCount> children,
        long revisionId
) {
}
