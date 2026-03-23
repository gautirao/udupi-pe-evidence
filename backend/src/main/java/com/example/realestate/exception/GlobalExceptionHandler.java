package com.example.realestate.exception;

import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.trust.BadgeNotFoundException;
import com.example.realestate.trust.IdentityAlreadyVerifiedException;
import com.example.realestate.trust.otp.OtpRateLimitException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mapping.PropertyReferenceException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Global exception handler that converts uncaught Spring MVC and infrastructure exceptions
 * into consistent {"error":"..."} JSON responses.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // ===== ResponseStatusException → preserves status + {"error":"..."} body =====

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleResponseStatus(ResponseStatusException ex) {
        String message = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", message));
    }

    // ===== ListingLifecycleException → status from error code, structured body =====

    @ExceptionHandler(ListingLifecycleException.class)
    public ResponseEntity<Map<String, Object>> handleListingLifecycle(ListingLifecycleException ex) {
        log.warn("Listing lifecycle error [{}]: {}", ex.getCode(), ex.getMessage());
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("code", ex.getCode().name());
        body.put("message", ex.getMessage());
        if (ex.getChangedFields() != null && !ex.getChangedFields().isEmpty()) {
            body.put("changedFields", ex.getChangedFields());
        }
        return ResponseEntity.status(ex.getCode().getHttpStatus()).body(body);
    }

    // ===== ListingStatusException → 409 Conflict =====

    @ExceptionHandler(ListingStatusException.class)
    public ResponseEntity<Map<String, String>> handleListingStatus(ListingStatusException ex) {
        log.warn("Listing status transition rejected: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", ex.getMessage()));
    }

    // ===== BadgeNotFoundException → 404 =====

    @ExceptionHandler(BadgeNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleBadgeNotFound(BadgeNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "BADGE_NOT_FOUND"));
    }

    // ===== IllegalArgumentException → 400 =====

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Invalid argument: {}", ex.getMessage());
        return ResponseEntity.badRequest()
                .body(Map.of("error", "INVALID_ARGUMENT"));
    }

    // ===== PropertyReferenceException → 400 =====

    @ExceptionHandler(PropertyReferenceException.class)
    public ResponseEntity<Map<String, String>> handlePropertyReference(PropertyReferenceException ex) {
        log.warn("Invalid sort/property reference: {}", ex.getPropertyName());
        return ResponseEntity.badRequest()
                .body(Map.of("error", "INVALID_SORT_FIELD"));
    }

    // ===== HttpMessageNotReadableException → 400 =====

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        log.warn("Malformed request body: {}", ex.getMessage());
        return ResponseEntity.badRequest()
                .body(Map.of("error", "MALFORMED_REQUEST"));
    }

    // ===== MethodArgumentNotValidException → 422 =====

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<Map<String, String>> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of("field", fe.getField(), "message", Objects.toString(fe.getDefaultMessage(), "")))
                .toList();
        return ResponseEntity.unprocessableEntity()
                .body(Map.of("error", "VALIDATION_FAILED", "fields", fieldErrors));
    }

    // ===== OtpRateLimitException → 429 =====

    @ExceptionHandler(OtpRateLimitException.class)
    public ResponseEntity<Map<String, String>> handleOtpRateLimit(OtpRateLimitException ex) {
        log.warn("OTP rate limit exceeded: {}", ex.getMessage());
        return ResponseEntity.status(429)
                .body(Map.of("error", "OTP_RATE_LIMIT_EXCEEDED"));
    }

    // ===== IdentityAlreadyVerifiedException → 409 =====

    @ExceptionHandler(IdentityAlreadyVerifiedException.class)
    public ResponseEntity<Map<String, String>> handleIdentityAlreadyVerified(IdentityAlreadyVerifiedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Identity already verified"));
    }

    // ===== Fallback Exception → 500 =====

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex, WebRequest request) {
        log.error("Unhandled exception at {}: {}", request.getDescription(false), ex.getMessage(), ex);
        return ResponseEntity.internalServerError()
                .body(Map.of("error", "INTERNAL_ERROR"));
    }
}
