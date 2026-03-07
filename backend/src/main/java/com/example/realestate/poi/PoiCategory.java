package com.example.realestate.poi;

import java.util.Map;
import java.util.Optional;

public enum PoiCategory {
    WORSHIP,
    HOSPITAL,
    SCHOOL,
    HOTEL,
    TRANSPORT,
    AIRPORT,
    GROCERY;

    /** Map from a single OSM (key, value) pair to the category it belongs to. */
    private static final Map<String, PoiCategory> TAG_MAP = Map.ofEntries(
            Map.entry("amenity=place_of_worship", WORSHIP),
            Map.entry("amenity=hospital",         HOSPITAL),
            Map.entry("amenity=clinic",            HOSPITAL),
            Map.entry("amenity=school",            SCHOOL),
            Map.entry("amenity=university",        SCHOOL),
            Map.entry("tourism=hotel",             HOTEL),
            Map.entry("tourism=guest_house",       HOTEL),
            Map.entry("tourism=hostel",            HOTEL),
            Map.entry("amenity=bus_station",       TRANSPORT),
            Map.entry("railway=station",           TRANSPORT),
            Map.entry("aeroway=aerodrome",         AIRPORT),
            Map.entry("shop=supermarket",          GROCERY),
            Map.entry("amenity=marketplace",       GROCERY)
    );

    /**
     * Infer the category from the OSM tags on an element.
     * Returns the first matching category in priority order, or empty if none match.
     */
    public static Optional<PoiCategory> from(Map<String, String> tags) {
        for (Map.Entry<String, String> tag : tags.entrySet()) {
            PoiCategory cat = TAG_MAP.get(tag.getKey() + "=" + tag.getValue());
            if (cat != null) return Optional.of(cat);
        }
        return Optional.empty();
    }
}
