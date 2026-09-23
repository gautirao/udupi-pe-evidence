package com.example.realestate.exception;

import com.example.realestate.area.AreaNotFoundException;
import com.example.realestate.discover.citylaunch.CityBootstrapConflictException;
import com.example.realestate.discover.citylaunch.CityPreparationConflictException;
import com.example.realestate.discover.citylaunch.CityPrerequisiteGenerationException;
import com.example.realestate.discover.citylaunch.GeographyValidationException;
import com.example.realestate.discover.navigation.NavigationTreeValidationException;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.trust.AuthorityAlreadyVerifiedException;
import com.example.realestate.trust.BadgeNotFoundException;
import com.example.realestate.trust.IdentityAlreadyVerifiedException;
import com.example.realestate.trust.otp.OtpRateLimitException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.data.mapping.PropertyReferenceException;
import org.springframework.security.access.AccessDeniedException;
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

    // ===== AccessDeniedException → 403 (thrown by @PreAuthorize denials) =====

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, String>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Requires admin role"));
    }

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

    // ===== AreaNotFoundException → 404 =====

    @ExceptionHandler(AreaNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleAreaNotFound(AreaNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Area not found"));
    }

    // ===== BadgeNotFoundException → 404 =====

    @ExceptionHandler(BadgeNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleBadgeNotFound(BadgeNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "BADGE_NOT_FOUND"));
    }

    // ===== CityPreparationConflictException → 409 =====

    @ExceptionHandler(CityPreparationConflictException.class)
    public ResponseEntity<Map<String, String>> handleCityPreparationConflict(CityPreparationConflictException ex) {
        log.warn("City preparation conflict: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "PREPARATION_IN_PROGRESS"));
    }

    // ===== CityBootstrapConflictException → 409 =====

    @ExceptionHandler(CityBootstrapConflictException.class)
    public ResponseEntity<Map<String, String>> handleCityBootstrapConflict(CityBootstrapConflictException ex) {
        log.warn("City bootstrap conflict: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "BOOTSTRAP_IN_PROGRESS"));
    }

    // ===== GeographyValidationException → 422 =====

    @ExceptionHandler(GeographyValidationException.class)
    public ResponseEntity<Map<String, String>> handleGeographyValidation(GeographyValidationException ex) {
        log.warn("Geography validation failed: {}", ex.getMessage());
        return ResponseEntity.unprocessableEntity()
                .body(Map.of("error", "GEOGRAPHY_VALIDATION_FAILED"));
    }

    // ===== CityPrerequisiteGenerationException → 422, distinct contract from GeographyValidationException =====

    @ExceptionHandler(CityPrerequisiteGenerationException.class)
    public ResponseEntity<Map<String, String>> handleCityPrerequisiteGeneration(CityPrerequisiteGenerationException ex) {
        log.warn("City prerequisite generation failed [{}]: {}", ex.reason(), ex.getMessage());
        return ResponseEntity.unprocessableEntity()
                .body(Map.of(
                        "error", "CITY_PREREQUISITES_NOT_GENERATED",
                        "reason", ex.reason(),
                        "message", ex.getMessage(),
                        "remediation", ex.remediation()));
    }

    // ===== NavigationTreeValidationException → 422, body carries the structured ValidationReport =====

    @ExceptionHandler(NavigationTreeValidationException.class)
    public ResponseEntity<Map<String, Object>> handleNavigationTreeValidation(NavigationTreeValidationException ex) {
        log.warn("Navigation tree validation failed with {} error(s): {}",
                ex.report().errors().size(), ex.report().errors());
        List<Map<String, String>> errors = ex.report().errors().stream()
                .map(e -> Map.of("code", e.code(), "message", e.message(),
                        "nodeKey", e.nodeKey() == null ? "" : e.nodeKey()))
                .toList();
        return ResponseEntity.unprocessableEntity()
                .body(Map.of("error", "NAVIGATION_TREE_VALIDATION_FAILED", "errors", errors));
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

    // ===== AuthorityAlreadyVerifiedException → 409 =====

    @ExceptionHandler(AuthorityAlreadyVerifiedException.class)
    public ResponseEntity<Map<String, String>> handleAuthorityAlreadyVerified(AuthorityAlreadyVerifiedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "Authority already verified"));
    }

    // ===== Fallback Exception → 500 =====

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex, WebRequest request) {
        log.error("Unhandled exception at {}: {}", request.getDescription(false), ex.getMessage(), ex);
        // #2038: surface the request/correlation id already assigned by MdcRequestFilter (and
        // already returned as the X-Request-Id response header) so a future production report
        // can be traced back to server-side logs. Do NOT generate a new id here — reuse only.
        // MDC.get("requestId") can be null (filter bypassed, or this exception thrown on a
        // thread without MDC inheritance); the "requestId" key is omitted in that case rather
        // than included as a null value, so the body stays a flat, predictable map of strings
        // and never contains a JSON null for this field.
        String requestId = MDC.get("requestId");
        Map<String, String> body = requestId != null
                ? Map.of("error", "INTERNAL_ERROR", "requestId", requestId)
                : Map.of("error", "INTERNAL_ERROR");
        return ResponseEntity.internalServerError().body(body);
    }
}
