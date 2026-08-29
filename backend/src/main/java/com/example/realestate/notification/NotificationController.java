package com.example.realestate.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private static final Logger log = LoggerFactory.getLogger(NotificationController.class);

    private final NotificationRepository notificationRepository;

    public NotificationController(NotificationRepository notificationRepository) {
        this.notificationRepository = notificationRepository;
    }

    @GetMapping
    public ResponseEntity<Page<NotificationResponse>> list(
            JwtAuthenticationToken auth,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        UUID userId = extractUserId(auth);

        Page<NotificationResponse> page = notificationRepository
                .findByUserId(userId, pageable)
                .map(NotificationResponse::from);

        log.info("GET /api/notifications -> 200 page={} size={} total={} userId={}",
                page.getNumber(), page.getSize(), page.getTotalElements(), userId);
        return ResponseEntity.ok(page);
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<?> markAsRead(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID userId = extractUserId(auth);

        Notification notification = notificationRepository.findByIdAndUserId(id, userId)
                .orElse(null);
        if (notification == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Notification not found"));
        }

        if (!notification.isRead()) {
            notification.setRead(true);
            notificationRepository.save(notification);
        }

        log.info("PUT /api/notifications/{}/read -> 204 userId={}", id, userId);
        return ResponseEntity.noContent().build();
    }

    @Transactional
    @PutMapping("/read-all")
    public ResponseEntity<?> markAllAsRead(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);
        int updated = notificationRepository.markAllAsReadByUserId(userId);

        log.info("PUT /api/notifications/read-all -> 204 updated={} userId={}", updated, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Long>> unreadCount(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);
        long count = notificationRepository.countByUserIdAndIsReadFalse(userId);

        log.info("GET /api/notifications/unread-count -> 200 count={} userId={}", count, userId);
        return ResponseEntity.ok(Map.of("count", count));
    }

    // ===== Auth =====

    private static UUID extractUserId(JwtAuthenticationToken auth) {
        return UUID.fromString(auth.getToken().getSubject());
    }

    // ===== Response DTO =====

    public record NotificationResponse(
            UUID id,
            String type,
            String title,
            String message,
            String metadata,
            boolean isRead,
            String createdAt
    ) {
        static NotificationResponse from(Notification n) {
            return new NotificationResponse(
                    n.getId(),
                    n.getType(),
                    n.getTitle(),
                    n.getMessage(),
                    n.getMetadata(),
                    n.isRead(),
                    n.getCreatedAt() != null ? n.getCreatedAt().toString() : null);
        }
    }
}
