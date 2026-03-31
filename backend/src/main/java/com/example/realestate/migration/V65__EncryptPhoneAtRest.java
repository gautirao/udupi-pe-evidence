package com.example.realestate.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.Base64;
import java.util.UUID;

/**
 * One-time migration: encrypt all existing plaintext phone numbers in {@code profiles}
 * using AES-256-GCM. Idempotent — rows already prefixed with {@code ENC:} are skipped.
 *
 * <p>Uses raw JDBC because Flyway migrations run before the JPA entity manager is available.
 * The encryption logic mirrors {@link com.example.realestate.trust.PhoneEncryptionConverter}.
 */
public class V65__EncryptPhoneAtRest extends BaseJavaMigration {

    private static final String ENC_PREFIX = "ENC:";
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;

    @Override
    public void migrate(Context context) throws Exception {
        Connection conn = context.getConnection();

        byte[] key = resolveKey();
        SecureRandom secureRandom = new SecureRandom();

        // Select all profiles with non-null, non-empty phone that is not already encrypted
        String selectSql = "SELECT id, phone FROM profiles WHERE phone IS NOT NULL AND phone <> '' AND phone NOT LIKE 'ENC:%'";
        String updateSql = "UPDATE profiles SET phone = ? WHERE id = ?";

        try (PreparedStatement select = conn.prepareStatement(selectSql);
             ResultSet rs = select.executeQuery()) {

            try (PreparedStatement update = conn.prepareStatement(updateSql)) {
                int count = 0;
                while (rs.next()) {
                    UUID id = (UUID) rs.getObject("id");
                    String plainPhone = rs.getString("phone");

                    String encrypted = encrypt(plainPhone, key, secureRandom);

                    update.setString(1, encrypted);
                    update.setObject(2, id);
                    update.addBatch();
                    count++;

                    // Execute in batches of 500
                    if (count % 500 == 0) {
                        update.executeBatch();
                    }
                }
                if (count % 500 != 0) {
                    update.executeBatch();
                }
            }
        }
    }

    private byte[] resolveKey() {
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
        return key;
    }

    private String encrypt(String plaintext, byte[] key, SecureRandom secureRandom) throws Exception {
        byte[] iv = new byte[GCM_IV_LENGTH];
        secureRandom.nextBytes(iv);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.ENCRYPT_MODE,
                new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(GCM_TAG_BITS, iv));

        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return ENC_PREFIX + Base64.getEncoder().encodeToString(combined);
    }
}
