package com.example.realestate.discover;

/**
 * Pure deterministic band helper for anonymous discover responses carrying a monthly rent
 * (issue #2051; listingPurpose "rent" or "lease" — both treated identically).
 *
 * <p><b>Unit: RUPEES.</b> Unlike the sibling {@link PriceBand}, which takes PAISE, this class
 * takes {@code monthly_rent} exactly as persisted in {@code property_listings.monthly_rent}
 * (rupees, not paise — see the #2051 investigation). The method signature is deliberately
 * {@code Long} rupees, NOT interchangeable with {@link PriceBand#of(Long)}, to prevent a future
 * caller from accidentally feeding a paise value here or a rupee value there.
 *
 * <p>Maps an exact monthly rent in rupees to a coarse display band string so that anonymous API
 * responses never leak an exact rent value.
 *
 * <p>Bucket boundaries (monotonic, no gaps, no overlaps; lower bound INCLUSIVE, upper bound
 * belongs to the NEXT bucket):
 * <pre>
 *   null or &lt;= 0        → null  (absent/invalid rent stays absent — never fabricated or
 *                             misrepresented as a valid cheap band)
 *   [0, ₹10,000)         → "₹0–10K"
 *   [₹10,000, ₹20,000)   → "₹10–20K"
 *   [₹20,000, ₹35,000)   → "₹20–35K"
 *   [₹35,000, ₹50,000)   → "₹35–50K"
 *   [₹50,000, ∞)         → "₹50K+"
 * </pre>
 */
public final class MonthlyRentBand {

    // Boundary constants in RUPEES.
    static final long BAND_10K_RUPEES = 10_000L;
    static final long BAND_20K_RUPEES = 20_000L;
    static final long BAND_35K_RUPEES = 35_000L;
    static final long BAND_50K_RUPEES = 50_000L;

    static final String LABEL_0_10K   = "₹0–10K";
    static final String LABEL_10_20K  = "₹10–20K";
    static final String LABEL_20_35K  = "₹20–35K";
    static final String LABEL_35_50K  = "₹35–50K";
    static final String LABEL_50K_PLUS = "₹50K+";

    private MonthlyRentBand() {}

    /**
     * Returns the coarse band label for {@code monthlyRentRupees}, or {@code null} when the
     * value is {@code null} or {@code <= 0} (absent/invalid rent is never fabricated into a
     * band — in particular, a stored rent of exactly 0 must NOT be presented as "₹0–10K").
     *
     * <p>This method is a pure function: same input always produces same output, no side
     * effects, no I/O. The {@code <= 0} guard runs BEFORE bucket selection so that an invalid
     * rent can never fall into the ₹0–10K bucket's inclusive lower bound.
     *
     * @param monthlyRentRupees monthly rent in RUPEES, or {@code null}
     * @return band label string, or {@code null} if the rent is absent or invalid ({@code <= 0})
     */
    public static String of(Long monthlyRentRupees) {
        if (monthlyRentRupees == null || monthlyRentRupees <= 0) {
            return null;
        }
        if (monthlyRentRupees < BAND_10K_RUPEES) {
            return LABEL_0_10K;
        }
        if (monthlyRentRupees < BAND_20K_RUPEES) {
            return LABEL_10_20K;
        }
        if (monthlyRentRupees < BAND_35K_RUPEES) {
            return LABEL_20_35K;
        }
        if (monthlyRentRupees < BAND_50K_RUPEES) {
            return LABEL_35_50K;
        }
        return LABEL_50K_PLUS;
    }
}
