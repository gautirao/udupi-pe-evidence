package com.example.realestate.listing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/**
 * Utility class for converting land area units to cents and computing price per cent.
 *
 * Conversion constants:
 * - 1 cent = 435.6 sq ft
 * - 1 sq m = 10.7639104167 sq ft
 */
public final class AreaUnitConverter {

    private static final BigDecimal SQFT_PER_CENT = new BigDecimal("435.6");
    private static final BigDecimal SQFT_PER_SQM = new BigDecimal("10.7639104167");

    private static final int CALC_SCALE = 10;
    private static final RoundingMode ROUNDING = RoundingMode.HALF_UP;

    /**
     * Mapping of recognized unit aliases to canonical unit names.
     */
    private static final Map<String, String> UNIT_ALIASES = Map.ofEntries(
            // Cent aliases
            Map.entry("cent", "cent"),
            Map.entry("cents", "cent"),
            // Square feet aliases
            Map.entry("sqft", "sqft"),
            Map.entry("sq ft", "sqft"),
            Map.entry("sq.ft", "sqft"),
            Map.entry("sq.ft.", "sqft"),
            Map.entry("sft", "sqft"),
            Map.entry("square feet", "sqft"),
            Map.entry("square foot", "sqft"),
            Map.entry("ft2", "sqft"),
            Map.entry("ft²", "sqft"),
            // Square meter aliases
            Map.entry("sqm", "sqm"),
            Map.entry("sq m", "sqm"),
            Map.entry("sq.m", "sqm"),
            Map.entry("sq.m.", "sqm"),
            Map.entry("square meter", "sqm"),
            Map.entry("square meters", "sqm"),
            Map.entry("square metre", "sqm"),
            Map.entry("square metres", "sqm"),
            Map.entry("m2", "sqm"),
            Map.entry("m²", "sqm")
    );

    private AreaUnitConverter() {
        // Utility class - prevent instantiation
    }

    /**
     * Normalizes a unit string to a canonical form.
     *
     * @param unit the unit string (e.g., "Sq Ft", "square meters", "CENT")
     * @return canonical unit name ("cent", "sqft", "sqm") or null if unrecognized
     */
    public static String normalizeUnit(String unit) {
        if (unit == null || unit.isBlank()) {
            return null;
        }
        String normalized = unit.trim().toLowerCase();
        return UNIT_ALIASES.get(normalized);
    }

    /**
     * Converts a land area value to cents.
     *
     * @param value the area value
     * @param unit  the unit of the value (will be normalized)
     * @return the area in cents, or null if unit is unrecognized or value is null/non-positive
     */
    public static BigDecimal toCent(BigDecimal value, String unit) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        String canonicalUnit = normalizeUnit(unit);
        if (canonicalUnit == null) {
            return null;
        }

        return switch (canonicalUnit) {
            case "cent" -> value;
            case "sqft" -> value.divide(SQFT_PER_CENT, CALC_SCALE, ROUNDING);
            case "sqm" -> {
                // sqm -> sqft -> cent
                BigDecimal sqft = value.multiply(SQFT_PER_SQM);
                yield sqft.divide(SQFT_PER_CENT, CALC_SCALE, ROUNDING);
            }
            default -> null;
        };
    }

    /**
     * Computes price per cent in paise.
     *
     * @param pricePaise total price in paise
     * @param areaCent   area in cents
     * @return price per cent in paise (rounded HALF_UP), or null if inputs are invalid
     */
    public static Long computePricePerCentPaise(Long pricePaise, BigDecimal areaCent) {
        if (pricePaise == null || pricePaise <= 0) {
            return null;
        }
        if (areaCent == null || areaCent.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        BigDecimal pricePerCent = BigDecimal.valueOf(pricePaise)
                .divide(areaCent, CALC_SCALE, ROUNDING);

        return pricePerCent.setScale(0, ROUNDING).longValue();
    }
}
