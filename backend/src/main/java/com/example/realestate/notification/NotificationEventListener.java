package com.example.realestate.notification;

import com.example.realestate.insights.SavedArea;
import com.example.realestate.insights.SavedAreaRepository;
import com.example.realestate.listing.event.ListingApprovedEvent;
import com.example.realestate.listing.event.ListingRejectedEvent;
import com.example.realestate.listing.event.ListingSubmittedEvent;
import com.example.realestate.listing.event.NewListingInAreaEvent;
import com.example.realestate.security.UserRoleRepository;
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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
public class NotificationEventListener {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventListener.class);

    private final ObjectMapper objectMapper;
    private final SavedAreaRepository savedAreaRepository;
    private final NotificationRepository notificationRepository;
    private final EmailService emailService;
    private final UserRoleRepository userRoleRepository;

    public NotificationEventListener(ObjectMapper objectMapper,
                                      SavedAreaRepository savedAreaRepository,
                                      NotificationRepository notificationRepository,
                                      EmailService emailService,
                                      UserRoleRepository userRoleRepository) {
        this.objectMapper = objectMapper;
        this.savedAreaRepository = savedAreaRepository;
        this.notificationRepository = notificationRepository;
        this.emailService = emailService;
        this.userRoleRepository = userRoleRepository;
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onListingApproved(ListingApprovedEvent event) {
        try {
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listing().getId().toString());
            String metadataJson = objectMapper.writeValueAsString(metadata);
            notificationRepository.insertNotification(
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
    public void onListingSubmitted(ListingSubmittedEvent event) {
        try {
            List<UUID> adminIds = userRoleRepository.findAllUserIdsByRole("admin");
            if (adminIds.isEmpty()) {
                log.debug("No admin users found for review_pending notification listingId={}",
                        event.listing().getId());
                return;
            }

            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listing().getId().toString());
            String metadataJson = objectMapper.writeValueAsString(metadata);

            for (UUID adminId : adminIds) {
                notificationRepository.insertNotification(
                        adminId,
                        "review_pending",
                        "New listing pending review",
                        "New listing '" + event.title() + "' is pending review.",
                        metadataJson);
            }
            log.info("Review-pending notifications sent listingId={} adminCount={}",
                    event.listing().getId(), adminIds.size());
        } catch (Exception e) {
            log.error("Failed to send review-pending notification listingId={}",
                    event.listing().getId(), e);
            // Do NOT rethrow — notification failure must not affect already-committed listing status
        }
    }

    @Async
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNewListingInArea(NewListingInAreaEvent event) {
        try {
            List<SavedArea> subscribers =
                    savedAreaRepository.findByAreaKeyAndAlertsEnabledTrue(event.areaKey());
            if (subscribers.isEmpty()) {
                return;
            }

            String area = event.areaLabel() != null ? event.areaLabel() : event.areaKey();
            String message = "A new " + event.propertyType() + " listing is available in " + area + ".";
            Long priceRupees = event.pricePaise() != null ? event.pricePaise() / 100L : null;

            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listingId().toString());
            metadata.put("area_key", event.areaKey());
            String metadataJson = objectMapper.writeValueAsString(metadata);

            OffsetDateTime now = OffsetDateTime.now();
            List<UUID> eligibleUserIds = new ArrayList<>();

            for (SavedArea subscriber : subscribers) {
                Long threshold = subscriber.getPriceThresholdRupees();
                if (priceRupees != null && threshold != null && priceRupees > threshold) {
                    log.debug("Skipping notification userId={} listingId={} priceRupees={} threshold={}",
                            subscriber.getUserId(), event.listingId(), priceRupees, threshold);
                    continue;
                }

                Notification n = new Notification();
                n.setUserId(subscriber.getUserId());
                n.setType("new_listing_in_area");
                n.setTitle("New listing in " + area);
                n.setMessage(message);
                n.setMetadata(metadataJson);
                n.setRead(false);
                n.setCreatedAt(now);
                notificationRepository.save(n);
                eligibleUserIds.add(subscriber.getUserId());
            }

            log.info("Area alerts sent listingId={} areaKey={} recipients={}",
                    event.listingId(), event.areaKey(), eligibleUserIds.size());

            if (eligibleUserIds.isEmpty()) {
                return;
            }

            // Send email alerts to eligible subscribers (fire-and-forget; each failure is isolated)
            List<String> emails = savedAreaRepository.findEmailsByUserIds(eligibleUserIds);
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
            notificationRepository.insertNotification(
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
