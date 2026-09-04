package com.example.realestate.discover;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Package-private utility for parsing and validating the {@code bbox} query parameter.
 *
 * <p>Shared by {@link DiscoverListingsController} and {@link DiscoverMarkersController}
 * so the validation contract is defined exactly once.
 *
 * <p>Expected format: {@code "south,west,north,east"} (comma-separated finite doubles).
 * Validation rules:
 * <ul>
 *   <li>Exactly 4 tokens</li>
 *   <li>All tokens parse as finite doubles</li>
 *   <li>south, north ∈ [-90, 90]</li>
 *   <li>west, east ∈ [-180, 180]</li>
 *   <li>south ≤ north</li>
 *   <li>west ≤ east (antimeridian crossing not supported in MVP)</li>
 * </ul>
 * A null or blank input returns {@code null} (param is optional; backward compatible).
 *
 * <p>Public so {@code com.example.realestate.savedsearch} can reuse this exact validation
 * logic (#2019 Slice A review ruling) instead of re-implementing it — narrowest-widening
 * reuse rather than a duplicated copy.
 */
public final class BboxParser {

    private BboxParser() {}

    public static DiscoverListingPredicateBuilder.Bbox parse(String bboxParam) {
        if (bboxParam == null || bboxParam.isBlank()) return null;
        String[] parts = bboxParam.split(",", -1);
        if (parts.length != 4) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_must_have_4_values");
        }
        double south, west, north, east;
        try {
            south = Double.parseDouble(parts[0].trim());
            west  = Double.parseDouble(parts[1].trim());
            north = Double.parseDouble(parts[2].trim());
            east  = Double.parseDouble(parts[3].trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_values_must_be_numeric");
        }
        if (!Double.isFinite(south) || !Double.isFinite(west) || !Double.isFinite(north) || !Double.isFinite(east)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_values_must_be_finite");
        }
        if (south < -90 || south > 90 || north < -90 || north > 90) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_lat_out_of_range");
        }
        if (west < -180 || west > 180 || east < -180 || east > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_lon_out_of_range");
        }
        if (south > north) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_south_must_be_lte_north");
        }
        if (west > east) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "bbox_west_must_be_lte_east");
        }
        return new DiscoverListingPredicateBuilder.Bbox(south, west, north, east);
    }
}
