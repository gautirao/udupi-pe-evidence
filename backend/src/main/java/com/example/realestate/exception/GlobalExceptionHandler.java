package com.example.realestate.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mapping.PropertyReferenceException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Global exception handler that converts uncaught Spring MVC and infrastructure exceptions
 * into consistent {"error":"..."} JSON responses.
 *
 * IMPORTANT: ResponseStatusException is handled by Spring's framework — do NOT add a handler
 * for it here. Controllers throw ResponseStatusException explicitly for known business errors
 * (404, 409, etc.) and Spring maps them correctly without our involvement.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

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

    // ===== Fallback Exception → 500 =====

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex, WebRequest request) {
        log.error("Unhandled exception at {}: {}", request.getDescription(false), ex.getMessage(), ex);
        return ResponseEntity.internalServerError()
                .body(Map.of("error", "INTERNAL_ERROR"));
    }
}
