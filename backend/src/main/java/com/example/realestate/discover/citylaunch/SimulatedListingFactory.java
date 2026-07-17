package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.AreaListingCard;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverMarker;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

/**
 * Deterministic, in-memory-only synthesis of exactly one "simulated" listing per in-scope
 * {@link SandboxArea}, used by the admin city-launch preview endpoints (#1911 PR3) to render
 * the production Discover DTOs against a revision that has zero real {@code property_listings}
 * rows.
 *
 * <p><b>Never persisted.</b> Every call to {@link #of} builds fresh, disposable DTOs — nothing
 * produced by this class is ever passed to a repository {@code .save()}.
 *
 * <p><b>Deterministic.</b> The same {@code (revisionId, areaKey)} pair always yields byte-identical
 * output: the seed is a stable SHA-256 hash of {@code revisionId + "|" + areaKey}, never
 * {@link java.util.UUID#randomUUID()} or a time-seeded {@link java.util.Random}.
 *
 * <p><b>Honest nulls.</b> Fields the sandbox graph has no real source for — hero image, trust
 * badge, RERA, confirmation/publish timestamps — are always {@code null}, never fabricated.
 */
public final class SimulatedListingFactory {

    private static final String[] PROPERTY_TYPES = {"apartment", "house", "villa", "land"};

    private SimulatedListingFactory() {}

    /** A safe, non-degenerate interior point for a {@link SandboxArea} — never {@code (0, 0)}. */
    public record InteriorPoint(double lat, double lon) {}

    /** Fully-derived, deterministic fixture values for one area's simulated listing. */
    public record SimulatedListing(
            String id,
            String listingNumber,
            String areaKey,
            String areaName,
            InteriorPoint point,
            Long pricePaise,
            Integer bedrooms,
            String propertyType,
            Double builtArea,
            String builtAreaUnit,
            Double landArea,
            String landAreaUnit,
            String title) {}

    /**
     * Resolves the safe interior point for {@code area}: the geo-center when present and (if a
     * bbox also exists) inside that bbox; otherwise the bbox midpoint; otherwise {@code null}.
     * Never returns a fabricated {@code (0, 0)} point.
     */
    public static InteriorPoint interiorPoint(SandboxArea area) {
        Double lat = area.getGeoCenterLat();
        Double lon = area.getGeoCenterLon();
        boolean hasBbox = hasCompleteBbox(area);

        if (lat != null && lon != null) {
            boolean insideBbox = !hasBbox
                    || (lat >= area.getMinLat() && lat <= area.getMaxLat()
                        && lon >= area.getMinLon() && lon <= area.getMaxLon());
            if (insideBbox) {
                return new InteriorPoint(lat, lon);
            }
        }
        if (hasBbox) {
            return new InteriorPoint(
                    (area.getMinLat() + area.getMaxLat()) / 2.0,
                    (area.getMinLon() + area.getMaxLon()) / 2.0);
        }
        return null;
    }

    /** True when {@code area} has a complete, valid (min &le; max) bbox. */
    public static boolean hasCompleteBbox(SandboxArea area) {
        return area.getMinLat() != null && area.getMinLon() != null
                && area.getMaxLat() != null && area.getMaxLon() != null
                && area.getMinLat() <= area.getMaxLat()
                && area.getMinLon() <= area.getMaxLon();
    }

    /**
     * Builds the deterministic simulated listing for {@code area}, or {@code null} when the area
     * has no safe interior point (excluded from the preview entirely).
     */
    public static SimulatedListing of(long revisionId, SandboxArea area) {
        InteriorPoint point = interiorPoint(area);
        if (point == null) {
            return null;
        }

        String areaKey = area.getAreaKey();
        long seed = stableSeed(revisionId, areaKey);
        String shortHash = Long.toHexString(seed);
        String id = "preview:" + revisionId + ":" + areaKey;
        String listingNumber = "PREVIEW-" + shortHash;

        long priceBand = Math.floorMod(seed, 8L);
        long pricePaise = (3_000_000L + priceBand * 1_500_000L) * 100L; // ~30L .. ~133.5L (paise)
        int bedrooms = (int) Math.floorMod(seed >>> 3, 4L) + 1; // 1..4
        String propertyType = PROPERTY_TYPES[(int) Math.floorMod(seed >>> 6, PROPERTY_TYPES.length)];
        double builtArea = 400.0 + Math.floorMod(seed >>> 9, 2000L);
        boolean isLand = "land".equals(propertyType);
        Double landArea = isLand ? 2.0 + Math.floorMod(seed >>> 12, 40L) : null;

        return new SimulatedListing(
                id, listingNumber, areaKey, area.getName(), point,
                pricePaise, bedrooms, propertyType,
                isLand ? null : builtArea, isLand ? null : "sq ft",
                landArea, isLand ? "cent" : null,
                "Simulated listing · " + area.getName());
    }

    /** Deterministic 63-bit seed derived from a SHA-256 hash — never random, never time-based. */
    private static long stableSeed(long revisionId, String areaKey) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest((revisionId + "|" + areaKey).getBytes(StandardCharsets.UTF_8));
            long value = 0;
            for (int i = 0; i < 8; i++) {
                value = (value << 8) | (hash[i] & 0xFF);
            }
            return value & Long.MAX_VALUE;
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public static DiscoverMarker toMarker(SimulatedListing listing) {
        return new DiscoverMarker(
                listing.id(),
                listing.point().lat(),
                listing.point().lon(),
                listing.pricePaise(),
                listing.areaName(),
                listing.propertyType(),
                null);
    }

    public static AreaListingCard toListingCard(SimulatedListing listing) {
        return new AreaListingCard(
                null, // id — no real listing UUID exists; never fabricated
                listing.pricePaise(),
                null, // priceBand — admin caller always sees exact price
                listing.propertyType(),
                listing.areaName(),
                null, // primaryImageUrl — honest null, never fabricated
                "sale",
                listing.bedrooms(),
                listing.title(),
                null, // bathrooms
                listing.builtArea(),
                listing.builtAreaUnit(),
                listing.landArea(),
                listing.landAreaUnit(),
                null, // totalFloors
                null, // parkingCount
                null, // furnishingStatus
                null, // createdAt — honest null, never fabricated
                null, // trustBadge — honest null, never fabricated
                listing.point().lat(),
                listing.point().lon());
    }

    public static DiscoverListingResponse toDetail(SimulatedListing listing) {
        return new DiscoverListingResponse(
                listing.id(),
                listing.listingNumber(),
                listing.propertyType(),
                listing.title(),
                listing.areaName(),
                listing.areaKey(),
                listing.pricePaise(),
                listing.landArea(),
                listing.landAreaUnit(),
                listing.builtArea(),
                listing.builtAreaUnit(),
                listing.bedrooms(),
                listing.point().lat(),
                listing.point().lon(),
                null, // heroImageUrl — honest null, never fabricated
                null, // createdAt — honest null, never fabricated
                null, // updatedAt — honest null, never fabricated
                null, // firstPublishedAt — honest null, never fabricated
                null, // lastUpdatedAt — honest null, never fabricated
                null, // confirmedAt — honest null, never fabricated
                null, // daysOnMarket — honest null, never fabricated
                null, // backOnMarket — honest null, never fabricated
                null, // reraNumber — honest null, never fabricated
                null, // reraValid — honest null, never fabricated
                null, // trustBadge — honest null, never fabricated
                null, // possessionStatus — honest null, never fabricated
                null, // sellerType — honest null, never fabricated
                "sale",
                "LIVE");
    }
}
