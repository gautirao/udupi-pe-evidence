package com.example.realestate.discover;

import com.example.realestate.geo.GeocodingService;
import org.springframework.jdbc.core.JdbcOperations;

/**
 * Pure, stateless helpers for deriving a geocoded {@code area_key}/{@code area_label}/city id from
 * a {@link GeocodingService.GeoResult}. Extracted (#2263) from {@code ListingIngestionService} so
 * the scraper ingestion pipeline and the broker create/submit flow ({@code
 * com.example.realestate.listing.area.ListingAreaResolutionService}) compute these identically
 * instead of maintaining two divergent implementations.
 */
public final class GeocodedAreaKeyFormat {

    private GeocodedAreaKeyFormat() {
    }

    /**
     * Derives the matching {@code cities.id} from the geocoded city name. {@code cities.slug}
     * (V71) uses the APP-CITY vocabulary — {@code bangalore}, {@code mangalore}, {@code udupi},
     * {@code kundapur} — which is a DIFFERENT vocabulary from the ADMINISTRATIVE DISTRICT segment
     * normalised by {@code AreaKeyFormat.normaliseDistrictToken} (e.g. Kundapur's areas carry
     * district {@code "Udupi"} but city slug {@code "kundapur"} — see V71's header comment).
     * {@link #normalizeCityToSlug} is an INDEPENDENT, smaller alias set mapping common
     * geocoded-city-name variants to the actual {@code cities.slug} values.
     *
     * @return the matching {@code cities.id}, or null if no city row matches.
     */
    public static Integer resolveCityId(JdbcOperations jdbcOperations, GeocodingService.GeoResult geoResult) {
        if (geoResult == null || geoResult.city() == null || geoResult.city().isBlank()) {
            return null;
        }
        String citySlug = normalizeCityToSlug(geoResult.city());
        return jdbcOperations.query(
                "SELECT id FROM cities WHERE slug = ?",
                rs -> rs.next() ? rs.getInt("id") : null,
                citySlug);
    }

    /** See {@link #resolveCityId}'s javadoc for why this is a distinct alias set. */
    private static String normalizeCityToSlug(String rawCity) {
        String normalised = rawCity.trim().toLowerCase().replaceAll("\\s+", "-").replaceAll("[^a-z0-9\\-]", "");
        return switch (normalised) {
            case "bengaluru", "bengaluru-urban" -> "bangalore";
            case "mangaluru", "dakshina-kannada" -> "mangalore";
            case "kundapura" -> "kundapur";
            default -> normalised;
        };
    }

    /**
     * Compute a deterministic area_key from geocode result components.
     * Format: country|region|city|locality (lowercase, trimmed, spaces->-, punctuation removed)
     * Fallback: if locality is null, use neighborhood; if neighborhood is null, use city.
     *
     * @return normalized area_key, or null if insufficient components
     */
    public static String computeAreaKey(GeocodingService.GeoResult geoResult) {
        if (geoResult == null) {
            return null;
        }

        String country = normalizeAreaComponent(geoResult.country());
        String region = normalizeAreaComponent(geoResult.region());
        String city = normalizeAreaComponent(geoResult.city());

        // Locality fallback chain: locality -> neighborhood -> city
        String locality = normalizeAreaComponent(geoResult.locality());
        if (locality.isEmpty()) {
            locality = normalizeAreaComponent(geoResult.neighborhood());
        }
        if (locality.isEmpty()) {
            locality = city; // final fallback to city
        }

        // Require at least country and city for a meaningful area_key
        if (country.isEmpty() || city.isEmpty()) {
            return null;
        }

        return String.join("|", country, region, city, locality);
    }

    /**
     * Compute a human-readable area label for display.
     * Format: "Locality, City" or just "City" if locality not available.
     *
     * @return display label, or null if no city available
     */
    public static String computeAreaLabel(GeocodingService.GeoResult geoResult) {
        if (geoResult == null) {
            return null;
        }

        String city = geoResult.city();
        if (city == null || city.isBlank()) {
            return null;
        }

        // Locality fallback chain: locality -> neighborhood -> null
        String locality = geoResult.locality();
        if (locality == null || locality.isBlank()) {
            locality = geoResult.neighborhood();
        }

        if (locality != null && !locality.isBlank()) {
            return locality.trim() + ", " + city.trim();
        }
        return city.trim();
    }

    /**
     * Normalize a single area component for use in area_key:
     * - lowercase
     * - trim whitespace
     * - replace spaces with hyphens
     * - remove punctuation (keep only alphanumeric and hyphens)
     */
    private static String normalizeAreaComponent(String value) {
        if (value == null) {
            return "";
        }
        return value.trim()
                .toLowerCase()
                .replaceAll("\\s+", "-")
                .replaceAll("[^a-z0-9\\-]", "");
    }
}
