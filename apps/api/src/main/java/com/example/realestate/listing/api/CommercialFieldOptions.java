package com.example.realestate.listing.api;

import java.util.Map;
import java.util.Set;

/**
 * Canonical option contract for commercial listing fields (M38 design vocabulary, ADR M38-03 §8.2).
 *
 * <p><b>Most sets in this class are AUTHOR-ONLY / FORWARD-ONLY — but not all.</b>
 * {@link #VALID_COMMERCIAL_OWNERSHIP} is WIRED, and wired TWICE:
 * <ul>
 *   <li>Since M38-FU2 / #1730 — {@code ListingController.validateCommercialFields} validates the
 *       typed per-subtype {@code commercialOwnership} field against it.</li>
 *   <li>Since #2063 — {@code ListingController.validateFamilyOwnershipType} ALSO validates the
 *       shared flat {@code ownershipType} field against it, for the COMMERCIAL family only (a
 *       deliberate narrowing mirroring #2048/PR #2057 decision D1 for RESIDENTIAL).</li>
 * </ul>
 * No OTHER field in the current flat {@code CreateRequest} / {@code UpdateRequest} is validated
 * against any other set here. Wiring those requires a post-audit distinct-value confirmation of
 * production stored values for the corresponding field (see {@code no-live-smoke-shared-supabase}
 * memory and M38-FU7 follow-up). The discriminated-union DTO that will consume these sets is
 * planned for #1689 / M38-FU2.
 *
 * <p>Commercial subtypes: shop/showroom, office, building, warehouse, commercial land.
 * Purpose: sale | rent | lease (all three apply to commercial; residential has no lease).
 *
 * <p>All machine keys are SCREAMING_SNAKE_CASE. Display labels live only in the parallel
 * {@code *_LABELS} map values — never in the {@code VALID_*} sets.
 */
public final class CommercialFieldOptions {

    private CommercialFieldOptions() {}

    // -------------------------------------------------------------------------
    // commercial_subtype
    // Design: Shop/Showroom / Office / Building / Warehouse / Land
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_COMMERCIAL_SUBTYPES = Set.of(
            "SHOP",
            "OFFICE",
            "BUILDING",
            "WAREHOUSE",
            "LAND"
    );

    public static final Map<String, String> COMMERCIAL_SUBTYPE_LABELS = Map.of(
            "SHOP",      "Shop / Showroom",
            "OFFICE",    "Office",
            "BUILDING",  "Commercial Building",
            "WAREHOUSE", "Warehouse / Godown",
            "LAND",      "Commercial Land"
    );

    // -------------------------------------------------------------------------
    // listing_purpose  (commercial)
    // Design: Sale / Rent / Lease
    // NOTE: The current flat `listingPurpose` field is a free string; wiring to this
    // set requires a production distinct-value audit before enforcement.
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_LISTING_PURPOSES = Set.of(
            "SALE",
            "RENT",
            "LEASE"
    );

    public static final Map<String, String> LISTING_PURPOSE_LABELS = Map.of(
            "SALE",  "Sale",
            "RENT",  "Rent",
            "LEASE", "Lease"
    );

    // -------------------------------------------------------------------------
    // floor_choice  (shop / office)
    // Design: Ground floor / First floor / Upper floor / Multiple floors
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_FLOOR_CHOICES = Set.of(
            "GROUND_FLOOR",
            "FIRST_FLOOR",
            "UPPER_FLOOR",
            "MULTIPLE_FLOORS"
    );

    public static final Map<String, String> FLOOR_CHOICE_LABELS = Map.of(
            "GROUND_FLOOR",   "Ground floor",
            "FIRST_FLOOR",    "First floor",
            "UPPER_FLOOR",    "Upper floor",
            "MULTIPLE_FLOORS","Multiple floors"
    );

    // -------------------------------------------------------------------------
    // floor_mode  (commercial building)
    // Design: GF only / GF + 1 / Multiple floors / Whole building / Custom
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_FLOOR_MODES = Set.of(
            "GF_ONLY",
            "GF_PLUS_1",
            "MULTIPLE_FLOORS",
            "WHOLE_BUILDING",
            "CUSTOM"
    );

