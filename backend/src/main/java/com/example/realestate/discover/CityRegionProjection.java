package com.example.realestate.discover;

import java.util.List;

/**
 * Pure stateless projection rules mapping a (distance, 8-sector direction) pair to a
 * {@code region_key}, under one of three per-city {@code region_model}s (#1882).
 *
 * <p>No Spring bean, no I/O — mirrors {@link RegionalGeo}'s pure-utility shape. Never
 * branches on city name/slug; all per-city behaviour is driven by the caller-supplied
 * {@code regionModel} + {@code centralRadiusKm} (loaded from {@code city_region_policy}).
 *
 * <h2>Region models</h2>
 * <ul>
 *   <li>{@code CENTRAL_CARDINAL_8} — a {@code CENTRAL} bucket for
 *       {@code distanceKm <= centralRadiusKm}, else the unmodified 8-sector direction key.</li>
 *   <li>{@code CENTRAL_CARDINAL_4} — a {@code CENTRAL} bucket, else the 8-sector direction
 *       key collapsed onto the nearest cardinal (see {@link #collapseToCardinal}).</li>
 *   <li>{@code DIRECTIONAL_8} — no {@code CENTRAL} bucket at all; every area (including ones
 *       within {@code centralRadiusKm}) maps to its raw 8-sector direction key.</li>
 * </ul>
 *
 * <p>The {@code CENTRAL} boundary is inclusive: {@code distanceKm == centralRadiusKm} →
 * {@code CENTRAL}.
 */
final class CityRegionProjection {

    static final String CENTRAL = "CENTRAL";

    static final String MODEL_CENTRAL_CARDINAL_4 = "CENTRAL_CARDINAL_4";
    static final String MODEL_CENTRAL_CARDINAL_8 = "CENTRAL_CARDINAL_8";
    static final String MODEL_DIRECTIONAL_8 = "DIRECTIONAL_8";

    /**
     * Canonical region order (index = display_order), used to derive both
     * {@link #canonicalRegionOrder(String)} and {@link #displayOrder(String)}.
     * CENTRAL first, then the 4 cardinals, then the 4 diagonals — stable across models.
     */
    private static final List<String> FULL_CANONICAL_ORDER =
            List.of("CENTRAL", "N", "E", "S", "W", "NE", "SE", "SW", "NW");

    private CityRegionProjection() { /* utility class */ }

    /**
     * Projects a single area's (distance, direction) pair to a region_key under the given
     * policy.
     *
     * @param distanceKm      distance from city geo_center in km (must be &ge; 0)
     * @param directionKey    one of the 8 compass sector keys (N/NE/E/SE/S/SW/W/NW), as
     *                        produced by {@link RegionalGeo#directionKey(double)}
     * @param regionModel     one of {@code CENTRAL_CARDINAL_4}, {@code CENTRAL_CARDINAL_8},
     *                        {@code DIRECTIONAL_8}
     * @param centralRadiusKm the city's CENTRAL-bucket radius (ignored for {@code DIRECTIONAL_8})
     * @return the projected region_key
     */
    static String projectRegionKey(double distanceKm, String directionKey, String regionModel, double centralRadiusKm) {
        if (distanceKm < 0) {
            throw new IllegalArgumentException("distanceKm must be >= 0, got: " + distanceKm);
        }
        requireValidModel(regionModel);

        if (!MODEL_DIRECTIONAL_8.equals(regionModel) && distanceKm <= centralRadiusKm) {
            return CENTRAL;
        }

        return switch (regionModel) {
            case MODEL_CENTRAL_CARDINAL_8, MODEL_DIRECTIONAL_8 -> directionKey;
            case MODEL_CENTRAL_CARDINAL_4 -> collapseToCardinal(directionKey);
            default -> throw new IllegalArgumentException("Unknown region_model: " + regionModel);
        };
    }

    /**
     * Collapses an 8-sector direction key onto the nearest of the 4 cardinal directions.
     * Deterministic, symmetric rule: each diagonal collapses onto the cardinal 45° clockwise
     * of it — NE→E, SE→S, SW→W, NW→N. Cardinals map to themselves.
     */
    private static String collapseToCardinal(String directionKey) {
        return switch (directionKey) {
            case "N", "E", "S", "W" -> directionKey;
            case "NE" -> "E";
            case "SE" -> "S";
            case "SW" -> "W";
            case "NW" -> "N";
            default -> throw new IllegalArgumentException("Unknown directionKey: " + directionKey);
        };
    }

    /**
     * The canonical region_key set produced by a region_model, in stable display order.
     * Never derived from listing counts — a fixed geometric ordering.
     */
    static List<String> canonicalRegionOrder(String regionModel) {
        requireValidModel(regionModel);
        return switch (regionModel) {
            case MODEL_CENTRAL_CARDINAL_4 -> List.of("CENTRAL", "N", "E", "S", "W");
            case MODEL_CENTRAL_CARDINAL_8 -> FULL_CANONICAL_ORDER;
            case MODEL_DIRECTIONAL_8 -> FULL_CANONICAL_ORDER.stream()
                    .filter(k -> !CENTRAL.equals(k))
                    .toList();
            default -> throw new IllegalArgumentException("Unknown region_model: " + regionModel);
        };
    }

    /**
     * Stable display_order for a region_key, from the fixed canonical ordering
     * (CENTRAL=0, N=1, E=2, S=3, W=4, NE=5, SE=6, SW=7, NW=8).
     */
    static int displayOrder(String regionKey) {
        int idx = FULL_CANONICAL_ORDER.indexOf(regionKey);
        if (idx < 0) {
            throw new IllegalArgumentException("Unknown region_key: " + regionKey);
        }
        return idx;
    }

    /**
     * True iff an area's bbox is complete enough to be used as-is (no centroid fallback for
     * any of its 4 corners) — i.e. {@code minLat}, {@code maxLat}, {@code minLon}, and
     * {@code maxLon} are all non-null.
     *
     * <p>Mirrors, field-for-field, the per-coordinate null-coalescing fallback in
     * {@code CityRegionOnboardingService#upsertCityRegions} (each of
     * {@code m.minLat() != null ? m.minLat() : m.geoCenterLat()}, and likewise for
     * {@code maxLat}/{@code minLon}/{@code maxLon}): that method already falls back to the
     * area's centroid independently per coordinate whenever a given field is {@code null}, so
     * "all 4 present" is exactly the condition under which an area contributes zero centroid
     * fallbacks to a region's bounds union. This method does not check for a degenerate box
     * (e.g. {@code minLat >= maxLat}) because {@code upsertCityRegions} does not test for that
     * either — degenerate/malformed bboxes are a separate, currently-undetected data-quality
     * concern (see #1887), not part of this null-based completeness predicate.
     */
    static boolean hasCompleteValidBbox(Double minLat, Double maxLat, Double minLon, Double maxLon) {
        return minLat != null && maxLat != null && minLon != null && maxLon != null;
    }

    private static void requireValidModel(String regionModel) {
        if (!MODEL_CENTRAL_CARDINAL_4.equals(regionModel)
                && !MODEL_CENTRAL_CARDINAL_8.equals(regionModel)
                && !MODEL_DIRECTIONAL_8.equals(regionModel)) {
            throw new IllegalArgumentException("Unknown region_model: " + regionModel);
        }
    }
}
