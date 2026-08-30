package com.example.realestate.trust.otp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * ⚠ STUB IMPLEMENTATION — NOT FOR PRODUCTION.
 *
 * <p>Activated by default ({@code trust.otp.provider=stub}) so the application starts cleanly
 * without any third-party OTP provider configured. The production MSG91 implementation will
 * replace this bean in issue #552 via {@code trust.otp.provider=msg91}.
 *
 * <p>Behaviour:
 * <ul>
 *   <li>{@link #send}: generates a random 6-digit code, stores it with a 10-minute TTL,
 *       logs it at WARN (never INFO), resets attempt counter.</li>
 *   <li>{@link #verify}: checks code match + TTL; tracks up to {@link #MAX_ATTEMPTS} attempts
 *       per phone before returning {@code false} permanently for the current code.</li>
 * </ul>
 *
 * <p>Thread-safety: all state is held in {@link ConcurrentHashMap}; atomic replacement of
 * the entry on each {@link #send} call prevents TOCTOU between entry read and replacement.
 */
@Component
@ConditionalOnProperty(name = "trust.otp.provider", havingValue = "stub", matchIfMissing = true)
public class StubOtpProvider implements OtpProvider {

    private static final Logger log = LoggerFactory.getLogger(StubOtpProvider.class);

    /** Maximum verify attempts before the OTP is silently rejected. */
    static final int MAX_ATTEMPTS = 5;

    /** TTL for generated codes, in minutes. */
    static final int TTL_MINUTES = 10;

    private final SecureRandom random = new SecureRandom();

    /** phone → current OTP entry (code + expiry). Replaced atomically on each send. */
    private final ConcurrentHashMap<String, StubOtpEntry> entries = new ConcurrentHashMap<>();

    /** phone → attempt counter. Reset to zero on each send. */
    private final ConcurrentHashMap<String, AtomicInteger> attempts = new ConcurrentHashMap<>();

    /**
     * Generates a random 6-digit OTP, stores it with a 10-minute TTL, and logs it at WARN.
     *
     * <p>A call to {@code send} always replaces any existing entry for the phone, and resets
     * the attempt counter — allowing the user to request a new code if the previous one
     * was exhausted or expired.
     *
     * @param phoneE164 target phone in E.164 format
     * @return send result with a random correlationId and the expiry timestamp
     */
    @Override
    public OtpSendResult send(String phoneE164) {
        String code = String.format("%06d", random.nextInt(1_000_000));
        OffsetDateTime expiresAt = OffsetDateTime.now().plusMinutes(TTL_MINUTES);

        entries.put(phoneE164, new StubOtpEntry(code, expiresAt));
        // Reset attempt counter atomically — use computeIfAbsent then set to 0
        attempts.compute(phoneE164, (k, existing) -> {
            if (existing == null) {
                return new AtomicInteger(0);
            }
            existing.set(0);
            return existing;
        });

        // WARN level: this code is never shown to users — only visible in server logs for dev/testing
        log.warn("⚠ STUB OTP for {}: {} — NOT FOR PRODUCTION", phoneE164, code);

        String correlationId = UUID.randomUUID().toString();
        return new OtpSendResult(correlationId, expiresAt);
    }

    /**
     * Verifies the submitted code against the stored entry for the phone.
     *
     * <p>Returns {@code false} (never throws) if:
     * <ul>
     *   <li>No entry exists for the phone</li>
     *   <li>The code is expired</li>
     *   <li>The code does not match</li>
     *   <li>The maximum attempt count ({@value #MAX_ATTEMPTS}) has been reached</li>
     * </ul>
     *
     * @param phoneE164 phone in E.164 format
     * @param code      code submitted by the user
     * @return {@code true} only if the code matches and is not expired and attempts are within limit
     */
    @Override
    public boolean verify(String phoneE164, String code) {
        StubOtpEntry entry = entries.get(phoneE164);
        if (entry == null) {
            return false;
        }

        if (OffsetDateTime.now().isAfter(entry.expiresAt())) {
            return false;
        }

        // Increment attempts before checking — ensures max is enforced strictly
        AtomicInteger counter = attempts.computeIfAbsent(phoneE164, k -> new AtomicInteger(0));
        int attempt = counter.incrementAndGet();
        if (attempt > MAX_ATTEMPTS) {
            return false;
        }

        return entry.code().equals(code);
    }

    /**
     * Internal OTP state record — immutable per send cycle.
     */
    record StubOtpEntry(String code, OffsetDateTime expiresAt) {}
}
