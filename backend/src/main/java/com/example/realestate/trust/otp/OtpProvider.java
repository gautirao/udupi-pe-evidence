package com.example.realestate.trust.otp;

/**
 * Contract for OTP delivery and verification.
 *
 * <p>The production implementation (MSG91) will be wired in issue #552.
 * The default implementation is {@link StubOtpProvider}, activated when
 * {@code trust.otp.provider=stub} (the default).
 *
 * <p>Implementations must be thread-safe.
 */
public interface OtpProvider {

    /**
     * Send an OTP to the given phone number.
     *
     * @param phoneE164 phone in E.164 format (e.g. {@code +919876543210}); must not be null
     * @return a {@link OtpSendResult} containing a correlation ID and expiry; never null
     * @throws OtpDeliveryException if the OTP cannot be delivered
     */
    OtpSendResult send(String phoneE164);

    /**
     * Verify the code submitted by the user.
     *
     * @param phoneE164 phone in E.164 format; must not be null
     * @param code      the OTP code submitted by the user; must not be null
     * @return {@code true} if the code is valid and not expired; {@code false} otherwise
     */
    boolean verify(String phoneE164, String code);
}
