package com.example.realestate.booking;

import com.example.realestate.exception.RateLimiterService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Booking (viewing request) API endpoints.
 *
 * Security model:
 * - POST /api/bookings: any authenticated user
 * - PUT  /api/bookings/:id/confirm: any authenticated user; service enforces dealer_id == JWT.sub (M5)
 * - PUT  /api/bookings/:id/decline: any authenticated user; service enforces dealer_id == JWT.sub (M5)
 * - PUT  /api/bookings/:id/cancel:  any authenticated user; service enforces participation (M5)
 * - GET  /api/bookings/mine: any authenticated user; returns Page<BookingResponse>
 * - GET  /api/bookings/broker: requires broker or admin role; returns Page<BookingResponse>
 */
@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private static final Logger log = LoggerFactory.getLogger(BookingController.class);
    private static final Set<String> BOOKING_SORT_FIELDS = Set.of("createdAt", "requestedDate");

    private final BookingService bookingService;
    private final RateLimiterService rateLimiterService;

    public BookingController(BookingService bookingService,
                             RateLimiterService rateLimiterService) {
        this.bookingService = bookingService;
        this.rateLimiterService = rateLimiterService;
    }

    // ===== POST /api/bookings =====

    @PostMapping
    public ResponseEntity<?> create(JwtAuthenticationToken auth,
                                    @RequestBody CreateBookingRequest req) {
        // M4: requesterId is always JWT.sub — never from body
        UUID requesterId = UUID.fromString(auth.getToken().getSubject());

        if (!rateLimiterService.getBookingBucket(requesterId.toString()).tryConsume(1)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
        }

        try {
            ViewingRequest booking = bookingService.createBooking(
                    requesterId,
                    req.listingId(),
                    req.requestedDate(),
                    req.requestedTimeSlot(),
                    req.requesterMessage());

            log.info("POST /api/bookings -> 201 bookingId={} requesterId={}",
                    booking.getId(), requesterId);
            return ResponseEntity.status(HttpStatus.CREATED).body(toResponse(booking));
        } catch (BookingService.BookingValidationException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", e.getField(), "error", e.getMessage()));
        } catch (BookingService.BookingConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ===== PUT /api/bookings/{id}/confirm =====

    @PutMapping("/{id}/confirm")
    public ResponseEntity<?> confirm(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID callerId = UUID.fromString(auth.getToken().getSubject());

        try {
            ViewingRequest booking = bookingService.confirmBooking(id, callerId);
            log.info("PUT /api/bookings/{}/confirm -> 200 callerId={}", id, callerId);
            return ResponseEntity.ok(toResponse(booking));
        } catch (BookingService.BookingNotFoundException e) {
            return notFound();
        } catch (BookingService.BookingStateConflictException e) {
            // NOTE: wrong-status transitions (e.g. confirm on already-CONFIRMED) now return 409
            // BOOKING_STATE_CONFLICT (not 400). This is intentional — the atomic UPDATE returns 0
            // rows for both race conditions AND invalid starting states. Clients should treat
            // 409 as "retry not useful" for state errors.
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "BOOKING_STATE_CONFLICT"));
        }
    }

    // ===== PUT /api/bookings/{id}/decline =====

    @PutMapping("/{id}/decline")
    public ResponseEntity<?> decline(JwtAuthenticationToken auth,
                                     @PathVariable UUID id,
                                     @RequestBody(required = false) DeclineBookingRequest req) {
        UUID callerId = UUID.fromString(auth.getToken().getSubject());
        String declineReason = req != null ? req.declineReason() : null;

        try {
            ViewingRequest booking = bookingService.declineBooking(id, callerId, declineReason);
            log.info("PUT /api/bookings/{}/decline -> 200 callerId={}", id, callerId);
            return ResponseEntity.ok(toResponse(booking));
        } catch (BookingService.BookingNotFoundException e) {
            return notFound();
        } catch (BookingService.BookingValidationException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", e.getField(), "error", e.getMessage()));
        } catch (BookingService.BookingStateConflictException e) {
            // NOTE: wrong-status transitions (e.g. confirm on already-CONFIRMED) now return 409
            // BOOKING_STATE_CONFLICT (not 400). This is intentional — the atomic UPDATE returns 0
            // rows for both race conditions AND invalid starting states. Clients should treat
            // 409 as "retry not useful" for state errors.
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "BOOKING_STATE_CONFLICT"));
        }
    }

    // ===== PUT /api/bookings/{id}/cancel =====

    @PutMapping("/{id}/cancel")
    public ResponseEntity<?> cancel(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID callerId = UUID.fromString(auth.getToken().getSubject());

        try {
            ViewingRequest booking = bookingService.cancelBooking(id, callerId);
            log.info("PUT /api/bookings/{}/cancel -> 200 callerId={}", id, callerId);
            return ResponseEntity.ok(toResponse(booking));
        } catch (BookingService.BookingNotFoundException e) {
            return notFound();
        } catch (BookingService.BookingStateConflictException e) {
            // NOTE: wrong-status transitions (e.g. confirm on already-CONFIRMED) now return 409
            // BOOKING_STATE_CONFLICT (not 400). This is intentional — the atomic UPDATE returns 0
            // rows for both race conditions AND invalid starting states. Clients should treat
            // 409 as "retry not useful" for state errors.
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "BOOKING_STATE_CONFLICT"));
        }
    }

    // ===== POST /api/bookings/{id}/cancel =====

    @PostMapping("/{id}/cancel")
    public ResponseEntity<?> cancelV2(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID callerId = UUID.fromString(auth.getToken().getSubject());

        try {
            ViewingRequest booking = bookingService.cancelBookingNew(id, callerId);
            log.info("POST /api/bookings/{}/cancel -> 200 callerId={}", id, callerId);
            return ResponseEntity.ok(toResponse(booking));
        } catch (BookingService.BookingNotFoundException e) {
            return notFound();
        } catch (BookingService.BookingForbiddenException e) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Forbidden"));
        } catch (BookingService.BookingStateConflictException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "BOOKING_STATE_CONFLICT"));
        }
    }

    // ===== GET /api/bookings/mine =====

    @GetMapping("/mine")
    public ResponseEntity<Page<BookingResponse>> mine(
            JwtAuthenticationToken auth,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        validateSort(pageable);
        UUID requesterId = UUID.fromString(auth.getToken().getSubject());
        return ResponseEntity.ok(bookingService.getBookingsForRequesterPaged(requesterId, pageable).map(this::toResponse));
    }

    // ===== GET /api/bookings/broker =====

    @GetMapping({"/broker"})
    public ResponseEntity<?> dealer(
            CallerInfo caller,
            @RequestParam(required = false) UUID listingId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        validateSort(pageable);

        if (listingId != null) {
            return ResponseEntity.ok(bookingService
                    .getBookingsForDealerByListingPaged(caller.userId(), listingId, pageable)
                    .map(this::toResponse));
        }
        return ResponseEntity.ok(bookingService.getBookingsForDealerPaged(caller.userId(), pageable).map(this::toResponse));
    }

    // ===== Validation helpers =====

    private void validateSort(Pageable pageable) {
        for (Sort.Order order : pageable.getSort()) {
            if (!BOOKING_SORT_FIELDS.contains(order.getProperty())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Invalid sort field. Allowed: " + BOOKING_SORT_FIELDS);
            }
        }
    }

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "Booking not found"));
    }

    // ===== Response mapping =====

    private BookingResponse toResponse(ViewingRequest b) {
        return new BookingResponse(
                b.getId(), b.getListingId(), b.getRequesterId(), b.getBrokerId(),
                b.getRequestedDate(), b.getRequestedTimeSlot(), b.getStatus(),
                b.getRequesterMessage(), b.getDeclineReason(), b.getCancelledBy(),
                b.getCancellationReason(),
                b.getCreatedAt(), b.getUpdatedAt());
    }

    // ===== DTOs =====

    public record CreateBookingRequest(
            UUID listingId,
            LocalDate requestedDate,
            String requestedTimeSlot,
            String requesterMessage
    ) {}

    public record DeclineBookingRequest(String declineReason) {}

    public record BookingResponse(
            UUID id,
            UUID listingId,
            UUID requesterId,
            UUID brokerId,
            LocalDate requestedDate,
            String requestedTimeSlot,
            String status,
            String requesterMessage,
            String declineReason,
            String cancelledBy,
            String cancellationReason,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {}
}