    public static final Map<String, String> FLOOR_MODE_LABELS = Map.of(
            "GF_ONLY",         "GF only",
            "GF_PLUS_1",       "GF + 1",
            "MULTIPLE_FLOORS", "Multiple floors",
            "WHOLE_BUILDING",  "Whole building",
            "CUSTOM",          "Custom"
    );

    // -------------------------------------------------------------------------
    // suitable_uses — shop / showroom
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_SHOP_SUITABLE_USES = Set.of(
            "RETAIL",
            "SHOWROOM",
            "GROCERY",
            "PHARMACY",
            "CLINIC",
            "SALON",
            "RESTAURANT_CAFE",
            "FOOD_OUTLET",
            "FOOTWEAR",
            "ELECTRONICS",
            "JEWELLERY",
            "OTHER"
    );

    public static final Map<String, String> SHOP_SUITABLE_USE_LABELS = Map.ofEntries(
            Map.entry("RETAIL",          "Retail"),
            Map.entry("SHOWROOM",        "Showroom"),
            Map.entry("GROCERY",         "Grocery"),
            Map.entry("PHARMACY",        "Pharmacy"),
            Map.entry("CLINIC",          "Clinic"),
            Map.entry("SALON",           "Salon"),
            Map.entry("RESTAURANT_CAFE", "Restaurant / cafe"),
            Map.entry("FOOD_OUTLET",     "Food outlet"),
            Map.entry("FOOTWEAR",        "Footwear"),
            Map.entry("ELECTRONICS",     "Electronics"),
            Map.entry("JEWELLERY",       "Jewellery"),
            Map.entry("OTHER",           "Other")
    );

    // -------------------------------------------------------------------------
    // suitable_uses — office
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_OFFICE_SUITABLE_USES = Set.of(
            "OFFICE",
            "CO_WORKING",
            "COACHING_TRAINING",
            "STUDIO",
            "CLINIC",
            "IT_TECH",
            "BACK_OFFICE",
            "OTHER"
    );

    public static final Map<String, String> OFFICE_SUITABLE_USE_LABELS = Map.of(
            "OFFICE",             "Office",
            "CO_WORKING",         "Co-working",
            "COACHING_TRAINING",  "Coaching / training",
            "STUDIO",             "Studio",
            "CLINIC",             "Clinic",
            "IT_TECH",            "IT / tech",
            "BACK_OFFICE",        "Back office",
            "OTHER",              "Other"
    );

    // -------------------------------------------------------------------------
    // suitable_uses — commercial building
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_BUILDING_SUITABLE_USES = Set.of(
            "RETAIL",
            "OFFICE",
            "SHOWROOM",
            "MIXED_USE",
            "HOSPITALITY",
            "INSTITUTIONAL",
            "CLINIC_HEALTHCARE",
            "OTHER"
    );

    public static final Map<String, String> BUILDING_SUITABLE_USE_LABELS = Map.of(
            "RETAIL",             "Retail",
            "OFFICE",             "Office",
            "SHOWROOM",           "Showroom",
            "MIXED_USE",          "Mixed-use",
            "HOSPITALITY",        "Hospitality",
            "INSTITUTIONAL",      "Institutional",
            "CLINIC_HEALTHCARE",  "Clinic / healthcare",
            "OTHER",              "Other"
    );

    // -------------------------------------------------------------------------
    // suitable_uses — warehouse / godown
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_WAREHOUSE_SUITABLE_USES = Set.of(
            "STORAGE",
            "LOGISTICS",
            "DISTRIBUTION",
            "LIGHT_INDUSTRIAL",
            "COLD_STORAGE",
            "ECOMMERCE_FULFILMENT",
            "OTHER"
    );

    public static final Map<String, String> WAREHOUSE_SUITABLE_USE_LABELS = Map.of(
            "STORAGE",              "Storage",
            "LOGISTICS",            "Logistics",
            "DISTRIBUTION",         "Distribution",
            "LIGHT_INDUSTRIAL",     "Light industrial",
            "COLD_STORAGE",         "Cold storage",
            "ECOMMERCE_FULFILMENT",  "E-commerce fulfilment",
            "OTHER",                "Other"
    );

