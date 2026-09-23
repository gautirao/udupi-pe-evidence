package com.example.realestate.discover.citylaunch;

/**
 * A single real-world place candidate returned by a {@link CityGeocodingProvider} for a
 * city-name query (#2676 Slice A).
 *
 * <p>{@code minLat}/{@code minLon}/{@code maxLat}/{@code maxLon} are a coarse bounding box —
 * enough to seed {@code cities.min_lat}/{@code max_lat}/etc. so the city has SOME extent for
 * map framing. This is explicitly NOT the authoritative validated city boundary; Slice B
 * ("canonical geography acquisition") owns replacing it with a reviewed, versioned boundary.
 *
 * @param displayName human-readable disambiguation label, e.g. "Mysuru, Karnataka, India"
 * @param countryCode ISO 3166-1 alpha-2, e.g. "in"; may be null if the provider omits it
 * @param placeType   provider's place classification, e.g. "city"/"town"/"administrative"
 * @param lat          city-centre latitude
 * @param lon          city-centre longitude
 */
public record GeocodeCandidate(
        String displayName,
        String countryCode,
        String placeType,
        double lat,
        double lon,
        Double minLat,
        Double minLon,
        Double maxLat,
        Double maxLon) {
}
