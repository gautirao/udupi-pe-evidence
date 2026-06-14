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

import java.util.List;

/**
 * Authenticated endpoint for paginated listing discovery.
 *
 * <p>GET /api/discover/listings
 *
 * <p>All query params are optional except {@code city}. Pagination defaults: page=0, size=20.
 * Price params ({@code priceMin}/{@code priceMax}) are in rupees and converted to paise (×100).
 */
@RestController
@RequestMapping("/api/discover/listings")
public class DiscoverListingsController {

    private static final Logger log = LoggerFactory.getLogger(DiscoverListingsController.class);

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 50;

    private static final TypeReference<List<List<Double>>> POLYGON_TYPE =
            new TypeReference<>() {};

    private final DiscoverListingsPort service;
    private final ObjectMapper objectMapper;

    public DiscoverListingsController(DiscoverListingsPort service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @GetMapping
    public ResponseEntity<DiscoverListingsPage> getListings(
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
            @RequestParam(name = "q", required = false) String q,
            @RequestParam(name = "bbox", required = false) String bboxParam,
            @RequestParam(name = "page", required = false, defaultValue = "0") int page,
            @RequestParam(name = "size", required = false, defaultValue = "20") int size,
            @RequestParam(name = "includeAggregates", required = false, defaultValue = "false") boolean includeAggregates,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose
    ) {
        log.debug("GET /api/discover/listings city={} page={} size={}", city, page, size);

        // Validate page
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page_must_be_non_negative");
        }

        // Clamp size
        int effectiveSize = Math.max(1, Math.min(size, MAX_SIZE));

        // Validate q length
        if (q != null && q.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "q_exceeds_max_length");
        }

        // Validate partial school params
        if ((schoolLat == null) != (schoolLon == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_lat_and_lon_required_together");
        }

        // Parse and validate polygon
        List<List<Double>> polygon = parsePolygon(polygonJson);

        // Parse and validate bbox
        DiscoverListingPredicateBuilder.Bbox bbox = BboxParser.parse(bboxParam);

        // Convert rupees → paise
        Long priceMinPaise = priceMin != null ? priceMin * 100L : null;
        Long priceMaxPaise = priceMax != null ? priceMax * 100L : null;

        DiscoverListingsQuery query = new DiscoverListingsQuery(
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
                q,
                bbox,
                page,
                effectiveSize,
                includeAggregates,
                listingPurpose
        );

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(service.getListings(query));
    }

    /**
     * Parses a JSON polygon string (e.g. {@code [[13.3,74.7],[13.4,74.8],[13.3,74.8]]}).
     * Returns null when the param is absent/blank.
     * Throws 400 when polygon is present but has fewer than 3 vertices.
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
