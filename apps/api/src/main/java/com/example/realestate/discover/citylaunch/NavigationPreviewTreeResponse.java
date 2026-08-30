package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationBoundsResponse;

import java.util.List;

/**
 * {@code GET .../navigation/tree} — the revision's SANDBOX navigation tree (never the promoted
 * public endpoint's cached production tree), with a lightweight structural validation status for
 * display. NO listing counts (mirrors {@link AdminCityLaunchPreviewController}'s split — counts
 * are a display-time concern this preview never touches).
 */
public record NavigationPreviewTreeResponse(
        long revisionId,
        String validationStatus,
        List<String> validationErrors,
        List<PreviewNode> nodes) {

    /**
     * {@code bounds} reuses {@link NavigationBoundsResponse}'s exact wire shape (AC14 item 2) —
     * straight passthrough from the {@code sandbox_navigation_nodes} row's own
     * centre/min/max_lat/lon columns (V121), never recomputed. Every node (CLUSTER and AREA) has
     * these columns {@code NOT NULL} at the storage layer, so {@code bounds} is populated for
     * every node here.
     */
    public record PreviewNode(
            String nodeKey, String nodeType, String parentNodeKey, String regionKey, String areaKey,
            String displayLabel, int depth, List<String> ancestorKeys, List<String> representativeAreaKeys,
            int displayOrder, int descendantAreaCount, NavigationBoundsResponse bounds) {}
}
