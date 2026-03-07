package com.example.realestate.poi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Fetches nearby points of interest from the Overpass API (OpenStreetMap)
 * and persists them in the {@code listing_pois} table.
 * <p>
 * Results are capped at 3 POIs per category (closest first) and 15 total.
 * A 14-day cache guard prevents redundant Overpass calls for the same listing.
 */
@Service
public class OverpassService {

    private static final Logger log = LoggerFactory.getLogger(OverpassService.class);

    private static final int CAP_PER_CATEGORY = 3;
    private static final int CAP_TOTAL = 15;
    private static final String SOURCE = "overpass";

    @Value("${app.overpass.url:https://overpass-api.de/api/interpreter}")
    private String primaryUrl;

    @Value("${app.overpass.fallback-url:https://overpass.kumi.systems/api/interpreter}")
    private String fallbackUrl;

    @Value("${app.overpass.radius-meters:1500}")
    private int radiusMeters;

    private final ListingPoiRepository repository;
    private final OverpassHttpClient httpClient;
    private final ObjectMapper objectMapper;

    /**
     * Production constructor — builds a real {@link java.net.http.HttpClient}
     * with 10-second connect and read timeouts matching the GeocodingService pattern.
     */
    @Autowired
    public OverpassService(ListingPoiRepository repository) {
        this.repository = repository;
        this.objectMapper = new ObjectMapper();
        // connectTimeout covers TCP handshake; HttpRequest.timeout() below covers full request (read included).
        // java.net.http.HttpClient.Builder has no separate readTimeout — the per-request timeout is sufficient.
        HttpClient realClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.httpClient = (url, body) -> {
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .POST(HttpRequest.BodyPublishers.ofString("data=" + body))
                        .timeout(Duration.ofSeconds(10))
                        .build();
                HttpResponse<String> response = realClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200) {
                    log.warn("Overpass HTTP {} from url={}", response.statusCode(), url);
                    return Optional.empty();
                }
                return Optional.of(response.body());
            } catch (Exception e) {
                log.warn("Overpass request failed url={}: {}", url, e.getMessage());
                return Optional.empty();
            }
        };
    }

    /**
     * Test constructor — accepts an injectable {@link OverpassHttpClient} seam.
     * Uses default Overpass URLs and radius so unit tests match production behaviour.
     */
    OverpassService(ListingPoiRepository repository, OverpassHttpClient httpClient) {
        this.repository = repository;
        this.httpClient = httpClient;
        this.objectMapper = new ObjectMapper();
        this.primaryUrl = "https://overpass-api.de/api/interpreter";
        this.fallbackUrl = "https://overpass.kumi.systems/api/interpreter";
        this.radiusMeters = 1500;
    }

    /**
     * Fetch POIs from Overpass for the given listing coordinates and persist them.
     * <p>
     * No-ops if a fresh Overpass result already exists within the last 14 days.
     * All inserts are all-or-nothing within a single transaction.
     *
     * @param listingId  the listing to attach POIs to
     * @param lat        listing latitude
     * @param lon        listing longitude
     * @return list of newly persisted {@link ListingPoi} rows (empty if cache hit or parse failure)
     */
    @Transactional(rollbackFor = Exception.class)
    public List<ListingPoi> fetchAndCache(UUID listingId, double lat, double lon) {
        // Cache guard: skip if fresh Overpass data already exists (within 14 days)
        if (repository.existsByListingIdAndSourceAndCreatedAtAfter(
                listingId, SOURCE, OffsetDateTime.now().minusDays(14))) {
            log.debug("overpass cache hit listingId={}", listingId);
            return List.of();
        }

        String query = buildQuery(lat, lon, radiusMeters);

        // Try primary, fall back to secondary
        Optional<String> responseBody = httpClient.post(primaryUrl, query);
        if (responseBody.isEmpty()) {
            log.info("Overpass primary failed, trying fallback listingId={}", listingId);
            responseBody = httpClient.post(fallbackUrl, query);
        }

        if (responseBody.isEmpty()) {
            log.warn("Both Overpass endpoints failed listingId={}", listingId);
            return List.of();
        }

        List<ListingPoi> pois = parseAndFilter(responseBody.get(), listingId, lat, lon);
        if (pois.isEmpty()) {
            return List.of();
        }

        List<ListingPoi> saved = repository.saveAll(pois);
        log.info("Overpass inserted {} POIs for listingId={}", saved.size(), listingId);
        return saved;
    }

    // ===== Query builder =====

    private static String buildQuery(double lat, double lon, int radius) {
        // Overpass QL: fetch all relevant node types within radius
        return String.format(
                "[out:json][timeout:25];" +
                "(" +
                "  node[amenity~\"place_of_worship|hospital|clinic|school|university|college|hotel\"](around:%d,%f,%f);" +
                "  node[tourism~\"hotel|guest_house\"](around:%d,%f,%f);" +
                "  node[public_transport=stop_position](around:%d,%f,%f);" +
                "  node[highway=bus_stop](around:%d,%f,%f);" +
                "  node[railway=station](around:%d,%f,%f);" +
                "  node[aeroway=aerodrome](around:%d,%f,%f);" +
                "  node[shop~\"supermarket|marketplace\"](around:%d,%f,%f);" +
                ");" +
                "out body;",
                radius, lat, lon,
                radius, lat, lon,
                radius, lat, lon,
                radius, lat, lon,
                radius, lat, lon,
                radius, lat, lon,
                radius, lat, lon
        );
    }

    // ===== Response parser =====

    private List<ListingPoi> parseAndFilter(String json, UUID listingId, double listingLat, double listingLon) {
        // Bucket by category, each bucket sorted by distance ASC
        Map<String, List<ListingPoi>> byCategory = new HashMap<>();

        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode elements = root.path("elements");
            if (!elements.isArray()) {
                log.warn("Overpass response missing 'elements' array listingId={}", listingId);
                return List.of();
            }

            for (JsonNode el : elements) {
                // Skip elements missing required fields
                if (el.path("id").isMissingNode() || el.path("id").isNull()) continue;
                if (el.path("lat").isMissingNode() || el.path("lat").isNull()) continue;
                if (el.path("lon").isMissingNode() || el.path("lon").isNull()) continue;
                if (el.path("tags").isMissingNode() || el.path("tags").isNull()) continue;

                long osmIdLong = el.get("id").asLong();
                double poiLat = el.get("lat").asDouble();
                double poiLon = el.get("lon").asDouble();
                JsonNode tagsNode = el.get("tags");

                // Build tags map
                Map<String, String> tags = new HashMap<>();
                tagsNode.fields().forEachRemaining(e -> tags.put(e.getKey(), e.getValue().asText("")));

                PoiCategory cat = PoiCategory.from(tags);
                if (cat == null) continue;

                String name = tags.getOrDefault("name", tags.getOrDefault("amenity",
                        tags.getOrDefault("tourism", tags.getOrDefault("shop", "Unknown"))));

                int distMeters = haversineMeters(listingLat, listingLon, poiLat, poiLon);

                ListingPoi poi = new ListingPoi();
                poi.setListingId(listingId);
                poi.setName(name);
                poi.setCategory(cat.name());
                poi.setLatitude(poiLat);
                poi.setLongitude(poiLon);
                poi.setDistanceMeters(distMeters);
                poi.setSource(SOURCE);
                poi.setOsmId(String.valueOf(osmIdLong));
                poi.setApproved(false);
                poi.setPinned(false);

                byCategory.computeIfAbsent(cat.name(), k -> new ArrayList<>()).add(poi);
            }
        } catch (Exception e) {
            log.error("Failed to parse Overpass response listingId={}: {}", listingId, e.getMessage(), e);
            return List.of();
        }

        // Cap: top 3 per category by distance ASC, then flatten; overall cap 15
        List<ListingPoi> result = new ArrayList<>();
        for (List<ListingPoi> bucket : byCategory.values()) {
            bucket.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));
            int limit = Math.min(bucket.size(), CAP_PER_CATEGORY);
            result.addAll(bucket.subList(0, limit));
        }

        if (result.size() > CAP_TOTAL) {
            result.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));
            result = new ArrayList<>(result.subList(0, CAP_TOTAL)); // copy to avoid subList view mutation hazard
        }

        return result;
    }

    // ===== Haversine =====

    /**
     * Compute great-circle distance in meters using the Haversine formula.
     * Earth radius: 6,371,000 m.
     */
    static int haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6_371_000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (int) Math.round(R * c);
    }
}
