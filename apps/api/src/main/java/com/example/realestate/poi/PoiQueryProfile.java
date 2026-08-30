package com.example.realestate.poi;

/**
 * Per-property-type Overpass query radius configuration.
 * <p>
 * Profiles control how wide each search ring is for amenity POIs vs settlement
 * nodes (place=city|town|village|hamlet|...) vs road-access ways.
 *
 * <p>Radius semantics:
 * <ul>
 *   <li>{@code amenityRadiusMeters}  — radius for the standard 7-category amenity query.</li>
 *   <li>{@code townRadiusMeters}     — radius for {@code place~"city|town"} nodes; 0 = skip.</li>
 *   <li>{@code villageRadiusMeters}  — radius for {@code place~"village|hamlet|locality|suburb"}; 0 = skip.</li>
 *   <li>{@code highwayRadiusMeters}  — radius for {@code highway~"trunk|primary|secondary|tertiary"}; 0 = skip.</li>
 * </ul>
 */
public record PoiQueryProfile(
        int amenityRadiusMeters,
        int townRadiusMeters,
        int villageRadiusMeters,
        int highwayRadiusMeters
) {

    // ===== Named profiles =====

    /** Land plots: wide settlement search + road context. */
    public static final PoiQueryProfile LAND       = new PoiQueryProfile(3_000, 25_000, 15_000, 3_000);
    /** Houses: moderate settlement context + road. */
    public static final PoiQueryProfile HOUSE      = new PoiQueryProfile(1_500, 10_000, 10_000, 2_000);
    /** Apartments: amenities only — urban by definition; no settlement enrichment. */
    public static final PoiQueryProfile APARTMENT  = new PoiQueryProfile(1_500, 0, 0, 0);
    /** Commercial: moderate settlement + road context; smaller amenity ring. */
    public static final PoiQueryProfile COMMERCIAL = new PoiQueryProfile(1_000, 10_000, 10_000, 2_000);
    /** Fallback for unknown types: amenities only, 1500m. */
    public static final PoiQueryProfile DEFAULT    = new PoiQueryProfile(1_500, 0, 0, 0);

    // ===== Factory =====

    /**
     * Return the profile for the given property type string.
     * Never null — unknown types fall back to DEFAULT.
     */
    public static PoiQueryProfile forPropertyType(String propertyType) {
        if (propertyType == null) return DEFAULT;
        return switch (propertyType) {
            case "land"       -> LAND;
            case "house"      -> HOUSE;
            case "apartment"  -> APARTMENT;
            case "commercial", "commercial_building", "warehouse", "commercial_land" -> COMMERCIAL;
            default           -> DEFAULT;
        };
    }

    // ===== Convenience =====

    /**
     * {@code true} if at least one settlement query (place node or road way) should run.
     * When {@code false}, {@link OverpassService#enrichSettlement} exits early without
     * making any Overpass calls.
     */
    public boolean hasSettlementQueries() {
        return townRadiusMeters > 0 || villageRadiusMeters > 0 || highwayRadiusMeters > 0;
    }
}
