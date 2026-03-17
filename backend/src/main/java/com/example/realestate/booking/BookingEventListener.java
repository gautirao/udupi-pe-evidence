package com.example.realestate.booking;

import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.notification.EmailService;
import com.example.realestate.notification.NotificationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * AFTER_COMMIT listener for booking domain events.
 * Inserts notifications for the 4 booking types defined in spec §8:
 *   viewing_requested  → broker
 *   viewing_confirmed  → requester
 *   viewing_declined   → requester
 *   viewing_cancelled  → counterparty (user → broker; broker → requester)
 *
 * Never rethrows — notification failures must not affect committed booking state.
 */
@Component
public class BookingEventListener {

    private static final Logger log = LoggerFactory.getLogger(BookingEventListener.class);

    private final ListingRepository listingRepository;
    private final NotificationRepository notificationRepository;
    private final ObjectMapper objectMapper;
    private final EmailService emailService;
    private final ViewingRequestRepository viewingRequestRepository;

    public BookingEventListener(ListingRepository listingRepository,
                                NotificationRepository notificationRepository,
                                ObjectMapper objectMapper,
                                EmailService emailService,
                                ViewingRequestRepository viewingRequestRepository) {
        this.listingRepository = listingRepository;
        this.notificationRepository = notificationRepository;
        this.objectMapper = objectMapper;
        this.emailService = emailService;
        this.viewingRequestRepository = viewingRequestRepository;
    }

    @Async
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingRequested(BookingService.ViewingRequestedEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            notificationRepository.insertNotification(
                    booking.getBrokerId(),
                    "viewing_requested",
                    "New viewing request",
                    "A viewing has been requested for your listing.",
                    metadata);
            log.info("viewing_requested notification sent bookingId={} brokerId={}",
                    booking.getId(), booking.getBrokerId());

            // Send email notification to dealer (failure must not propagate)
            sendBookingEmail(booking);
        } catch (Exception e) {
            log.error("Failed to send viewing_requested notification bookingId={}",
                    booking.getId(), e);
        }
    }

    @Async
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingConfirmed(BookingService.ViewingConfirmedEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            notificationRepository.insertNotification(
                    booking.getRequesterId(),
                    "viewing_confirmed",
                    "Viewing confirmed",
                    "Your viewing request has been confirmed.",
                    metadata);
            log.info("viewing_confirmed notification sent bookingId={} requesterId={}",
                    booking.getId(), booking.getRequesterId());
        } catch (Exception e) {
            log.error("Failed to send viewing_confirmed notification bookingId={}",
                    booking.getId(), e);
        }
    }

    @Async
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingDeclined(BookingService.ViewingDeclinedEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            notificationRepository.insertNotification(
                    booking.getRequesterId(),
                    "viewing_declined",
                    "Viewing declined",
                    "Your viewing request has been declined.",
                    metadata);
            log.info("viewing_declined notification sent bookingId={} requesterId={}",
                    booking.getId(), booking.getRequesterId());
        } catch (Exception e) {
            log.error("Failed to send viewing_declined notification bookingId={}",
                    booking.getId(), e);
        }
    }

    @Async
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingCancelled(BookingService.ViewingCancelledEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            // Notify the counterparty: user cancelled → notify broker; broker cancelled → notify requester
            boolean cancelledByUser = "user".equals(booking.getCancelledBy()) || "requester".equals(booking.getCancelledBy());
            java.util.UUID recipientId = cancelledByUser ? booking.getBrokerId() : booking.getRequesterId();

            notificationRepository.insertNotification(
                    recipientId,
                    "viewing_cancelled",
                    "Viewing cancelled",
                    "A viewing has been cancelled.",
                    metadata);
            log.info("viewing_cancelled notification sent bookingId={} cancelledBy={} recipientId={}",
                    booking.getId(), booking.getCancelledBy(), recipientId);
        } catch (Exception e) {
            log.error("Failed to send viewing_cancelled notification bookingId={}",
                    booking.getId(), e);
        }
    }

    private void sendBookingEmail(ViewingRequest booking) {
        try {
            String dealerEmail = viewingRequestRepository.findEmailByUserId(booking.getBrokerId())
                    .orElse(null);
            if (dealerEmail == null) {
                log.warn("No email found for brokerId={}, skipping booking email", booking.getBrokerId());
                return;
            }

            String buyerName = viewingRequestRepository.findFullNameByUserId(booking.getRequesterId())
                    .orElse(null);

            String listingTitle = listingRepository.findById(booking.getListingId())
                    .map(Listing::getTitle)
                    .orElse(null);

            emailService.sendBookingNotification(dealerEmail, buyerName, listingTitle, booking.getListingId());
        } catch (Exception e) {
            log.error("Failed to send booking email bookingId={} brokerId={}",
                    booking.getId(), booking.getBrokerId(), e);
        }
    }

    private String buildMetadata(ViewingRequest booking) throws Exception {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("booking_id", booking.getId().toString());
        metadata.put("listing_id", booking.getListingId().toString());
        return objectMapper.writeValueAsString(metadata);
    }
}
