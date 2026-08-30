package com.example.realestate.discover.navigation;

import java.util.List;

/**
 * The structured report a future preview/promotion slice consumes instead of a raw exception.
 *
 * <p>{@code lenientWarnings} (#2086 rework fix, PR #2111 cycle 1): populated ONLY when {@link
 * NavigationTreeValidationService} ran under {@link ValidationMode#LENIENT_RUNTIME_LOAD} and
 * checks #15/#16 found a violation that would have been a blocking {@link ValidationError} under
 * {@link ValidationMode#STRICT}. Never affects {@link #isValid()} — a lenient warning is by
 * definition non-fatal. The single-arg constructor below defaults it to empty so every existing
 * {@code new ValidationReport(errors)} call site (tests included) keeps compiling unchanged; only
 * {@link NavigationTreeValidationService} ever populates it.
 */
public record ValidationReport(List<ValidationError> errors, List<String> lenientWarnings) {

    public ValidationReport(List<ValidationError> errors) {
        this(errors, List.of());
    }

    public boolean isValid() {
        return errors.isEmpty();
    }
}
