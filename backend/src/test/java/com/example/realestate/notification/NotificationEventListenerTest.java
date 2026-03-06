package com.example.realestate.notification;

import com.example.realestate.insights.SavedAreaRepository;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService.NewListingInAreaEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class NotificationEventListenerTest {

    private SavedAreaRepository savedAreaRepository;
    private NotificationRepository notificationRepository;
    private EmailService emailService;
    private NotificationEventListener listener;

    private static final UUID USER_A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID USER_B = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    @BeforeEach
    void setUp() {
        savedAreaRepository = mock(SavedAreaRepository.class);
        notificationRepository = mock(NotificationRepository.class);
        emailService = mock(EmailService.class);
        listener = new NotificationEventListener(
                mock(ListingRepository.class),
                new ObjectMapper(),
                savedAreaRepository,
                notificationRepository,
                emailService);
    }

    @Test
    void onNewListingInArea_sendsInAppAndEmailPerRecipient() {
        when(savedAreaRepository.findUserIdsByAreaKey("udupi-town"))
                .thenReturn(List.of(USER_A, USER_B));
        when(savedAreaRepository.findUserEmailsByAreaKey("udupi-town"))
                .thenReturn(List.of("a@test.com", "b@test.com"));

        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "udupi-town", "Udupi Town",
                "3BHK Flat", "apartment", 5_000_000_00L);

        listener.onNewListingInArea(event);

        verify(notificationRepository, times(2)).save(any());
        verify(emailService).sendNewListingAlert(eq("a@test.com"), eq("Udupi Town"),
                eq(LISTING_ID), eq("3BHK Flat"), eq(5_000_000_00L));
        verify(emailService).sendNewListingAlert(eq("b@test.com"), eq("Udupi Town"),
                eq(LISTING_ID), eq("3BHK Flat"), eq(5_000_000_00L));
    }

    @Test
    void onNewListingInArea_noSubscribers_noEmailSent() {
        when(savedAreaRepository.findUserIdsByAreaKey("empty-area")).thenReturn(List.of());
        when(savedAreaRepository.findUserEmailsByAreaKey("empty-area")).thenReturn(List.of());

        listener.onNewListingInArea(new NewListingInAreaEvent(
                LISTING_ID, "empty-area", "Empty Area",
                "Plot", "land", null));

        verify(emailService, never()).sendNewListingAlert(any(), any(), any(), any(), any());
    }

    @Test
    void onNewListingInArea_emailFailure_doesNotPropagateOrAffectInApp() {
        when(savedAreaRepository.findUserIdsByAreaKey("udupi-town"))
                .thenReturn(List.of(USER_A));
        when(savedAreaRepository.findUserEmailsByAreaKey("udupi-town"))
                .thenReturn(List.of("a@test.com"));
        doThrow(new RuntimeException("SMTP down")).when(emailService)
                .sendNewListingAlert(any(), any(), any(), any(), any());

        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "udupi-town", "Udupi Town",
                "House", "house", 1_000_000_00L);

        // Must not throw — email failure is swallowed
        listener.onNewListingInArea(event);

        // In-app notification was still saved
        verify(notificationRepository, times(1)).save(any());
    }

    @Test
    void onNewListingInArea_emailServiceCalledWithCorrectAreaLabel() {
        when(savedAreaRepository.findUserIdsByAreaKey("kinnimulky"))
                .thenReturn(List.of(USER_A));
        when(savedAreaRepository.findUserEmailsByAreaKey("kinnimulky"))
                .thenReturn(List.of("a@test.com"));

        // areaLabel is null — should fall back to areaKey
        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "kinnimulky", null, "Plot", "land", null);

        listener.onNewListingInArea(event);

        verify(emailService).sendNewListingAlert(eq("a@test.com"), eq("kinnimulky"),
                eq(LISTING_ID), eq("Plot"), isNull());
    }
}
