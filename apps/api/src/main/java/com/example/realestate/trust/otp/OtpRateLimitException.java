package com.example.realestate.trust.otp;

/**
 * Thrown by {@link OtpService} when the per-phone OTP send rate limit is exceeded.
 */
public class OtpRateLimitException extends RuntimeException {

    public OtpRateLimitException(String message) {
        super(message);
    }
}
