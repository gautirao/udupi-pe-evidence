package com.example.realestate.discover.navigation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

/**
 * Extends {@code CityRegionOnboardingService#computeFingerprint}'s V113 recipe ("join every
 * policy-shaping input with '|', sha256 it") with the ten #1955 recursive-cluster generator knobs
 * — this class is the slice that wires the V121 migration comment's fingerprint contract.
 *
 * <p>Field order is fixed (matches the V121 {@code ALTER TABLE city_region_policy} column order)
 * so the same policy row always yields the same fingerprint regardless of how it was loaded.
 * Changing any folded-in value re-stamps every generated node on the next regeneration; an
 * unrelated re-run with nothing changed keeps the same fingerprint.
 */
public final class NavigationPolicyFingerprint {

    private NavigationPolicyFingerprint() {
    }

    public static String compute(
            String regionModel, double centralRadiusKm, List<String> sortedDirectionLabelPairs,
            GeneratorPolicy policy) {

        String canonical = String.join("|",
                nullToEmpty(regionModel),
                String.valueOf(centralRadiusKm),
                String.join(",", sortedDirectionLabelPairs),
                String.valueOf(policy.maxDirectChildren()),
                String.valueOf(policy.minAreasPerCluster()),
                String.valueOf(policy.maxSafetyDepth()),
                String.valueOf(policy.oneChildPrevention()),
                String.valueOf(policy.compactnessThreshold()),
                String.valueOf(policy.separationThreshold()),
                nullToEmpty(policy.partitionMethod()),
                nullToEmpty(policy.representativeSelection()),
                nullToEmpty(policy.outlierRule()),
                nullToEmpty(policy.centreTreatment()));

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice.
            return canonical;
        }
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}
