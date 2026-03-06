package com.example.realestate.insights;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/saved-areas")
public class SavedAreaController {

    private static final Logger log = LoggerFactory.getLogger(SavedAreaController.class);

    private final SavedAreaRepository savedAreaRepository;

    public SavedAreaController(SavedAreaRepository savedAreaRepository) {
        this.savedAreaRepository = savedAreaRepository;
    }

    @GetMapping
    public ResponseEntity<List<SavedAreaResponse>> list(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);

        List<SavedAreaResponse> areas = savedAreaRepository
                .findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(SavedAreaResponse::from)
                .toList();

        log.info("GET /api/saved-areas -> 200 count={} userId={}", areas.size(), userId);
        return ResponseEntity.ok(areas);
    }

    @PostMapping
    public ResponseEntity<?> save(JwtAuthenticationToken auth, @RequestBody SaveAreaRequest req) {
        UUID userId = extractUserId(auth);

        if (req.areaKey() == null || req.areaKey().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "areaKey is required"));
        }

        SavedArea area = new SavedArea();
        area.setUserId(userId);
        area.setAreaKey(req.areaKey());
        area.setAreaLabel(req.areaLabel());
        area.setCreatedAt(OffsetDateTime.now());

        try {
            SavedArea saved = savedAreaRepository.save(area);
            log.info("POST /api/saved-areas -> 201 areaKey={} userId={}", req.areaKey(), userId);
            return ResponseEntity.status(HttpStatus.CREATED).body(SavedAreaResponse.from(saved));
        } catch (DataIntegrityViolationException e) {
            log.info("POST /api/saved-areas -> 409 duplicate areaKey={} userId={}", req.areaKey(), userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Area already saved"));
        }
    }

    @PatchMapping("/{id}/alerts")
    public ResponseEntity<?> updateAlerts(JwtAuthenticationToken auth,
                                          @PathVariable UUID id,
                                          @RequestBody AlertsRequest req) {
        UUID userId = extractUserId(auth);

        SavedArea area = savedAreaRepository.findByIdAndUserId(id, userId).orElse(null);
        if (area == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Saved area not found"));
        }

        area.setAlertsEnabled(req.alertsEnabled());
        SavedArea saved = savedAreaRepository.save(area);
        log.info("PATCH /api/saved-areas/{}/alerts -> alertsEnabled={} userId={}", id, req.alertsEnabled(), userId);
        return ResponseEntity.ok(SavedAreaResponse.from(saved));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID userId = extractUserId(auth);

        SavedArea area = savedAreaRepository.findByIdAndUserId(id, userId).orElse(null);
        if (area == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("error", "Saved area not found"));
        }

        savedAreaRepository.delete(area);
        log.info("DELETE /api/saved-areas/{} -> 204 areaKey={} userId={}", id, area.getAreaKey(), userId);
        return ResponseEntity.noContent().build();
    }

    // ===== Auth =====

    private static UUID extractUserId(JwtAuthenticationToken auth) {
        return UUID.fromString(auth.getToken().getSubject());
    }

    // ===== DTOs =====

    public record SaveAreaRequest(String areaKey, String areaLabel) {}

    public record AlertsRequest(boolean alertsEnabled) {}

    public record SavedAreaResponse(UUID id, String areaKey, String areaLabel, String createdAt, boolean alertsEnabled) {
        static SavedAreaResponse from(SavedArea a) {
            return new SavedAreaResponse(
                    a.getId(), a.getAreaKey(), a.getAreaLabel(),
                    a.getCreatedAt() != null ? a.getCreatedAt().toString() : null,
                    a.isAlertsEnabled());
        }
    }
}
