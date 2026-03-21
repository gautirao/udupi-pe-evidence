package com.example.realestate.booking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Bulk status-transition operations used by the listing cascade flow
 * (e.g. when a listing is taken offline, withdrawn, or re-listed).
 *
 * All three methods are synchronous and designed to participate in the
 * caller's @Transactional boundary. They must NOT be called from an
 * @Async context, as rollback semantics would be lost.
 */
@Service
public class BookingCascadeService {

    private static final Logger log = LoggerFactory.getLogger(BookingCascadeService.class);

    private static final int MAX_CANCELLATION_REASON_LENGTH = 100;

    /**
     * Literal written into the cancelledBy column for system-initiated cancellations.
     * JPQL string literals cannot reference this constant directly — the JPQL in
     * ViewingRequestRepository uses the string {@code 'system'} verbatim.
     */
    static final String CANCELLED_BY_SYSTEM = "system";

    private final ViewingRequestRepository viewingRequestRepository;

    public BookingCascadeService(ViewingRequestRepository viewingRequestRepository) {
        this.viewingRequestRepository = viewingRequestRepository;
    }

    /**
     * Bulk-cancel all REQUESTED bookings for a listing.
     * Sets status → CANCELLED, cancellationReason = reason, cancelledBy = "system".
     *
     * @param listingId          listing whose REQUESTED bookings should be cancelled
     * @param cancellationReason human-readable reason; required, max 100 chars
     * @return number of rows updated
     * @throws IllegalArgumentException if cancellationReason is null, blank, or exceeds 100 chars
     */
    @Transactional
    public int cancelPendingBookings(UUID listingId, String cancellationReason) {
        validateCancellationReason(cancellationReason);
        int rows = viewingRequestRepository.bulkCancelRequested(listingId, cancellationReason, OffsetDateTime.now());
        log.info("cancelPendingBookings listingId={} rows={}", listingId, rows);
        return rows;
    }

    /**
     * Bulk-freeze all CONFIRMED bookings for a listing.
     * Sets status → NEEDS_RESOLUTION, cancellationReason = reason.
     * Frozen bookings remain visible in the broker's active booking list (DEALER_ACTIVE_STATUSES
     * includes NEEDS_RESOLUTION) so the broker can take follow-up action.
     *
     * @param listingId          listing whose CONFIRMED bookings should be frozen
     * @param cancellationReason human-readable reason; required, max 100 chars
     * @return number of rows updated
     * @throws IllegalArgumentException if cancellationReason is null, blank, or exceeds 100 chars
     */
    @Transactional
    public int freezeConfirmedBookings(UUID listingId, String cancellationReason) {
        validateCancellationReason(cancellationReason);
        int rows = viewingRequestRepository.bulkFreezeConfirmed(listingId, cancellationReason, OffsetDateTime.now());
        log.info("freezeConfirmedBookings listingId={} rows={}", listingId, rows);
        return rows;
    }

    /**
     * Bulk-unfreeze all NEEDS_RESOLUTION bookings for a listing.
     * Sets status → CONFIRMED, cancellationReason = NULL.
     * Used when a listing is re-listed or its offline status is reversed.
     *
     * @param listingId listing whose NEEDS_RESOLUTION bookings should be restored
     * @return number of rows updated
     */
    @Transactional
    public int unfreezeBookings(UUID listingId) {
        int rows = viewingRequestRepository.bulkUnfreeze(listingId, OffsetDateTime.now());
        log.info("unfreezeBookings listingId={} rows={}", listingId, rows);
        return rows;
    }

    // ===== Private helpers =====

    private void validateCancellationReason(String cancellationReason) {
        if (cancellationReason == null || cancellationReason.isBlank()) {
            throw new IllegalArgumentException("cancellationReason must not be null or blank");
        }
        if (cancellationReason.length() > MAX_CANCELLATION_REASON_LENGTH) {
            throw new IllegalArgumentException(
                    "cancellationReason must not exceed " + MAX_CANCELLATION_REASON_LENGTH + " characters");
        }
    }
}
