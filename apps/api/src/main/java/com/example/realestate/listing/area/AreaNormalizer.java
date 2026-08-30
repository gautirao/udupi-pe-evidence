package com.example.realestate.listing.area;

import com.example.realestate.listing.core.Listing;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Utility class for normalizing land area units and computing price per cent.
 *
 * Conversions:
 * - 1 sq m = 10.7639104167 sq ft
 * - 1 cent = 435.6 sq ft
 *
 * Supported input units (case-insensitive, spaces normalized):
 * - sqm, sq m, sqmtr, sqmtrs, square meter, square meters, square metre, square metres, m2
 * - sqft, sq ft, sft, square foot, square feet, ft2
 * - cent, cents
 */
public final class AreaNormalizer {

    // Conversion constants (source of truth)
    private static final BigDecimal SQFT_PER_SQM = new BigDecimal("10.7639104167");
    private static final BigDecimal SQFT_PER_CENT = new BigDecimal("435.6");
    // 1 gunta = 1089 sq ft (exact)
    private static final BigDecimal SQFT_PER_GUNTA = new BigDecimal("1089");
    // 1 acre = 43560 sq ft (exact)
    private static final BigDecimal SQFT_PER_ACRE = new BigDecimal("43560");
    // 1 acre = 4046.8564224 sq m (exact, international acre)
    private static final BigDecimal SQM_PER_ACRE = new BigDecimal("4046.8564224");
    // Scale for computed (boundary-derived) acreage exposed on the read path (#1367)
    private static final int ACRES_SCALE = 2;

    // Derived: sqm per cent = sqft_per_cent / sqft_per_sqm
    private static final BigDecimal SQM_PER_CENT = SQFT_PER_CENT.divide(SQFT_PER_SQM, 20, RoundingMode.HALF_UP);

    private static final int AREA_SCALE = 6;
    private static final int PAISE_SCALE = 0;

    private AreaNormalizer() {
        // Utility class - prevent instantiation
    }

    /**
     * Result of area normalization containing derived fields.
     * All fields may be null if input was invalid.
     */
    public record NormalizedArea(
            BigDecimal areaSqm,
            BigDecimal areaSqft,
            BigDecimal areaCent
    ) {
        public static NormalizedArea empty() {
            return new NormalizedArea(null, null, null);
        }
    }

    /**
     * Normalizes land area to sqm (canonical), sqft, and cent.
     *
     * @param landArea     the raw land area value
     * @param landAreaUnit the unit string (e.g., "sqft", "sq m", "cent")
     * @return NormalizedArea with derived values, or empty if inputs are invalid
     */
    public static NormalizedArea normalize(BigDecimal landArea, String landAreaUnit) {
        if (landArea == null || landArea.compareTo(BigDecimal.ZERO) <= 0) {
            return NormalizedArea.empty();
        }

        if (landAreaUnit == null || landAreaUnit.isBlank()) {
            return NormalizedArea.empty();
        }

        AreaUnit unit = parseUnit(landAreaUnit);
        if (unit == null) {
            return NormalizedArea.empty();
        }

        BigDecimal areaSqm;
        BigDecimal areaSqft;
        BigDecimal areaCent;

        switch (unit) {
            case SQM -> {
                areaSqm = landArea.setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaSqft = landArea.multiply(SQFT_PER_SQM).setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaCent = landArea.divide(SQM_PER_CENT, AREA_SCALE, RoundingMode.HALF_UP);
            }
            case SQFT -> {
                areaSqft = landArea.setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaSqm = landArea.divide(SQFT_PER_SQM, AREA_SCALE, RoundingMode.HALF_UP);
                areaCent = landArea.divide(SQFT_PER_CENT, AREA_SCALE, RoundingMode.HALF_UP);
            }
            case CENT -> {
                areaCent = landArea.setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaSqft = landArea.multiply(SQFT_PER_CENT).setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaSqm = landArea.multiply(SQM_PER_CENT).setScale(AREA_SCALE, RoundingMode.HALF_UP);
            }
            case GUNTA -> {
                // 1 gunta = 1089 sqft; delegate to sqft conversion path
                BigDecimal asSqft = landArea.multiply(SQFT_PER_GUNTA);
                areaSqft = asSqft.setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaSqm = asSqft.divide(SQFT_PER_SQM, AREA_SCALE, RoundingMode.HALF_UP);
                areaCent = asSqft.divide(SQFT_PER_CENT, AREA_SCALE, RoundingMode.HALF_UP);
            }
            case ACRE -> {
                // 1 acre = 43560 sqft; delegate to sqft conversion path
                BigDecimal asSqft = landArea.multiply(SQFT_PER_ACRE);
                areaSqft = asSqft.setScale(AREA_SCALE, RoundingMode.HALF_UP);
                areaSqm = asSqft.divide(SQFT_PER_SQM, AREA_SCALE, RoundingMode.HALF_UP);
                areaCent = asSqft.divide(SQFT_PER_CENT, AREA_SCALE, RoundingMode.HALF_UP);
            }
            default -> {
                return NormalizedArea.empty();
            }
        }

        return new NormalizedArea(areaSqm, areaSqft, areaCent);
    }

