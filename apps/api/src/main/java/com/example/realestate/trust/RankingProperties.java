package com.example.realestate.trust;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.HashMap;
import java.util.Map;

/**
 * Configuration properties for the trust ranking score formula.
 *
 * <p>Bound from the {@code trust.ranking} namespace in {@code application.yml}.
 * Registered as a bean via {@link TrustConfig} using
 * {@code @EnableConfigurationProperties} so that binding failures surface at
 * startup rather than being silently swallowed.
 *
 * <p>Default values mirror the canonical spec (RE-150):
 * <ul>
 *   <li>tierBase: A=1000, B=750, C=500, D=0</li>
 *   <li>freshnessWeight=200, profileWeight=100, listingWeight=100</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "trust.ranking")
public class RankingProperties {

    /**
     * Per-tier base score. Keys are single-letter tier strings: "A", "B", "C", "D".
     */
    private Map<String, Integer> tierBase = defaultTierBase();

    private Weights weights = new Weights();

    // -------------------------------------------------------------------------
    // Getters / setters — required by Spring relaxed binding
    // -------------------------------------------------------------------------

    public Map<String, Integer> getTierBase() {
        return tierBase;
    }

    public void setTierBase(Map<String, Integer> tierBase) {
        this.tierBase = tierBase;
    }

    public Weights getWeights() {
        return weights;
    }

    public void setWeights(Weights weights) {
        this.weights = weights;
    }

    /**
     * Returns the base score for the given tier letter, defaulting to 0 if
     * the tier is not present in the configuration map.
     *
     * @param tier single-letter tier string ("A", "B", "C", or "D")
     * @return configured base score, or 0 if absent
     */
    public int tierBaseFor(String tier) {
        return tierBase.getOrDefault(tier, 0);
    }

    // -------------------------------------------------------------------------
    // Nested types
    // -------------------------------------------------------------------------

    public static class Weights {

        private double freshness = 200;
        private double profile = 100;
        private double listing = 100;

        public double getFreshness() {
            return freshness;
        }

        public void setFreshness(double freshness) {
            this.freshness = freshness;
        }

        public double getProfile() {
            return profile;
        }

        public void setProfile(double profile) {
            this.profile = profile;
        }

        public double getListing() {
            return listing;
        }

        public void setListing(double listing) {
            this.listing = listing;
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private static Map<String, Integer> defaultTierBase() {
        Map<String, Integer> map = new HashMap<>();
        map.put("A", 1000);
        map.put("B", 750);
        map.put("C", 500);
        map.put("D", 0);
        return map;
    }
}
