package com.example.realestate.discover.navigation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * One in-memory node produced by {@link NavigationTreeGenerator}, before persistence. Parent
 * linkage is by {@code parentNodeKey} (D5's stable public identity) rather than a surrogate id —
 * surrogate ids don't exist until {@link NavigationTreeSandboxWriter} inserts the row.
 */
public record GeneratedNode(
        String regionKey, String nodeType, String nodeKey, String parentNodeKey, String areaKey,
        List<String> representativeAreaKeys, String displayLabel, int displayOrder, int depth,
        List<String> ancestorKeys, int descendantAreaCount,
        BigDecimal centreLat, BigDecimal centreLon,
        BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
        String policyFingerprint, Instant generatedAt) {
}
