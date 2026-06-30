package com.example.realestate.listing.api;

import java.util.Map;
import java.util.Set;

/**
 * Canonical option contract for agricultural land listing fields.
 *
 * <h2>Wired sets (validated at the controller boundary via {@code rejectIfUnknown})</h2>
 * <ul>
 *   <li>{@link #VALID_WATER_SOURCES}</li>
 *   <li>{@link #VALID_SOIL_TYPES}</li>
 *   <li>{@link #VALID_ROAD_ACCESS_VALUES}</li>
 *   <li>{@link #VALID_CULTIVATION_STATUSES}</li>
 *   <li>{@link #VALID_OWNERSHIP_TYPES}</li>
 *   <li>{@link #VALID_LAND_CATEGORIES} — wired as of M38-10b (#1693)</li>
 * </ul>
 *
 * <h2>Author-only / forward sets (NOT wired to any current request field)</h2>
 * <p>These sets declare the M38 design vocabulary (ADR M38-03 §8.3) for the typed model
 * arriving in #1689 / M38-FU1. They carry zero runtime validation effect today. Wiring
 * any of them requires a post-audit distinct-value confirmation of production stored values
 * (see {@code no-live-smoke-shared-supabase} memory). A guard test
 * ({@code ListingFieldWiringGuardTest}) asserts no {@code validate*} method in
 * {@code ListingController} references these sets.
 * <ul>
 *   <li>{@link #VALID_FACING_VALUES} — for the future {@code facing} column</li>
 *   <li>{@link #VALID_POSSESSION_VALUES}</li>
 *   <li>{@link #VALID_FENCING_STATUSES} — forward enum for the future {@code boundaryFencingStatus}
 *       column that replaces the current {@code Boolean fencingDone} (#1689)</li>
 *   <li>{@link #VALID_TERRAIN_VALUES}</li>
 *   <li>{@link #VALID_WATER_DESIGN} — typed-model extension of {@link #VALID_WATER_SOURCES}</li>
 *   <li>{@link #VALID_SOIL_DESIGN} — typed-model extension of {@link #VALID_SOIL_TYPES}</li>
 *   <li>{@link #VALID_CROPS}</li>
 *   <li>{@link #VALID_LOCATION_FEATURES}</li>
 *   <li>{@link #VALID_CONVERSION_STATUSES}</li>
 *   <li>{@link #VALID_AGRI_AREA_UNITS}</li>
 *   <li>{@link #VALID_YN} — shared tri-state across agri, commercial and residential domains</li>
 * </ul>
 *
 * <p>All machine keys are SCREAMING_SNAKE_CASE (matching the stored DB value).
 * Display labels live only in the parallel {@code *_LABELS} map values — never in the
 * {@code VALID_*} sets.
 */
public final class AgriFieldOptions {

    private AgriFieldOptions() {}

    // =========================================================================
    // WIRED — validated at the ListingController request boundary
    // =========================================================================

    // -------------------------------------------------------------------------
    // water_source  (wired)
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
    // soil_type  (wired)
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
    // road_access  (wired)
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
    // cultivation_status  (wired)
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
    // ownership_type  (wired)
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

    // -------------------------------------------------------------------------
    // land_category  (wired as of M38-10b / #1693)
    //
    // Exact superset of the FE LAND_CATEGORY key set (src/lib/agriFieldLabels.ts):
    //   FARMLAND, PLANTATION, FARM_PLOT, AGRICULTURAL_PLOT, OTHER
    // Null / blank values are always accepted (rejectIfUnknown null/blank-accept semantics).
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_LAND_CATEGORIES = Set.of(
            "FARMLAND",
            "PLANTATION",
            "FARM_PLOT",
            "AGRICULTURAL_PLOT",
            "OTHER"
    );

    public static final Map<String, String> LAND_CATEGORY_LABELS = Map.of(
            "FARMLAND",          "Farmland",
            "PLANTATION",        "Plantation",
            "FARM_PLOT",         "Farm plot",
            "AGRICULTURAL_PLOT", "Agricultural plot",
            "OTHER",             "Other"
    );

    // =========================================================================
    // FORWARD / AUTHOR-ONLY — M38 design vocabulary (ADR §8.3); not wired today.
    // No validate* method in ListingController may reference these sets.
    // Wiring requires post-audit distinct-value confirmation (M38-FU7 follow-up).
    // =========================================================================

