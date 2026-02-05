package com.example.realestate.listing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Utility class for parsing Indian price formats and converting to paise.
 *
 * Supported formats:
 * - Plain numbers: "50000" → 5000000 paise
 * - With rupee symbol: "₹50000" → 5000000 paise
 * - With commas (Indian format): "₹10,00,000" → 100000000 paise
 * - Lakhs: "5.5 L", "5 lakh", "5 lac" → 550000000 paise
 * - Crores: "2 Cr", "2 crore", "2.5 crores" → 25000000000 paise
 */
public final class PriceParser {

    private static final long PAISE_PER_RUPEE = 100L;
    private static final long LAKH = 100_000L;
    private static final long CRORE = 10_000_000L;

    // Pattern to match price with optional multiplier
    // Groups: (1) numeric value with optional decimals, (2) optional multiplier (L/lakh/lac/Cr/crore)
    private static final Pattern PRICE_PATTERN = Pattern.compile(
            "₹?\\s*([\\d,]+\\.?\\d*)\\s*(L|lakh|lakhs|lac|lacs|Cr|crore|crores)?",
            Pattern.CASE_INSENSITIVE
    );

    private PriceParser() {
        // Utility class - prevent instantiation
    }

    /**
     * Parses an Indian price string and converts to paise.
     *
     * @param priceString the price string to parse (e.g., "₹5.5 L", "50 lakhs", "2 Cr")
     * @return the price in paise, or null if parsing fails or input is null/empty
     */
    public static Long parseToPaise(String priceString) {
        if (priceString == null || priceString.isBlank()) {
            return null;
        }

        String normalized = priceString.trim();
        Matcher matcher = PRICE_PATTERN.matcher(normalized);

        if (!matcher.find()) {
            return null;
        }

        String numericPart = matcher.group(1);
        String multiplier = matcher.group(2);

        if (numericPart == null || numericPart.isEmpty()) {
            return null;
        }

        // Remove commas from the numeric part
        String cleanNumber = numericPart.replace(",", "");

        try {
            BigDecimal value = new BigDecimal(cleanNumber);
            BigDecimal rupees = applyMultiplier(value, multiplier);
            return rupeesToPaise(rupees);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Converts a BigDecimal rupee value (from AI classification) to paise.
     *
     * @param rupees the price in rupees
     * @return the price in paise, or null if input is null
     */
    public static Long rupeesToPaise(BigDecimal rupees) {
        if (rupees == null) {
            return null;
        }
        // Multiply by 100 and round to avoid floating point issues
        BigDecimal paise = rupees.multiply(BigDecimal.valueOf(PAISE_PER_RUPEE));
        return paise.setScale(0, RoundingMode.HALF_UP).longValue();
    }

    /**
     * Converts paise to rupees for display purposes.
     *
     * @param paise the price in paise
     * @return the price in rupees as BigDecimal, or null if input is null
     */
    public static BigDecimal paiseToRupees(Long paise) {
        if (paise == null) {
            return null;
        }
        return BigDecimal.valueOf(paise).divide(BigDecimal.valueOf(PAISE_PER_RUPEE), 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal applyMultiplier(BigDecimal value, String multiplier) {
        if (multiplier == null || multiplier.isEmpty()) {
            return value;
        }

        String lower = multiplier.toLowerCase();
        if (lower.equals("l") || lower.startsWith("lakh") || lower.startsWith("lac")) {
            return value.multiply(BigDecimal.valueOf(LAKH));
        } else if (lower.equals("cr") || lower.startsWith("crore")) {
            return value.multiply(BigDecimal.valueOf(CRORE));
        }

        return value;
    }
}
