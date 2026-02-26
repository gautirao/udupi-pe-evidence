package com.example.realestate.booking;

import com.example.realestate.exception.RateLimiterService;
import io.github.bucket4j.Bucket;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for BookingController.
 * Covers AC-B1 (happy path), AC-B2 (duplicate → 409), M5 (ownership → 404), M10 (self-booking → 400).
 * Uses jwt() post-processor; mocks BookingService entirely.
 */
@WebMvcTest(
        controllers = BookingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(BookingControllerTest.TestConfig.class)
class BookingControllerTest {

    private static final UUID REQUESTER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DEALER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID BOOKING_ID   = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID LISTING_ID   = UUID.fromString("00000000-0000-0000-0000-000000000088");

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BookingService bookingService;

    @MockitoBean
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private RateLimiterService rateLimiterService;

    @BeforeEach
    void setUp() {
        reset(bookingService, transactionManager, rateLimiterService);
        // Default: bucket allows all requests (tryConsume returns true)
        Bucket allowBucket = Mockito.mock(Bucket.class);
        when(allowBucket.tryConsume(1)).thenReturn(true);
        when(rateLimiterService.getBookingBucket(anyString())).thenReturn(allowBucket);
    }

    // ==================== Test 1: No JWT → 403 ====================

    @Test
    void create_withoutJwt_returns403() throws Exception {
        mockMvc.perform(post("/api/bookings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2026-04-01",
                                 "requestedTimeSlot":"10:00-11:00"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 2: POST 201 happy path (AC-B1) ====================

    @Test
    void create_happyPath_returns201WithRequestedStatus() throws Exception {
        ViewingRequest booking = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        when(bookingService.createBooking(
                eq(REQUESTER_ID), eq(LISTING_ID),
                any(LocalDate.class), eq("10:00-11:00"), eq("Hi")))
                .thenReturn(booking);

        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2026-04-01",
                                 "requestedTimeSlot":"10:00-11:00","requesterMessage":"Hi"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(BOOKING_ID.toString()))
                .andExpect(jsonPath("$.status").value("REQUESTED"));

        verify(bookingService).createBooking(
                eq(REQUESTER_ID), eq(LISTING_ID),
                any(LocalDate.class), eq("10:00-11:00"), eq("Hi"));
    }

    // ==================== Test 3: POST 409 duplicate (AC-B2) ====================

    @Test
    void create_duplicateActiveBooking_returns409() throws Exception {
        when(bookingService.createBooking(any(), any(), any(), any(), any()))
                .thenThrow(new BookingService.BookingConflictException(
                        "You already have an active booking for this listing"));

        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2026-04-01",
                                 "requestedTimeSlot":"10:00-11:00"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already have an active booking for this listing"));
    }

    // ==================== Test 4: POST 400 self-booking (M10) ====================

    @Test
    void create_selfBooking_returns400WithFieldError() throws Exception {
        when(bookingService.createBooking(any(), any(), any(), any(), any()))
                .thenThrow(new BookingService.BookingValidationException(
                        "listingId", "You cannot request a viewing for your own listing"));

        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2026-04-01",
                                 "requestedTimeSlot":"10:00-11:00"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("listingId"));
    }

    // ==================== Test 5: POST 400 invalid time slot (M7) ====================

    @Test
    void create_invalidTimeSlot_returns400() throws Exception {
        when(bookingService.createBooking(any(), any(), any(), any(), any()))
                .thenThrow(new BookingService.BookingValidationException(
                        "requestedTimeSlot", "Time slot must match format HH:MM-HH:MM"));

        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2026-04-01",
                                 "requestedTimeSlot":"bad-slot"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("requestedTimeSlot"));
    }

    // ==================== Test 6: POST 400 past date (M8) ====================

    @Test
    void create_pastDate_returns400() throws Exception {
        when(bookingService.createBooking(any(), any(), any(), any(), any()))
                .thenThrow(new BookingService.BookingValidationException(
                        "requestedDate", "Requested date must be in the future"));

        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2020-01-01",
                                 "requestedTimeSlot":"10:00-11:00"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.field").value("requestedDate"));
    }

    // ==================== Test 7: PUT /confirm 200 ====================

    @Test
    void confirm_happyPath_returns200WithConfirmedStatus() throws Exception {
        ViewingRequest booking = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_CONFIRMED);
        when(bookingService.confirmBooking(BOOKING_ID, DEALER_ID)).thenReturn(booking);

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(BOOKING_ID.toString()))
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        verify(bookingService).confirmBooking(BOOKING_ID, DEALER_ID);
    }

    // ==================== Test 8: PUT /confirm 404 wrong owner (M5) ====================

    @Test
    void confirm_wrongOwner_returns404() throws Exception {
        when(bookingService.confirmBooking(eq(BOOKING_ID), any()))
                .thenThrow(new BookingService.BookingNotFoundException(BOOKING_ID));

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Booking not found"));
    }

    // ==================== Test 9: PUT /confirm 409 wrong status (atomic path) ====================

    @Test
    void confirm_alreadyConfirmedOrWrongStatus_returns409WithConflictCode() throws Exception {
        when(bookingService.confirmBooking(eq(BOOKING_ID), eq(DEALER_ID)))
                .thenThrow(new BookingService.BookingStateConflictException());

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("BOOKING_STATE_CONFLICT"));
    }

    // ==================== Test 10: PUT /cancel 200 by requester ====================

    @Test
    void cancel_byRequester_returns200WithCancelledStatus() throws Exception {
        ViewingRequest booking = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_CANCELLED);
        booking.setCancelledBy("user");
        when(bookingService.cancelBooking(BOOKING_ID, REQUESTER_ID)).thenReturn(booking);

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/cancel")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelledBy").value("user"));

        verify(bookingService).cancelBooking(BOOKING_ID, REQUESTER_ID);
    }

    // ==================== Test 11: PUT /cancel 404 unrelated caller (M5) ====================

    @Test
    void cancel_unrelatedCaller_returns404() throws Exception {
        UUID unrelatedUser = UUID.fromString("00000000-0000-0000-0000-000000000007");
        when(bookingService.cancelBooking(eq(BOOKING_ID), eq(unrelatedUser)))
                .thenThrow(new BookingService.BookingNotFoundException(BOOKING_ID));

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/cancel")
                        .with(jwt().jwt(j -> j.subject(unrelatedUser.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Booking not found"));
    }

    // ==================== Test 12: GET /mine 200 — updated to Page format ====================

    @Test
    void mine_returns200WithPage() throws Exception {
        ViewingRequest item = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        Page<ViewingRequest> page = new PageImpl<>(List.of(item));
        when(bookingService.getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/bookings/mine")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(BOOKING_ID.toString()))
                .andExpect(jsonPath("$.totalElements").value(1));

        verify(bookingService).getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class));
    }

    // ==================== Test 13: GET /dealer 200 with dealer role — updated to Page format ====================

    @Test
    void dealer_withDealerRole_returns200WithPage() throws Exception {
        when(bookingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        ViewingRequest item = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        Page<ViewingRequest> page = new PageImpl<>(List.of(item));
        when(bookingService.getBookingsForDealerPaged(eq(DEALER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/bookings/dealer")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(BOOKING_ID.toString()))
                .andExpect(jsonPath("$.totalElements").value(1));

        verify(bookingService).getBookingsForDealerPaged(eq(DEALER_ID), any(Pageable.class));
    }

    // ==================== Test 14: GET /dealer 403 without dealer role ====================

    @Test
    void dealer_withoutDealerRole_returns403() throws Exception {
        when(bookingService.getUserRole(REQUESTER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(get("/api/bookings/dealer")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires dealer or admin role"));

        verify(bookingService, never()).getBookingsForDealerPaged(any(), any());
    }

    // ==================== Test 15: PUT /confirm 409 state conflict ====================

    @Test
    void confirm_stateConflict_returns409WithErrorCode() throws Exception {
        when(bookingService.confirmBooking(eq(BOOKING_ID), eq(DEALER_ID)))
                .thenThrow(new BookingService.BookingStateConflictException());

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("BOOKING_STATE_CONFLICT"));
    }

    // ==================== Test 16: PUT /decline 409 state conflict ====================

    @Test
    void decline_stateConflict_returns409WithErrorCode() throws Exception {
        when(bookingService.declineBooking(eq(BOOKING_ID), eq(DEALER_ID), any()))
                .thenThrow(new BookingService.BookingStateConflictException());

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/decline")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"declineReason\":\"Not available\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("BOOKING_STATE_CONFLICT"));
    }

    // ==================== Test 17: PUT /cancel 409 state conflict ====================

    @Test
    void cancel_stateConflict_returns409WithErrorCode() throws Exception {
        when(bookingService.cancelBooking(eq(BOOKING_ID), eq(REQUESTER_ID)))
                .thenThrow(new BookingService.BookingStateConflictException());

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/cancel")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("BOOKING_STATE_CONFLICT"));
    }

    // ==================== Test 18: GET /mine — 2 items, page metadata ====================

    @Test
    void requester_getBookings_returnsPage_withPaginationMetadata() throws Exception {
        UUID booking2Id = UUID.fromString("00000000-0000-0000-0000-000000000098");
        ViewingRequest item1 = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        ViewingRequest item2 = buildBooking(booking2Id, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_CONFIRMED);
        Page<ViewingRequest> page = new PageImpl<>(
                List.of(item1, item2), PageRequest.of(0, 20), 2);
        when(bookingService.getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/bookings/mine")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.size").value(20));
    }

    // ==================== Test 19: GET /dealer — 2 items, page metadata ====================

    @Test
    void dealer_getBookings_returnsPage_withPaginationMetadata() throws Exception {
        when(bookingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        UUID booking2Id = UUID.fromString("00000000-0000-0000-0000-000000000097");
        ViewingRequest item1 = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        ViewingRequest item2 = buildBooking(booking2Id, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_CONFIRMED);
        Page<ViewingRequest> page = new PageImpl<>(
                List.of(item1, item2), PageRequest.of(0, 20), 2);
        when(bookingService.getBookingsForDealerPaged(eq(DEALER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/bookings/dealer")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.size").value(20));
    }

    // ==================== Test 20: GET /mine — empty page ====================

    @Test
    void requester_getBookings_emptyPage_returns200() throws Exception {
        Page<ViewingRequest> emptyPage = new PageImpl<>(
                List.of(), PageRequest.of(0, 20), 0);
        when(bookingService.getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class)))
                .thenReturn(emptyPage);

        mockMvc.perform(get("/api/bookings/mine")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    // ==================== Test 21: GET /mine — page and size params passed to service ====================

    @Test
    void requester_getBookings_pageParam_passedToService() throws Exception {
        Page<ViewingRequest> page = new PageImpl<>(
                List.of(), PageRequest.of(1, 5), 0);
        when(bookingService.getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class)))
                .thenReturn(page);

        mockMvc.perform(get("/api/bookings/mine?page=1&size=5")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk());

        verify(bookingService).getBookingsForRequesterPaged(
                eq(REQUESTER_ID),
                argThat(p -> p.getPageNumber() == 1 && p.getPageSize() == 5));
    }

    // ==================== Test 22: POST /api/bookings rate limit exceeded → 429 ====================

    @Test
    void createBooking_rateLimitExceeded_returns429() throws Exception {
        Bucket exhaustedBucket = Mockito.mock(Bucket.class);
        when(exhaustedBucket.tryConsume(1)).thenReturn(false);
        when(rateLimiterService.getBookingBucket(anyString())).thenReturn(exhaustedBucket);

        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"listingId":"%s","requestedDate":"2026-04-01",
                                 "requestedTimeSlot":"10:00-11:00"}
                                """.formatted(LISTING_ID)))
                .andExpect(status().isTooManyRequests());
    }

    // ==================== Helpers ====================

    private ViewingRequest buildBooking(UUID id, UUID requesterId, UUID dealerId, String status) {
        ViewingRequest b = new ViewingRequest();
        b.setId(id);
        b.setListingId(LISTING_ID);
        b.setRequesterId(requesterId);
        b.setDealerId(dealerId);
        b.setRequestedDate(LocalDate.of(2026, 4, 1));
        b.setRequestedTimeSlot("10:00-11:00");
        b.setStatus(status);
        b.setCreatedAt(OffsetDateTime.now());
        b.setUpdatedAt(OffsetDateTime.now());
        return b;
    }

}
