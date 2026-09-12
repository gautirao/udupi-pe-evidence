package com.example.realestate.listing.area;

import com.example.realestate.listing.core.Listing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;

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

    // ── Sq-ft projection, shared by the Discover area filter (#2459) ────────────────────────────

    /**
     * The scale every sq-ft value in this class is produced at ({@code 6}, HALF_UP). Exposed so the
     * SQL that reproduces {@link #toSqft} row-side can {@code ROUND(..., 6)} to the SAME scale
     * instead of hardcoding a second copy of the number.
     */
    public static final int SQFT_SCALE = AREA_SCALE;

    /**
     * Converts an arbitrary (value, unit) area pair to square feet, or returns {@code null} when the
     * pair carries no usable area.
     *
     * <p><b>This is the ONE conversion layer</b> (#2459 Step 2). It is deliberately NOT a second
     * normaliser: it produces exactly {@code normalize(value, unit).areaSqft()} for every input —
     * {@code AreaNormalizerSqftTest} asserts that equivalence for every unit — and every other
     * consumer (the Discover primary-area predicate on Postgres, its OpenSearch mirror) derives from
     * {@link AreaUnit#sqftFactor()} declared here rather than restating a factor.
     *
     * <p>{@code null} is returned — never a fabricated or coerced value — when:
     * <ul>
     *   <li>{@code value} is {@code null} or {@code <= 0};</li>
     *   <li>{@code unit} is {@code null}, blank, or NOT in the recognised vocabulary. An
     *       unrecognised unit (e.g. {@code SQ_YD}, which the write vocabulary accepts but for which
     *       no conversion path exists) is UNRESOLVED, never defaulted to sq ft — silently treating
     *       an unknown unit as sq ft would misreport a plot by orders of magnitude.</li>
     * </ul>
     *
     * @param value the raw area value in {@code unit}
     * @param unit  the raw unit string (case/spacing insensitive, see {@link AreaUnit})
     * @return the area in sq ft at scale {@link #SQFT_SCALE}, or {@code null} when unresolvable
     */
    public static BigDecimal toSqft(BigDecimal value, String unit) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        AreaUnit parsed = parseUnit(unit);
        if (parsed == null) {
            return null;
        }
        return value.multiply(parsed.sqftFactor()).setScale(SQFT_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * Recognised area units and their exact sq-ft factors.
     *
     * <p>Public because it is the single declaration the Discover area predicate (#2459) generates
     * both its SQL {@code CASE} and its OpenSearch {@code terms}/{@code range} mirror from. Adding a
     * unit here teaches every engine about it at once; that is the whole point of not letting a
     * second conversion table exist.
     */
    public enum AreaUnit {
        SQM(SQFT_PER_SQM, "sqm", "sq m", "sqmtr", "sqmtrs",
                "square meter", "square meters", "square metre", "square metres", "m2"),
        SQFT(BigDecimal.ONE, "sqft", "sq ft", "sft", "square foot", "square feet", "ft2"),
        CENT(SQFT_PER_CENT, "cent", "cents"),
        GUNTA(SQFT_PER_GUNTA, "gunta", "guntas"),
        ACRE(SQFT_PER_ACRE, "acre", "acres");

        private final BigDecimal sqftFactor;
        private final List<String> aliases;

        AreaUnit(BigDecimal sqftFactor, String... aliases) {
            this.sqftFactor = sqftFactor;
            this.aliases = List.of(aliases);
        }

        /** Exact multiplier from this unit to square feet. */
        public BigDecimal sqftFactor() {
            return sqftFactor;
        }

        /**
         * The accepted spellings, already in the canonical comparison form this class compares
         * against: lower-case, trimmed, internal whitespace collapsed to a single space.
         */
        public List<String> aliases() {
            return aliases;
        }
    }

    /**
     * Canonicalises a raw unit string for alias comparison: lower-case, internal whitespace
     * collapsed to one space, then trimmed.
     *
     * <p>Exposed so SQL that reproduces {@link #toSqft} row-side can apply the IDENTICAL
     * transformation ({@code btrim(regexp_replace(lower(col), '\s+', ' ', 'g'))}) rather than
     * approximating it.
     *
     * @param unitString the raw unit string
     * @return the canonical form, or {@code null} when {@code unitString} is {@code null}
     */
    public static String canonicalUnitToken(String unitString) {
        if (unitString == null) {
            return null;
        }
        return unitString.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    /**
     * Parses a unit string into {@link AreaUnit}, handling common aliases and variations.
     * Normalizes case and spacing.
     *
     * @param unitString the raw unit string
     * @return AreaUnit or null if unrecognized
     */
    public static AreaUnit parseUnit(String unitString) {
        if (unitString == null) {
            return null;
        }
        String normalized = canonicalUnitToken(unitString);
        for (AreaUnit unit : AreaUnit.values()) {
            if (unit.aliases().contains(normalized)) {
                return unit;
            }
        }
        return null;
    }
}
