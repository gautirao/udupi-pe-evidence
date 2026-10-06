package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PhoneHasherTest {

    private static final String KEY_A = "QUVTMjU2R0NNLXRlc3Qta2V5LWZvci1kZXYtb25seTA=";
    private static final String KEY_B = "ZGlmZmVyZW50LWtleS1mb3ItaGFzaGVyLXRlc3QtMDE=";

    @Test
    @DisplayName("hash is deterministic for the same key and phone")
    void deterministic() {
        PhoneHasher h = new PhoneHasher(KEY_A);
        assertThat(h.hash("+919876541234")).isEqualTo(h.hash("+919876541234"));
    }

    @Test
    @DisplayName("hash is 64 lowercase hex chars and does not contain the digits or equal an unkeyed SHA-256")
    void hexAndNotRawDigits() throws Exception {
        String hash = new PhoneHasher(KEY_A).hash("+919876541234");
        assertThat(hash).matches("[0-9a-f]{64}");
        assertThat(hash).doesNotContain("9876541234");
        byte[] unkeyed = java.security.MessageDigest.getInstance("SHA-256")
                .digest("919876541234".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : unkeyed) sb.append(String.format("%02x", b));
        assertThat(hash).as("must be keyed, not a plain SHA-256 of the digits").isNotEqualTo(sb.toString());
    }

    @Test
    @DisplayName("different phones hash differently")
    void distinctPhonesDistinctHashes() {
        PhoneHasher h = new PhoneHasher(KEY_A);
        assertThat(h.hash("+919876541234")).isNotEqualTo(h.hash("+919876541235"));
    }

    @Test
    @DisplayName("keyed: a different master key yields a different hash for the same phone")
    void differentKeyDifferentHash() {
        assertThat(new PhoneHasher(KEY_A).hash("+919876541234"))
                .isNotEqualTo(new PhoneHasher(KEY_B).hash("+919876541234"));
    }

    @Test
    @DisplayName("formatting variants of the same Indian number normalise to the same hash")
    void normalisesFormatting() {
        PhoneHasher h = new PhoneHasher(KEY_A);
        String canonical = h.hash("+919876541234");
        assertThat(h.hash("919876541234")).isEqualTo(canonical);
        assertThat(h.hash("9876541234")).isEqualTo(canonical);
    }

    @Test
    @DisplayName("normalizeDigits strips a leading + and prefixes 91 to bare 10-digit numbers")
    void normalizeDigits() {
        assertThat(PhoneHasher.normalizeDigits("+919876541234")).isEqualTo("919876541234");
        assertThat(PhoneHasher.normalizeDigits("9876541234")).isEqualTo("919876541234");
    }

    @Test
    @DisplayName("trunk 0 and international 00 prefixes canonicalise to the same digits and hash as +91 / bare forms")
    void trunkAndInternationalPrefixesNormalise() {
        PhoneHasher h = new PhoneHasher(KEY_A);
        String canonical = h.hash("+919876541234");
        for (String variant : new String[] {"09876541234", "0919876541234", "00919876541234",
                "+919876541234", "9876541234", "+91 98765-41234"}) {
            assertThat(PhoneHasher.normalizeDigits(variant)).as(variant).isEqualTo("919876541234");
            assertThat(h.hash(variant)).as(variant).isEqualTo(canonical);
        }
    }
}
