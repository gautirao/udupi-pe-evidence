package com.example.realestate.trust.otp;

import java.time.OffsetDateTime;

/**
 * Result returned by {@link OtpProvider#send}.
 *
 * @param correlationId opaque identifier for the send request (useful for tracing in production providers)
 * @param expiresAt     the point in time after which the OTP is no longer valid
 */
public record OtpSendResult(String correlationId, OffsetDateTime expiresAt) {}