    // -------------------------------------------------------------------------
    // facing  (forward-only; future `facing` column in the typed agri model)
    // Design: East / West / North / South / North-East / North-West /
    //         South-East / South-West / Not sure
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_FACING_VALUES = Set.of(
            "EAST",
            "WEST",
            "NORTH",
            "SOUTH",
            "NORTH_EAST",
            "NORTH_WEST",
            "SOUTH_EAST",
            "SOUTH_WEST",
            "NOT_SURE"
    );

    public static final Map<String, String> FACING_LABELS = Map.of(
            "EAST",       "East",
            "WEST",       "West",
            "NORTH",      "North",
            "SOUTH",      "South",
            "NORTH_EAST", "North-East",
            "NORTH_WEST", "North-West",
            "SOUTH_EAST", "South-East",
            "SOUTH_WEST", "South-West",
            "NOT_SURE",   "Not sure"
    );

    // -------------------------------------------------------------------------
    // possession / availability  (forward-only)
    // Design: Immediate / Within 30 days / Later / Not sure
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_POSSESSION_VALUES = Set.of(
            "IMMEDIATE",
            "WITHIN_30_DAYS",
            "LATER",
            "NOT_SURE"
    );

    public static final Map<String, String> POSSESSION_LABELS = Map.of(
            "IMMEDIATE",      "Immediate",
            "WITHIN_30_DAYS", "Within 30 days",
            "LATER",          "Later",
            "NOT_SURE",       "Not sure"
    );

    // -------------------------------------------------------------------------
    // fencing_status  (forward-only)
    // Future enum column `boundaryFencingStatus` — replaces Boolean `fencingDone`
    // in the typed agri model (#1689). The Boolean column is UNTOUCHED this PR.
    // Design: Fully fenced / Partly fenced / Not fenced / Not sure
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_FENCING_STATUSES = Set.of(
            "FULLY_FENCED",
            "PARTLY_FENCED",
            "NOT_FENCED",
            "NOT_SURE"
    );

    public static final Map<String, String> FENCING_STATUS_LABELS = Map.of(
            "FULLY_FENCED",  "Fully fenced",
            "PARTLY_FENCED", "Partly fenced",
            "NOT_FENCED",    "Not fenced",
            "NOT_SURE",      "Not sure"
    );

    // -------------------------------------------------------------------------
    // terrain  (forward-only)
    // Design: Flat / Gently sloped / Sloped / Mixed / Not sure
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_TERRAIN_VALUES = Set.of(
            "FLAT",
            "GENTLY_SLOPED",
            "SLOPED",
            "MIXED",
            "NOT_SURE"
    );

    public static final Map<String, String> TERRAIN_LABELS = Map.of(
            "FLAT",          "Flat",
            "GENTLY_SLOPED", "Gently sloped",
            "SLOPED",        "Sloped",
            "MIXED",         "Mixed",
            "NOT_SURE",      "Not sure"
    );

    // -------------------------------------------------------------------------
    // water design  (forward-only; typed-model extension of VALID_WATER_SOURCES)
    // Design adds CANAL / NONE / NOT_SURE; differs from the wired flat-entity set.
    // Do NOT merge with VALID_WATER_SOURCES — the wired set covers the current field.
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_WATER_DESIGN = Set.of(
            "BOREWELL",
            "WELL",
            "POND",
            "STREAM",
            "CANAL",
            "NONE",
            "OTHER",
            "NOT_SURE"
    );

    public static final Map<String, String> WATER_DESIGN_LABELS = Map.of(
            "BOREWELL", "Borewell",
            "WELL",     "Open well",
            "POND",     "Pond",
            "STREAM",   "Stream",
            "CANAL",    "Canal",
            "NONE",     "None",
            "OTHER",    "Other",
            "NOT_SURE", "Not sure"
    );

    // -------------------------------------------------------------------------
    // soil design  (forward-only; typed-model extension of VALID_SOIL_TYPES)
    // Design vocabulary (ADR §8.3) differs from the wired set; kept separate.
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_SOIL_DESIGN = Set.of(
            "RED_SOIL",
            "BLACK_COTTON_SOIL",
            "LATERITE",
            "SANDY",
            "LOAMY",
            "CLAY",
            "ALLUVIAL",
            "MIXED",
            "NOT_SURE"
    );

    public static final Map<String, String> SOIL_DESIGN_LABELS = Map.of(
            "RED_SOIL",          "Red soil",
            "BLACK_COTTON_SOIL", "Black / cotton soil",
            "LATERITE",          "Laterite",
            "SANDY",             "Sandy",
            "LOAMY",             "Loamy",
            "CLAY",              "Clay",
            "ALLUVIAL",          "Alluvial",
            "MIXED",             "Mixed",
            "NOT_SURE",          "Not sure"
    );

