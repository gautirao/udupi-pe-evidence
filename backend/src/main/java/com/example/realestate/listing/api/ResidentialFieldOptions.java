package com.example.realestate.listing.api;

import java.util.Map;
import java.util.Set;

/**
 * Canonical option contract for residential listing fields (M38 design vocabulary, ADR M38-03 §8.1).
 *
 * <p><b>All sets in this class are AUTHOR-ONLY / FORWARD-ONLY.</b> No field in the current flat
 * {@code CreateRequest} / {@code UpdateRequest} is validated against any set here. Wiring requires
 * a post-audit distinct-value confirmation of production stored values for the corresponding field
 * (see {@code no-live-smoke-shared-supabase} memory and M38-FU7 follow-up). The discriminated-union
 * DTO that will consume these sets is planned for #1689 / M38-FU2.
 *
 * <h2>CRITICAL: furnishing casing</h2>
 * <p>{@link #VALID_FURNISHING_STATUSES} uses <b>lowercase</b> keys
 * ({@code unfurnished}, {@code semi_furnished}, {@code furnished}) to match the values actually
 * stored in the {@code furnishing_status} column today (per {@code src/lib/listing-constants.ts}
 * {@code FURNISHING_OPTIONS}). This is the only SCREAMING_SNAKE exception in these authority classes.
 * All other sets here use SCREAMING_SNAKE_CASE.
 *
 * <p>All machine keys match the value as STORED in the database column.
 * Display labels live only in the parallel {@code *_LABELS} map values — never in {@code VALID_*}.
 */
public final class ResidentialFieldOptions {

    private ResidentialFieldOptions() {}

    // -------------------------------------------------------------------------
    // furnishing_status  (LOWERCASE — matches current stored form)
    // Design: Unfurnished / Semi-furnished / Furnished
    // Current flat field: furnishingStatus (free string, not yet wired to strict validation).
    // Wiring requires a production distinct-value audit before enforcement.
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_FURNISHING_STATUSES = Set.of(
            "unfurnished",
            "semi_furnished",
            "furnished"
    );

    public static final Map<String, String> FURNISHING_STATUS_LABELS = Map.of(
            "unfurnished",   "Unfurnished",
            "semi_furnished","Semi-furnished",
            "furnished",     "Furnished"
    );

    // -------------------------------------------------------------------------
    // facing  (residential; abbreviated compass notation as used in the FE design)
    // Design: East / West / North / South / NE / NW / SE / SW  (no 'Not sure' for residential)
    // Note: agri facing in AgriFieldOptions uses NORTH_EAST / NORTH_WEST / SOUTH_EAST / SOUTH_WEST
    // and includes NOT_SURE — different design vocabularies, stored differently.
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_FACING_VALUES = Set.of(
            "EAST",
            "WEST",
            "NORTH",
            "SOUTH",
            "NE",
            "NW",
            "SE",
            "SW"
    );

    public static final Map<String, String> FACING_LABELS = Map.of(
            "EAST",  "East",
            "WEST",  "West",
            "NORTH", "North",
            "SOUTH", "South",
            "NE",    "NE",
            "NW",    "NW",
            "SE",    "SE",
            "SW",    "SW"
    );

    // -------------------------------------------------------------------------
    // property_status  (apartment / house / villa)
    // Design: Ready to move / Under construction
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_PROPERTY_STATUSES = Set.of(
            "READY_TO_MOVE",
            "UNDER_CONSTRUCTION"
    );

    public static final Map<String, String> PROPERTY_STATUS_LABELS = Map.of(
            "READY_TO_MOVE",      "Ready to move",
            "UNDER_CONSTRUCTION", "Under construction"
    );

    // -------------------------------------------------------------------------
    // ownership  (residential)
    // Design: Freehold / Cooperative society / Leasehold / Power of attorney
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_RESIDENTIAL_OWNERSHIP = Set.of(
            "FREEHOLD",
            "COOPERATIVE_SOCIETY",
            "LEASEHOLD",
            "POWER_OF_ATTORNEY"
    );

    public static final Map<String, String> RESIDENTIAL_OWNERSHIP_LABELS = Map.of(
            "FREEHOLD",            "Freehold",
            "COOPERATIVE_SOCIETY", "Cooperative society",
            "LEASEHOLD",           "Leasehold",
            "POWER_OF_ATTORNEY",   "Power of attorney"
    );

    // -------------------------------------------------------------------------
    // maintenance included  (rent terms; same values as commercial)
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
    // availability  (residential rent)
    // Design: Immediate / Within 15 days / Within 30 days / After 30 days
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_AVAILABILITY = Set.of(
            "IMMEDIATE",
            "WITHIN_15_DAYS",
            "WITHIN_30_DAYS",
            "AFTER_30_DAYS"
    );

    public static final Map<String, String> AVAILABILITY_LABELS = Map.of(
            "IMMEDIATE",      "Immediate",
            "WITHIN_15_DAYS", "Within 15 days",
            "WITHIN_30_DAYS", "Within 30 days",
            "AFTER_30_DAYS",  "After 30 days"
    );

    // -------------------------------------------------------------------------
    // preferred_tenants  (residential rent)
    // Design: No preference / Family / Students / Professionals / Company lease
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_PREFERRED_TENANTS = Set.of(
            "NO_PREFERENCE",
            "FAMILY",
            "STUDENTS",
            "PROFESSIONALS",
            "COMPANY_LEASE"
    );

    public static final Map<String, String> PREFERRED_TENANT_LABELS = Map.of(
            "NO_PREFERENCE",  "No preference",
            "FAMILY",         "Family",
            "STUDENTS",       "Students",
            "PROFESSIONALS",  "Professionals",
            "COMPANY_LEASE",  "Company lease"
    );

    // -------------------------------------------------------------------------
    // conversion_status  (plot only)
    // Design: Not converted / DC converted / Residential zone / Not sure
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_CONVERSION_STATUSES = Set.of(
            "NOT_CONVERTED",
            "DC_CONVERTED",
            "RESIDENTIAL_ZONE",
            "NOT_SURE"
    );

    public static final Map<String, String> CONVERSION_STATUS_LABELS = Map.of(
            "NOT_CONVERTED",    "Not converted",
            "DC_CONVERTED",     "DC converted",
            "RESIDENTIAL_ZONE", "Residential zone",
            "NOT_SURE",         "Not sure"
    );

    // -------------------------------------------------------------------------
    // residential area units  (Cents included; Gunta absent for residential)
    // Design: Sq.ft / Sq.m / Sq.yd / Cents / Acre
    // -------------------------------------------------------------------------

    public static final Set<String> VALID_RESIDENTIAL_AREA_UNITS = Set.of(
            "SQ_FT",
            "SQ_M",
            "SQ_YD",
            "CENTS",
            "ACRE"
    );

    public static final Map<String, String> RESIDENTIAL_AREA_UNIT_LABELS = Map.of(
            "SQ_FT", "Sq.ft",
            "SQ_M",  "Sq.m",
            "SQ_YD", "Sq.yd",
            "CENTS", "Cents",
            "ACRE",  "Acre"
    );
}
