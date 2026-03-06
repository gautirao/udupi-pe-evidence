package com.example.realestate.notification;

import com.example.realestate.insights.SavedArea;
import com.example.realestate.insights.SavedAreaRepository;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingService.NewListingInAreaEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
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

    private SavedArea savedArea(UUID userId, Long priceThresholdRupees) {
        SavedArea s = new SavedArea();
        s.setUserId(userId);
        s.setAreaKey("udupi-town");
        s.setAreaLabel("Udupi Town");
        s.setCreatedAt(OffsetDateTime.now());
        s.setAlertsEnabled(true);
        s.setPriceThresholdRupees(priceThresholdRupees);
        return s;
    }

    @Test
    void onNewListingInArea_sendsInAppAndEmailPerRecipient() {
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("udupi-town"))
                .thenReturn(List.of(savedArea(USER_A, null), savedArea(USER_B, null)));
        when(savedAreaRepository.findEmailsByUserIds(List.of(USER_A, USER_B)))
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
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("empty-area")).thenReturn(List.of());

        listener.onNewListingInArea(new NewListingInAreaEvent(
                LISTING_ID, "empty-area", "Empty Area",
                "Plot", "land", null));

        verify(emailService, never()).sendNewListingAlert(any(), any(), any(), any(), any());
    }

    @Test
    void onNewListingInArea_emailFailure_doesNotPropagateOrAffectInApp() {
        SavedArea s = savedArea(USER_A, null);
        s.setAreaKey("udupi-town");
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("udupi-town"))
                .thenReturn(List.of(s));
        when(savedAreaRepository.findEmailsByUserIds(List.of(USER_A)))
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
    void onNewListingInArea_priceAboveThreshold_skipNotification() {
        // Threshold 5 000 000 rupees, price 6 000 000 rupees (600_000_000 paise)
        SavedArea s = savedArea(USER_A, 5_000_000L);
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("udupi-town"))
                .thenReturn(List.of(s));

        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "udupi-town", "Udupi Town",
                "Luxury Villa", "house", 600_000_000L); // 6 000 000 rupees

        listener.onNewListingInArea(event);

        verify(notificationRepository, never()).save(any());
        verify(emailService, never()).sendNewListingAlert(any(), any(), any(), any(), any());
    }

    @Test
    void onNewListingInArea_priceBelowThreshold_sendsNotification() {
        // Threshold 5 000 000 rupees, price 4 000 000 rupees (400_000_000 paise)
        SavedArea s = savedArea(USER_A, 5_000_000L);
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("udupi-town"))
                .thenReturn(List.of(s));
        when(savedAreaRepository.findEmailsByUserIds(List.of(USER_A)))
                .thenReturn(List.of("a@test.com"));

        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "udupi-town", "Udupi Town",
                "Affordable Plot", "land", 400_000_000L); // 4 000 000 rupees

        listener.onNewListingInArea(event);

        verify(notificationRepository, times(1)).save(any());
        verify(emailService, times(1)).sendNewListingAlert(any(), any(), any(), any(), any());
    }

    @Test
    void onNewListingInArea_nullThreshold_alwaysSendsNotification() {
        // No threshold set — all listings pass through
        SavedArea s = savedArea(USER_A, null);
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("udupi-town"))
                .thenReturn(List.of(s));
        when(savedAreaRepository.findEmailsByUserIds(List.of(USER_A)))
                .thenReturn(List.of("a@test.com"));

        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "udupi-town", "Udupi Town",
                "Expensive Villa", "house", 100_000_000_00L); // any price

        listener.onNewListingInArea(event);

        verify(notificationRepository, times(1)).save(any());
    }

    @Test
    void onNewListingInArea_mixedThresholds_onlyEligibleReceiveNotification() {
        // USER_A has threshold 5M, USER_B has no threshold
        // Price is 6M rupees (600_000_000 paise)
        SavedArea a = savedArea(USER_A, 5_000_000L);
        SavedArea b = savedArea(USER_B, null);
        b.setUserId(USER_B);
        when(savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue("udupi-town"))
                .thenReturn(List.of(a, b));
        when(savedAreaRepository.findEmailsByUserIds(List.of(USER_B)))
                .thenReturn(List.of("b@test.com"));

        NewListingInAreaEvent event = new NewListingInAreaEvent(
                LISTING_ID, "udupi-town", "Udupi Town",
                "Big Villa", "house", 600_000_000L);

        listener.onNewListingInArea(event);

        // Only USER_B gets notified (USER_A's threshold exceeded)
        verify(notificationRepository, times(1)).save(any());
        verify(emailService, times(1)).sendNewListingAlert(eq("b@test.com"), any(), any(), any(), any());
    }
}
