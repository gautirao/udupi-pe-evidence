package com.example.realestate.discover.citylaunch;

/**
 * Thrown when a caller attempts to start a new city launch preparation for a city that already
 * has an in-flight (non-terminal, pre-promotion) {@link CityLaunchRevision}.
 *
 * <p>Surfaces the DB-level {@code uq_clr_inflight} unique-index violation (V118) as a domain
 * exception. {@link CityLaunchPreparationService#prepare} catches the raw
 * {@code DataIntegrityViolationException} from the admission {@code saveAndFlush} and rethrows
 * this instead, so the constraint is the single source of truth for "already in flight" — no
 * separate read-then-check race exists in the service.
 *
 * <p>Mapped to {@code 409 Conflict} by {@link com.example.realestate.exception.GlobalExceptionHandler}.
 */
public class CityPreparationConflictException extends RuntimeException {

    public CityPreparationConflictException(String message) {
        super(message);
    }
}
