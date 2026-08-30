package com.example.realestate.trust.otp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.time.OffsetDateTime;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link StubOtpProvider}.
 *
 * <p>Tests the stub implementation in isolation — no Spring context required.
 * Expired-code tests manipulate internal state directly to avoid sleeping.
 */
class StubOtpProviderTest {

    private StubOtpProvider provider;

    private static final String PHONE = "+919876543210";

    @BeforeEach
    void setUp() {
        provider = new StubOtpProvider();
    }

    // -------------------------------------------------------------------------
    // send tests
    // -------------------------------------------------------------------------

    /**
     * send() must return a non-null result with a correlationId and future expiresAt.
     * The generated code must be 6 digits.
     */
    @Test
    void send_generatesCodeAndStoresIt() {
        OtpSendResult result = provider.send(PHONE);

        assertThat(result).isNotNull();
        assertThat(result.correlationId()).isNotNull().isNotBlank();
        assertThat(result.expiresAt()).isAfter(OffsetDateTime.now());

        // A freshly generated code should verify correctly
        // We use a helper to extract the code from internal state
        String code = extractCode(PHONE);
        assertThat(code).matches("\\d{6}");
        assertThat(provider.verify(PHONE, code)).isTrue();
    }

    // -------------------------------------------------------------------------
    // verify tests
    // -------------------------------------------------------------------------

    /**
     * verify() returns true for the correct code within TTL.
     */
    @Test
    void verify_correctCode_returnsTrue() {
        provider.send(PHONE);
        String code = extractCode(PHONE);

        assertThat(provider.verify(PHONE, code)).isTrue();
    }

    /**
     * verify() returns false for a wrong code.
     */
    @Test
    void verify_wrongCode_returnsFalse() {
        provider.send(PHONE);
        String code = extractCode(PHONE);
        String wrongCode = code.equals("000000") ? "111111" : "000000";

        assertThat(provider.verify(PHONE, wrongCode)).isFalse();
    }

    /**
     * verify() returns false when the OTP entry has expired.
     * We inject a past expiresAt directly into the internal map.
     */
    @Test
    void verify_expiredCode_returnsFalse() {
        provider.send(PHONE);
        String code = extractCode(PHONE);

        // Overwrite the entry with an already-expired timestamp
        forceExpireEntry(PHONE, code);

        assertThat(provider.verify(PHONE, code)).isFalse();
    }

    /**
     * verify() returns false after MAX_ATTEMPTS attempts have been made,
     * even with the correct code.
     */
    @Test
    void verify_exceedMaxAttempts_returnsFalse() {
        provider.send(PHONE);
        String code = extractCode(PHONE);

        // Consume MAX_ATTEMPTS with wrong codes
        for (int i = 0; i < StubOtpProvider.MAX_ATTEMPTS; i++) {
            provider.verify(PHONE, "wrong" + i);
        }

        // Next call (attempt MAX_ATTEMPTS + 1) must return false even with correct code
        assertThat(provider.verify(PHONE, code)).isFalse();
    }

    /**
     * send() resets the attempt counter so verification works again after a re-send.
     */
    @Test
    void send_resetsAttemptCounter() {
        provider.send(PHONE);
        String oldCode = extractCode(PHONE);

        // Exhaust attempts
        for (int i = 0; i <= StubOtpProvider.MAX_ATTEMPTS; i++) {
            provider.verify(PHONE, "wrong");
        }

        // Re-send: should reset counter and produce a new code
        provider.send(PHONE);
        String newCode = extractCode(PHONE);

        assertThat(provider.verify(PHONE, newCode)).isTrue();
    }

    // -------------------------------------------------------------------------
    // Private helpers — direct internal state manipulation
    // -------------------------------------------------------------------------

    /**
     * Reads the current OTP code stored for the phone without going through verify().
     */
    @SuppressWarnings("unchecked")
    private String extractCode(String phone) {
        try {
            Field entriesField = StubOtpProvider.class.getDeclaredField("entries");
            entriesField.setAccessible(true);
            ConcurrentHashMap<String, ?> entries =
                    (ConcurrentHashMap<String, ?>) entriesField.get(provider);
            Object entry = entries.get(phone);
            // StubOtpProvider.StubOtpEntry is a package-private record — access via record accessor
            return (String) entry.getClass().getMethod("code").invoke(entry);
        } catch (Exception e) {
            throw new RuntimeException("Failed to extract OTP code via reflection", e);
        }
    }

    /**
     * Replaces the stored entry for the phone with one that has an already-expired timestamp.
     */
    @SuppressWarnings("unchecked")
    private void forceExpireEntry(String phone, String code) {
        try {
            Field entriesField = StubOtpProvider.class.getDeclaredField("entries");
            entriesField.setAccessible(true);
            ConcurrentHashMap<Object, Object> entries =
                    (ConcurrentHashMap<Object, Object>) entriesField.get(provider);

            // Construct a new StubOtpEntry record with a past expiresAt
            Class<?> entryClass = Class.forName(
                    "com.example.realestate.trust.otp.StubOtpProvider$StubOtpEntry");
            Object expiredEntry = entryClass
                    .getDeclaredConstructor(String.class, OffsetDateTime.class)
                    .newInstance(code, OffsetDateTime.now().minusMinutes(1));

            entries.put(phone, expiredEntry);
        } catch (Exception e) {
            throw new RuntimeException("Failed to force-expire OTP entry via reflection", e);
        }
    }
}
