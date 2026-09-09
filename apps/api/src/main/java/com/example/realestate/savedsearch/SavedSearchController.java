package com.example.realestate.savedsearch;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import org.springframework.web.server.ResponseStatusException;

import com.example.realestate.exception.RateLimiterService;

/**
 * #2019 Slice A: REST surface for saved/alertable searches. Every endpoint derives the
 * caller's identity from the validated JWT subject (never a client-supplied user id), and
 * every owner-scoped lookup/mutation is IDOR-safe (404, never 403, on ownership mismatch —
 * see {@link SavedSearchService#get}), mirroring {@code SavedAreaController}'s pattern.
 *
 * <p>Rate-limit *consumption* happens here, before the service (and the DB) are touched —
 * matching {@code BookingController} / {@code PaymentController} convention. The service
 * itself never consumes a rate-limit bucket.
 */
@RestController
@RequestMapping("/api/saved-searches")
public class SavedSearchController {

    private static final Logger log = LoggerFactory.getLogger(SavedSearchController.class);

    private final SavedSearchService savedSearchService;
    private final RateLimiterService rateLimiterService;

    public SavedSearchController(SavedSearchService savedSearchService, RateLimiterService rateLimiterService) {
        this.savedSearchService = savedSearchService;
        this.rateLimiterService = rateLimiterService;
    }

    @GetMapping
    public ResponseEntity<List<SavedSearchResponse>> list(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);

        List<SavedSearchResponse> searches =
                savedSearchService.list(userId).stream().map(SavedSearchResponse::from).toList();