    /**
     * Convenience overload: normalizes area fields on a Listing and writes derived values back.
     * Reads landArea + landAreaUnit; updates areaSqm, areaSqft, areaCent, and pricePerCentPaise.
     * No-ops if area or unit are absent.
     *
     * @param listing the listing to normalize in-place
     */
    public static void normalize(Listing listing) {
        NormalizedArea normalized = normalize(listing.getLandArea(), listing.getLandAreaUnit());
        listing.setAreaSqm(normalized.areaSqm());
        listing.setAreaSqft(normalized.areaSqft());
        listing.setAreaCent(normalized.areaCent());
        listing.setPricePerCentPaise(
                computePricePerCentPaise(listing.getPricePaise(), normalized.areaCent()));
    }

    /**
     * Converts a boundary area in square metres to acres, rounded to exactly 2 decimals (HALF_UP).
     *
     * <p>Pure derive-on-read helper for the boundary-derived {@code computedAreaAcres} field (#1367).
     * Distinct from the {@link #normalize(BigDecimal, String)} enum path — does NOT touch any
     * broker-declared area unit. Result scale is always 2 (e.g. 1.0 → 1.00).
     *
     * @param areaSqm the area in square metres (typically from {@code ST_Area} on a geography column)
     * @return acreage at scale 2, or null when input is null
     */
    public static BigDecimal sqmToAcres(BigDecimal areaSqm) {
        if (areaSqm == null) {
            return null;
        }
        return areaSqm.divide(SQM_PER_ACRE, ACRES_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Computes price per cent in paise.
     *
     * @param pricePaise the total price in paise
     * @param areaCent   the area in cents
     * @return price per cent in paise (rounded HALF_UP to 0 decimals), or null if inputs are invalid
     */
    public static Long computePricePerCentPaise(Long pricePaise, BigDecimal areaCent) {
        if (pricePaise == null || pricePaise <= 0) {
            return null;
        }

        if (areaCent == null || areaCent.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }

        BigDecimal priceBd = BigDecimal.valueOf(pricePaise);
        BigDecimal pricePerCent = priceBd.divide(areaCent, PAISE_SCALE, RoundingMode.HALF_UP);
        return pricePerCent.longValue();
    }

    /**
     * Internal enum for recognized area units.
     */
    private enum AreaUnit {
        SQM, SQFT, CENT, GUNTA, ACRE
    }

    /**
     * Parses a unit string into AreaUnit, handling common aliases and variations.
     * Normalizes case and spacing.
     *
     * @param unitString the raw unit string
     * @return AreaUnit or null if unrecognized
     */
    private static AreaUnit parseUnit(String unitString) {
        if (unitString == null) {
            return null;
        }

        // Normalize: lowercase, trim, collapse spaces
        String normalized = unitString.toLowerCase().trim().replaceAll("\\s+", " ");

        // SQM aliases
        if (normalized.equals("sqm") ||
            normalized.equals("sq m") ||
            normalized.equals("sqmtr") ||
            normalized.equals("sqmtrs") ||
            normalized.equals("square meter") ||
            normalized.equals("square meters") ||
            normalized.equals("square metre") ||
            normalized.equals("square metres") ||
            normalized.equals("m2")) {
            return AreaUnit.SQM;
        }

        // SQFT aliases
        if (normalized.equals("sqft") ||
            normalized.equals("sq ft") ||
            normalized.equals("sft") ||
            normalized.equals("square foot") ||
            normalized.equals("square feet") ||
            normalized.equals("ft2")) {
            return AreaUnit.SQFT;
        }

        // CENT aliases
        if (normalized.equals("cent") ||
            normalized.equals("cents")) {
            return AreaUnit.CENT;
        }

        // GUNTA aliases (1 gunta = 1089 sqft)
        if (normalized.equals("gunta") ||
            normalized.equals("guntas")) {
            return AreaUnit.GUNTA;
        }

        // ACRE aliases (1 acre = 43560 sqft)
        if (normalized.equals("acre") ||
            normalized.equals("acres")) {
            return AreaUnit.ACRE;
        }

        return null;
    }
}
