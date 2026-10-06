package com.example.realestate.propertyrequest;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Public anonymous write endpoint for property requests (#1793).
 *
 * <p>Declared {@code permitAll} for POST in {@link com.example.realestate.security.JwtConfig},
 * which also ignores any Authorization header on this one path so a browser holding an expired
 * token is not rejected with 401.
 *
 * <p><strong>Dark by default (FF1):</strong> wired only when {@code app.property-requests.enabled=true};
 * otherwise the route does not exist (404 through the security chain) and nothing downstream is
 * touched. See {@link PropertyRequestEncryptionKeyGuard} for the fail-closed key check.
 *
 * <p><strong>PII contract:</strong> the request body is never logged; the phone is never echoed in
 * any response; validation errors carry static messages only (no rejected values). The two
 * handlers below are controller-local on purpose: the global handler maps bean-validation
 * failures to 422 and logs {@code HttpMessageNotReadableException#getMessage()}, which can quote
 * body fragments (including the phone).
 */
@RestController
@ConditionalOnProperty(name = "app.property-requests.enabled", havingValue = "true")
@RequestMapping("/api/public/property-requests")
public class PublicPropertyRequestController {

    private final PropertyRequestService service;
    private final PropertyRequestRateLimiter rateLimiter;

    /**
     * The guard parameter is intentionally unused: depending on it forces the fail-closed key check
     * to run whenever this controller is created, even with lazy initialisation enabled (#1793 L2).
     */
    public PublicPropertyRequestController(PropertyRequestService service,
                                           PropertyRequestRateLimiter rateLimiter,
                                           PropertyRequestEncryptionKeyGuard keyGuard) {
        this.service = service;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    public ResponseEntity<PropertyRequestCreatedResponse> create(
            @Valid @RequestBody CreatePropertyRequestDto body, HttpServletRequest request) {
        PropertyRequestCreatedResponse created = service.create(body, rateLimiter.resolveClientKey(request));
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> fields = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> Map.of("field", fe.getField(), "message", Objects.toString(fe.getDefaultMessage(), "")))
                .toList();
        return ResponseEntity.badRequest().body(Map.of("error", "VALIDATION_FAILED", "fields", fields));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleUnreadable(HttpMessageNotReadableException ex) {
        // Deliberately no logging of ex.getMessage(): it can contain fragments of the body.
        return ResponseEntity.badRequest().body(Map.of("error", "MALFORMED_REQUEST"));
    }
}
