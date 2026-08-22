package com.example.realestate.geo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Geocoding service backed by Nominatim (OpenStreetMap).
 * <p>
 * Caches results in geocode_cache table to avoid redundant API calls.
 * Applies locality simplification (noise-word removal) before querying Nominatim.
 * Nominatim rate limit: 1 req/sec — callers are responsible for throttling between listings.
 */
@Service
public class GeocodingService implements GeocodingPort {

    private static final Logger log = LoggerFactory.getLogger(GeocodingService.class);

    private static final String NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
    private static final String NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
    private static final String NOMINATIM_BASE = NOMINATIM_SEARCH; // kept for existing geocode() path
    private static final String USER_AGENT = "UdupiPropertyTracker/1.0 (property listing aggregator)";

    private static final Set<String> NOISE_WORDS = Set.of(
            "highway", "road", "rd", "street", "st", "lane", "ln", "avenue", "ave",
            "junction", "jn", "jnc", "circle", "square", "cross", "crossing",
            "beach", "temple", "church", "mosque", "school", "college", "hospital",
            "near", "opp", "opposite", "behind", "beside", "main", "bypass",
            "nh", "sh", "mh", "east", "west", "north", "south"
    );

    private final GeocodeCacheRepository cacheRepository;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public GeocodingService(GeocodeCacheRepository cacheRepository) {
        this.cacheRepository = cacheRepository;
        this.httpClient = HttpClient.newHttpClient();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Result of a geocoding operation.
     */
    public record GeoResult(
            double latitude,
            double longitude,
            String displayName,
            String country,
            String region,
            String city,
            String locality,
            String neighborhood) {
    }

    /**
     * Geocode a locality string to coordinates.
     * Checks DB cache first, then queries Nominatim with progressive simplification.
     *
     * @return GeoResult or null if geocoding fails
     */
    @Override
    public GeoResult geocode(String locality) {
        if (locality == null || locality.isBlank()) return null;

        String normalized = locality.trim().toLowerCase();

        // 1. Cache lookup (original)
        Optional<GeocodeCache> cached = cacheRepository.findByLocalityIgnoreCase(normalized);
        if (cached.isPresent()) {
            log.debug("geocode cache hit locality={}", normalized);
            return toGeoResult(cached.get(), locality);
        }

        // 2. Simplify and check cache for simplified form
        String simplified = simplify(locality.trim());
        if (!simplified.equalsIgnoreCase(normalized)) {
            Optional<GeocodeCache> simplifiedCached = cacheRepository.findByLocalityIgnoreCase(simplified.toLowerCase());
            if (simplifiedCached.isPresent()) {
                log.debug("geocode cache hit (simplified) locality={}", simplified);
                saveCache(normalized, simplifiedCached.get().getLatitude(),
                        simplifiedCached.get().getLongitude(), simplifiedCached.get().getDisplayName());
                return toGeoResult(simplifiedCached.get(), locality);
            }
        }

        // 3. Build search variations and call Nominatim
        List<String> variations = buildVariations(simplified);
        for (String term : variations) {
            NominatimHit hit = callNominatim(term);
            if (hit != null) {
                saveCache(normalized, hit.latitude(), hit.longitude(), null);
                String country = firstNonBlank(hit.address(), "country");
                String region = firstNonBlank(hit.address(), "state");
                String city = firstNonBlank(hit.address(),
                        "city", "town", "village", "municipality", "county", "state_district");
                String neighborhood = firstNonBlank(hit.address(), "suburb", "neighbourhood", "quarter");
                return new GeoResult(hit.latitude(), hit.longitude(), null, country, region, city, locality, neighborhood);
            }
        }

        log.warn("geocode failed for locality={}", locality);
        return null;
    }

    // ===== Interactive geocode proxy (AddressPicker) =====

    /**
     * Result DTO for the interactive geocode proxy endpoints.
     * Mirrors the Nominatim JSON shape expected by the frontend geocode.ts.
     */
    public record PlaceResult(
            double lat,
            double lon,
            String display_name,
            Map<String, String> address) {}

    /**
     * Forward geocode: returns up to {@code limit} matching places from Nominatim.
     * Viewbox bounded to coastal Karnataka; countrycodes=in for relevance.
     * Uses server-side User-Agent to comply with Nominatim usage policy.
     */
    public List<PlaceResult> searchPlaces(String query, int limit) {
        if (query == null || query.isBlank()) return Collections.emptyList();

        try {
            URI uri = UriComponentsBuilder.fromHttpUrl(NOMINATIM_SEARCH)
                    .queryParam("q", query)
                    .queryParam("format", "json")
                    .queryParam("addressdetails", "1")
                    .queryParam("limit", Math.min(Math.max(limit, 1), 10))
                    .queryParam("countrycodes", "in")
                    .queryParam("viewbox", "74.5,13.0,75.1,13.7")
                    .queryParam("bounded", "0")
                    .build(false).encode().toUri();

            HttpRequest request = HttpRequest.newBuilder(uri)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept-Language", "en")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Nominatim search HTTP {} for query={}", response.statusCode(), query);
                return Collections.emptyList();
            }
            JsonNode results = objectMapper.readTree(response.body());
            List<PlaceResult> places = new ArrayList<>();
            for (JsonNode node : results) {
                places.add(new PlaceResult(
                        node.path("lat").asDouble(),
                        node.path("lon").asDouble(),
                        node.path("display_name").asText(""),
                        parseAddressNode(node.path("address"))));
            }
            log.debug("Nominatim search query={} results={}", query, places.size());
            return places;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while searching places for query={}", query, e);
            return Collections.emptyList();
        } catch (Exception e) {
            log.warn("Nominatim search error for query={}: {}", query, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * Reverse geocode: get a display name + address for a lat/lon pair via Nominatim.
     * Returns null if the call fails or no result is found.
     */
    public PlaceResult reverseGeocodePlace(double lat, double lon) {
        URI uri = UriComponentsBuilder.fromHttpUrl(NOMINATIM_REVERSE)
                .queryParam("lat", lat)
                .queryParam("lon", lon)
                .queryParam("format", "json")
                .queryParam("addressdetails", "1")
                .build(true).toUri();

        try {
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept-Language", "en")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Nominatim reverse HTTP {} lat={} lon={}", response.statusCode(), lat, lon);
                return null;
            }
            JsonNode node = objectMapper.readTree(response.body());
            if (!node.has("display_name")) return null;
            return new PlaceResult(
                    node.path("lat").asDouble(),
                    node.path("lon").asDouble(),
                    node.path("display_name").asText(""),
                    parseAddressNode(node.path("address")));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while reverse geocoding lat={} lon={}", lat, lon, e);
            return null;
        } catch (Exception e) {
            log.warn("Nominatim reverse error lat={} lon={}: {}", lat, lon, e.getMessage());
            return null;
        }
    }

