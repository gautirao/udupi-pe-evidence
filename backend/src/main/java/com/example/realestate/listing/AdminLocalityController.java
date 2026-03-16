package com.example.realestate.listing;

import com.example.realestate.security.UserRoleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only locality normalization endpoints.
 *
 * GET  /api/admin/localities/candidates  — list all localities with counts + suggested canonical
 * POST /api/admin/localities/preview     — how many listings would be affected by a rename
 * POST /api/admin/localities/apply       — bulk rename locality (from → to)
 */
@RestController
@RequestMapping("/api/admin/localities")
public class AdminLocalityController {

    private static final Logger log = LoggerFactory.getLogger(AdminLocalityController.class);

    private final LocalityNormalizerService normalizerService;
    private final AdminAuditService adminAuditService;
    private final UserRoleService userRoleService;

    public AdminLocalityController(LocalityNormalizerService normalizerService,
                                   AdminAuditService adminAuditService,
                                   UserRoleService userRoleService) {
        this.normalizerService = normalizerService;
        this.adminAuditService = adminAuditService;
        this.userRoleService = userRoleService;
    }

    @GetMapping("/candidates")
    public ResponseEntity<?> getCandidates(JwtAuthenticationToken auth) {
        if (resolveAdminOrForbid(auth) == null) return forbidden();
        List<LocalityNormalizerService.LocalityCandidate> candidates = normalizerService.getCandidates();
        log.info("GET /api/admin/localities/candidates -> {} localities", candidates.size());
        return ResponseEntity.ok(candidates);
    }

    @PostMapping("/preview")
    public ResponseEntity<?> preview(JwtAuthenticationToken auth,
                                     @RequestBody MappingRequest req) {
        if (resolveAdminOrForbid(auth) == null) return forbidden();
        if (req.from() == null || req.from().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "'from' is required"));
        }
        long count = normalizerService.previewImpact(req.from());
        return ResponseEntity.ok(Map.of("affectedCount", count, "from", req.from(),
                "to", req.to() != null ? req.to() : ""));
    }

    @PostMapping("/apply")
    public ResponseEntity<?> apply(JwtAuthenticationToken auth,
                                   @RequestBody MappingRequest req) {
        UUID adminId = resolveAdminOrForbid(auth);
        if (adminId == null) return forbidden();
        if (req.from() == null || req.from().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "'from' is required"));
        }
        if (req.to() == null || req.to().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "'to' is required"));
        }
        long beforeCount = normalizerService.previewImpact(req.from());
        int updated = normalizerService.apply(req.from(), req.to());
        log.info("POST /api/admin/localities/apply admin={} from='{}' to='{}' -> {} rows updated",
                adminId, req.from(), req.to(), updated);
        adminAuditService.record(adminId, "locality_renamed", "locality", null,
                "{\"from\":\"" + req.from().replace("\"", "\\\"") + "\",\"count\":" + beforeCount + "}",
                "{\"to\":\"" + req.to().replace("\"", "\\\"") + "\",\"updatedCount\":" + updated + "}");
        return ResponseEntity.ok(Map.of("updatedCount", updated, "from", req.from(), "to", req.to()));
    }

    // ===== Auth =====

    private UUID resolveAdminOrForbid(JwtAuthenticationToken auth) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = userRoleService.getUserRole(userId).orElse(null);
        if (!"admin".equals(role)) return null;
        return userId;
    }

    private static ResponseEntity<Map<String, String>> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Requires admin role"));
    }

    // ===== DTOs =====

    public record MappingRequest(String from, String to) {}
}