    // -------------------------------------------------------------------------
    // suitable_uses — commercial land
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_COMMERCIAL_LAND_SUITABLE_USES = Set.of(
            "RETAIL",
            "OFFICE",
            "SHOWROOM",
            "WAREHOUSE",
            "MIXED_USE_COMMERCIAL",
            "HOSPITALITY",
            "OTHER"
    );

    public static final Map<String, String> COMMERCIAL_LAND_SUITABLE_USE_LABELS = Map.of(
            "RETAIL",               "Retail",
            "OFFICE",               "Office",
            "SHOWROOM",             "Showroom",
            "WAREHOUSE",            "Warehouse",
            "MIXED_USE_COMMERCIAL", "Mixed-use commercial",
            "HOSPITALITY",          "Hospitality",
            "OTHER",                "Other"
    );

    // -------------------------------------------------------------------------
    // hub / location type — shop / showroom
    // Design: Mall / High street / Retail complex / Standalone building
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_SHOP_HUB_TYPES = Set.of(
            "MALL",
            "HIGH_STREET",
            "RETAIL_COMPLEX",
            "STANDALONE_BUILDING"
    );

    public static final Map<String, String> SHOP_HUB_TYPE_LABELS = Map.of(
            "MALL",               "Mall",
            "HIGH_STREET",        "High street",
            "RETAIL_COMPLEX",     "Retail complex",
            "STANDALONE_BUILDING","Standalone building"
    );

    // -------------------------------------------------------------------------
    // hub / location type — office
    // Design: Business park / IT park / Commercial complex / Standalone building
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_OFFICE_HUB_TYPES = Set.of(
            "BUSINESS_PARK",
            "IT_PARK",
            "COMMERCIAL_COMPLEX",
            "STANDALONE_BUILDING"
    );

    public static final Map<String, String> OFFICE_HUB_TYPE_LABELS = Map.of(
            "BUSINESS_PARK",       "Business park",
            "IT_PARK",             "IT park",
            "COMMERCIAL_COMPLEX",  "Commercial complex",
            "STANDALONE_BUILDING", "Standalone building"
    );

    // -------------------------------------------------------------------------
    // amenities / utilities  (shared: shop / office / building / warehouse; absent for land)
    // Design toggles: power / dg / water / internet / cctv / security /
    //                  cafeteria / reception / fire / ac
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_AMENITIES_UTILITIES = Set.of(
            "POWER",
            "DG",
            "WATER_STORAGE",
            "INTERNET",
            "CCTV",
            "SECURITY",
            "CAFETERIA",
            "RECEPTION",
            "FIRE",
            "AC"
    );

    public static final Map<String, String> AMENITY_UTILITY_LABELS = Map.of(
            "POWER",        "Power backup",
            "DG",           "DG availability",
            "WATER_STORAGE","Water storage",
            "INTERNET",     "Internet connectivity",
            "CCTV",         "CCTV surveillance",
            "SECURITY",     "Security personnel",
            "CAFETERIA",    "Cafeteria / food court",
            "RECEPTION",    "Reception area",
            "FIRE",         "Fire extinguishers",
            "AC",           "Central air conditioning"
    );

    // -------------------------------------------------------------------------
    // occupancy_status  (shop / building)
    // Design: Vacant / Partly occupied / Fully occupied
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_OCCUPANCY_STATUSES = Set.of(
            "VACANT",
            "PARTLY_OCCUPIED",
            "FULLY_OCCUPIED"
    );

    public static final Map<String, String> OCCUPANCY_STATUS_LABELS = Map.of(
            "VACANT",          "Vacant",
            "PARTLY_OCCUPIED", "Partly occupied",
            "FULLY_OCCUPIED",  "Fully occupied"
    );

    // -------------------------------------------------------------------------
    // furnishing  (office; SCREAMING_SNAKE — this is the typed-model field,
    // NOT the current flat `furnishingStatus` which is stored lowercase)
    // Design: Unfurnished / Semi-furnished / Furnished / Plug-and-play
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_COMMERCIAL_FURNISHING_STATUSES = Set.of(
            "UNFURNISHED",
            "SEMI_FURNISHED",
            "FURNISHED",
            "PLUG_AND_PLAY"
    );

