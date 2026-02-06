package com.example.realestate.listing;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class AreaUnitConverterTest {

    @Nested
    class NormalizeUnitTests {

        @ParameterizedTest
        @CsvSource({
                "cent, cent",
                "cents, cent",
                "CENT, cent",
                "Cents, cent"
        })
        void normalizesCentVariants(String input, String expected) {
            assertThat(AreaUnitConverter.normalizeUnit(input)).isEqualTo(expected);
        }

        @ParameterizedTest
        @CsvSource({
                "sqft, sqft",
                "sq ft, sqft",
                "sq.ft, sqft",
                "sq.ft., sqft",
                "sft, sqft",
                "square feet, sqft",
                "square foot, sqft",
                "ft2, sqft",
                "ft², sqft",
                "SQFT, sqft",
                "SQ FT, sqft"
        })
        void normalizesSqftVariants(String input, String expected) {
            assertThat(AreaUnitConverter.normalizeUnit(input)).isEqualTo(expected);
        }

        @ParameterizedTest
        @CsvSource({
                "sqm, sqm",
                "sq m, sqm",
                "sq.m, sqm",
                "sq.m., sqm",
                "square meter, sqm",
                "square meters, sqm",
                "square metre, sqm",
                "square metres, sqm",
                "m2, sqm",
                "m², sqm",
                "SQM, sqm"
        })
        void normalizesSqmVariants(String input, String expected) {
            assertThat(AreaUnitConverter.normalizeUnit(input)).isEqualTo(expected);
        }

        @ParameterizedTest
        @NullAndEmptySource
        @ValueSource(strings = {"  ", "acre", "hectare", "unknown", "guntha", "gunta"})
        void returnsNullForUnrecognizedUnits(String input) {
            assertThat(AreaUnitConverter.normalizeUnit(input)).isNull();
        }
    }

    @Nested
    class ToCentTests {

        @Test
        void centInputReturnsAsIs() {
            BigDecimal result = AreaUnitConverter.toCent(new BigDecimal("10"), "cent");
            assertThat(result).isEqualByComparingTo("10");
        }

        @Test
        void centInputWithVariantUnit() {
            BigDecimal result = AreaUnitConverter.toCent(new BigDecimal("5.5"), "Cents");
            assertThat(result).isEqualByComparingTo("5.5");
        }

        @Test
        void sqftToCentConversion() {
            // 435.6 sqft = 1 cent
            BigDecimal result = AreaUnitConverter.toCent(new BigDecimal("435.6"), "sqft");
            assertThat(result).isEqualByComparingTo("1");
        }

        @Test
        void sqftToCentConversionWithVariantUnit() {
            // 871.2 sq ft = 2 cents
            BigDecimal result = AreaUnitConverter.toCent(new BigDecimal("871.2"), "sq ft");
            assertThat(result).isEqualByComparingTo("2");
        }

        @Test
        void sqmToCentConversion() {
            // 1 sqm = 10.7639104167 sqft
            // 10.7639104167 sqft / 435.6 sqft per cent = 0.0247105... cents
            BigDecimal result = AreaUnitConverter.toCent(new BigDecimal("1"), "sqm");
            assertThat(result.doubleValue()).isCloseTo(0.0247105, within(0.0000001));
        }

        @Test
        void sqmToCentConversionLargerValue() {
            // 100 sqm = 1076.39104167 sqft = 2.47105... cents
            BigDecimal result = AreaUnitConverter.toCent(new BigDecimal("100"), "square meters");
            assertThat(result.doubleValue()).isCloseTo(2.47105, within(0.00001));
        }

        @Test
        void returnsNullForNullValue() {
            assertThat(AreaUnitConverter.toCent(null, "sqft")).isNull();
        }

        @Test
        void returnsNullForZeroValue() {
            assertThat(AreaUnitConverter.toCent(BigDecimal.ZERO, "sqft")).isNull();
        }

        @Test
        void returnsNullForNegativeValue() {
            assertThat(AreaUnitConverter.toCent(new BigDecimal("-100"), "sqft")).isNull();
        }

        @Test
        void returnsNullForNullUnit() {
            assertThat(AreaUnitConverter.toCent(new BigDecimal("100"), null)).isNull();
        }

        @Test
        void returnsNullForUnrecognizedUnit() {
            assertThat(AreaUnitConverter.toCent(new BigDecimal("100"), "acre")).isNull();
        }

        @Test
        void returnsNullForEmptyUnit() {
            assertThat(AreaUnitConverter.toCent(new BigDecimal("100"), "")).isNull();
        }

        @Test
        void returnsNullForBlankUnit() {
            assertThat(AreaUnitConverter.toCent(new BigDecimal("100"), "   ")).isNull();
        }
    }

    @Nested
    class ComputePricePerCentPaiseTests {

        @Test
        void computesCorrectly() {
            // 1000000 paise / 10 cents = 100000 paise per cent
            Long result = AreaUnitConverter.computePricePerCentPaise(1000000L, new BigDecimal("10"));
            assertThat(result).isEqualTo(100000L);
        }

        @Test
        void roundsHalfUp() {
            // 100 paise / 3 cents = 33.333... -> rounds to 33
            Long result = AreaUnitConverter.computePricePerCentPaise(100L, new BigDecimal("3"));
            assertThat(result).isEqualTo(33L);

            // 200 paise / 3 cents = 66.666... -> rounds to 67
            Long result2 = AreaUnitConverter.computePricePerCentPaise(200L, new BigDecimal("3"));
            assertThat(result2).isEqualTo(67L);
        }

        @Test
        void handlesLargeValues() {
            // 50 lakh rupees (5000000000 paise) / 10 cents = 500000000 paise per cent
            Long result = AreaUnitConverter.computePricePerCentPaise(5000000000L, new BigDecimal("10"));
            assertThat(result).isEqualTo(500000000L);
        }

        @Test
        void handlesSmallAreaValues() {
            // 1000000 paise / 0.5 cents = 2000000 paise per cent
            Long result = AreaUnitConverter.computePricePerCentPaise(1000000L, new BigDecimal("0.5"));
            assertThat(result).isEqualTo(2000000L);
        }

        @Test
        void returnsNullForNullPrice() {
            assertThat(AreaUnitConverter.computePricePerCentPaise(null, new BigDecimal("10"))).isNull();
        }

        @Test
        void returnsNullForZeroPrice() {
            assertThat(AreaUnitConverter.computePricePerCentPaise(0L, new BigDecimal("10"))).isNull();
        }

        @Test
        void returnsNullForNegativePrice() {
            assertThat(AreaUnitConverter.computePricePerCentPaise(-100L, new BigDecimal("10"))).isNull();
        }

        @Test
        void returnsNullForNullArea() {
            assertThat(AreaUnitConverter.computePricePerCentPaise(1000000L, null)).isNull();
        }

        @Test
        void returnsNullForZeroArea() {
            assertThat(AreaUnitConverter.computePricePerCentPaise(1000000L, BigDecimal.ZERO)).isNull();
        }

        @Test
        void returnsNullForNegativeArea() {
            assertThat(AreaUnitConverter.computePricePerCentPaise(1000000L, new BigDecimal("-10"))).isNull();
        }
    }

    @Nested
    class IntegrationTests {

        @Test
        void endToEndSqftConversion() {
            // 4356 sqft at 50 lakh rupees
            // 4356 sqft = 10 cents
            // 50 lakh = 5000000 rupees = 500000000 paise
            // Price per cent = 500000000 / 10 = 50000000 paise (5 lakh per cent)

            BigDecimal areaCent = AreaUnitConverter.toCent(new BigDecimal("4356"), "sqft");
            assertThat(areaCent).isEqualByComparingTo("10");

            Long pricePerCent = AreaUnitConverter.computePricePerCentPaise(500000000L, areaCent);
            assertThat(pricePerCent).isEqualTo(50000000L);
        }

        @Test
        void endToEndSqmConversion() {
            // 100 sqm property
            // 100 sqm = 1076.39104167 sqft = 2.47105... cents
            BigDecimal areaCent = AreaUnitConverter.toCent(new BigDecimal("100"), "sqm");

            // At 10 lakh rupees (100000000 paise)
            // Price per cent = 100000000 / 2.47105 = ~40468578 paise per cent
            Long pricePerCent = AreaUnitConverter.computePricePerCentPaise(100000000L, areaCent);
            assertThat(pricePerCent).isBetween(40468500L, 40468600L);
        }

        @Test
        void endToEndCentConversion() {
            // 5 cents at 25 lakh rupees
            // 25 lakh = 2500000 rupees = 250000000 paise
            // Price per cent = 250000000 / 5 = 50000000 paise (5 lakh per cent)

            BigDecimal areaCent = AreaUnitConverter.toCent(new BigDecimal("5"), "cent");
            assertThat(areaCent).isEqualByComparingTo("5");

            Long pricePerCent = AreaUnitConverter.computePricePerCentPaise(250000000L, areaCent);
            assertThat(pricePerCent).isEqualTo(50000000L);
        }
    }
}
