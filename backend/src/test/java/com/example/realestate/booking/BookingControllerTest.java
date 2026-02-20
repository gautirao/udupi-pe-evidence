package com.example.realestate.booking;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
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

    @BeforeEach
    void setUp() {
        reset(bookingService, transactionManager);
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

    // ==================== Test 9: PUT /confirm 400 wrong status ====================

    @Test
    void confirm_wrongStatus_returns400() throws Exception {
        when(bookingService.confirmBooking(eq(BOOKING_ID), eq(DEALER_ID)))
                .thenThrow(new BookingService.BookingStatusException(
                        "Cannot confirm a booking with status CONFIRMED"));

        mockMvc.perform(put("/api/bookings/" + BOOKING_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Cannot confirm a booking with status CONFIRMED"));
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

    // ==================== Test 12: GET /mine 200 ====================

    @Test
    void mine_returns200WithArray() throws Exception {
        ViewingRequest booking = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        when(bookingService.getBookingsForRequester(REQUESTER_ID)).thenReturn(List.of(booking));

        mockMvc.perform(get("/api/bookings/mine")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(BOOKING_ID.toString()));

        verify(bookingService).getBookingsForRequester(REQUESTER_ID);
    }

    // ==================== Test 13: GET /dealer 200 with dealer role ====================

    @Test
    void dealer_withDealerRole_returns200WithArray() throws Exception {
        when(bookingService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));
        ViewingRequest booking = buildBooking(BOOKING_ID, REQUESTER_ID, DEALER_ID,
                BookingService.STATUS_REQUESTED);
        when(bookingService.getBookingsForDealer(DEALER_ID)).thenReturn(List.of(booking));

        mockMvc.perform(get("/api/bookings/dealer")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(BOOKING_ID.toString()));

        verify(bookingService).getBookingsForDealer(DEALER_ID);
    }

    // ==================== Test 14: GET /dealer 403 without dealer role ====================

    @Test
    void dealer_withoutDealerRole_returns403() throws Exception {
        when(bookingService.getUserRole(REQUESTER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(get("/api/bookings/dealer")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires dealer or admin role"));

        verify(bookingService, never()).getBookingsForDealer(any());
    }

    // ==================== Helper ====================

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
