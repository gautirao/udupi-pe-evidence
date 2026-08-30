package com.example.realestate.discover.navigation;

import java.math.BigDecimal;

/**
 * A canonical area's geometry as seen by {@link NavigationTreeGenerator} — geometry ONLY, never
 * listing data (#1955 D4 listing-independence contract).
 */
public record GeneratorArea(
        String areaKey, String name,
        BigDecimal centreLat, BigDecimal centreLon,
        BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon) {
}