    public static final Map<String, String> COMMERCIAL_FURNISHING_STATUS_LABELS = Map.of(
            "UNFURNISHED",   "Unfurnished",
            "SEMI_FURNISHED","Semi-furnished",
            "FURNISHED",     "Furnished",
            "PLUG_AND_PLAY", "Plug-and-play"
    );

    // -------------------------------------------------------------------------
    // ownership  (commercial) — WIRED. Validated at the ListingController request boundary
    // twice: (1) since #1730, as the typed commercialOwnership field via validateCommercialFields;
    // (2) since #2063, ALSO as the shared flat ownershipType field via validateFamilyOwnershipType,
    // for the COMMERCIAL family only. #2063 is a deliberate narrowing (mirroring PR #2057 decision
    // D1 for RESIDENTIAL): agri-only ownership values (INHERITED, PATTA, SURVEY_SETTLEMENT, KATHA,
    // REVENUE) are NOT valid for commercial listings, even though AGRICULTURAL/PLOT still share
    // the same underlying ownershipType column and continue to validate against
    // AgriFieldOptions.VALID_OWNERSHIP_TYPES unchanged (residual PLOT/AGRICULTURAL gap tracked as
    // issue #2067).
    // Design: Freehold / Leasehold / Power of attorney / Other
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_COMMERCIAL_OWNERSHIP = Set.of(
            "FREEHOLD",
            "LEASEHOLD",
            "POWER_OF_ATTORNEY",
            "OTHER"
    );

    public static final Map<String, String> COMMERCIAL_OWNERSHIP_LABELS = Map.of(
            "FREEHOLD",           "Freehold",
            "LEASEHOLD",          "Leasehold",
            "POWER_OF_ATTORNEY",  "Power of attorney",
            "OTHER",              "Other"
    );

    // -------------------------------------------------------------------------
    // maintenance included  (rent / lease terms; shared commercial and residential)
    // Design: Included / Excluded
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_MAINT_INC = Set.of(
            "INCLUDED",
            "EXCLUDED"
    );

    public static final Map<String, String> MAINT_INC_LABELS = Map.of(
            "INCLUDED", "Included",
            "EXCLUDED", "Excluded"
    );

    // -------------------------------------------------------------------------
    // availability  (commercial; same 4 values as residential)
    // Design: Immediate / Within 15 days / Within 30 days / After 30 days
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_COMMERCIAL_AVAILABILITY = Set.of(
            "IMMEDIATE",
            "WITHIN_15_DAYS",
            "WITHIN_30_DAYS",
            "AFTER_30_DAYS"
    );

    public static final Map<String, String> COMMERCIAL_AVAILABILITY_LABELS = Map.of(
            "IMMEDIATE",      "Immediate",
            "WITHIN_15_DAYS", "Within 15 days",
            "WITHIN_30_DAYS", "Within 30 days",
            "AFTER_30_DAYS",  "After 30 days"
    );

    // -------------------------------------------------------------------------
    // warehouse flooring  (warehouse-specific)
    // Design: Concrete / RCC / Trimix / Epoxy coated / Kota / tiled / Other
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_WAREHOUSE_FLOORING = Set.of(
            "CONCRETE_RCC",
            "TRIMIX",
            "EPOXY_COATED",
            "KOTA_TILED",
            "OTHER"
    );

    public static final Map<String, String> WAREHOUSE_FLOORING_LABELS = Map.of(
            "CONCRETE_RCC",  "Concrete / RCC",
            "TRIMIX",        "Trimix",
            "EPOXY_COATED",  "Epoxy coated",
            "KOTA_TILED",    "Kota / tiled",
            "OTHER",         "Other"
    );

    // -------------------------------------------------------------------------
    // commercial area units  (no Cents; Gunta absent for commercial)
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_COMMERCIAL_AREA_UNITS = Set.of(
            "SQ_FT",
            "SQ_M",
            "SQ_YD",
            "ACRE"
    );

    public static final Map<String, String> COMMERCIAL_AREA_UNIT_LABELS = Map.of(
            "SQ_FT", "Sq.ft",
            "SQ_M",  "Sq.m",
            "SQ_YD", "Sq.yd",
            "ACRE",  "Acre"
    );
}
