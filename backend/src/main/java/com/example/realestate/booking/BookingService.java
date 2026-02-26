package com.example.realestate.booking;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Business logic for booking (viewing request) lifecycle.
 *
 * Security controls (M4–M10):
 *   M4:  requester_id = JWT.sub; dealer_id = listing.created_by — never from body.
 *   M5:  Per-endpoint ownership check; BookingNotFoundException (→ 404) for non-owners.
 *   M7:  requestedTimeSlot validated against ^\d{2}:\d{2}-\d{2}:\d{2}$.
 *   M8:  requestedDate must be in the future, at most 90 days out.
 *   M9:  requesterMessage and declineReason max 500 characters.
 *   M10: Self-booking prevention — requesterId == dealerId → 400.
 */
@Service
public class BookingService {

    private static final Logger log = LoggerFactory.getLogger(BookingService.class);

    // M7: valid time slot format HH:MM-HH:MM
    private static final Pattern TIME_SLOT_PATTERN = Pattern.compile("^\\d{2}:\\d{2}-\\d{2}:\\d{2}$");

    // M8: max days out for a booking
    private static final int MAX_BOOKING_DAYS_AHEAD = 90;

    // M9: max free-text field length
    private static final int MAX_FREE_TEXT_LENGTH = 500;

    // Status constants (match ViewingRequest entity defaults and V15 migration)
    static final String STATUS_REQUESTED = "REQUESTED";
    static final String STATUS_CONFIRMED = "CONFIRMED";
    static final String STATUS_DECLINED = "DECLINED";
    static final String STATUS_CANCELLED = "CANCELLED";

    private static final Set<String> CANCELLABLE_BY_USER = Set.of(STATUS_REQUESTED, STATUS_CONFIRMED);
    private static final Set<String> CANCELLABLE_BY_DEALER = Set.of(STATUS_CONFIRMED);

    private static final List<String> DEALER_ACTIVE_STATUSES = List.of(STATUS_REQUESTED, STATUS_CONFIRMED);

    private final ViewingRequestRepository viewingRequestRepository;
    private final ListingRepository listingRepository;
    private final ApplicationEventPublisher eventPublisher;

    public BookingService(ViewingRequestRepository viewingRequestRepository,
                          ListingRepository listingRepository,
                          ApplicationEventPublisher eventPublisher) {
        this.viewingRequestRepository = viewingRequestRepository;
        this.listingRepository = listingRepository;
        this.eventPublisher = eventPublisher;
    }

    // ===== Role lookup (for controller resolveCallerOrForbid) =====

    public Optional<String> getUserRole(UUID userId) {
        return listingRepository.findUserRole(userId);
    }

    // ===== Create booking =====

    /**
     * Create a new viewing request.
     *
     * M4:  requesterId = JWT.sub (passed from controller, never from body).
     *       dealerId = listing.created_by (looked up from DB, never from body).
     * M7:  requestedTimeSlot must match ^\d{2}:\d{2}-\d{2}:\d{2}$
     * M8:  requestedDate must be future, at most 90 days out.
     * M9:  requesterMessage max 500 characters.
     * M10: requesterId != dealerId.
     *
     * @throws BookingValidationException for input validation failures
     * @throws BookingConflictException   when a duplicate active booking already exists
     */
    @Transactional
    public ViewingRequest createBooking(UUID requesterId, UUID listingId,
                                        LocalDate requestedDate, String requestedTimeSlot,
                                        String requesterMessage) {
        // Validate time slot (M7)
        if (requestedTimeSlot == null || !TIME_SLOT_PATTERN.matcher(requestedTimeSlot).matches()) {
            throw new BookingValidationException("requestedTimeSlot",
                    "Time slot must match format HH:MM-HH:MM (e.g. 10:00-11:00)");
        }

        // Validate date (M8)
        LocalDate today = LocalDate.now();
        if (requestedDate == null || !requestedDate.isAfter(today)) {
            throw new BookingValidationException("requestedDate",
                    "Requested date must be in the future");
        }
        if (requestedDate.isAfter(today.plusDays(MAX_BOOKING_DAYS_AHEAD))) {
            throw new BookingValidationException("requestedDate",
                    "Requested date must be within " + MAX_BOOKING_DAYS_AHEAD + " days");
        }

        // Validate requesterMessage length (M9)
        if (requesterMessage != null && requesterMessage.length() > MAX_FREE_TEXT_LENGTH) {
            throw new BookingValidationException("requesterMessage",
                    "Message must be " + MAX_FREE_TEXT_LENGTH + " characters or fewer");
        }

        // Look up listing — must exist and be LIVE (M4: dealerId from listing, never body)
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new BookingValidationException("listingId", "Listing not found"));

