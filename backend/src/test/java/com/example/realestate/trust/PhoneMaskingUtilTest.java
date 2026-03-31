package com.example.realestate.trust;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Unit tests for {@link PhoneMaskingUtil}.
 */
class PhoneMaskingUtilTest {

    @Test
    void mask_fullPhone_showsLastFourDigits() {
        assertEquals("*********3210", PhoneMaskingUtil.mask("+919876543210"));
    }

    @Test
    void mask_exactlyFourChars_allVisible() {
        assertEquals("1234", PhoneMaskingUtil.mask("1234"));
    }

    @Test
    void mask_lessThanFourChars_returnsFourStars() {
        assertEquals("****", PhoneMaskingUtil.mask("123"));
    }

    @Test
    void mask_null_returnsFourStars() {
        assertEquals("****", PhoneMaskingUtil.mask(null));
    }

    @Test
    void mask_emptyString_returnsFourStars() {
        assertEquals("****", PhoneMaskingUtil.mask(""));
    }

    @Test
    void mask_fiveChars_masksFirstOne() {
        assertEquals("*5678", PhoneMaskingUtil.mask("15678"));
    }
}
