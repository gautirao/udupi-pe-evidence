package com.example.realestate.discover.navigation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Filter context for {@link AreaCountProvider} (#1955 Areas PR A, SLICE 2e, AC12).
 *
 * @param citySlug       city slug (required)
 * @param listingPurpose {@code "sale"}/{@code "rent"}, or {@code null} for blended — same
 *                       vocabulary as {@link com.example.realestate.discover.SummaryQuery}
 * @param propertyType   optional singular property type filter; {@code null}/blank = blended
 * @param exposure       reserved namespace tag for a future public/anon-teaser vs authenticated
 *                       count tiering (mirrors the anon-teaser precedent elsewhere in discover);
 *                       every caller in this slice passes {@code "public"}. Never {@code null} —
 *                       the compact constructor defaults it so the cache key is always complete.
 */
public record AreaCountQuery(String citySlug, String listingPurpose, String propertyType, String exposure) {

    public AreaCountQuery {
        if (exposure == null || exposure.isBlank()) {
            exposure = "public";
        }
    }

    /**
     * Deterministic digest of every non-city dimension — used as part of {@link
     * AreaCountRollupService}'s short-TTL cache key. {@code citySlug} and (for the rollup) {@code
     * revisionId} are folded in separately by the caller, not here, so this hash alone need only
     * distinguish purpose/propertyType/exposure combinations for the SAME city+revision.
     */
    public String normalizedFilterHash() {
        String raw = (listingPurpose == null ? "" : listingPurpose) + "|"
                + (propertyType == null ? "" : propertyType) + "|" + exposure;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice.
            return raw;
        }
    }
}
