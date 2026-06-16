package com.example.realestate.listing.api;

import java.util.Map;
import java.util.Set;

/**
 * Canonical option contract for the 5 free-text agricultural land fields.
 *
 * <p>Validation mechanism: lightweight {@code Set<String>} constant check (not {@code @Pattern}).
 * Rationale: the canonical set will evolve as new soil/water/tenure categories are added for
 * future districts; a Set-of-strings constant is easier to extend and review than a regex
 * alternation, and avoids introducing a new annotation-processor dependency.
 *
 * <p>All keys are SCREAMING_SNAKE_CASE machine values stored in the database.
 * Display labels are English strings suitable for UI rendering.
 */
public final class AgriFieldOptions {

    private AgriFieldOptions() {}

    // -------------------------------------------------------------------------
    // water_source
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_WATER_SOURCES = Set.of(
            "BOREWELL",
            "WELL",
            "RIVER",
            "RAIN_FED",
            "POND",
            "STREAM",
            "NOT_AVAILABLE",
            "OTHER"
    );

    public static final Map<String, String> WATER_SOURCE_LABELS = Map.of(
            "BOREWELL",      "Borewell",
            "WELL",          "Open well",
            "RIVER",         "River",
            "RAIN_FED",      "Rain-fed",
            "POND",          "Pond",
            "STREAM",        "Stream",
            "NOT_AVAILABLE", "Not available",
            "OTHER",         "Other"
    );

    // -------------------------------------------------------------------------
    // soil_type
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_SOIL_TYPES = Set.of(
            "RED_LATERITE",
            "BLACK_COTTON",
            "ALLUVIAL",
            "SANDY_LOAM",
            "CLAY",
            "OTHER"
    );

    public static final Map<String, String> SOIL_TYPE_LABELS = Map.of(
            "RED_LATERITE",  "Red laterite",
            "BLACK_COTTON",  "Black cotton",
            "ALLUVIAL",      "Alluvial",
            "SANDY_LOAM",    "Sandy loam",
            "CLAY",          "Clay",
            "OTHER",         "Other"
    );

    // -------------------------------------------------------------------------
    // road_access
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_ROAD_ACCESS_VALUES = Set.of(
            "TARRED_ROAD",
            "KACHCHA_ROAD",
            "HIGHWAY_FRONTAGE",
            "NO_ROAD_ACCESS",
            "OTHER"
    );

    public static final Map<String, String> ROAD_ACCESS_LABELS = Map.of(
            "TARRED_ROAD",       "Tarred road",
            "KACHCHA_ROAD",      "Kachcha road",
            "HIGHWAY_FRONTAGE",  "Highway frontage",
            "NO_ROAD_ACCESS",    "No road access",
            "OTHER",             "Other"
    );

    // -------------------------------------------------------------------------
    // cultivation_status
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_CULTIVATION_STATUSES = Set.of(
            "CULTIVATED",
            "FALLOW",
            "ARECA_PLANTATION",
            "COCONUT_PLANTATION",
            "PARTIALLY_CULTIVATED",
            "OTHER"
    );

    public static final Map<String, String> CULTIVATION_STATUS_LABELS = Map.of(
            "CULTIVATED",           "Cultivated",
            "FALLOW",               "Fallow",
            "ARECA_PLANTATION",     "Areca plantation",
            "COCONUT_PLANTATION",   "Coconut plantation",
            "PARTIALLY_CULTIVATED", "Partially cultivated",
            "OTHER",                "Other"
    );

    // -------------------------------------------------------------------------
    // ownership_type
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_OWNERSHIP_TYPES = Set.of(
            "FREEHOLD",
            "INHERITED",
            "PATTA",
            "SURVEY_SETTLEMENT",
            "KATHA",
            "REVENUE",
            "OTHER"
    );

    public static final Map<String, String> OWNERSHIP_TYPE_LABELS = Map.of(
            "FREEHOLD",          "Freehold",
            "INHERITED",         "Inherited",
            "PATTA",             "Patta",
            "SURVEY_SETTLEMENT", "Survey settlement",
            "KATHA",             "Katha",
            "REVENUE",           "Revenue",
            "OTHER",             "Other"
    );
}
