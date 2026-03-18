package com.example.realestate.listing.area;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class AreaNormalizerTest {

    // Tolerance for comparing BigDecimal values (due to division precision)
    // Single-step conversions are accurate to 6 decimal places
    private static final BigDecimal TOLERANCE = new BigDecimal("0.000001");
    // Round-trip conversions accumulate error, allow wider tolerance
    private static final BigDecimal ROUND_TRIP_TOLERANCE = new BigDecimal("0.0001");

    @Nested
    @DisplayName("normalize - SQM input")
    class NormalizeSqmTests {

        @Test
        @DisplayName("100 sqm normalizes correctly")
        void sqmInput_normalizesCorrectly() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("100"), "sqm");

            assertThat(result.areaSqm()).isEqualByComparingTo(new BigDecimal("100"));
            // 100 sqm * 10.7639104167 sqft/sqm = 1076.39104167 sqft
            assertThat(result.areaSqft()).isCloseTo(
                    new BigDecimal("1076.391042"), within(TOLERANCE));
            // 100 sqm / 40.4686... sqm/cent = 2.471... cents
            assertThat(result.areaCent()).isCloseTo(
                    new BigDecimal("2.471054"), within(TOLERANCE));
        }

        @ParameterizedTest
        @DisplayName("SQM unit variations are recognized")
        @CsvSource({
            "sqm", "SQM", "Sqm",
            "sq m", "SQ M", "Sq M",
            "sqmtr", "sqmtrs",
            "square meter", "square meters",
            "square metre", "square metres",
            "m2"
        })
        void sqmVariations_recognized(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("100"), unit);

            assertThat(result.areaSqm()).isNotNull();
            assertThat(result.areaSqft()).isNotNull();
            assertThat(result.areaCent()).isNotNull();
        }
    }

    @Nested
    @DisplayName("normalize - SQFT input")
    class NormalizeSqftTests {

        @Test
        @DisplayName("1000 sqft normalizes correctly")
        void sqftInput_normalizesCorrectly() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1000"), "sqft");

            assertThat(result.areaSqft()).isEqualByComparingTo(new BigDecimal("1000"));
            // 1000 sqft / 10.7639104167 sqft/sqm = 92.903... sqm
            assertThat(result.areaSqm()).isCloseTo(
                    new BigDecimal("92.903040"), within(TOLERANCE));
            // 1000 sqft / 435.6 sqft/cent = 2.2956... cents
            assertThat(result.areaCent()).isCloseTo(
                    new BigDecimal("2.295684"), within(TOLERANCE));
        }

        @Test
        @DisplayName("435.6 sqft equals exactly 1 cent")
        void sqftEqualsCent_normalizesCorrectly() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("435.6"), "sqft");

            assertThat(result.areaCent()).isCloseTo(
                    new BigDecimal("1.000000"), within(TOLERANCE));
        }

        @ParameterizedTest
        @DisplayName("SQFT unit variations are recognized")
        @CsvSource({
            "sqft", "SQFT", "SqFt",
            "sq ft", "SQ FT",
            "sft",
            "square foot", "square feet",
            "ft2"
        })
        void sqftVariations_recognized(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1000"), unit);

            assertThat(result.areaSqm()).isNotNull();
            assertThat(result.areaSqft()).isNotNull();
            assertThat(result.areaCent()).isNotNull();
        }
    }

    @Nested
    @DisplayName("normalize - CENT input")
    class NormalizeCentTests {

        @Test
        @DisplayName("10 cents normalizes correctly")
        void centInput_normalizesCorrectly() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("10"), "cent");

            assertThat(result.areaCent()).isEqualByComparingTo(new BigDecimal("10"));
            // 10 cents * 435.6 sqft/cent = 4356 sqft
            assertThat(result.areaSqft()).isEqualByComparingTo(new BigDecimal("4356"));
            // 10 cents * (435.6 / 10.7639104167) sqm/cent = 404.68... sqm
            assertThat(result.areaSqm()).isCloseTo(
                    new BigDecimal("404.685642"), within(TOLERANCE));
        }

        @Test
        @DisplayName("1 cent equals 435.6 sqft")
        void oneCent_equals435Sqft() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "cent");

            assertThat(result.areaSqft()).isEqualByComparingTo(new BigDecimal("435.6"));
        }

        @ParameterizedTest
        @DisplayName("CENT unit variations are recognized")
        @CsvSource({
            "cent", "CENT", "Cent",
            "cents", "CENTS"
        })
        void centVariations_recognized(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("10"), unit);

            assertThat(result.areaSqm()).isNotNull();
            assertThat(result.areaSqft()).isNotNull();
            assertThat(result.areaCent()).isNotNull();
        }
    }

    @Nested
    @DisplayName("normalize - Invalid inputs")
    class NormalizeInvalidInputTests {

        @Test
        @DisplayName("Null area returns empty")
        void nullArea_returnsEmpty() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(null, "sqft");

            assertThat(result.areaSqm()).isNull();
            assertThat(result.areaSqft()).isNull();
            assertThat(result.areaCent()).isNull();
        }

        @Test
        @DisplayName("Zero area returns empty")
        void zeroArea_returnsEmpty() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    BigDecimal.ZERO, "sqft");

            assertThat(result.areaSqm()).isNull();
            assertThat(result.areaSqft()).isNull();
            assertThat(result.areaCent()).isNull();
        }

        @Test
        @DisplayName("Negative area returns empty")
        void negativeArea_returnsEmpty() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("-100"), "sqft");

            assertThat(result.areaSqm()).isNull();
            assertThat(result.areaSqft()).isNull();
            assertThat(result.areaCent()).isNull();
        }

        @ParameterizedTest
        @DisplayName("Null and empty units return empty")
        @NullAndEmptySource
        @ValueSource(strings = {"   ", "\t", "\n"})
        void nullAndEmptyUnit_returnsEmpty(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("100"), unit);

            assertThat(result.areaSqm()).isNull();
            assertThat(result.areaSqft()).isNull();
            assertThat(result.areaCent()).isNull();
        }

        @ParameterizedTest
        @DisplayName("Unknown units return empty")
        @ValueSource(strings = {
            "hectare", "ha",
            "guntha", "ground",
            "are", "ares", "unknown", "xyz"
        })
        void unknownUnit_returnsEmpty(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("100"), unit);

            assertThat(result.areaSqm()).isNull();
            assertThat(result.areaSqft()).isNull();
            assertThat(result.areaCent()).isNull();
        }
    }

    @Nested
    @DisplayName("normalize - GUNTA input")
    class NormalizeGuntaTests {

        @Test
        @DisplayName("1 gunta = 1089 sqft exactly")
        void oneGunta_sqftIsExact() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "gunta");

            assertThat(result.areaSqft()).isEqualByComparingTo(new BigDecimal("1089"));
        }

        @Test
        @DisplayName("1 gunta sqm conversion correct")
        void oneGunta_sqmIsCorrect() {
            // 1089 sqft / 10.7639104167 sqft/sqm ≈ 101.17 sqm
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "gunta");

            assertThat(result.areaSqm()).isCloseTo(new BigDecimal("101.17"), within(new BigDecimal("0.01")));
        }

        @Test
        @DisplayName("1 gunta cent conversion correct")
        void oneGunta_centIsCorrect() {
            // 1089 sqft / 435.6 sqft/cent ≈ 2.5 cents
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "gunta");

            assertThat(result.areaCent()).isCloseTo(new BigDecimal("2.5"), within(new BigDecimal("0.01")));
        }

        @ParameterizedTest
        @DisplayName("GUNTA unit variations are recognized")
        @CsvSource({
            "gunta", "GUNTA", "Gunta",
            "guntas", "GUNTAS"
        })
        void guntaVariations_recognized(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), unit);

            assertThat(result.areaSqm()).isNotNull();
            assertThat(result.areaSqft()).isNotNull();
            assertThat(result.areaCent()).isNotNull();
        }
    }

    @Nested
    @DisplayName("normalize - ACRE input")
    class NormalizeAcreTests {

        @Test
        @DisplayName("1 acre = 43560 sqft exactly")
        void oneAcre_sqftIsExact() {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "acre");

            assertThat(result.areaSqft()).isEqualByComparingTo(new BigDecimal("43560"));
        }

        @Test
        @DisplayName("1 acre = 100 cents")
        void oneAcre_centIsCorrect() {
            // 43560 sqft / 435.6 sqft/cent = 100 cents
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "acre");

            assertThat(result.areaCent()).isEqualByComparingTo(new BigDecimal("100"));
        }

        @Test
        @DisplayName("1 acre sqm conversion correct")
        void oneAcre_sqmIsCorrect() {
            // 43560 sqft / 10.7639104167 sqft/sqm ≈ 4046.86 sqm
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), "acre");

            assertThat(result.areaSqm()).isCloseTo(new BigDecimal("4046.86"), within(new BigDecimal("0.01")));
        }

        @ParameterizedTest
        @DisplayName("ACRE unit variations are recognized")
        @CsvSource({
            "acre", "ACRE", "Acre",
            "acres", "ACRES"
        })
        void acreVariations_recognized(String unit) {
            AreaNormalizer.NormalizedArea result = AreaNormalizer.normalize(
                    new BigDecimal("1"), unit);

            assertThat(result.areaSqm()).isNotNull();
            assertThat(result.areaSqft()).isNotNull();
            assertThat(result.areaCent()).isNotNull();
        }
    }

    @Nested
    @DisplayName("normalize - Conversion consistency")
    class ConversionConsistencyTests {

        @Test
        @DisplayName("Round-trip sqm->sqft->sqm preserves value")
        void roundTrip_sqmToSqftToSqm_preservesValue() {
            BigDecimal originalSqm = new BigDecimal("100");
            AreaNormalizer.NormalizedArea first = AreaNormalizer.normalize(originalSqm, "sqm");
            AreaNormalizer.NormalizedArea second = AreaNormalizer.normalize(first.areaSqft(), "sqft");

            assertThat(second.areaSqm()).isCloseTo(originalSqm, within(ROUND_TRIP_TOLERANCE));
        }

        @Test
        @DisplayName("Round-trip cent->sqft->cent preserves value")
        void roundTrip_centToSqftToCent_preservesValue() {
            BigDecimal originalCent = new BigDecimal("10");
            AreaNormalizer.NormalizedArea first = AreaNormalizer.normalize(originalCent, "cent");
            AreaNormalizer.NormalizedArea second = AreaNormalizer.normalize(first.areaSqft(), "sqft");

            assertThat(second.areaCent()).isCloseTo(originalCent, within(ROUND_TRIP_TOLERANCE));
        }

        @Test
        @DisplayName("All three input units produce consistent sqm output")
        void allUnits_produceConsistentSqm() {
            // Define 100 sqm as base
            BigDecimal baseSqm = new BigDecimal("100");
            AreaNormalizer.NormalizedArea fromSqm = AreaNormalizer.normalize(baseSqm, "sqm");

            // Convert that to equivalent sqft and cent, then normalize those
            AreaNormalizer.NormalizedArea fromSqft = AreaNormalizer.normalize(
                    fromSqm.areaSqft(), "sqft");
            AreaNormalizer.NormalizedArea fromCent = AreaNormalizer.normalize(
                    fromSqm.areaCent(), "cent");

            // All should produce the same sqm value (within round-trip tolerance)
            assertThat(fromSqft.areaSqm()).isCloseTo(baseSqm, within(ROUND_TRIP_TOLERANCE));
            assertThat(fromCent.areaSqm()).isCloseTo(baseSqm, within(ROUND_TRIP_TOLERANCE));
        }
    }

    @Nested
    @DisplayName("computePricePerCentPaise")
    class ComputePricePerCentPaiseTests {

        @Test
        @DisplayName("Valid price and area computes correctly")
        void validInputs_computesCorrectly() {
            // 10 lakh paise (₹10,000) for 5 cents = 2 lakh paise (₹2,000) per cent
            Long result = AreaNormalizer.computePricePerCentPaise(
                    1_000_000L, new BigDecimal("5"));

            assertThat(result).isEqualTo(200_000L);
        }

        @Test
        @DisplayName("5 crore paise (₹5L) for 10 cents = 50 lakh paise per cent")
        void realisticExample_computesCorrectly() {
            // ₹5 lakh = 5,00,00,000 paise for 10 cents
            // = 50,00,000 paise (₹50,000) per cent
            Long result = AreaNormalizer.computePricePerCentPaise(
                    50_000_000L, new BigDecimal("10"));

            assertThat(result).isEqualTo(5_000_000L);
        }

        @Test
        @DisplayName("Fractional cent rounds correctly with HALF_UP")
        void fractionalCent_roundsCorrectly() {
            // 100 paise / 3 cents = 33.33... paise, rounds to 33
            Long result = AreaNormalizer.computePricePerCentPaise(
                    100L, new BigDecimal("3"));

            assertThat(result).isEqualTo(33L);

            // 200 paise / 3 cents = 66.66... paise, rounds to 67
            Long result2 = AreaNormalizer.computePricePerCentPaise(
                    200L, new BigDecimal("3"));

            assertThat(result2).isEqualTo(67L);
        }

        @Test
        @DisplayName("Null price returns null")
        void nullPrice_returnsNull() {
            Long result = AreaNormalizer.computePricePerCentPaise(
                    null, new BigDecimal("5"));

            assertThat(result).isNull();
        }

        @Test
        @DisplayName("Zero price returns null")
        void zeroPrice_returnsNull() {
            Long result = AreaNormalizer.computePricePerCentPaise(
                    0L, new BigDecimal("5"));

            assertThat(result).isNull();
        }

        @Test
        @DisplayName("Negative price returns null")
        void negativePrice_returnsNull() {
            Long result = AreaNormalizer.computePricePerCentPaise(
                    -100L, new BigDecimal("5"));

            assertThat(result).isNull();
        }

        @Test
        @DisplayName("Null area returns null")
        void nullArea_returnsNull() {
            Long result = AreaNormalizer.computePricePerCentPaise(
                    1_000_000L, null);

            assertThat(result).isNull();
        }

        @Test
        @DisplayName("Zero area returns null")
        void zeroArea_returnsNull() {
            Long result = AreaNormalizer.computePricePerCentPaise(
                    1_000_000L, BigDecimal.ZERO);

            assertThat(result).isNull();
        }

        @Test
        @DisplayName("Negative area returns null")
        void negativeArea_returnsNull() {
            Long result = AreaNormalizer.computePricePerCentPaise(
                    1_000_000L, new BigDecimal("-5"));

            assertThat(result).isNull();
        }

        @Test
        @DisplayName("Large values compute without overflow")
        void largeValues_computeWithoutOverflow() {
            // 100 crore rupees = 10,000,000,000 paise for 100 cents
            // = 100,000,000 paise (1 crore rupees) per cent
            Long result = AreaNormalizer.computePricePerCentPaise(
                    10_000_000_000L, new BigDecimal("100"));

            assertThat(result).isEqualTo(100_000_000L);
        }

        @Test
        @DisplayName("Small fractional area computes correctly")
        void smallFractionalArea_computesCorrectly() {
            // 1000 paise for 0.5 cents = 2000 paise per cent
            Long result = AreaNormalizer.computePricePerCentPaise(
                    1000L, new BigDecimal("0.5"));

            assertThat(result).isEqualTo(2000L);
        }
    }

    @Nested
    @DisplayName("Integration - normalize + computePricePerCentPaise")
    class IntegrationTests {

        @Test
        @DisplayName("Full pipeline: 1000 sqft at ₹5L = ₹X per cent")
        void fullPipeline_sqftToPrice() {
            // Step 1: Normalize 1000 sqft
            AreaNormalizer.NormalizedArea normalized = AreaNormalizer.normalize(
                    new BigDecimal("1000"), "sqft");

            // 1000 sqft / 435.6 sqft/cent = 2.2956... cents
            assertThat(normalized.areaCent()).isCloseTo(
                    new BigDecimal("2.295684"), within(TOLERANCE));

            // Step 2: Compute price per cent for ₹5 lakh = 50,000,000 paise
            Long pricePerCent = AreaNormalizer.computePricePerCentPaise(
                    50_000_000L, normalized.areaCent());

            // 50,000,000 / 2.2956... = 21,783,216 paise (₹2,17,832.16 per cent)
            assertThat(pricePerCent).isBetween(21_780_000L, 21_790_000L);
        }

        @Test
        @DisplayName("Full pipeline: 10 cents at ₹10L = ₹1L per cent")
        void fullPipeline_centToPrice() {
            // Step 1: Normalize 10 cents
            AreaNormalizer.NormalizedArea normalized = AreaNormalizer.normalize(
                    new BigDecimal("10"), "cent");

            // Step 2: Compute price per cent for ₹10 lakh = 100,000,000 paise
            Long pricePerCent = AreaNormalizer.computePricePerCentPaise(
                    100_000_000L, normalized.areaCent());

            // 100,000,000 / 10 = 10,000,000 paise (₹1 lakh per cent)
            assertThat(pricePerCent).isEqualTo(10_000_000L);
        }

        @Test
        @DisplayName("Invalid area produces null price per cent")
        void invalidArea_producesNullPrice() {
            // Step 1: Unknown unit returns empty
            AreaNormalizer.NormalizedArea normalized = AreaNormalizer.normalize(
                    new BigDecimal("100"), "hectare");

            assertThat(normalized.areaCent()).isNull();

            // Step 2: Null area cent produces null price
            Long pricePerCent = AreaNormalizer.computePricePerCentPaise(
                    50_000_000L, normalized.areaCent());

            assertThat(pricePerCent).isNull();
        }
    }
}
