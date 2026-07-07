package com.example.realestate.savedlistings;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Saved-homes API (#1566): let an authenticated user save/unsave/list property
 * listings. Every endpoint here requires a valid JWT — {@code userId} is derived
 * exclusively from the JWT subject, never from client input. This controller is
 * NOT added to any {@code permitAll} matcher, so anonymous callers get the
 * framework's default 401/403 before reaching here.
 *
 * <p>POST/DELETE are idempotent by design (approved contract): saving an
 * already-saved listing returns 200 rather than 409, and unsaving an absent row
 * returns 204 rather than 404 — a toggle-style UI never has to special-case
 * "already in this state".
 */
@RestController
@RequestMapping("/api/me/saved-listings")
public class SavedListingsController {

    private static final Logger log = LoggerFactory.getLogger(SavedListingsController.class);

    private final SavedListingsService savedListingsService;

    public SavedListingsController(SavedListingsService savedListingsService) {
        this.savedListingsService = savedListingsService;
    }

    @GetMapping
    public ResponseEntity<List<SavedListingCard>> list(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);
        List<SavedListingCard> cards = savedListingsService.listSaved(userId);
        log.info("GET /api/me/saved-listings -> 200 count={} userId={}", cards.size(), userId);
        return ResponseEntity.ok(cards);
    }

    @GetMapping("/ids")
    public ResponseEntity<List<UUID>> listIds(JwtAuthenticationToken auth) {
        UUID userId = extractUserId(auth);
        List<UUID> ids = savedListingsService.listSavedIds(userId);
        log.info("GET /api/me/saved-listings/ids -> 200 count={} userId={}", ids.size(), userId);
        return ResponseEntity.ok(ids);
    }

    @PostMapping
    public ResponseEntity<?> save(JwtAuthenticationToken auth, @RequestBody SaveListingRequest req) {
        UUID userId = extractUserId(auth);

        UUID listingId = parseListingId(req.listingId());
        if (listingId == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "listingId is required"));
        }

        SavedListingsService.SaveOutcome outcome = savedListingsService.save(userId, listingId);
        return switch (outcome) {
            case CREATED -> {
                log.info("POST /api/me/saved-listings -> 201 listingId={} userId={}", listingId, userId);
                yield ResponseEntity.status(HttpStatus.CREATED)
                        .body(Map.of("listingId", listingId, "saved", true));
            }
            case ALREADY_SAVED -> {
                log.debug("POST /api/me/saved-listings -> 200 (already saved) listingId={} userId={}",
                        listingId, userId);
                yield ResponseEntity.ok(Map.of("listingId", listingId, "saved", true));
            }
            case LISTING_NOT_FOUND -> {
                log.info("POST /api/me/saved-listings -> 404 listingId={} userId={}", listingId, userId);
                yield ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Listing not found"));
            }
        };
    }

    @DeleteMapping("/{listingId}")
    public ResponseEntity<Void> delete(JwtAuthenticationToken auth, @PathVariable UUID listingId) {
        UUID userId = extractUserId(auth);
        savedListingsService.unsave(userId, listingId);
        log.info("DELETE /api/me/saved-listings/{} -> 204 userId={}", listingId, userId);
        return ResponseEntity.noContent().build();
    }

    // ===== Auth =====

    private static UUID extractUserId(JwtAuthenticationToken auth) {
        return UUID.fromString(auth.getToken().getSubject());
    }

    private static UUID parseListingId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // ===== DTOs =====

    public record SaveListingRequest(String listingId) {}
}
