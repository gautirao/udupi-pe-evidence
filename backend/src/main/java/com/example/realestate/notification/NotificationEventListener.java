package com.example.realestate.notification;

import com.example.realestate.insights.SavedAreaRepository;
import com.example.realestate.listing.ListingService.ListingApprovedEvent;
import com.example.realestate.listing.ListingService.ListingRejectedEvent;
import com.example.realestate.listing.ListingService.NewListingInAreaEvent;
import com.example.realestate.listing.ListingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Component
public class NotificationEventListener {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventListener.class);

    private final ListingRepository listingRepository;
    private final ObjectMapper objectMapper;
    private final SavedAreaRepository savedAreaRepository;
    private final NotificationRepository notificationRepository;
    private final EmailService emailService;

    public NotificationEventListener(ListingRepository listingRepository, ObjectMapper objectMapper,
                                      SavedAreaRepository savedAreaRepository,
                                      NotificationRepository notificationRepository,
                                      EmailService emailService) {
        this.listingRepository = listingRepository;
        this.objectMapper = objectMapper;
        this.savedAreaRepository = savedAreaRepository;
        this.notificationRepository = notificationRepository;
        this.emailService = emailService;
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onListingApproved(ListingApprovedEvent event) {
        try {
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listing().getId().toString());
            String metadataJson = objectMapper.writeValueAsString(metadata);
            listingRepository.insertNotification(
                    event.ownerId(),
                    "listing_approved",
                    "Listing approved",
                    "Your listing '" + event.title() + "' has been approved and is now live.",
                    metadataJson);
            log.info("Approval notification sent listingId={}", event.listing().getId());
        } catch (Exception e) {
            log.error("Failed to send approval notification listingId={}", event.listing().getId(), e);
            // Do NOT rethrow — notification failure must not affect already-committed listing status
        }
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNewListingInArea(NewListingInAreaEvent event) {
        try {
            List<UUID> userIds = savedAreaRepository.findUserIdsByAreaKey(event.areaKey());
            if (userIds.isEmpty()) {
                return;
            }

            String area = event.areaLabel() != null ? event.areaLabel() : event.areaKey();
            String message = "A new " + event.propertyType() + " listing is available in " + area + ".";

            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listingId().toString());
            metadata.put("area_key", event.areaKey());
            String metadataJson = objectMapper.writeValueAsString(metadata);

            OffsetDateTime now = OffsetDateTime.now();
            for (UUID userId : userIds) {
                Notification n = new Notification();
                n.setUserId(userId);
                n.setType("new_listing_in_area");
                n.setTitle("New listing in " + area);
                n.setMessage(message);
                n.setMetadata(metadataJson);
                n.setRead(false);
                n.setCreatedAt(now);
                notificationRepository.save(n);
            }

            log.info("Area alerts sent listingId={} areaKey={} recipients={}",
                    event.listingId(), event.areaKey(), userIds.size());

            // Send email alerts to subscribers (fire-and-forget; each failure is isolated)
            List<String> emails = savedAreaRepository.findUserEmailsByAreaKey(event.areaKey());
            for (String email : emails) {
                try {
                    emailService.sendNewListingAlert(
                            email, area, event.listingId(), event.title(), event.pricePaise());
                } catch (Exception emailEx) {
                    log.error("Failed to send alert email to={} listingId={}", email, event.listingId(), emailEx);
                }
            }
        } catch (Exception e) {
            log.error("Failed to send area alerts listingId={} areaKey={}",
                    event.listingId(), event.areaKey(), e);
            // Do NOT rethrow — notification failure must not affect already-committed listing status
        }
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onListingRejected(ListingRejectedEvent event) {
        try {
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listing().getId().toString());
            metadata.put("reason", event.reason());
            String metadataJson = objectMapper.writeValueAsString(metadata);
            listingRepository.insertNotification(
                    event.ownerId(),
                    "listing_rejected",
                    "Listing rejected",
                    "Your listing '" + event.title() + "' was rejected. Reason: " + event.reason(),
                    metadataJson);
            log.info("Rejection notification sent listingId={}", event.listing().getId());
        } catch (Exception e) {
            log.error("Failed to send rejection notification listingId={}", event.listing().getId(), e);
            // Do NOT rethrow — notification failure must not affect already-committed listing status
        }
    }
}
