package com.example.realestate.poi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/**
 * Fetches nearby POIs from Overpass API (OSM), computes Haversine distances,
 * and persists results into listing_pois with a 14-day cache guard.
 *
 * <p>Primary endpoint: overpass-api.de — on failure retries Kumi fallback.
 * Both fail → returns empty list; no exception propagates.
 */
@Service
public class OverpassService {

    private static final Logger log = LoggerFactory.getLogger(OverpassService.class);

    static final String PRIMARY_URL = "https://overpass-api.de/api/interpreter";
    static final String FALLBACK_URL = "https://overpass.kumi.systems/api/interpreter";

    private static final int CAP_PER_CATEGORY = 3;
    private static final int CAP_TOTAL = 15;
    private static final int CACHE_TTL_DAYS = 14;

    private final ListingPoiRepository repository;
    private final OverpassHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final int radiusMeters;

    /** Production constructor — wires in the real HTTP client. */
    public OverpassService(
            ListingPoiRepository repository,
            @Value("${app.overpass.radius-meters:1500}") int radiusMeters) {
        this(repository, buildDefaultHttpClient(), new ObjectMapper(), radiusMeters);
    }

    /** Package-private constructor for unit tests — accepts a mock HTTP client. */
    OverpassService(ListingPoiRepository repository, OverpassHttpClient httpClient,
                    ObjectMapper objectMapper, int radiusMeters) {
        this.repository = repository;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
        this.radiusMeters = radiusMeters;
    }

    /**
     * Fetches Overpass suggestions for a listing if the cache has expired (older than 14 days).
     * Returned list contains the newly persisted rows (unapproved, source='overpass').
     * Returns an empty list silently on any API failure.
     */
    public List<ListingPoi> fetchAndCache(UUID listingId, double lat, double lng) {
        if (isCacheValid(listingId)) {
            log.debug("Overpass cache hit for listing {}, skipping fetch", listingId);
            return repository.findByListingIdAndApproved(listingId, false);
        }

        String query = buildQuery(lat, lng);
        Optional<String> json = httpClient.post(PRIMARY_URL, query);
        if (json.isEmpty()) {
            log.warn("Primary Overpass endpoint failed for listing {}, trying Kumi fallback", listingId);
            json = httpClient.post(FALLBACK_URL, query);
        }
        if (json.isEmpty()) {
            log.warn("Both Overpass endpoints failed for listing {}, returning empty", listingId);
            return List.of();
        }

        List<ListingPoi> pois = parseAndCap(json.get(), listingId, lat, lng);
        pois.forEach(this::saveIfNotDuplicate);
        return pois;
    }

    // --- Visible for testing ---

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

    // --- Private helpers ---

    private boolean isCacheValid(UUID listingId) {
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(CACHE_TTL_DAYS);
        return repository.existsByListingIdAndSourceAndCreatedAtAfter(listingId, "overpass", cutoff);
    }

    private String buildQuery(double lat, double lng) {
        String around = String.format(Locale.ROOT, "around:%d,%.6f,%.6f", radiusMeters, lat, lng);
        return "[out:json][timeout:10];\n(\n"
                + nodeWay("amenity", "place_of_worship", around)
                + nodeWay("amenity", "hospital", around)
                + node("amenity", "clinic", around)
                + nodeWay("amenity", "school", around)
                + nodeWay("amenity", "university", around)
                + node("tourism", "hotel", around)
                + node("tourism", "guest_house", around)
                + node("tourism", "hostel", around)
                + node("amenity", "bus_station", around)
                + nodeWay("railway", "station", around)
                + nodeWay("aeroway", "aerodrome", around)
                + nodeWay("shop", "supermarket", around)
                + node("amenity", "marketplace", around)
                + ");\nout center;";
    }

    private static String node(String k, String v, String around) {
        return String.format("  node[\"%s\"=\"%s\"](%s);\n", k, v, around);
    }

