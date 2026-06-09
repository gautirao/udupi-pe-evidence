package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Computes and persists city-relative direction × distance classifications for all areas.
 *
 * <p>For each (city, area) pair:
 * <ol>
 *   <li>Reads city geo_center_lat/lon and area geo_center_lat/lon from Postgres.</li>
 *   <li>Computes bearing (degrees) and distance (km) via {@link RegionalGeo}.</li>
 *   <li>Maps bearing → direction_key and distance → distance_band_key via {@link RegionalGeo}.</li>
 *   <li>Upserts into regional_area_classifications using ON CONFLICT(city_key, area_key) DO UPDATE.</li>
 * </ol>
 *
 * <p>Idempotency: ON CONFLICT guarantees a second run updates existing rows to stable values
 * (same geometry → same classification). No duplicate rows are ever inserted.
 *
 * <p>City-relativity: the same area_key can appear under multiple city_key values with
 * different (direction, band) classifications. This is correct — distance/direction is
 * always relative to the city geo_center.
 *
 * <p>Error handling: per-row errors are logged at WARN level; processing continues.
 * A single malformed geo record does not abort the entire run.
 */
@Service
public class RegionalClassificationBackfillService {

    private static final Logger log = LoggerFactory.getLogger(RegionalClassificationBackfillService.class);

    private final JdbcOperations jdbcOperations;

    public RegionalClassificationBackfillService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Runs the full backfill across all cities and their associated areas.
     * Logs a summary on completion.
     *
     * @return number of rows upserted
     */
    @Transactional
    public int runBackfill() {
        log.info("RegionalClassificationBackfill: starting backfill");

        List<CityRow> cities = jdbcOperations.query(
                CITIES_SQL,
                (rs, rowNum) -> new CityRow(
                        rs.getString("slug"),
                        rs.getDouble("geo_center_lat"),
                        rs.getDouble("geo_center_lon")
                )
        );

        log.info("RegionalClassificationBackfill: found {} cities", cities.size());

        int totalUpserted = 0;
        int totalErrors = 0;

        for (CityRow city : cities) {
            List<AreaRow> areas = jdbcOperations.query(
                    AREAS_FOR_CITY_SQL,
                    (rs, rowNum) -> new AreaRow(
                            rs.getString("area_key"),
                            rs.getDouble("geo_center_lat"),
                            rs.getDouble("geo_center_lon")
                    ),
                    city.slug()
            );

            log.info("RegionalClassificationBackfill: city={} areas={}", city.slug(), areas.size());

            for (AreaRow area : areas) {
                try {
                    double bearing = RegionalGeo.bearingDeg(
                            city.lat(), city.lon(),
                            area.lat(), area.lon());
                    double distanceKm = RegionalGeo.haversineKm(
                            city.lat(), city.lon(),
                            area.lat(), area.lon());
                    String directionKey = RegionalGeo.directionKey(bearing);
                    String bandKey = RegionalGeo.distanceBandKey(distanceKm);

                    jdbcOperations.update(UPSERT_SQL,
                            city.slug(), area.areaKey(),
                            directionKey, bandKey,
                            bearing, distanceKm);
                    totalUpserted++;
                } catch (Exception e) {
                    totalErrors++;
                    log.warn("RegionalClassificationBackfill: SKIP city={} area={} error={}",
                            city.slug(), area.areaKey(), e.getMessage());
                }
            }
        }

        log.info("RegionalClassificationBackfill: complete upserted={} errors={}",
                totalUpserted, totalErrors);
        return totalUpserted;
    }

    // ── Private row types ─────────────────────────────────────────────────────

    private record CityRow(String slug, double lat, double lon) {}

    private record AreaRow(String areaKey, double lat, double lon) {}

    // ── SQL ───────────────────────────────────────────────────────────────────

    private static final String CITIES_SQL = """
            SELECT slug, geo_center_lat, geo_center_lon
            FROM cities
            WHERE is_active = true
            ORDER BY slug
            """;

    /**
     * Fetch all 4-segment locality areas for a city via city slug.
     * Bound args: [city_slug].
     */
    private static final String AREAS_FOR_CITY_SQL = """
            SELECT a.area_key, a.geo_center_lat, a.geo_center_lon
            FROM areas a
            JOIN cities c ON c.id = a.city_id
            WHERE c.slug = ?
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
            ORDER BY a.area_key
            """;

    /**
     * Upsert a single (city_key, area_key) classification row.
     * ON CONFLICT(city_key, area_key) DO UPDATE makes this idempotent.
     * Bound args: [city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km].
     */
    private static final String UPSERT_SQL = """
            INSERT INTO regional_area_classifications
                (city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, now())
            ON CONFLICT (city_key, area_key)
            DO UPDATE SET
                direction_key     = EXCLUDED.direction_key,
                distance_band_key = EXCLUDED.distance_band_key,
                bearing_deg       = EXCLUDED.bearing_deg,
                distance_km       = EXCLUDED.distance_km,
                computed_at       = now()
            """;
}
