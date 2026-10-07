package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

/** Unit tests for the #1793 PR-C free-text contact-number rule. */
class ContactNumberRuleTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "Call me on 9876543210",
            "+91 98765 43210",
            "98765-43210",
            "98765.43210",
            "9876 543 210",
            "Call +91-9876543210",
            "(98765) 43210",
            "919876543210",
            "09876543210",
            "0 98765 43210",
            "reach me 6000000000 asap",
            "7123456789",
            "8123456789.",
            "9876543210 9123456780",
            "Call 9876543210 9123456780",
            "98765 43210 98765 43210",
            "see 1200 9876543210",
            "9876543210 1200 sqft",
            "98765 43200",            // a chunk ends in 00 but not ALL chunks: not a range
            "+91 98765 43200",
            "98765-43200",
            "9876543200",             // single chunk: never exempt
            "Call me on 9876543200",
            "pin 600028 1200 sqft",   // pincode + number: known limit, rejected
    })
    @DisplayName("phone-like text is rejected")
    void rejects(String text) {
        assertThat(ContactNumberRule.containsContactNumber(text)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "3 BHK", "1200 sqft", "50 lakh", "2020-2024", "6000000 - 9000000", "₹50,00,000",
            "budget 45-60 lakh", "2 BHK near 5th cross, 560078", "Built 1998", "plot 30x40",
            "5987654321",      // 10 digits but starts with 5
            "1234567890",      // 10 digits but starts with 1
            "98765432",        // 8 digits
            "98765432101",     // 11 digits not starting 0
            "919876543",       // 9 digits
            "5198765432 10",   // 12 digits starting 51 (not 91)
            "9000000 7500000",
            "1200 1500 2000 sqft options",
            "911234567890",    // 12 digits, 91 then 1 (not 6-9)
            "01234567890",     // 11 digits, 0 then 1 (not 6-9)
            "Rent 60000-75000",       // range: ALL chunks end in 00
            "budget 80000 - 95000",
            "65000 75000",
            "6000000-7500000",
            "2 to 3 BHK under 80 lakh",
            "",
    })
    @DisplayName("numeric-but-not-a-phone text is accepted")
    void accepts(String text) {
        assertThat(ContactNumberRule.containsContactNumber(text)).isFalse();
    }

    @Test
    @DisplayName("null and blank are accepted")
    void nullAndBlank() {
        assertThat(ContactNumberRule.containsContactNumber(null)).isFalse();
        assertThat(ContactNumberRule.containsContactNumber("   ")).isFalse();
    }

    @Test
    @DisplayName("linear time: 45 x '9876543210 ' (rejected) and a 100k-char separator/digit soup complete fast")
    void completesFast() {
        String repeated = "9876543210 ".repeat(45);
        boolean r1 = assertTimeoutPreemptively(Duration.ofMillis(500),
                () -> ContactNumberRule.containsContactNumber(repeated));
        // Joined numbers are rejected by the span search; still fast.
        assertThat(r1).isTrue();

        String soup = "1 . ( - ) ".repeat(10_000);
        assertTimeoutPreemptively(Duration.ofMillis(500), () -> ContactNumberRule.containsContactNumber(soup));
    }

    @Test
    @DisplayName("the message constant is the owner-approved text")
    void message() {
        assertThat(ContactNumberRule.MESSAGE)
                .isEqualTo("Please enter contact numbers only in the Phone / WhatsApp field.");
    }
}
