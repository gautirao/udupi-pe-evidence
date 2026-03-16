package com.example.realestate.listing;

import com.example.realestate.security.UserRoleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only audit log reader.
 * GET /api/admin/audit-log?limit=50 — returns recent admin actions.
 */
@RestController
@RequestMapping("/api/admin/audit-log")
public class AdminAuditController {

    private static final Logger log = LoggerFactory.getLogger(AdminAuditController.class);

    private final AdminAuditService adminAuditService;
    private final UserRoleService userRoleService;

    public AdminAuditController(AdminAuditService adminAuditService, UserRoleService userRoleService) {
        this.adminAuditService = adminAuditService;
        this.userRoleService = userRoleService;
    }

    @GetMapping
    public ResponseEntity<?> getAuditLog(JwtAuthenticationToken auth,
                                          @RequestParam(defaultValue = "50") int limit) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());
        String role = userRoleService.getUserRole(userId).orElse(null);
        if (!"admin".equals(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Requires admin role"));
        }

        int safeLimit = Math.min(Math.max(limit, 1), 200);
        List<AdminAuditService.AuditLogEntry> entries = adminAuditService.getRecent(safeLimit);
        log.info("GET /api/admin/audit-log -> {} entries limit={}", entries.size(), safeLimit);
        return ResponseEntity.ok(entries);
    }
}
