package com.example.realestate.listing.pricing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class PriceParserTest {

    @Nested
    @DisplayName("parseToPaise - String parsing")
    class ParseToPaiseTests {

        @Test
        @DisplayName("Plain number: 50000 → 5000000 paise")
        void plainNumber_parsesCorrectly() {
            Long result = PriceParser.parseToPaise("50000");
            assertThat(result).isEqualTo(5_000_000L);
        }

        @Test
        @DisplayName("With rupee symbol: ₹50000 → 5000000 paise")
        void withRupeeSymbol_parsesCorrectly() {
            Long result = PriceParser.parseToPaise("₹50000");
            assertThat(result).isEqualTo(5_000_000L);
        }

        @Test
        @DisplayName("Indian comma format: ₹10,00,000 → 100000000 paise")
        void indianCommaFormat_parsesCorrectly() {
            Long result = PriceParser.parseToPaise("₹10,00,000");
            assertThat(result).isEqualTo(100_000_000L);
        }

        @Test
        @DisplayName("Lakhs with L: 5.5 L → 55000000 paise (550,000 rupees)")
        void lakhsWithL_parsesCorrectly() {
            // 5.5 lakh = 550,000 rupees = 55,000,000 paise
            Long result = PriceParser.parseToPaise("5.5 L");
            assertThat(result).isEqualTo(55_000_000L);
        }

        @Test
        @DisplayName("Lakhs with word: 50 lakhs → 500000000 paise (5,000,000 rupees)")
        void lakhsWithWord_parsesCorrectly() {
            // 50 lakh = 5,000,000 rupees = 500,000,000 paise
            Long result = PriceParser.parseToPaise("50 lakhs");
            assertThat(result).isEqualTo(500_000_000L);
        }

        @Test
        @DisplayName("Crores with Cr: 2 Cr → 2000000000 paise (20,000,000 rupees)")
        void croresWithCr_parsesCorrectly() {
            // 2 crore = 20,000,000 rupees = 2,000,000,000 paise
            Long result = PriceParser.parseToPaise("2 Cr");
            assertThat(result).isEqualTo(2_000_000_000L);
        }

        @Test
        @DisplayName("Crores with decimal: 2.5 crores → 2500000000 paise (25,000,000 rupees)")
        void croresWithDecimal_parsesCorrectly() {
            // 2.5 crore = 25,000,000 rupees = 2,500,000,000 paise
            Long result = PriceParser.parseToPaise("2.5 crores");
            assertThat(result).isEqualTo(2_500_000_000L);
        }

        @ParameterizedTest
        @DisplayName("Lakh variations all parse correctly")
        @CsvSource({
            // 5 lakh = 500,000 rupees = 50,000,000 paise
            "'5 L', 50000000",
            "'5 l', 50000000",
            "'5 lakh', 50000000",
            "'5 Lakh', 50000000",
            "'5 lakhs', 50000000",
            "'5 lac', 50000000",
            "'5 lacs', 50000000",
            "'₹5 L', 50000000",
            "'₹ 5 L', 50000000"
        })
        void lakhVariations_parseCorrectly(String input, long expectedPaise) {
            assertThat(PriceParser.parseToPaise(input)).isEqualTo(expectedPaise);
        }

        @ParameterizedTest
        @DisplayName("Crore variations all parse correctly")
        @CsvSource({
            // 1 crore = 10,000,000 rupees = 1,000,000,000 paise
            "'1 Cr', 1000000000",
            "'1 cr', 1000000000",
            "'1 crore', 1000000000",
            "'1 Crore', 1000000000",
            "'1 crores', 1000000000",
            "'₹1 Cr', 1000000000",
            "'₹ 1 Cr', 1000000000"
        })
        void croreVariations_parseCorrectly(String input, long expectedPaise) {
            assertThat(PriceParser.parseToPaise(input)).isEqualTo(expectedPaise);
        }

        @ParameterizedTest
        @DisplayName("Null and empty inputs return null")
        @NullAndEmptySource
        @ValueSource(strings = {"   ", "\t", "\n"})
        void nullAndEmptyInputs_returnNull(String input) {
            assertThat(PriceParser.parseToPaise(input)).isNull();
        }

        @ParameterizedTest
        @DisplayName("Invalid inputs return null")
        @ValueSource(strings = {"abc", "price", "₹", "L", "Cr", "free"})
        void invalidInputs_returnNull(String input) {
            assertThat(PriceParser.parseToPaise(input)).isNull();
        }

        @Test
        @DisplayName("Large crore value parses without overflow")
        void largeCroreValue_parsesWithoutOverflow() {
            // 500 crores = 5,000,000,000 rupees = 500,000,000,000 paise
            Long result = PriceParser.parseToPaise("500 Cr");
            assertThat(result).isEqualTo(500_000_000_000L);
        }

        @Test
        @DisplayName("Decimal paise rounds correctly")
        void decimalPaise_roundsCorrectly() {
            // 5.555 rupees = 555.5 paise, rounds to 556
            Long result = PriceParser.parseToPaise("5.555");
            assertThat(result).isEqualTo(556L);
        }
    }

    @Nested
    @DisplayName("rupeesToPaise - BigDecimal conversion")
    class RupeesToPaiseTests {

        @Test
        @DisplayName("Null input returns null")
        void nullInput_returnsNull() {
            assertThat(PriceParser.rupeesToPaise(null)).isNull();
        }

        @Test
        @DisplayName("Integer rupees convert correctly")
        void integerRupees_convertCorrectly() {
            BigDecimal rupees = new BigDecimal("50000");
            assertThat(PriceParser.rupeesToPaise(rupees)).isEqualTo(5_000_000L);
        }

        @Test
        @DisplayName("Decimal rupees convert correctly")
        void decimalRupees_convertCorrectly() {
            BigDecimal rupees = new BigDecimal("50000.50");
            assertThat(PriceParser.rupeesToPaise(rupees)).isEqualTo(5_000_050L);
        }

        @Test
        @DisplayName("Large values (5 million) convert correctly")
        void largeValues_convertCorrectly() {
            // 5 million rupees (50 lakhs)
            BigDecimal rupees = new BigDecimal("5000000");
            assertThat(PriceParser.rupeesToPaise(rupees)).isEqualTo(500_000_000L);
        }

        @Test
        @DisplayName("Sub-paise decimals round half-up")
        void subPaiseDecimals_roundHalfUp() {
            // 100.005 rupees = 10000.5 paise, rounds to 10001
            BigDecimal rupees = new BigDecimal("100.005");
            assertThat(PriceParser.rupeesToPaise(rupees)).isEqualTo(10_001L);

            // 100.004 rupees = 10000.4 paise, rounds to 10000
            BigDecimal rupees2 = new BigDecimal("100.004");
            assertThat(PriceParser.rupeesToPaise(rupees2)).isEqualTo(10_000L);
        }
    }

    @Nested
    @DisplayName("paiseToRupees - Reverse conversion")
    class PaiseToRupeesTests {

        @Test
        @DisplayName("Null input returns null")
        void nullInput_returnsNull() {
            assertThat(PriceParser.paiseToRupees(null)).isNull();
        }

        @Test
        @DisplayName("Paise convert to rupees correctly")
        void paise_convertToRupeesCorrectly() {
            assertThat(PriceParser.paiseToRupees(5_000_000L))
                    .isEqualByComparingTo(new BigDecimal("50000.00"));
        }

        @Test
        @DisplayName("Odd paise values produce correct decimals")
        void oddPaiseValues_produceCorrectDecimals() {
            assertThat(PriceParser.paiseToRupees(5_000_050L))
                    .isEqualByComparingTo(new BigDecimal("50000.50"));
        }

        @Test
        @DisplayName("Round-trip conversion preserves value")
        void roundTrip_preservesValue() {
            BigDecimal original = new BigDecimal("123456.78");
            Long paise = PriceParser.rupeesToPaise(original);
            BigDecimal result = PriceParser.paiseToRupees(paise);
            assertThat(result).isEqualByComparingTo(original);
        }
    }
}
