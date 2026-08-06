package com.example.realestate.discover.navigation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * One in-memory node produced by {@link NavigationTreeGenerator}, before persistence. Parent
 * linkage is by {@code parentNodeKey} (D5's stable public identity) rather than a surrogate id —
 * surrogate ids don't exist until {@link NavigationTreeSandboxWriter} inserts the row.
 *
 * <p>{@code bearingDegrees} (#2086 design.R4): the initial great-circle bearing, in degrees
 * normalised to {@code [0, 360)}, from the PARENT node's centre to THIS node's centre — never
 * relative to a user's camera/viewport. {@code null} for depth-0 DIRECTION nodes (no parent node
 * exists; the city centre is not itself a node).
 */
public record GeneratedNode(
        String regionKey, String nodeType, String nodeKey, String parentNodeKey, String areaKey,
        List<String> representativeAreaKeys, String displayLabel, int displayOrder, int depth,
        List<String> ancestorKeys, int descendantAreaCount,
        BigDecimal centreLat, BigDecimal centreLon,
        BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
        BigDecimal bearingDegrees,
        String policyFingerprint, Instant generatedAt) {
}
