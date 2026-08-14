package com.example.realestate.discover.citylaunch;

import java.util.Map;

/**
 * Admin preview of a {@link CityLaunchRevision}'s Agricultural destination classification quality
 * (#2151 PR A) — GET {@code .../preview/agri}. API-only; no shopper-visible surface reads this.
 *
 * @param rowCount                     number of {@code sandbox_agri_destination_classification}
 *                                      rows generated for this revision
 * @param directionDistribution        row count grouped by {@code direction_key} (e.g. "N" -> 4)
 * @param distanceBandDistribution     row count grouped by {@code distance_band_key}
 * @param areasWithMissingCoordinates  count of this revision's ACTIVE {@code sandbox_areas} rows
 *                                      with a NULL {@code geo_center_lat}/{@code geo_center_lon}. A
 *                                      defensive diagnostic, expected to be 0 in production: {@code
 *                                      public.areas.geo_center_lat}/{@code geo_center_lon} are
 *                                      {@code DOUBLE PRECISION NOT NULL}, so an admin should not
 *                                      read a real 0 here as a meaningful "all coordinates present"
 *                                      confirmation — it simply means this diagnostic never fires
 *                                      under normal operation
 * @param originLat                    the city origin latitude used for every row in this revision
 * @param originLon                    the city origin longitude used for every row in this revision
 */
public record AgriPreviewResponse(
        int rowCount,
        Map<String, Long> directionDistribution,
        Map<String, Long> distanceBandDistribution,
        int areasWithMissingCoordinates,
        Double originLat,
        Double originLon) {
}