        log.info("GET /api/saved-searches -> 200 count={} userId={}", searches.size(), userId);
        return ResponseEntity.ok(searches);
    }

    @GetMapping("/{id}")
    public ResponseEntity<SavedSearchResponse> get(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID userId = extractUserId(auth);

        SavedSearch savedSearch = savedSearchService.get(userId, id);
        log.info("GET /api/saved-searches/{} -> 200 userId={}", id, userId);
        return ResponseEntity.ok(SavedSearchResponse.from(savedSearch));
    }

    @PostMapping
    public ResponseEntity<SavedSearchResponse> create(JwtAuthenticationToken auth, @RequestBody SavedSearchRequest req) {
        UUID userId = extractUserId(auth);

        if (!rateLimiterService.getSavedSearchCreateBucket(userId.toString()).tryConsume(1)) {
            log.info("POST /api/saved-searches -> 429 rate limited userId={}", userId);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "saved_search_rate_limit_exceeded");
        }

        SavedSearchService.CreateOutcome outcome =
                savedSearchService.create(
                        userId,
                        req.citySlug(),
                        req.resultScopeKind(),
                        req.areaKeys(),
                        req.polygon(),
                        req.viewportSouth(),
                        req.viewportWest(),
                        req.viewportNorth(),
                        req.viewportEast(),
                        req.filters(),
                        req.label(),
                        req.alertFrequency());

        HttpStatus status = outcome.created() ? HttpStatus.CREATED : HttpStatus.OK;
        log.info(
                "POST /api/saved-searches -> {} created={} id={} userId={}",
                status.value(),
                outcome.created(),
                outcome.savedSearch().getId(),
                userId);
        return ResponseEntity.status(status).body(SavedSearchResponse.from(outcome.savedSearch()));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<SavedSearchResponse> update(
            JwtAuthenticationToken auth, @PathVariable UUID id, @RequestBody SavedSearchRequest req) {
        UUID userId = extractUserId(auth);

        if (!rateLimiterService.getSavedSearchUpdateBucket(userId.toString()).tryConsume(1)) {
            log.info("PATCH /api/saved-searches/{} -> 429 rate limited userId={}", id, userId);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "saved_search_rate_limit_exceeded");
        }

        SavedSearch updated =
                savedSearchService.update(
                        userId,
                        id,
                        req.citySlug(),
                        req.resultScopeKind(),
                        req.areaKeys(),
                        req.polygon(),
                        req.viewportSouth(),
                        req.viewportWest(),
                        req.viewportNorth(),
                        req.viewportEast(),
                        req.filters(),
                        req.label(),
                        req.alertFrequency());

        log.info("PATCH /api/saved-searches/{} -> 200 userId={}", id, userId);
        return ResponseEntity.ok(SavedSearchResponse.from(updated));
    }

    @PatchMapping("/{id}/pause")
    public ResponseEntity<SavedSearchResponse> pause(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID userId = extractUserId(auth);

        SavedSearch paused = savedSearchService.pause(userId, id);
        log.info("PATCH /api/saved-searches/{}/pause -> 200 userId={}", id, userId);
        return ResponseEntity.ok(SavedSearchResponse.from(paused));
    }

    @PatchMapping("/{id}/resume")
    public ResponseEntity<SavedSearchResponse> resume(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID userId = extractUserId(auth);

        SavedSearch resumed = savedSearchService.resume(userId, id);
        log.info("PATCH /api/saved-searches/{}/resume -> 200 userId={}", id, userId);
        return ResponseEntity.ok(SavedSearchResponse.from(resumed));
    }

    /** #2019 Slice B: owner-scoped email unsubscribe/resubscribe for one saved search. */
    @PatchMapping("/{id}/email-alerts")
    public ResponseEntity<SavedSearchResponse> setEmailAlerts(
            JwtAuthenticationToken auth, @PathVariable UUID id, @RequestBody EmailAlertsRequest req) {
        UUID userId = extractUserId(auth);
        if (req == null || req.enabled() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "saved_search_email_alerts_enabled_required");
        }

        SavedSearch updated = savedSearchService.setEmailAlerts(userId, id, req.enabled());
        log.info("PATCH /api/saved-searches/{}/email-alerts -> 200 enabled={} userId={}", id, req.enabled(), userId);
        return ResponseEntity.ok(SavedSearchResponse.from(updated));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(JwtAuthenticationToken auth, @PathVariable UUID id) {
        UUID userId = extractUserId(auth);

        savedSearchService.delete(userId, id);
        log.info("DELETE /api/saved-searches/{} -> 204 userId={}", id, userId);
        return ResponseEntity.noContent().build();
    }

    // ===== Auth =====

    private static UUID extractUserId(JwtAuthenticationToken auth) {
        return UUID.fromString(auth.getToken().getSubject());
    }

    // ===== DTOs =====

    /**
     * Request body shape shared by create and update. {@code resultScopeKind} is a required
     * discriminator; exactly one of {@code areaKeys}, {@code polygon}, or the four
     * {@code viewport*} fields must be populated and consistent with it (enforced by
     * {@link SavedSearchScopeExclusivity} in the service layer). {@code filters} keys are
     * restricted to {@link SavedSearchFilterAllowlist}'s allowlist; unsupported keys are
     * rejected, never silently dropped.
     */
    public record SavedSearchRequest(
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> filters,
            String label,
            AlertFrequency alertFrequency) {
    }

    /** Body for {@code PATCH /{id}/email-alerts}: {@code enabled} is required. */
    public record EmailAlertsRequest(Boolean enabled) {
    }

    public record SavedSearchResponse(
            UUID id,
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> filters,
            String fingerprint,
            String label,
            SavedSearchStatus status,
            AlertFrequency alertFrequency,
            AlertStatus alertStatus,
            boolean emailAlertsEnabled,
            String lastAlertedAt,
            String alertWatermark,
            String createdAt,
            String updatedAt) {
        static SavedSearchResponse from(SavedSearch s) {
            return new SavedSearchResponse(
                    s.getId(),
                    s.getCitySlug(),
                    s.getResultScopeKind(),
                    s.getAreaKeys(),
                    s.getPolygon(),
                    s.getViewportSouth(),
                    s.getViewportWest(),
                    s.getViewportNorth(),
                    s.getViewportEast(),
                    s.getFilters(),
                    s.getFingerprint(),
                    s.getLabel(),
                    s.getStatus(),
                    s.getAlertFrequency(),
                    s.getAlertStatus(),
                    s.isEmailAlertsEnabled(),
                    s.getLastAlertedAt() != null ? s.getLastAlertedAt().toString() : null,
                    s.getAlertWatermark() != null ? s.getAlertWatermark().toString() : null,
                    s.getCreatedAt() != null ? s.getCreatedAt().toString() : null,
                    s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null);
        }
    }
}
