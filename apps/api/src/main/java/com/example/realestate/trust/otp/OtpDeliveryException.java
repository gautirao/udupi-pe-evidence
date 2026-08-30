package com.example.realestate.trust.otp;

/**
 * Unchecked exception thrown when an OTP cannot be delivered to the target phone number.
 *
 * <p>Callers should map this to an HTTP 503 response and must not expose the cause message
 * to API consumers.
 */
public class OtpDeliveryException extends RuntimeException {

    public OtpDeliveryException(String message) {
        super(message);
    }

    public OtpDeliveryException(String message, Throwable cause) {
        super(message, cause);
    }
}
