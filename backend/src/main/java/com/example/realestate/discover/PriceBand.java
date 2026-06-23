package com.example.realestate.discover;

/**
 * Pure deterministic price-band helper for anonymous discover responses.
 *
 * <p>Maps an exact price in paise to a coarse display band string so that
 * anonymous API responses never leak exact asking prices.
 *
 * <p>Bucket boundaries (monotonic, no gaps, no overlaps):
 * <pre>
 *   null            → null  (absent price stays absent — never fabricated)
 *   0 – &lt;₹25 L    → "₹0–25L"
 *   ₹25 L – &lt;₹50 L → "₹25–50L"
 *   ₹50 L – &lt;₹1 Cr → "₹50L–1Cr"
 *   ₹1 Cr – &lt;₹2 Cr → "₹1–2Cr"
 *   ≥ ₹2 Cr        → "₹2Cr+"
 * </pre>
 *
 * <p>Constants are in paise (1 rupee = 100 paise):
 * <ul>
 *   <li>₹25 L  = 25,00,000 rupees × 100 = 2_500_000_00L paise</li>
 *   <li>₹50 L  = 50,00,000 rupees × 100 = 5_000_000_00L paise</li>
 *   <li>₹1 Cr  = 1,00,00,000 rupees × 100 = 10_000_000_00L paise</li>
 *   <li>₹2 Cr  = 2,00,00,000 rupees × 100 = 20_000_000_00L paise</li>
 * </ul>
 */
public final class PriceBand {

    // Boundary constants in paise
    static final long BAND_25L_PAISE   =  2_500_000_00L;  // ₹25 L
    static final long BAND_50L_PAISE   =  5_000_000_00L;  // ₹50 L
    static final long BAND_1CR_PAISE   = 10_000_000_00L;  // ₹1 Cr
    static final long BAND_2CR_PAISE   = 20_000_000_00L;  // ₹2 Cr

    static final String LABEL_0_25L    = "₹0–25L";
    static final String LABEL_25_50L   = "₹25–50L";
    static final String LABEL_50L_1CR  = "₹50L–1Cr";
    static final String LABEL_1CR_2CR  = "₹1–2Cr";
    static final String LABEL_2CR_PLUS = "₹2Cr+";

    private PriceBand() {}

    /**
     * Returns the coarse band label for {@code pricePaise}, or {@code null} when
     * {@code pricePaise} is {@code null} (absent price is never fabricated).
     *
     * <p>This method is a pure function: same input always produces same output,
     * no side effects, no I/O.
     *
     * @param pricePaise asking price in paise, or {@code null}
     * @return band label string, or {@code null} if price is absent
     */
    public static String of(Long pricePaise) {
        if (pricePaise == null) {
            return null;
        }
        if (pricePaise < BAND_25L_PAISE) {
            return LABEL_0_25L;
        }
        if (pricePaise < BAND_50L_PAISE) {
            return LABEL_25_50L;
        }
        if (pricePaise < BAND_1CR_PAISE) {
            return LABEL_50L_1CR;
        }
        if (pricePaise < BAND_2CR_PAISE) {
            return LABEL_1CR_2CR;
        }
        return LABEL_2CR_PLUS;
    }
}
