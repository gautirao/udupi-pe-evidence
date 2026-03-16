package com.example.realestate.booking;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.notification.EmailService;
import com.example.realestate.notification.NotificationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BookingEventListenerTest {

    private ListingRepository listingRepository;
    private NotificationRepository notificationRepository;
    private EmailService emailService;
    private ViewingRequestRepository viewingRequestRepository;
    private BookingEventListener listener;

    private static final UUID BOOKING_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000020");
    private static final UUID REQUESTER_ID = UUID.fromString("00000000-0000-0000-0000-000000000030");

    @BeforeEach
    void setUp() {
        listingRepository = mock(ListingRepository.class);
        notificationRepository = mock(NotificationRepository.class);
        emailService = mock(EmailService.class);
        viewingRequestRepository = mock(ViewingRequestRepository.class);
        listener = new BookingEventListener(
                listingRepository,
                notificationRepository,
                new ObjectMapper(),
                emailService,
                viewingRequestRepository);
    }

    private ViewingRequest buildBooking() {
        ViewingRequest booking = new ViewingRequest();
        booking.setId(BOOKING_ID);
        booking.setListingId(LISTING_ID);
        booking.setDealerId(DEALER_ID);
        booking.setRequesterId(REQUESTER_ID);
        booking.setStatus("REQUESTED");
        booking.setCreatedAt(OffsetDateTime.now());
        booking.setUpdatedAt(OffsetDateTime.now());
        return booking;
    }

    private Listing buildListing(String title) {
        Listing listing = new Listing();
        listing.setTitle(title);
        return listing;
    }

    @Test
    void onViewingRequested_sendsEmailWithCorrectArgs() {
        ViewingRequest booking = buildBooking();
        when(viewingRequestRepository.findEmailByUserId(DEALER_ID))
                .thenReturn(Optional.of("dealer@test.com"));
        when(viewingRequestRepository.findFullNameByUserId(REQUESTER_ID))
                .thenReturn(Optional.of("Ravi Kumar"));
        when(listingRepository.findById(LISTING_ID))
                .thenReturn(Optional.of(buildListing("3BHK Flat in Udupi")));

        listener.onViewingRequested(new BookingService.ViewingRequestedEvent(booking));

        verify(emailService).sendBookingNotification(
                eq("dealer@test.com"),
                eq("Ravi Kumar"),
                eq("3BHK Flat in Udupi"),
                eq(LISTING_ID));

        // In-app notification was also sent
        verify(notificationRepository).insertNotification(
                eq(DEALER_ID), eq("viewing_requested"), anyString(), anyString(), anyString());
    }

    @Test
    void onViewingRequested_emailFailure_doesNotThrow() {
        ViewingRequest booking = buildBooking();
        when(viewingRequestRepository.findEmailByUserId(DEALER_ID))
                .thenReturn(Optional.of("dealer@test.com"));
        when(viewingRequestRepository.findFullNameByUserId(REQUESTER_ID))
                .thenReturn(Optional.of("Buyer Name"));
        when(listingRepository.findById(LISTING_ID))
                .thenReturn(Optional.of(buildListing("Plot")));
        doThrow(new RuntimeException("Resend API down"))
                .when(emailService).sendBookingNotification(any(), any(), any(), any());

        // Must not throw — email failure is swallowed
        listener.onViewingRequested(new BookingService.ViewingRequestedEvent(booking));

        // In-app notification was still sent
        verify(notificationRepository).insertNotification(
                eq(DEALER_ID), eq("viewing_requested"), anyString(), anyString(), anyString());
    }

    @Test
    void onViewingRequested_nullDealerEmail_emailSkipped() {
        ViewingRequest booking = buildBooking();
        when(viewingRequestRepository.findEmailByUserId(DEALER_ID))
                .thenReturn(Optional.empty());

        listener.onViewingRequested(new BookingService.ViewingRequestedEvent(booking));

        // Email send never called
        verify(emailService, never()).sendBookingNotification(any(), any(), any(), any());

        // In-app notification was still sent
        verify(notificationRepository).insertNotification(
                eq(DEALER_ID), eq("viewing_requested"), anyString(), anyString(), anyString());
    }

    @Test
    void onViewingRequested_nullBuyerName_fallbackUsed() {
        ViewingRequest booking = buildBooking();
        when(viewingRequestRepository.findEmailByUserId(DEALER_ID))
                .thenReturn(Optional.of("dealer@test.com"));
        when(viewingRequestRepository.findFullNameByUserId(REQUESTER_ID))
                .thenReturn(Optional.empty());
        when(listingRepository.findById(LISTING_ID))
                .thenReturn(Optional.of(buildListing("2BHK House")));

        listener.onViewingRequested(new BookingService.ViewingRequestedEvent(booking));

        // buyerName should be null — EmailService handles the fallback internally
        verify(emailService).sendBookingNotification(
                eq("dealer@test.com"),
                isNull(),
                eq("2BHK House"),
                eq(LISTING_ID));
    }

    @Test
    void onViewingRequested_nullListingTitle_fallbackUsed() {
        ViewingRequest booking = buildBooking();
        when(viewingRequestRepository.findEmailByUserId(DEALER_ID))
                .thenReturn(Optional.of("dealer@test.com"));
        when(viewingRequestRepository.findFullNameByUserId(REQUESTER_ID))
                .thenReturn(Optional.of("Buyer"));
        when(listingRepository.findById(LISTING_ID))
                .thenReturn(Optional.of(buildListing(null)));

        listener.onViewingRequested(new BookingService.ViewingRequestedEvent(booking));

        // listingTitle should be null — EmailService handles the fallback internally
        verify(emailService).sendBookingNotification(
                eq("dealer@test.com"),
                eq("Buyer"),
                isNull(),
                eq(LISTING_ID));
    }

    @Test
    void onViewingRequested_listingNotFound_emailStillAttempted() {
        ViewingRequest booking = buildBooking();
        when(viewingRequestRepository.findEmailByUserId(DEALER_ID))
                .thenReturn(Optional.of("dealer@test.com"));
        when(viewingRequestRepository.findFullNameByUserId(REQUESTER_ID))
                .thenReturn(Optional.of("Buyer"));
        when(listingRepository.findById(LISTING_ID))
                .thenReturn(Optional.empty());

        listener.onViewingRequested(new BookingService.ViewingRequestedEvent(booking));

        // listingTitle is null when listing not found
        verify(emailService).sendBookingNotification(
                eq("dealer@test.com"),
                eq("Buyer"),
                isNull(),
                eq(LISTING_ID));
    }
}
