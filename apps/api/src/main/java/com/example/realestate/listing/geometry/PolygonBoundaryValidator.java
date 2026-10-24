package com.example.realestate.listing.geometry;

import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.exception.ListingValidationException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Validates a GeoJSON polygon boundary string before it is persisted for an agricultural listing.
 *
 * <p>Checks run in order, failing fast on the first violation:
 * <ol>
 *   <li>Property type must be "agricultural_land"</li>
 *   <li>GeoJSON must parse as valid JSON</li>
 *   <li>GeoJSON type must be "Polygon"</li>
 *   <li>Coordinates must have exactly 1 ring (no holes)</li>
 *   <li>Ring must have ≥ 4 coordinates (≥ 3 distinct vertices + closure)</li>
 *   <li>Ring must be closed (first coord == last coord)</li>
 *   <li>All coordinates must be within India bounding box (lon 68–98, lat 6–38)</li>
 *   <li>DB: ST_IsValid must be true (catches self-intersections)</li>
 *   <li>DB: ST_Area must be ≤ 1×10⁸ m² (100 km²)</li>
 * </ol>
 *
 * <p>Steps 1–7 are pure Java (no DB call). Steps 8–9 require PostGIS.
 */
@Component
public class PolygonBoundaryValidator {

    private static final double INDIA_LON_MIN = 68.0;
    private static final double INDIA_LON_MAX = 98.0;
    private static final double INDIA_LAT_MIN = 6.0;
    private static final double INDIA_LAT_MAX = 38.0;
    private static final double AREA_CAP_SQM = 1e8; // 100 km²

    private final ListingRepository listingRepository;
    private final ObjectMapper objectMapper;

    public PolygonBoundaryValidator(ListingRepository listingRepository, ObjectMapper objectMapper) {
        this.listingRepository = listingRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Validates the boundary GeoJSON string for the given property type.
     *
     * @param geoJson      GeoJSON polygon string from the PUT request
     * @param propertyType the listing's property type (after applying the update)
     * @throws ListingValidationException with a specific error code if validation fails
     */
    public void validate(String geoJson, String propertyType) {
        // 1. Agri-type guard
        if (!"agricultural_land".equals(propertyType)) {
            fail("boundary is only accepted for agricultural_land listings", "BOUNDARY_NON_AGRI_TYPE");
        }

        // 2. JSON parseable
        JsonNode root;
        try {
            root = objectMapper.readTree(geoJson);
        } catch (Exception e) {
            fail("boundary is not valid JSON", "BOUNDARY_INVALID_JSON");
            return; // unreachable but satisfies compiler
        }

        // 3. GeoJSON type = Polygon
        JsonNode typeNode = root.get("type");
        if (typeNode == null || !"Polygon".equals(typeNode.asText())) {
            fail("boundary GeoJSON type must be 'Polygon'", "BOUNDARY_INVALID_TYPE");
        }

        // 4. Exactly 1 ring (no holes)
        JsonNode coordinatesNode = root.get("coordinates");
        if (coordinatesNode == null || !coordinatesNode.isArray() || coordinatesNode.size() != 1) {
            fail("boundary Polygon must have exactly 1 ring (no holes or multiple rings)", "BOUNDARY_HAS_HOLES");
        }

        JsonNode ring = coordinatesNode.get(0);
        if (!ring.isArray()) {
            fail("boundary ring must be an array of coordinates", "BOUNDARY_INVALID_TYPE");
        }

        // 5. Ring ≥ 4 coordinates
        if (ring.size() < 4) {
            fail("boundary ring must have at least 4 coordinates (3 distinct vertices + closure)", "BOUNDARY_TOO_FEW_VERTICES");
        }

        // 6. Ring closed (first == last)
        JsonNode first = ring.get(0);
        JsonNode last = ring.get(ring.size() - 1);
        if (!coordsEqual(first, last)) {
            fail("boundary ring is not closed: first and last coordinates must be equal", "BOUNDARY_NOT_CLOSED");
        }

        // 7. India bounding box (lon 68–98, lat 6–38)
        for (int i = 0; i < ring.size(); i++) {
            JsonNode coord = ring.get(i);
            if (!coord.isArray() || coord.size() < 2) {
                fail("boundary coordinate at index " + i + " is invalid", "BOUNDARY_INVALID_TYPE");
            }
            double lon = coord.get(0).asDouble();
            double lat = coord.get(1).asDouble();
            if (lon < INDIA_LON_MIN || lon > INDIA_LON_MAX || lat < INDIA_LAT_MIN || lat > INDIA_LAT_MAX) {
                fail("boundary coordinate [" + lon + "," + lat + "] is outside India bounding box", "BOUNDARY_OUTSIDE_INDIA");
            }
        }

        // 8. ST_IsValid (DB check — self-intersection)
        try {
            if (!listingRepository.isBoundaryGeometryValid(geoJson)) {
                fail("boundary polygon is self-intersecting or geometrically invalid", "BOUNDARY_INVALID_GEOMETRY");
            }
        } catch (ListingValidationException e) {
            throw e;
        } catch (Exception e) {
            fail("boundary geometry validation failed: " + e.getMessage(), "BOUNDARY_INVALID_GEOMETRY");
        }

        // 9. Area cap (DB check — ≤ 100 km²)
        try {
            double areaSqm = listingRepository.computeBoundaryAreaSqm(geoJson);
            if (areaSqm > AREA_CAP_SQM) {
                fail("boundary polygon area (" + (areaSqm / 1e6) + " km²) exceeds the 100 km² cap", "BOUNDARY_TOO_LARGE");
            }
        } catch (ListingValidationException e) {
            throw e;
        } catch (Exception e) {
            fail("boundary area computation failed: " + e.getMessage(), "BOUNDARY_INVALID_GEOMETRY");
        }
    }

    private static boolean coordsEqual(JsonNode a, JsonNode b) {
        if (a == null || b == null || !a.isArray() || !b.isArray()) return false;
        if (a.size() < 2 || b.size() < 2) return false;
        return Double.compare(a.get(0).asDouble(), b.get(0).asDouble()) == 0
                && Double.compare(a.get(1).asDouble(), b.get(1).asDouble()) == 0;
    }

    private static void fail(String message, String code) {
        throw new ListingValidationException(List.of(Map.of("error", message, "code", code)));
    }
}
