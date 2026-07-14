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
 *
 * <p>Two independent fetch pipelines, each with a 14-day cache guard:
 * <ul>
 *   <li><b>Amenity fetch</b> ({@link #fetchAndCacheAmenities}) — the standard 7-category
 *       amenity query, radius from {@link PoiQueryProfile}. Stores with
 *       {@code source='overpass'}, {@code approved=false} (requires broker review).</li>
 *   <li><b>Settlement fetch</b> ({@link #enrichSettlement}) — place nodes (town/village)
 *       and road-access ways, parameterised per property type. Stores with
 *       {@code source='overpass_settlement'}, {@code approved=true} (auto-approved).</li>
 * </ul>
 *
 * <p>The two caches are independent: running settlement enrichment eagerly on location
 * confirmation does NOT prevent the subsequent lazy amenity fetch when the broker opens
 * PoiManager.
 */
@Service
public class OverpassService {

    private static final Logger log = LoggerFactory.getLogger(OverpassService.class);

    private static final int CAP_PER_AMENITY_CATEGORY = 3;
    private static final int CAP_AMENITY_TOTAL        = 15;

    /** Result caps for settlement POIs (closest-first). */
    private static final int CAP_TOWN_CENTER   = 3;
    private static final int CAP_VILLAGE_CENTER = 5;
    private static final int CAP_HIGHWAY        = 2;

    /** Skip ways with more geometry nodes than this — prevents huge road segments. */
    private static final int MAX_WAY_GEOMETRY_NODES = 500;

    private static final String SOURCE            = "overpass";
    private static final String SOURCE_SETTLEMENT = "overpass_settlement";

    @Value("${app.overpass.url:https://overpass-api.de/api/interpreter}")
    private String primaryUrl;

    @Value("${app.overpass.fallback-url:https://overpass.kumi.systems/api/interpreter}")
    private String fallbackUrl;

    private final ListingPoiRepository repository;
    private final OverpassHttpClient httpClient;
    private final ObjectMapper objectMapper;

    /**
     * Production constructor — builds a real {@link java.net.http.HttpClient}
     * with 10-second connect and request timeouts.
     */
    @Autowired
    public OverpassService(ListingPoiRepository repository) {
        this.repository = repository;
        this.objectMapper = new ObjectMapper();
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
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                log.warn("Overpass request interrupted url={}", url, e);
                return Optional.empty();
            } catch (Exception e) {
                log.warn("Overpass request failed url={}: {}", url, e.getMessage());
                return Optional.empty();
            }
        };
    }

    /**
     * Test constructor — accepts an injectable {@link OverpassHttpClient} seam.
     */
    OverpassService(ListingPoiRepository repository, OverpassHttpClient httpClient) {
        this.repository = repository;
        this.httpClient = httpClient;
        this.objectMapper = new ObjectMapper();
        this.primaryUrl = "https://overpass-api.de/api/interpreter";
        this.fallbackUrl = "https://overpass.kumi.systems/api/interpreter";
    }

    // ===== Public API =====

    /**
     * Backward-compatible 3-arg facade — delegates to
     * {@link #fetchAndCacheAmenities(UUID, double, double, String)} with {@code propertyType="other"}.
     * Retained for existing call sites that do not yet pass property type.
     */
    public List<ListingPoi> fetchAndCache(UUID listingId, double lat, double lon) {
        return fetchAndCacheAmenities(listingId, lat, lon, "other");
    }

    /**
     * Fetch amenity POIs from Overpass for the given listing and persist them.
     *
     * <p>No-ops if a fresh Overpass amenity result already exists within the last 14 days.
     * Uses {@link PoiQueryProfile#forPropertyType(String)} to select the amenity search radius.
     * All inserts are all-or-nothing within a single transaction.
     * Stored with {@code source='overpass'} and {@code approved=false}.
     *
     * @param listingId    the listing to attach POIs to
     * @param lat          listing latitude
     * @param lon          listing longitude
     * @param propertyType listing property type (determines query radius via profile)
     * @return list of newly persisted rows; empty on cache hit or parse failure
     */
    @Transactional(rollbackFor = Exception.class)
    public List<ListingPoi> fetchAndCacheAmenities(UUID listingId, double lat, double lon, String propertyType) {
        if (repository.existsByListingIdAndSourceAndCreatedAtAfter(
                listingId, SOURCE, OffsetDateTime.now().minusDays(14))) {
            log.debug("overpass amenity cache hit listingId={}", listingId);
            return List.of();
        }

        PoiQueryProfile profile = PoiQueryProfile.forPropertyType(propertyType);
        String query = buildAmenityQuery(lat, lon, profile.amenityRadiusMeters());

        Optional<String> responseBody = httpClient.post(primaryUrl, query);
        if (responseBody.isEmpty()) {
            log.info("Overpass amenity primary failed, trying fallback listingId={}", listingId);
            responseBody = httpClient.post(fallbackUrl, query);
        }
        if (responseBody.isEmpty()) {
            log.warn("Both Overpass endpoints failed for amenities listingId={}", listingId);
            return List.of();
        }

        List<ListingPoi> pois = parseAmenityAndFilter(responseBody.get(), listingId, lat, lon);
        if (pois.isEmpty()) return List.of();

        List<ListingPoi> saved = repository.saveAll(pois);
        log.info("Overpass amenity inserted {} POIs for listingId={}", saved.size(), listingId);
        return saved;
    }

    /**
     * Fetch settlement POIs (place nodes + road-access ways) for the given listing.
     *
     * <p>No-ops if fresh settlement data already exists (14-day cache guard using
     * {@code source='overpass_settlement'} — independent from the amenity cache).
     * Also no-ops for property types where {@link PoiQueryProfile#hasSettlementQueries()}
     * is false (e.g. {@code apartment}).
     *
     * <p>All settlement POIs are stored with {@code source='overpass_settlement'} and
     * {@code approved=true} (auto-approved — they are factual map data, not broker content).
     *
     * @param listingId    the listing to enrich
     * @param lat          listing latitude
     * @param lon          listing longitude
     * @param propertyType listing property type (selects radii from profile)
     * @return list of newly persisted rows; empty on cache hit, no settlement data, or failure
     */
    @Transactional(rollbackFor = Exception.class)
    public List<ListingPoi> enrichSettlement(UUID listingId, double lat, double lon, String propertyType) {
        PoiQueryProfile profile = PoiQueryProfile.forPropertyType(propertyType);
        if (!profile.hasSettlementQueries()) {
            log.debug("settlement enrichment skipped (no queries for type={}) listingId={}", propertyType, listingId);
            return List.of();
        }

        if (repository.existsByListingIdAndSourceAndCreatedAtAfter(
                listingId, SOURCE_SETTLEMENT, OffsetDateTime.now().minusDays(14))) {
            log.debug("overpass settlement cache hit listingId={}", listingId);
            return List.of();
        }

        String query = buildSettlementQuery(lat, lon, profile);

        Optional<String> responseBody = httpClient.post(primaryUrl, query);
        if (responseBody.isEmpty()) {
            log.info("Overpass settlement primary failed, trying fallback listingId={}", listingId);
            responseBody = httpClient.post(fallbackUrl, query);
        }
        if (responseBody.isEmpty()) {
            log.warn("Both Overpass endpoints failed for settlement listingId={}", listingId);
            return List.of();
        }

        List<ListingPoi> pois = parseSettlementAndFilter(responseBody.get(), listingId, lat, lon);
        if (pois.isEmpty()) return List.of();

        List<ListingPoi> saved = repository.saveAll(pois);
        log.info("Overpass settlement inserted {} POIs for listingId={}", saved.size(), listingId);
        return saved;
    }

    // ===== Query builders =====

    private static String buildAmenityQuery(double lat, double lon, int radius) {
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

    /**
     * Builds an Overpass QL query for place nodes and road-access ways.
     * Only includes clauses for non-zero radii from the profile.
     * Uses {@code out geom;} so way geometry is returned for distance computation.
     */
    static String buildSettlementQuery(double lat, double lon, PoiQueryProfile profile) {
        StringBuilder sb = new StringBuilder("[out:json][timeout:30];\n(\n");
        if (profile.townRadiusMeters() > 0) {
            sb.append(String.format(
                    "  node[place~\"city|town\"](around:%d,%f,%f);\n",
                    profile.townRadiusMeters(), lat, lon));
        }
        if (profile.villageRadiusMeters() > 0) {
            sb.append(String.format(
                    "  node[place~\"village|hamlet|locality|suburb\"](around:%d,%f,%f);\n",
                    profile.villageRadiusMeters(), lat, lon));
        }
        if (profile.highwayRadiusMeters() > 0) {
            sb.append(String.format(
                    "  way[highway~\"trunk|primary|secondary|tertiary\"](around:%d,%f,%f);\n",
                    profile.highwayRadiusMeters(), lat, lon));
        }
        sb.append(");\nout geom;");
        return sb.toString();
    }

    // ===== Response parsers =====

    private List<ListingPoi> parseAmenityAndFilter(String json, UUID listingId,
                                                    double listingLat, double listingLon) {
        Map<String, List<ListingPoi>> byCategory = new HashMap<>();
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode elements = root.path("elements");
            if (!elements.isArray()) {
                log.warn("Overpass amenity response missing 'elements' array listingId={}", listingId);
                return List.of();
            }

            for (JsonNode el : elements) {
                if (el.path("id").isMissingNode() || el.path("id").isNull()) continue;
                if (el.path("lat").isMissingNode() || el.path("lat").isNull()) continue;
                if (el.path("lon").isMissingNode() || el.path("lon").isNull()) continue;
                if (el.path("tags").isMissingNode() || el.path("tags").isNull()) continue;

                long osmIdLong = el.get("id").asLong();
                double poiLat = el.get("lat").asDouble();
                double poiLon = el.get("lon").asDouble();

                Map<String, String> tags = toTagMap(el.get("tags"));
                PoiCategory cat = PoiCategory.from(tags);
                // Exclude settlement categories from amenity fetch
                if (cat == null
                        || cat == PoiCategory.TOWN_CENTER
                        || cat == PoiCategory.VILLAGE_CENTER
                        || cat == PoiCategory.HIGHWAY) continue;

                String name = tags.getOrDefault("name", tags.getOrDefault("amenity",
                        tags.getOrDefault("tourism", tags.getOrDefault("shop", "Unknown"))));

                ListingPoi poi = buildPoi(listingId, name, cat.name(),
                        poiLat, poiLon, listingLat, listingLon,
                        SOURCE, false, String.valueOf(osmIdLong));
                byCategory.computeIfAbsent(cat.name(), k -> new ArrayList<>()).add(poi);
            }
        } catch (Exception e) {
            log.error("Failed to parse Overpass amenity response listingId={}: {}", listingId, e.getMessage(), e);
            return List.of();
        }

        // Cap: top 3 per category, overall cap 15
        List<ListingPoi> result = new ArrayList<>();
        for (List<ListingPoi> bucket : byCategory.values()) {
            bucket.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));
            result.addAll(bucket.subList(0, Math.min(bucket.size(), CAP_PER_AMENITY_CATEGORY)));
        }
        if (result.size() > CAP_AMENITY_TOTAL) {
            result.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));
            result = new ArrayList<>(result.subList(0, CAP_AMENITY_TOTAL));
        }
        return result;
    }

    /**
     * Parse settlement Overpass response (place nodes + highway ways) and cap results.
     * Nodes: direct {@code lat}/{@code lon} from element.
     * Ways: find the nearest geometry node to the listing; skip ways with {@literal >}500 geometry nodes.
     */
    private List<ListingPoi> parseSettlementAndFilter(String json, UUID listingId,
                                                       double listingLat, double listingLon) {
        List<ListingPoi> townCenters   = new ArrayList<>();
        List<ListingPoi> villageCenters = new ArrayList<>();
        List<ListingPoi> highways      = new ArrayList<>();

        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode elements = root.path("elements");
            if (!elements.isArray()) {
                log.warn("Overpass settlement response missing 'elements' array listingId={}", listingId);
                return List.of();
            }

            for (JsonNode el : elements) {
                if (el.path("id").isMissingNode() || el.path("id").isNull()) continue;
                if (el.path("tags").isMissingNode() || el.path("tags").isNull()) continue;

                long osmIdLong = el.get("id").asLong();
                Map<String, String> tags = toTagMap(el.get("tags"));
                PoiCategory cat = PoiCategory.from(tags);
                if (cat == null) continue;

                String osmId = String.valueOf(osmIdLong);

                switch (cat) {
                    case TOWN_CENTER, VILLAGE_CENTER -> {
                        if (el.path("lat").isMissingNode() || el.path("lon").isMissingNode()) continue;
                        double poiLat = el.get("lat").asDouble();
                        double poiLon = el.get("lon").asDouble();
                        String name = tags.getOrDefault("name", tags.getOrDefault("place", "Unknown"));
                        ListingPoi poi = buildPoi(listingId, name, cat.name(),
                                poiLat, poiLon, listingLat, listingLon,
                                SOURCE_SETTLEMENT, true, osmId);
                        if (cat == PoiCategory.TOWN_CENTER) townCenters.add(poi);
                        else villageCenters.add(poi);
                    }
                    case HIGHWAY -> {
                        JsonNode geometry = el.path("geometry");
                        if (!geometry.isArray() || geometry.size() == 0) continue;
                        if (geometry.size() > MAX_WAY_GEOMETRY_NODES) {
                            log.debug("Skipping highway way id={} — {} geometry nodes (max {})",
                                    osmIdLong, geometry.size(), MAX_WAY_GEOMETRY_NODES);
                            continue;
                        }
                        // Find nearest geometry node to the listing
                        double nearestLat = 0, nearestLon = 0;
                        int nearestDist = Integer.MAX_VALUE;
                        for (JsonNode gn : geometry) {
                            if (gn.path("lat").isMissingNode() || gn.path("lon").isMissingNode()) continue;
                            double gLat = gn.get("lat").asDouble();
                            double gLon = gn.get("lon").asDouble();
                            int d = haversineMeters(listingLat, listingLon, gLat, gLon);
                            if (d < nearestDist) {
                                nearestDist = d;
                                nearestLat  = gLat;
                                nearestLon  = gLon;
                            }
                        }
                        if (nearestDist == Integer.MAX_VALUE) continue;
                        String name = extractHighwayName(tags, tags.getOrDefault("highway", ""));
                        ListingPoi poi = buildPoi(listingId, name, PoiCategory.HIGHWAY.name(),
                                nearestLat, nearestLon, listingLat, listingLon,
                                SOURCE_SETTLEMENT, true, osmId);
                        highways.add(poi);
                    }
                    default -> { /* no-op: amenity categories are not expected in settlement response */ }
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse Overpass settlement response listingId={}: {}", listingId, e.getMessage(), e);
            return List.of();
        }

        // Sort by distance and apply per-category caps
        townCenters.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));
        villageCenters.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));
        highways.sort(Comparator.comparingInt(ListingPoi::getDistanceMeters));

        List<ListingPoi> result = new ArrayList<>();
        result.addAll(townCenters.subList(0, Math.min(townCenters.size(), CAP_TOWN_CENTER)));
        result.addAll(villageCenters.subList(0, Math.min(villageCenters.size(), CAP_VILLAGE_CENTER)));
        result.addAll(highways.subList(0, Math.min(highways.size(), CAP_HIGHWAY)));
        return result;
    }

    // ===== Helpers =====

    private ListingPoi buildPoi(UUID listingId, String name, String category,
                                 double poiLat, double poiLon,
                                 double listingLat, double listingLon,
                                 String source, boolean approved, String osmId) {
        ListingPoi poi = new ListingPoi();
        poi.setListingId(listingId);
        poi.setName(name);
        poi.setCategory(category);
        poi.setLatitude(poiLat);
        poi.setLongitude(poiLon);
        poi.setDistanceMeters(haversineMeters(listingLat, listingLon, poiLat, poiLon));
        poi.setSource(source);
        poi.setOsmId(osmId);
        poi.setApproved(approved);
        poi.setPinned(false);
        return poi;
    }

    private static Map<String, String> toTagMap(JsonNode tagsNode) {
        Map<String, String> tags = new HashMap<>();
        tagsNode.fields().forEachRemaining(e -> tags.put(e.getKey(), e.getValue().asText("")));
        return tags;
    }

    /**
     * Derive a human-readable highway display name.
     * Priority: (1) {@code ref} tag normalized to "NH-66" style,
     * (2) {@code name} tag as-is, (3) tier label from highway value.
     */
    static String extractHighwayName(Map<String, String> tags, String highwayValue) {
        String ref = tags.get("ref");
        if (ref != null && !ref.isBlank()) {
            // Normalize "NH 66" → "NH-66", "SH 57" → "SH-57"
            return ref.trim().replaceAll("\\s+", "-");
        }
        String name = tags.get("name");
        if (name != null && !name.isBlank()) {
            return name.trim();
        }
        // Tier fallback
        return switch (highwayValue) {
            case "trunk"       -> "National Highway";
            case "primary"     -> "State Highway";
            case "secondary"   -> "District Road";
            case "tertiary"    -> "Local Road";
            default            -> "Road";
        };
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
