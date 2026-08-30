package com.example.realestate.trust;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link PhoneEncryptionConverter}.
 *
 * <p>No Spring context — exercises pure crypto logic with the dev/test fallback key.
 */
class PhoneEncryptionConverterTest {

    private PhoneEncryptionConverter converter;

    @BeforeEach
    void setUp() {
        converter = new PhoneEncryptionConverter();
        converter.clearCachedKey();
    }

    // --- encrypt/decrypt roundtrip ---

    @Test
    void roundTrip_preservesPlaintext() {
        String phone = "+919876543210";
        String encrypted = converter.convertToDatabaseColumn(phone);
        assertTrue(encrypted.startsWith(PhoneEncryptionConverter.ENC_PREFIX),
                "Encrypted value must start with ENC: prefix");

        String decrypted = converter.convertToEntityAttribute(encrypted);
        assertEquals(phone, decrypted);
    }

    @Test
    void roundTrip_shortPhone() {
        String phone = "1234";
        String encrypted = converter.convertToDatabaseColumn(phone);
        String decrypted = converter.convertToEntityAttribute(encrypted);
        assertEquals(phone, decrypted);
    }

    // --- null handling ---

    @Test
    void encrypt_null_returnsNull() {
        assertNull(converter.convertToDatabaseColumn(null));
    }

    @Test
    void decrypt_null_returnsNull() {
        assertNull(converter.convertToEntityAttribute(null));
    }

    // --- empty string handling ---

    @Test
    void encrypt_emptyString_returnsEmpty() {
        assertEquals("", converter.convertToDatabaseColumn(""));
    }

    @Test
    void decrypt_emptyString_returnsEmpty() {
        assertEquals("", converter.convertToEntityAttribute(""));
    }

    // --- idempotency ---

    @Test
    void encrypt_alreadyEncrypted_returnsUnchanged() {
        String phone = "+919876543210";
        String encrypted = converter.convertToDatabaseColumn(phone);

        // Encrypt again — should be idempotent
        String doubleEncrypted = converter.convertToDatabaseColumn(encrypted);
        assertEquals(encrypted, doubleEncrypted, "Already-encrypted value must pass through unchanged");
    }

    // --- legacy plaintext in DB ---

    @Test
    void decrypt_legacyPlaintext_returnsAsIs() {
        // Before migration runs, DB may still have plaintext
        String plainPhone = "+919876543210";
        String result = converter.convertToEntityAttribute(plainPhone);
        assertEquals(plainPhone, result, "Plaintext without ENC: prefix should be returned as-is");
    }

    // --- uniqueness (different IVs) ---

    @Test
    void encrypt_sameValue_producesDifferentCiphertexts() {
        String phone = "+919876543210";
        String enc1 = converter.convertToDatabaseColumn(phone);
        String enc2 = converter.convertToDatabaseColumn(phone);
        assertNotEquals(enc1, enc2, "Each encryption should use a unique random IV");

        // Both should decrypt to the same value
        assertEquals(phone, converter.convertToEntityAttribute(enc1));
        assertEquals(phone, converter.convertToEntityAttribute(enc2));
    }
}