    private static Map<String, String> parseAddressNode(JsonNode addr) {
        Map<String, String> map = new HashMap<>();
        if (addr == null || addr.isMissingNode()) return map;
        addr.fields().forEachRemaining(entry -> {
            if (entry.getValue().isTextual()) {
                map.put(entry.getKey(), entry.getValue().asText());
            }
        });
        return map;
    }

    // ===== Nominatim call =====

    /**
     * Result of a single successful Nominatim search hit: coordinates plus the raw
     * {@code address} breakdown (only populated when {@code addressdetails=1} is requested).
     */
    record NominatimHit(double latitude, double longitude, Map<String, String> address) {}

    private NominatimHit callNominatim(String term) {
        String searchQuery = term + ", Karnataka, India";

        try {
            URI uri = UriComponentsBuilder.fromHttpUrl(NOMINATIM_BASE)
                    .queryParam("q", searchQuery)
                    .queryParam("format", "json")
                    .queryParam("addressdetails", "1")
                    .queryParam("limit", "1")
                    .queryParam("countrycodes", "in")
                    .build(false).encode().toUri();

            HttpRequest request = HttpRequest.newBuilder(uri)
                    .header("User-Agent", USER_AGENT)
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Nominatim HTTP {} for term={}", response.statusCode(), term);
                return null;
            }

            JsonNode results = objectMapper.readTree(response.body());
            if (results.isEmpty()) {
                log.debug("Nominatim no results for term={}", term);
                return null;
            }

            JsonNode first = results.get(0);
            double lat = first.get("lat").asDouble();
            double lon = first.get("lon").asDouble();
            Map<String, String> address = parseAddressNode(first.path("address"));
            log.debug("Nominatim success term={} lat={} lon={}", term, lat, lon);
            return new NominatimHit(lat, lon, address);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while querying Nominatim for term={}", term, e);
            return null;
        } catch (Exception e) {
            log.warn("Nominatim error for term={}: {}", term, e.getMessage());
            return null;
        }
    }

    /**
     * Returns the first non-blank value found in {@code address} across {@code keys}, in order.
     * Nominatim's address breakdown does not always carry a {@code city} field (e.g. a town-level
     * settlement like Manipal has only {@code town}); this mirrors OSM's own place-type fallback
     * chain (city &gt; town &gt; village &gt; municipality &gt; county &gt; state_district).
     */
    private static String firstNonBlank(Map<String, String> address, String... keys) {
        for (String key : keys) {
            String value = address.get(key);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    // ===== Helpers =====

    private void saveCache(String locality, double lat, double lon, String displayName) {
        try {
            cacheRepository.save(new GeocodeCache(locality, lat, lon, displayName,
                    OffsetDateTime.now(ZoneOffset.UTC)));
        } catch (DataIntegrityViolationException e) {
            // Race condition: another thread cached same locality — ignore
        }
    }

    private static GeoResult toGeoResult(GeocodeCache c, String originalLocality) {
        return new GeoResult(c.getLatitude(), c.getLongitude(), c.getDisplayName(),
                null, null, null, originalLocality, null);
    }

    static String simplify(String locality) {
        String simplified = locality.toLowerCase();
        for (String word : NOISE_WORDS) {
            simplified = simplified.replaceAll("(?i)\\b" + Pattern.quote(word) + "\\b", "");
        }
        simplified = simplified
                .replaceAll("[-–—]", " ")
                .replaceAll("[()\\[\\]{}]", "")
                .replaceAll("\\s+", " ")
                .replaceAll("^\\s*,\\s*", "")
                .replaceAll("\\s*,\\s*$", "")
                .replaceAll(",\\s*,", ",")
                .trim();

        List<String> parts = new ArrayList<>();
        for (String p : simplified.split(",")) {
            String trimmed = p.trim();
            if (trimmed.length() > 2) parts.add(trimmed);
        }
        return parts.isEmpty() ? locality.trim() : String.join(", ", parts);
    }

    private static List<String> buildVariations(String simplified) {
        List<String> variations = new ArrayList<>();
        variations.add(simplified);
        String[] parts = simplified.split(",");
        if (parts.length >= 2) {
            variations.add(parts[0].trim() + ", " + parts[parts.length - 1].trim());
        }
        if (parts.length >= 1 && !parts[0].trim().equals(simplified)) {
            variations.add(parts[0].trim());
        }
        return variations;
    }
}
