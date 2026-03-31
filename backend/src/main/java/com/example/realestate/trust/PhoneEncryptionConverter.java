package com.example.realestate.trust;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * JPA converter that transparently encrypts/decrypts phone numbers using AES-256-GCM.
 *
 * <p>Storage format: {@code ENC:}<i>Base64(IV || ciphertext || authTag)</i>.
 * IV is 12 bytes; GCM auth tag is 128 bits (16 bytes).
 *
 * <p>Key source: environment variable {@code PHONE_ENCRYPTION_KEY} (Base64-encoded 32 bytes).
 * Falls back to Spring property {@code security.phone.encryption-key}.
 *
 * <p>Null-safe: {@code null} in produces {@code null} out; empty string passes through unchanged.
 * Idempotent: values already prefixed with {@code ENC:} are not double-encrypted.
 */
@Converter
public class PhoneEncryptionConverter implements AttributeConverter<String, String> {

    static final String ENC_PREFIX = "ENC:";
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();

    // --- key resolution (env var > Spring property > hardcoded dev key) ---

    private volatile byte[] cachedKey;

    byte[] resolveKey() {
        if (cachedKey != null) {
            return cachedKey;
        }
        String b64 = System.getenv("PHONE_ENCRYPTION_KEY");
        if (b64 == null || b64.isBlank()) {
            b64 = System.getProperty("security.phone.encryption-key");
        }
        if (b64 == null || b64.isBlank()) {
            // Dev/test fallback — NEVER rely on this in production
            b64 = "QUVTMjU2R0NNLXRlc3Qta2V5LWZvci1kZXYtb25seTA=";
        }
        byte[] key = Base64.getDecoder().decode(b64);
        if (key.length != 32) {
            throw new IllegalStateException(
                    "PHONE_ENCRYPTION_KEY must decode to exactly 32 bytes, got " + key.length);
        }
        cachedKey = key;
        return key;
    }

    // ---- AttributeConverter contract ----

    @Override
    public String convertToDatabaseColumn(String plainPhone) {
        if (plainPhone == null) {
            return null;
        }
        if (plainPhone.isEmpty()) {
            return plainPhone;
        }
        if (plainPhone.startsWith(ENC_PREFIX)) {
            // Already encrypted (idempotency guard)
            return plainPhone;
        }
        return encrypt(plainPhone);
    }

    @Override
    public String convertToEntityAttribute(String dbValue) {
        if (dbValue == null) {
            return null;
        }
        if (dbValue.isEmpty()) {
            return dbValue;
        }
        if (!dbValue.startsWith(ENC_PREFIX)) {
            // Legacy plaintext — return as-is (migration may not have run yet)
            return dbValue;
        }
        return decrypt(dbValue);
    }

    // ---- Crypto helpers (package-visible for migration reuse) ----

    String encrypt(String plaintext) {
        try {
            byte[] key = resolveKey();
            byte[] iv = new byte[GCM_IV_LENGTH];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));

            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));

            // Concatenate IV + ciphertext (GCM appends auth tag to ciphertext)
            byte[] combined = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

            return ENC_PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            throw new IllegalStateException("Phone encryption failed", e);
        }
    }

    String decrypt(String encValue) {
        try {
            String b64 = encValue.substring(ENC_PREFIX.length());
            byte[] combined = Base64.getDecoder().decode(b64);

            byte[] key = resolveKey();
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);

            byte[] ciphertext = new byte[combined.length - GCM_IV_LENGTH];
            System.arraycopy(combined, GCM_IV_LENGTH, ciphertext, 0, ciphertext.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));

            byte[] plainBytes = cipher.doFinal(ciphertext);
            return new String(plainBytes, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Phone decryption failed", e);
        }
    }

    /** Clears the cached key — used by tests only. */
    void clearCachedKey() {
        cachedKey = null;
    }
}
