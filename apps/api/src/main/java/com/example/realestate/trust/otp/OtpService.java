package com.example.realestate.trust.otp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Domain service wrapping {@link OtpProvider} with rate-limiting logic.
 *
 * <p>Rate limit: a maximum of 3 OTP send requests per phone number per hour.
 * Timestamps are tracked in an in-memory {@link ConcurrentHashMap}; this resets on
 * application restart, which is acceptable for the stub phase. The production MSG91
 * implementation may move rate limiting to Redis or MSG91's own DLR facility (issue #552).
 *
 * <p>Verification is delegated directly to the provider; no additional business rules
 * are applied at this layer.
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);

    /** Maximum OTP send requests allowed per phone per hour. */
    static final int MAX_SENDS_PER_HOUR = 3;

    private static final long ONE_HOUR_MILLIS = 60L * 60L * 1000L;

    private final OtpProvider provider;

    /** phone → list of send timestamps (epoch millis) within the current sliding window. */
    private final ConcurrentHashMap<String, List<Long>> sendTimestamps = new ConcurrentHashMap<>();

    public OtpService(OtpProvider provider) {
        this.provider = provider;
    }

    /**
     * Sends an OTP to the given phone number, enforcing a rate limit of
     * {@value #MAX_SENDS_PER_HOUR} requests per phone per hour.
     *
     * @param phoneE164 target phone in E.164 format; must not be null or blank
     * @return the {@link OtpSendResult} from the underlying provider
     * @throws OtpDeliveryException   if the provider cannot deliver the OTP
     * @throws OtpRateLimitException  if the rate limit for this phone has been exceeded
     */
    public OtpSendResult sendOtp(String phoneE164) {
        enforceRateLimit(phoneE164);
        OtpSendResult result = provider.send(phoneE164);
        recordSendTimestamp(phoneE164);
        log.info("OTP sent phone={} correlationId={} expiresAt={}",
                maskPhone(phoneE164), result.correlationId(), result.expiresAt());
        return result;
    }

    /**
     * Verifies the OTP code for the given phone.
     *
     * @param phoneE164 phone in E.164 format; must not be null or blank
     * @param code      the OTP code submitted by the user; must not be null
     * @return {@code true} if valid and not expired; {@code false} otherwise
     */
    public boolean verifyOtp(String phoneE164, String code) {
        return provider.verify(phoneE164, code);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void enforceRateLimit(String phoneE164) {
        long now = Instant.now().toEpochMilli();
        long windowStart = now - ONE_HOUR_MILLIS;

        sendTimestamps.compute(phoneE164, (phone, timestamps) -> {
            List<Long> current = (timestamps != null) ? timestamps : new ArrayList<>();
            // Prune expired entries from sliding window
            current.removeIf(ts -> ts < windowStart);
            if (current.size() >= MAX_SENDS_PER_HOUR) {
                throw new OtpRateLimitException(
                        "OTP rate limit exceeded for phone. Max " + MAX_SENDS_PER_HOUR + " per hour.");
            }
            return current;
        });
    }

    private void recordSendTimestamp(String phoneE164) {
        long now = Instant.now().toEpochMilli();
        sendTimestamps.compute(phoneE164, (phone, timestamps) -> {
            List<Long> current = (timestamps != null) ? timestamps : new ArrayList<>();
            current.add(now);
            return current;
        });
    }

    /**
     * Masks all but the last 4 digits of the phone for safe logging.
     * E.g. "+919876543210" → "+9198*****3210"
     */
    private static String maskPhone(String phoneE164) {
        if (phoneE164 == null || phoneE164.length() <= 4) {
            return "****";
        }
        String suffix = phoneE164.substring(phoneE164.length() - 4);
        String prefix = phoneE164.substring(0, Math.min(4, phoneE164.length()));
        return prefix + "*****" + suffix;
    }
}
