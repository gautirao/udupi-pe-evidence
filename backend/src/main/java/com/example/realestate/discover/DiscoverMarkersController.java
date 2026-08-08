package com.example.realestate.discover;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.example.realestate.discover.navigation.NavigationGraphCache;
import com.example.realestate.discover.navigation.NavigationGraph;

import java.util.List;

/**
 * Authenticated endpoint for map marker discovery.
 *
 * <p>GET /api/discover/markers
 *
 * <p>Accepts the same filter params as {@link DiscoverListingsController} (minus pagination).
 * Returns up to 5000 markers. If the filtered set exceeds 5000 rows a WARN is logged and
 * the first 5000 are returned.
 */
@RestController
@RequestMapping("/api/discover/markers")
public class DiscoverMarkersController {

    private static final Logger log = LoggerFactory.getLogger(DiscoverMarkersController.class);

    private static final TypeReference<List<List<Double>>> POLYGON_TYPE =
            new TypeReference<>() {};

    private final DiscoverMarkersPort service;
    private final ObjectMapper objectMapper;
    private final NavigationGraphCache navigationGraphCache;

    public DiscoverMarkersController(DiscoverMarkersPort service, ObjectMapper objectMapper, NavigationGraphCache navigationGraphCache) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.navigationGraphCache = navigationGraphCache;
    }

    @GetMapping
    public ResponseEntity<DiscoverMarkersResponse> getMarkers(
            @RequestParam(name = "city") String city,
            @RequestParam(name = "propertyTypes", required = false) List<String> propertyTypes,
            @RequestParam(name = "priceMin", required = false) Long priceMin,
            @RequestParam(name = "priceMax", required = false) Long priceMax,
            @RequestParam(name = "dateFrom", required = false) String dateFrom,
            @RequestParam(name = "dateTo", required = false) String dateTo,
            @RequestParam(name = "bedrooms", required = false) List<Integer> bedrooms,
            @RequestParam(name = "sellerTypes", required = false) List<String> sellerTypes,
            @RequestParam(name = "backOnMarket", required = false) Boolean backOnMarket,
            @RequestParam(name = "newToMarket", required = false) Boolean newToMarket,
            @RequestParam(name = "reraRegistered", required = false) Boolean reraRegistered,
            @RequestParam(name = "readyToMove", required = false) Boolean readyToMove,
            @RequestParam(name = "polygon", required = false) String polygonJson,
            @RequestParam(name = "schoolLat", required = false) Double schoolLat,
            @RequestParam(name = "schoolLon", required = false) Double schoolLon,
            @RequestParam(name = "schoolRadiusKm", required = false) Double schoolRadiusKm,
            @RequestParam(name = "bbox", required = false) String bboxParam,
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose,
            @RequestParam(required = false) String excludePropertyType,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            @RequestParam(name = "nodeKey", required = false) String nodeKey
    ) {
        log.debug("GET /api/discover/markers city={}", city);

        // Validate q length
        if (q != null && q.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "q_exceeds_max_length");
        }

        // Validate partial school params
        if ((schoolLat == null) != (schoolLon == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_lat_and_lon_required_together");
        }

        // areaKeys: absent (null) = no area filter; present-but-empty = client bug → reject.
        List<String> effectiveAreaKeys = areaKeys;
        if (nodeKey != null) {
            NavigationGraph graph = navigationGraphCache.getActiveGraph(city)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "city_graph_not_found"));
            if (!graph.containsNodeKey(nodeKey)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_node_key");
            }
            if ("root".equals(nodeKey)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "node_listings_not_eligible: root node is excluded");
            }
            List<String> descendantAreas = graph.descendantAreaKeysOf(nodeKey);
            if (descendantAreas.size() > 15) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "node_listings_not_eligible: descendant area count exceeds 15");
            }
            effectiveAreaKeys = descendantAreas;
        } else if (areaKeys != null && areaKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty");
        }

        // Parse and validate polygon
        List<List<Double>> polygon = parsePolygon(polygonJson);

        // Parse and validate bbox
        DiscoverListingPredicateBuilder.Bbox bbox = BboxParser.parse(bboxParam);

        // Convert rupees → paise
        Long priceMinPaise = priceMin != null ? priceMin * 100L : null;
        Long priceMaxPaise = priceMax != null ? priceMax * 100L : null;

        List<String> excludeList = excludePropertyType != null ? List.of(excludePropertyType) : null;

        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                city,
                propertyTypes,
                priceMinPaise,
                priceMaxPaise,
                dateFrom,
                dateTo,
                bedrooms,
                sellerTypes,
                backOnMarket,
                newToMarket,
                reraRegistered,
                readyToMove,
                polygon,
                schoolLat,
                schoolLon,
                schoolRadiusKm,
                bbox,
                (q != null && !q.isBlank()) ? q.trim() : null,
                (listingPurpose != null && !listingPurpose.isBlank()) ? listingPurpose.trim() : null,
                excludeList,
                effectiveAreaKeys
        );

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.getMarkers(filters));
    }

    /**
     * Parses a JSON polygon string. Returns null when absent/blank.
     * Throws 400 when present but has fewer than 3 vertices.
     */
    private List<List<Double>> parsePolygon(String polygonJson) {
        if (polygonJson == null || polygonJson.isBlank()) return null;
        try {
            List<List<Double>> polygon = objectMapper.readValue(polygonJson, POLYGON_TYPE);
            if (polygon == null || polygon.size() < 3) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_must_have_at_least_3_vertices");
            }
            return polygon;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.debug("Unparseable polygon param: {}", polygonJson, e);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon_invalid_json");
        }
    }

}