    // -------------------------------------------------------------------------
    // crops  (forward-only; multi-valued child table in typed model)
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_CROPS = Set.of(
            "PADDY",
            "COCONUT",
            "ARECA_SUPARI",
            "CASHEW",
            "BANANA",
            "SUGARCANE",
            "VEGETABLES",
            "MANGO",
            "RUBBER",
            "PEPPER",
            "MIXED_PLANTATION",
            "FALLOW_OPEN"
    );

    public static final Map<String, String> CROP_LABELS = Map.ofEntries(
            Map.entry("PADDY",            "Paddy"),
            Map.entry("COCONUT",          "Coconut"),
            Map.entry("ARECA_SUPARI",     "Areca / supari"),
            Map.entry("CASHEW",           "Cashew"),
            Map.entry("BANANA",           "Banana"),
            Map.entry("SUGARCANE",        "Sugarcane"),
            Map.entry("VEGETABLES",       "Vegetables"),
            Map.entry("MANGO",            "Mango"),
            Map.entry("RUBBER",           "Rubber"),
            Map.entry("PEPPER",           "Pepper"),
            Map.entry("MIXED_PLANTATION", "Mixed plantation"),
            Map.entry("FALLOW_OPEN",      "Fallow / open")
    );

    // -------------------------------------------------------------------------
    // location_features  (forward-only; multi-valued child table in typed model)
    // Broker-declared, not platform-verified (ADR §10j).
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_LOCATION_FEATURES = Set.of(
            "COASTAL",
            "RIVERSIDE",
            "BACKWATER_FACING",
            "ROADSIDE",
            "NEAR_VILLAGE_ROAD",
            "NEAR_HIGHWAY",
            "NEAR_TEMPLE_LANDMARK"
    );

    public static final Map<String, String> LOCATION_FEATURE_LABELS = Map.of(
            "COASTAL",              "Coastal",
            "RIVERSIDE",            "Riverside",
            "BACKWATER_FACING",     "Backwater-facing",
            "ROADSIDE",             "Roadside",
            "NEAR_VILLAGE_ROAD",    "Near village road",
            "NEAR_HIGHWAY",         "Near highway",
            "NEAR_TEMPLE_LANDMARK", "Near temple / landmark"
    );

    // -------------------------------------------------------------------------
    // conversion_status  (forward-only; part of land-record section)
    // Design: Not converted / Conversion applied / Approved for conversion / Not sure
    // Framed as broker-declared records — never a verification flag (ADR §10k).
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_CONVERSION_STATUSES = Set.of(
            "NOT_CONVERTED",
            "CONVERSION_APPLIED",
            "APPROVED_FOR_CONVERSION",
            "NOT_SURE"
    );

    public static final Map<String, String> CONVERSION_STATUS_LABELS = Map.of(
            "NOT_CONVERTED",           "Not converted",
            "CONVERSION_APPLIED",      "Conversion applied",
            "APPROVED_FOR_CONVERSION", "Approved for conversion",
            "NOT_SURE",                "Not sure"
    );

    // -------------------------------------------------------------------------
    // agri area units  (forward-only; agri-domain area unit set for the typed model)
    // Residential omits Gunta; commercial omits Cent and Gunta (per-family sets differ).
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_AGRI_AREA_UNITS = Set.of(
            "ACRE",
            "CENT",
            "GUNTA",
            "SQ_FT"
    );

    public static final Map<String, String> AGRI_AREA_UNIT_LABELS = Map.of(
            "ACRE",  "Acre",
            "CENT",  "Cent",
            "GUNTA", "Gunta",
            "SQ_FT", "Sq.ft"
    );

    // -------------------------------------------------------------------------
    // YN tri-state  (forward-only; shared across agri, commercial and residential)
    // Used for irrigation, electricity, and any Yes/No/Not-sure field in the typed model.
    // NOT wired to Boolean farmhouseAvailable / fencingDone — those are Boolean columns
    // and Jackson already enforces true/false/null.
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_YN = Set.of(
            "YES",
            "NO",
            "NOT_SURE"
    );

    public static final Map<String, String> YN_LABELS = Map.of(
            "YES",      "Yes",
            "NO",       "No",
            "NOT_SURE", "Not sure"
    );
}