    private static String nodeWay(String k, String v, String around) {
        return node(k, v, around)
                + String.format("  way[\"%s\"=\"%s\"](%s);\n", k, v, around);
    }

    private List<ListingPoi> parseAndCap(String json, UUID listingId, double lat, double lng) {
        List<ListingPoi> all = new ArrayList<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode elements = root.path("elements");
            for (JsonNode el : elements) {
                toListingPoi(el, listingId, lat, lng).ifPresent(all::add);
            }
        } catch (Exception e) {
            log.warn("Failed to parse Overpass response for listing {}: {}", listingId, e.getMessage());
            return List.of();
        }
        return applyCaps(all);
    }

    private Optional<ListingPoi> toListingPoi(JsonNode el, UUID listingId, double listingLat, double listingLng) {
        JsonNode tagsNode = el.path("tags");
        if (tagsNode.isMissingNode()) return Optional.empty();

        Map<String, String> tags = new LinkedHashMap<>();
        tagsNode.fields().forEachRemaining(e -> tags.put(e.getKey(), e.getValue().asText()));

        Optional<PoiCategory> cat = PoiCategory.from(tags);
        if (cat.isEmpty()) return Optional.empty();

        // Coordinates: node has lat/lon directly; way/relation has center{}
        double poiLat, poiLon;
        if (el.has("lat")) {
            poiLat = el.get("lat").asDouble();
            poiLon = el.get("lon").asDouble();
        } else {
            JsonNode center = el.path("center");
            if (center.isMissingNode()) return Optional.empty();
            poiLat = center.get("lat").asDouble();
            poiLon = center.get("lon").asDouble();
        }

        ListingPoi poi = new ListingPoi();
        poi.setListingId(listingId);
        poi.setName(tags.getOrDefault("name", cat.get().name().toLowerCase()));
        poi.setCategory(cat.get().name());
        poi.setLatitude(poiLat);
        poi.setLongitude(poiLon);
        poi.setDistanceMeters(haversineMeters(listingLat, listingLng, poiLat, poiLon));
        poi.setSource("overpass");
        poi.setOsmId(String.valueOf(el.get("id").asLong()));
        poi.setApproved(false);
        poi.setPinned(false);
        return Optional.of(poi);
    }

    private List<ListingPoi> applyCaps(List<ListingPoi> pois) {
        // Top 3 per category by distance, then total cap at 15
        return pois.stream()
                .sorted(Comparator.comparingInt(p -> Optional.ofNullable(p.getDistanceMeters()).orElse(Integer.MAX_VALUE)))
                .collect(Collectors.groupingBy(ListingPoi::getCategory))
                .values().stream()
                .flatMap(group -> group.stream().limit(CAP_PER_CATEGORY))
                .sorted(Comparator.comparingInt(p -> Optional.ofNullable(p.getDistanceMeters()).orElse(Integer.MAX_VALUE)))
                .limit(CAP_TOTAL)
                .collect(Collectors.toList());
    }

    private void saveIfNotDuplicate(ListingPoi poi) {
        if (poi.getOsmId() != null && repository.existsByListingIdAndOsmId(poi.getListingId(), poi.getOsmId())) {
            return;
        }
        repository.save(poi);
    }

    private static OverpassHttpClient buildDefaultHttpClient() {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(12))
                .build();
        return (url, queryBody) -> {
            try {
                String encoded = "data=" + URLEncoder.encode(queryBody, StandardCharsets.UTF_8);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(url))
                        .POST(HttpRequest.BodyPublishers.ofString(encoded))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .timeout(Duration.ofSeconds(12))
                        .build();
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() == 200) return Optional.of(response.body());
                log.warn("Overpass {} returned HTTP {}", url, response.statusCode());
                return Optional.empty();
            } catch (Exception e) {
                log.warn("Overpass HTTP call to {} failed: {}", url, e.getMessage());
                return Optional.empty();
            }
        };
    }
}
