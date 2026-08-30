package com.example.realestate.discover.navigation;

import java.math.BigDecimal;

/**
 * The {@code city_region_policy} recursive-cluster generator knobs (#1955 D1) — read verbatim
 * from the DB row by {@link NavigationPolicyReader}, NEVER hardcoded as Java constants.
 *
 * <p>{@code compactnessThreshold}/{@code separationThreshold} are folded into the
 * policy_fingerprint (via {@link NavigationPolicyFingerprint}) so changing either still forces a
 * regeneration, but per the approved #1955 design this slice's GEOMETRIC_BISECTION
 * split-acceptance decision is governed solely by {@code oneChildPrevention} +
 * {@code minAreasPerCluster} — these two threshold knobs exist for a future compactness-aware
 * partitioning variant and are intentionally NOT consulted by {@link NavigationTreeGenerator} yet.
 */
public record GeneratorPolicy(
        int maxDirectChildren, int minAreasPerCluster, int maxSafetyDepth, boolean oneChildPrevention,
        BigDecimal compactnessThreshold, BigDecimal separationThreshold, String partitionMethod,
        String representativeSelection, String outlierRule, String centreTreatment) {
}
