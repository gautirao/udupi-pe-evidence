package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link PriceBand} — pure-function price coarsening helper.
 *
 * <p>Verifies:
 * <ul>
 *   <li>null input → null output (no fabrication)</li>
 *   <li>zero → lowest band</li>
 *   <li>exact boundary values (at each band edge)</li>
 *   <li>one paise below each boundary</li>
 *   <li>very large price → top band</li>
 *   <li>monotonicity: higher price → band is at least as high</li>
 * </ul>
 */
class PriceBandTest {

    // ── AC3: null price → null band (never fabricated) ───────────────────────

    @Test
    void nullPrice_returnsNull() {
        assertThat(PriceBand.of(null)).isNull();
    }

    // ── Boundary: zero → ₹0–25L ─────────────────────────────────────────────

    @Test
    void zeroPaise_returnsLowestBand() {
        assertThat(PriceBand.of(0L)).isEqualTo("₹0–25L");
    }

    // ── Band 1: ₹0–25L (0 to BAND_25L_PAISE - 1) ───────────────────────────

    @Test
    void onePaise_returnsLowestBand() {
        assertThat(PriceBand.of(1L)).isEqualTo("₹0–25L");
    }

    @Test
    void justBelow25L_returnsLowestBand() {
        assertThat(PriceBand.of(PriceBand.BAND_25L_PAISE - 1)).isEqualTo("₹0–25L");
    }

    // ── Band 2: ₹25–50L (exactly at 25L boundary) ───────────────────────────

    @Test
    void exactly25L_returns25To50LBand() {
        assertThat(PriceBand.of(PriceBand.BAND_25L_PAISE)).isEqualTo("₹25–50L");
    }

    @Test
    void justAbove25L_returns25To50LBand() {
        assertThat(PriceBand.of(PriceBand.BAND_25L_PAISE + 1)).isEqualTo("₹25–50L");
    }

    @Test
    void justBelow50L_returns25To50LBand() {
        assertThat(PriceBand.of(PriceBand.BAND_50L_PAISE - 1)).isEqualTo("₹25–50L");
    }

    // ── Band 3: ₹50L–1Cr ────────────────────────────────────────────────────

    @Test
    void exactly50L_returns50LTo1CrBand() {
        assertThat(PriceBand.of(PriceBand.BAND_50L_PAISE)).isEqualTo("₹50L–1Cr");
    }

    @Test
    void justAbove50L_returns50LTo1CrBand() {
        assertThat(PriceBand.of(PriceBand.BAND_50L_PAISE + 1)).isEqualTo("₹50L–1Cr");
    }

    @Test
    void justBelow1Cr_returns50LTo1CrBand() {
        assertThat(PriceBand.of(PriceBand.BAND_1CR_PAISE - 1)).isEqualTo("₹50L–1Cr");
    }

    // ── Band 4: ₹1–2Cr ──────────────────────────────────────────────────────

    @Test
    void exactly1Cr_returns1To2CrBand() {
        assertThat(PriceBand.of(PriceBand.BAND_1CR_PAISE)).isEqualTo("₹1–2Cr");
    }

    @Test
    void justAbove1Cr_returns1To2CrBand() {
        assertThat(PriceBand.of(PriceBand.BAND_1CR_PAISE + 1)).isEqualTo("₹1–2Cr");
    }

    @Test
    void justBelow2Cr_returns1To2CrBand() {
        assertThat(PriceBand.of(PriceBand.BAND_2CR_PAISE - 1)).isEqualTo("₹1–2Cr");
    }

    // ── Band 5: ₹2Cr+ ───────────────────────────────────────────────────────

    @Test
    void exactly2Cr_returnsTopBand() {
        assertThat(PriceBand.of(PriceBand.BAND_2CR_PAISE)).isEqualTo("₹2Cr+");
    }

    @Test
    void justAbove2Cr_returnsTopBand() {
        assertThat(PriceBand.of(PriceBand.BAND_2CR_PAISE + 1)).isEqualTo("₹2Cr+");
    }

    @Test
    void veryLargePrice_returnsTopBand() {
        assertThat(PriceBand.of(Long.MAX_VALUE)).isEqualTo("₹2Cr+");
    }

    // ── Monotonicity: higher price → band label is non-decreasing ────────────
    // We verify this by asserting the band order is preserved across a
    // representative price ladder.

    @Test
    void monotonicity_priceLadderProducesNonDecreasingBands() {
        String[] labels = {
                PriceBand.LABEL_0_25L,
                PriceBand.LABEL_25_50L,
                PriceBand.LABEL_50L_1CR,
                PriceBand.LABEL_1CR_2CR,
                PriceBand.LABEL_2CR_PLUS
        };
        long[] prices = {
                0L,
                PriceBand.BAND_25L_PAISE,
                PriceBand.BAND_50L_PAISE,
                PriceBand.BAND_1CR_PAISE,
                PriceBand.BAND_2CR_PAISE
        };

        for (int i = 0; i < prices.length; i++) {
            assertThat(PriceBand.of(prices[i]))
                    .as("price %d paise should map to band %s", prices[i], labels[i])
                    .isEqualTo(labels[i]);
        }
    }

    // ── Determinism: same input always gives same output ─────────────────────

    @Test
    void determinism_sameInputGivesSameOutput() {
        long price = 7_500_000_00L; // ₹75L — in ₹50L–1Cr band
        String first = PriceBand.of(price);
        String second = PriceBand.of(price);
        assertThat(first).isEqualTo(second).isEqualTo("₹50L–1Cr");
    }

    // ── No exact price leakage: output is only one of the 5 label constants ──

    @Test
    void output_isAlwaysOneOfFiveKnownLabels() {
        long[] testPrices = {
                0L, 1L, 100_000L, PriceBand.BAND_25L_PAISE, PriceBand.BAND_50L_PAISE,
                PriceBand.BAND_1CR_PAISE, PriceBand.BAND_2CR_PAISE, Long.MAX_VALUE
        };
        java.util.Set<String> knownLabels = java.util.Set.of(
                PriceBand.LABEL_0_25L, PriceBand.LABEL_25_50L, PriceBand.LABEL_50L_1CR,
                PriceBand.LABEL_1CR_2CR, PriceBand.LABEL_2CR_PLUS
        );

        for (long price : testPrices) {
            String band = PriceBand.of(price);
            assertThat(knownLabels)
                    .as("band for price %d must be one of the 5 known labels, got: %s", price, band)
                    .contains(band);
        }
    }
}
