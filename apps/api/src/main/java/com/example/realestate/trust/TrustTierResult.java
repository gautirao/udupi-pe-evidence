package com.example.realestate.trust;

import java.util.UUID;

/**
 * Immutable result DTO returned by {@link TrustTierCalculator}.
 *
 * <p>Tier values: "A" (highest trust), "B", "C", "D" (default / lowest trust).
 * No tier is ever {@code null}; the calculator always returns at least "D".
 */
public class TrustTierResult {

    private final UUID listingId;
    private final String tier;  // "A", "B", "C", or "D"

    public TrustTierResult(UUID listingId, String tier) {
        this.listingId = listingId;
        this.tier = tier;
    }

    public UUID getListingId() {
        return listingId;
    }

    public String getTier() {
        return tier;
    }
}
