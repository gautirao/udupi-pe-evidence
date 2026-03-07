package com.example.realestate.poi;

import java.util.Map;

/**
 * OSM tag-based categories for nearby points of interest.
 * <p>
 * Each enum constant maps one or more OSM tag pairs (key=value) to a logical category.
 * Use {@link #from(Map)} to resolve a category from a raw OSM tag map.
 */
public enum PoiCategory {

    WORSHIP,
    HOSPITAL,
    SCHOOL,
    HOTEL,
    TRANSPORT,
    AIRPORT,
    GROCERY;

    /**
     * Resolve a {@link PoiCategory} from a raw OSM tag map.
     * Iterates tag pairs in definition order and returns the first match.
     *
     * @param tags OSM tags for an element (never null)
     * @return matching category, or {@code null} if no tag pair matches
     */
    public static PoiCategory from(Map<String, String> tags) {
        if (tags == null || tags.isEmpty()) return null;

        String amenity = tags.get("amenity");
        String tourism = tags.get("tourism");
        String publicTransport = tags.get("public_transport");
        String highway = tags.get("highway");
        String railway = tags.get("railway");
        String aeroway = tags.get("aeroway");
        String shop = tags.get("shop");

        // amenity=place_of_worship → WORSHIP
        if ("place_of_worship".equals(amenity)) return WORSHIP;

        // amenity=hospital, amenity=clinic → HOSPITAL
        if ("hospital".equals(amenity) || "clinic".equals(amenity)) return HOSPITAL;

        // amenity=school, amenity=university, amenity=college → SCHOOL
        if ("school".equals(amenity) || "university".equals(amenity) || "college".equals(amenity)) return SCHOOL;

        // tourism=hotel, tourism=guest_house, amenity=hotel → HOTEL
        if ("hotel".equals(tourism) || "guest_house".equals(tourism) || "hotel".equals(amenity)) return HOTEL;

        // public_transport=stop_position, highway=bus_stop, railway=station → TRANSPORT
        if ("stop_position".equals(publicTransport) || "bus_stop".equals(highway) || "station".equals(railway)) return TRANSPORT;

        // aeroway=aerodrome → AIRPORT
        if ("aerodrome".equals(aeroway)) return AIRPORT;

        // shop=supermarket, shop=marketplace → GROCERY
        if ("supermarket".equals(shop) || "marketplace".equals(shop)) return GROCERY;

        return null;
    }
}
