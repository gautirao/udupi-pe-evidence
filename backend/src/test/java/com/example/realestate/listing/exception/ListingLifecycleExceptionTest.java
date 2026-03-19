package com.example.realestate.listing.exception;

import com.example.realestate.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ListingLifecycleException} and its handling by
 * {@link GlobalExceptionHandler}.
 *
 * Uses direct handler invocation — no Spring context required — so inline
 * controller catches cannot interfere.
 */
class ListingLifecycleExceptionTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    // ===== All 6 error codes map to correct HTTP status =====

    @ParameterizedTest
    @EnumSource(ListingErrorCode.class)
    void handler_returnsCorrectHttpStatus_forEachErrorCode(ListingErrorCode code) {
        ListingLifecycleException ex = new ListingLifecycleException(code, "test message");

        ResponseEntity<Map<String, String>> response = handler.handleListingLifecycle(ex);

        assertThat(response.getStatusCode().value()).isEqualTo(code.getHttpStatus());
    }

    // ===== JSON body includes "code" and "message" fields =====

    @ParameterizedTest
    @EnumSource(ListingErrorCode.class)
    void handler_returnsCodeAndMessageInBody(ListingErrorCode code) {
        String message = "Error for " + code.name();
        ListingLifecycleException ex = new ListingLifecycleException(code, message);

        ResponseEntity<Map<String, String>> response = handler.handleListingLifecycle(ex);

        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().get("code")).isEqualTo(code.name());
        assertThat(response.getBody().get("message")).isEqualTo(message);
    }

    // ===== Specific error code status values =====

    @Test
    void transitionNotAllowed_maps_to422() {
        assertThat(ListingErrorCode.TRANSITION_NOT_ALLOWED.getHttpStatus()).isEqualTo(422);
    }

    @Test
    void statusConflict_maps_to409() {
        assertThat(ListingErrorCode.STATUS_CONFLICT.getHttpStatus()).isEqualTo(409);
    }

    @Test
    void listingIncomplete_maps_to422() {
        assertThat(ListingErrorCode.LISTING_INCOMPLETE.getHttpStatus()).isEqualTo(422);
    }

    @Test
    void reasonCodeRequired_maps_to422() {
        assertThat(ListingErrorCode.REASON_CODE_REQUIRED.getHttpStatus()).isEqualTo(422);
    }

    @Test
    void fastRestoreNotEligible_maps_to422() {
        assertThat(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE.getHttpStatus()).isEqualTo(422);
    }

    @Test
    void submissionAlreadyActioned_maps_to409() {
        assertThat(ListingErrorCode.SUBMISSION_ALREADY_ACTIONED.getHttpStatus()).isEqualTo(409);
    }

    // ===== Exception does NOT extend ListingStatusException =====

    @Test
    void exception_doesNotExtendListingStatusException() {
        ListingLifecycleException ex = new ListingLifecycleException(
                ListingErrorCode.TRANSITION_NOT_ALLOWED, "test");

        assertThat(ex).isNotInstanceOf(ListingStatusException.class);
        assertThat(ex).isInstanceOf(RuntimeException.class);
    }

    // ===== Response body does NOT contain "error" field — no collision with existing format =====

    @Test
    void responseBody_doesNotContainErrorField() {
        ListingLifecycleException ex = new ListingLifecycleException(
                ListingErrorCode.STATUS_CONFLICT, "conflict");

        ResponseEntity<Map<String, String>> response = handler.handleListingLifecycle(ex);

        assertThat(response.getBody()).doesNotContainKey("error");
    }
}
