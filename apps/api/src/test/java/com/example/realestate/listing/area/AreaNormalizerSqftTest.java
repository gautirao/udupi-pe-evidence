package com.example.realestate.listing.area;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Unit tests for {@link AreaNormalizer#toSqft} — the ONE sq-ft conversion layer the #2459 built-area
 * filter extends coverage to (Step 2).
 *
 * <p>The first test is the load-bearing one: {@code toSqft} must be the SAME function as
 * {@code normalize(...).areaSqft()}, not a second implementation that happens to agree today.
 */
class AreaNormalizerSqftTest {

    private static BigDecimal bd(String v) {
        return new BigDecimal(v);
    }

    @Test
    void toSqft_isExactlyTheNormalizeAreaSqftProjection_forEveryUnit() {
        String[] units = {"sqm", "sq m", "m2", "sqft", "sq ft", "sft", "cent", "cents",
                "gunta", "acre", "acres"};
        String[] values = {"1", "0.5", "92.903040", "1200", "2.5", "1650.75"};
        for (String unit : units) {
            for (String value : values) {
                assertEquals(
                        AreaNormalizer.normalize(bd(value), unit).areaSqft(),
                        AreaNormalizer.toSqft(bd(value), unit),
                        unit + " / " + value);
            }
        }
    }

    // ── The built-area pair's real stored units ────────────────────────────────────────────────

    @Test
    void sqft_passesThroughAtScale6() {
        assertEquals(0, bd("1200.000000").compareTo(AreaNormalizer.toSqft(bd("1200"), "sqft")));
    }

    @Test
    void sqm_convertsWithTheExactSqftPerSqmFactor() {
        // 100 sqm * 10.7639104167 = 1076.39104167 → scale 6 HALF_UP
        assertEquals(0, bd("1076.391042").compareTo(AreaNormalizer.toSqft(bd("100"), "sqm")));
    }

    @Test
    void cent_convertsWithTheExact435Point6Factor() {
        assertEquals(0, bd("1089.000000").compareTo(AreaNormalizer.toSqft(bd("2.5"), "cent")));
    }

    @Test
    void acre_convertsWithTheExact43560Factor() {
        assertEquals(0, bd("43560.000000").compareTo(AreaNormalizer.toSqft(bd("1"), "acre")));
        assertEquals(0, bd("21780.000000").compareTo(AreaNormalizer.toSqft(bd("0.5"), "acres")));
    }

    @Test
    void gunta_convertsWithTheExact1089Factor() {
        assertEquals(0, bd("1089.000000").compareTo(AreaNormalizer.toSqft(bd("1"), "gunta")));
    }

    // ── Inclusive boundary values ──────────────────────────────────────────────────────────────

    @Test
    void inclusiveBoundary_holdsExactlyForTerminatingConversions() {
        // 2.5 cent is EXACTLY 1089 sq ft, so a >= 1089 bound includes it and a >= 1090 bound does
        // not. An inclusive bound that only "nearly" holds would make the control lie at its edges.
        BigDecimal atBoundary = AreaNormalizer.toSqft(bd("2.5"), "cent");
        assertEquals(0, atBoundary.compareTo(bd("1089")));
        assertEquals(1, atBoundary.compareTo(bd("1088.999999")));
        assertEquals(-1, atBoundary.compareTo(bd("1089.000001")));
    }

    @Test
    void unitParsing_ignoresCaseAndCollapsesWhitespace() {
        BigDecimal expected = AreaNormalizer.toSqft(bd("100"), "sq ft");
        assertEquals(expected, AreaNormalizer.toSqft(bd("100"), "  SQ   FT "));
        assertEquals(expected, AreaNormalizer.toSqft(bd("100"), "Sq Ft"));
        assertEquals("sq ft", AreaNormalizer.canonicalUnitToken("  SQ   FT "));
    }

    // ── Everything that must return null rather than a fabricated number ───────────────────────

    @Test
    void unrecognisedUnit_isUnresolvedAndIsNeverCoercedToSqft() {
        // SQ_YD is writable vocabulary with NO conversion path (0 rows use it today). Treating it
        // as sq ft would understate a plot by ~9x — silently, and in the direction that keeps the
        // row in the result set.
        assertNull(AreaNormalizer.toSqft(bd("1200"), "SQ_YD"));
        assertNull(AreaNormalizer.toSqft(bd("1200"), "sq yd"));
        assertNull(AreaNormalizer.toSqft(bd("1200"), "hectare"));
        assertNull(AreaNormalizer.toSqft(bd("1200"), ""));
        assertNull(AreaNormalizer.toSqft(bd("1200"), "   "));
        assertNull(AreaNormalizer.toSqft(bd("1200"), null));
    }

    @Test
    void missingOrNonPositiveValue_isUnresolved() {
        assertNull(AreaNormalizer.toSqft(null, "sqft"));
        assertNull(AreaNormalizer.toSqft(BigDecimal.ZERO, "sqft"));
        assertNull(AreaNormalizer.toSqft(bd("-1"), "sqft"));
    }

    @Test
    void everyDeclaredUnitHasAtLeastOneAliasAndAPositiveFactor() {
        for (AreaNormalizer.AreaUnit unit : AreaNormalizer.AreaUnit.values()) {
            assertNotNull(unit.sqftFactor(), unit.name());
            assertEquals(1, unit.sqftFactor().compareTo(BigDecimal.ZERO), unit.name());
            org.junit.jupiter.api.Assertions.assertFalse(unit.aliases().isEmpty(), unit.name());
            for (String alias : unit.aliases()) {
                assertEquals(alias, AreaNormalizer.canonicalUnitToken(alias),
                        "alias must already be in canonical comparison form: " + alias);
                assertEquals(unit, AreaNormalizer.parseUnit(alias));
            }
        }
    }
}
