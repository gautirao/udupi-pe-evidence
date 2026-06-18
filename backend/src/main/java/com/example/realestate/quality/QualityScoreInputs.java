package com.example.realestate.quality;

import java.time.Instant;
import java.time.OffsetDateTime;

/**
 * All caller-supplied inputs to {@link QualityScoreService#compute}.
 *
 * <p>This record carries NO database references. The caller is responsible for
 * populating it from the Listing entity (or any other source) before invoking the
 * pure-function service.
 *
 * <h3>Field notes</h3>
 * <ul>
 *   <li>{@code trustTier} — A/B/C/D as stored on {@code Listing.trustTier}. Nullable;
 *       null is treated as the lowest tier (D) by the scorer.</li>
 *   <li>{@code propertyType} — lowercase value as stored on {@code Listing.propertyType}
 *       (e.g. {@code "agricultural_land"}). Nullable; null disables AGRI_COMPLETENESS.</li>
 *   <li>{@code listingPricePaise} — price in paise (matches {@code Listing.pricePaise}).
 *       Nullable.</li>
 *   <li>{@code medianComparablePricePaise} — area-median price in paise supplied by the
 *       caller (e.g. from an analytics query). Null → PRICE_SANITY marked INDETERMINATE
 *       and excluded from the score denominator.</li>
 *   <li>{@code createdAt} — matches {@code Listing.createdAt} (OffsetDateTime). Null →
 *       RECENCY scores 0.</li>
 *   <li>{@code now} — REQUIRED caller-supplied clock instant. Must not be null. Never
 *       call {@code Instant.now()} inside the service; the caller supplies the clock
 *       so that scoring is deterministic and testable.</li>
 * </ul>
 *
 * @param photoCount                  Number of photos attached to the listing (0 if none).
 * @param description                 Listing description text. Null/blank → DESCRIPTION scores 0.
 * @param trustTier                   Trust tier: A, B, C, or D. Nullable.
 * @param propertyType                Property type string (lowercase). Nullable.
 * @param landCategory                Agri field — land category. Nullable.
 * @param waterSource                 Agri field — water source. Nullable.
 * @param soilType                    Agri field — soil type. Nullable.
 * @param roadAccess                  Agri field — road access. Nullable.
 * @param cultivationStatus           Agri field — cultivation status. Nullable.
 * @param ownershipType               Agri field — ownership type. Nullable.
 * @param farmhouseAvailable          Agri field — farmhouse flag. Nullable.
 * @param fencingDone                 Agri field — fencing flag. Nullable.
 * @param listingPricePaise           Listing price in paise. Nullable.
 * @param medianComparablePricePaise  Area-median comparable price in paise. Nullable →
 *                                    PRICE_SANITY INDETERMINATE.
 * @param locality                    Locality string from {@code Listing.locality}. Nullable.
 * @param areaKey                     Area key from {@code Listing.areaKey}. Nullable.
 * @param latitude                    Latitude from {@code Listing.latitude}. Nullable.
 * @param longitude                   Longitude from {@code Listing.longitude}. Nullable.
 * @param createdAt                   Creation timestamp from {@code Listing.createdAt}. Nullable.
 * @param now                         Caller-supplied current instant (clock). Required — must not be null.
 */
public record QualityScoreInputs(
        int photoCount,
        String description,
        String trustTier,
        String propertyType,

        // Agri fields (all nullable; only used when propertyType == "agricultural_land")
        String landCategory,
        String waterSource,
        String soilType,
        String roadAccess,
        String cultivationStatus,
        String ownershipType,
        Boolean farmhouseAvailable,
        Boolean fencingDone,

        // Pricing
        Long listingPricePaise,
        Long medianComparablePricePaise,

        // Location
        String locality,
        String areaKey,
        Double latitude,
        Double longitude,

        // Temporal
        OffsetDateTime createdAt,
        Instant now
) {
    public QualityScoreInputs {
        if (now == null) {
            throw new IllegalArgumentException("QualityScoreInputs.now must not be null");
        }
    }
}