        if (!ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            throw new BookingValidationException("listingId",
                    "Viewing requests can only be made for live listings");
        }

        UUID dealerId = listing.getCreatedBy();

        // Guard: SCRAPED listings have no dealer (created_by = null) — cannot accept bookings
        if (dealerId == null) {
            throw new BookingValidationException("listingId",
                    "This listing cannot accept booking requests");
        }

        // Self-booking prevention (M10)
        if (requesterId.equals(dealerId)) {
            throw new BookingValidationException("listingId",
                    "You cannot request a viewing for your own listing");
        }

        ViewingRequest booking = new ViewingRequest();
        booking.setListingId(listingId);
        booking.setRequesterId(requesterId);
        booking.setDealerId(dealerId);
        booking.setRequestedDate(requestedDate);
        booking.setRequestedTimeSlot(requestedTimeSlot);
        booking.setStatus(STATUS_REQUESTED);
        booking.setRequesterMessage(requesterMessage);

        OffsetDateTime now = OffsetDateTime.now();
        booking.setCreatedAt(now);
        booking.setUpdatedAt(now);

        try {
            ViewingRequest saved = viewingRequestRepository.save(booking);
            log.info("Created booking bookingId={} listingId={} requesterId={} dealerId={}",
                    saved.getId(), listingId, requesterId, dealerId);
            eventPublisher.publishEvent(new ViewingRequestedEvent(saved));
            return saved;
        } catch (DataIntegrityViolationException e) {
            log.warn("Duplicate active booking listingId={} requesterId={}", listingId, requesterId);
            throw new BookingConflictException(
                    "You already have an active booking for this listing");
        }
    }

    // ===== Confirm =====

    /**
     * Dealer confirms a REQUESTED booking.
     * M5: verify dealer_id == callerId; return 404 (BookingNotFoundException) if not.
     * Atomic: ownership check read → confirmAtomic → if 0 rows → BookingStateConflictException.
     */
    @Transactional
    public ViewingRequest confirmBooking(UUID bookingId, UUID callerId) {
        // Ownership check (M5) — still needs a read
        findBookingForDealer(bookingId, callerId);

        OffsetDateTime now = OffsetDateTime.now();
        int rows = viewingRequestRepository.confirmAtomic(bookingId, STATUS_REQUESTED, callerId, now);
        if (rows == 0) {
            throw new BookingStateConflictException();
        }

        ViewingRequest saved = viewingRequestRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(bookingId));
        log.info("Confirmed booking bookingId={} dealerId={}", bookingId, callerId);
        eventPublisher.publishEvent(new ViewingConfirmedEvent(saved));
        return saved;
    }

    // ===== Decline =====

    /**
     * Dealer declines a REQUESTED booking.
     * M5: verify dealer_id == callerId; return 404 if not.
     * M9: declineReason max 500 chars.
     * Atomic: M9 check → ownership read → declineAtomic → if 0 rows → BookingStateConflictException.
     */
    @Transactional
    public ViewingRequest declineBooking(UUID bookingId, UUID callerId, String declineReason) {
        // M9: declineReason length
        if (declineReason != null && declineReason.length() > MAX_FREE_TEXT_LENGTH) {
            throw new BookingValidationException("declineReason",
                    "Decline reason must be " + MAX_FREE_TEXT_LENGTH + " characters or fewer");
        }

        // Ownership check (M5)
        findBookingForDealer(bookingId, callerId);

        OffsetDateTime now = OffsetDateTime.now();
        int rows = viewingRequestRepository.declineAtomic(bookingId, STATUS_REQUESTED, callerId, declineReason, now);
        if (rows == 0) {
            throw new BookingStateConflictException();
        }

        ViewingRequest saved = viewingRequestRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(bookingId));
        log.info("Declined booking bookingId={} dealerId={}", bookingId, callerId);
        eventPublisher.publishEvent(new ViewingDeclinedEvent(saved));
        return saved;
    }

    // ===== Cancel =====

    /**
     * Cancel a booking. Either the requester or the dealer can cancel, with different rules:
     * - Requester: can cancel from REQUESTED or CONFIRMED. Sets cancelledBy = 'user'.
     * - Dealer: can cancel from CONFIRMED only. Sets cancelledBy = 'dealer'.
     * M5: return 404 if callerId matches neither requester_id nor dealer_id.
     * Atomic: ownership read → determine role → cancelAtomic → if 0 rows → BookingStateConflictException.
     */
    @Transactional
    public ViewingRequest cancelBooking(UUID bookingId, UUID callerId) {
        ViewingRequest booking = viewingRequestRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(bookingId));

        boolean isRequester = callerId.equals(booking.getRequesterId());
        boolean isDealer = callerId.equals(booking.getDealerId());

        if (!isRequester && !isDealer) {
            // M5: return 404 — do not leak existence to non-participants
            throw new BookingNotFoundException(bookingId);
        }

        String cancelledBy;
        Set<String> allowedStatuses;
        if (isRequester) {
            cancelledBy = "user";
            allowedStatuses = CANCELLABLE_BY_USER;
        } else {
            cancelledBy = "dealer";
            allowedStatuses = CANCELLABLE_BY_DEALER;
        }

        OffsetDateTime now = OffsetDateTime.now();
        int rows = viewingRequestRepository.cancelAtomic(bookingId, allowedStatuses, callerId, cancelledBy, now);
        if (rows == 0) {
            throw new BookingStateConflictException();
        }

        ViewingRequest saved = viewingRequestRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(bookingId));
        log.info("Cancelled booking bookingId={} cancelledBy={} callerId={}",
                bookingId, saved.getCancelledBy(), callerId);
        eventPublisher.publishEvent(new ViewingCancelledEvent(saved));
        return saved;
    }

    // ===== Queries =====

    public List<ViewingRequest> getBookingsForRequester(UUID requesterId) {
        return viewingRequestRepository.findByRequesterIdOrderByCreatedAtDesc(requesterId);
    }

    public List<ViewingRequest> getBookingsForDealer(UUID dealerId) {
        return viewingRequestRepository.findByDealerIdAndStatusInOrderByCreatedAtDesc(
                dealerId, DEALER_ACTIVE_STATUSES);
    }

    public Page<ViewingRequest> getBookingsForRequesterPaged(UUID requesterId, Pageable pageable) {
        return viewingRequestRepository
                .findByRequesterId(requesterId, pageable);
    }

    public Page<ViewingRequest> getBookingsForDealerPaged(UUID dealerId, Pageable pageable) {
        return viewingRequestRepository
                .findByDealerIdAndStatusIn(dealerId, DEALER_ACTIVE_STATUSES, pageable);
    }

    // ===== Private helpers =====

    /**
     * Load a booking and verify the caller is the dealer.
     * Returns BookingNotFoundException if booking not found or dealer_id != callerId (M5).
     */
    private ViewingRequest findBookingForDealer(UUID bookingId, UUID callerId) {
        ViewingRequest booking = viewingRequestRepository.findById(bookingId)
                .orElseThrow(() -> new BookingNotFoundException(bookingId));

        if (!callerId.equals(booking.getDealerId())) {
            // M5: return 404 — avoids leaking existence to non-dealers
            throw new BookingNotFoundException(bookingId);
        }
        return booking;
    }

    // ===== Exceptions =====

    public static class BookingNotFoundException extends RuntimeException {
        public BookingNotFoundException(UUID id) {
            super("Booking not found");
        }
    }

    public static class BookingConflictException extends RuntimeException {
        public BookingConflictException(String message) {
            super(message);
        }
    }

    public static class BookingValidationException extends RuntimeException {
        private final String field;

        public BookingValidationException(String field, String message) {
            super(message);
            this.field = field;
        }

        public String getField() {
            return field;
        }
    }

    public static class BookingStateConflictException extends RuntimeException {
        public BookingStateConflictException() {
            super("Booking state was modified concurrently");
        }
    }

    // ===== Domain events =====

    public record ViewingRequestedEvent(ViewingRequest booking) {}

    public record ViewingConfirmedEvent(ViewingRequest booking) {}

    public record ViewingDeclinedEvent(ViewingRequest booking) {}

    public record ViewingCancelledEvent(ViewingRequest booking) {}
}
