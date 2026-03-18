package com.example.realestate.listing.audit;

import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Admin-only audit log reader.
 * GET /api/admin/audit-log?limit=50 — returns recent admin actions.
 */
@RestController
@RequestMapping("/api/admin/audit-log")
public class AdminAuditController {

    private static final Logger log = LoggerFactory.getLogger(AdminAuditController.class);

    private final AdminAuditService adminAuditService;

    public AdminAuditController(AdminAuditService adminAuditService) {
        this.adminAuditService = adminAuditService;
    }

    @GetMapping
    public ResponseEntity<?> getAuditLog(CallerInfo caller,
                                          @RequestParam(defaultValue = "50") int limit) {
        if (!caller.isAdmin()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");

        int safeLimit = Math.min(Math.max(limit, 1), 200);
        List<AdminAuditService.AuditLogEntry> entries = adminAuditService.getRecent(safeLimit);
        log.info("GET /api/admin/audit-log -> {} entries limit={}", entries.size(), safeLimit);
        return ResponseEntity.ok(entries);
    }
}
