package com.example.realestate.propertyrequest;

import com.example.realestate.security.CallerInfo;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Admin-only reader for property requests (#1793).
 * GET /api/admin/property-requests?limit=50 — newest first, limit clamped to 1..200.
 * Anonymous callers get 401 from the security chain; non-admins get 403 here. Responses carry
 * {@code phoneMasked} only.
 */
@RestController
@RequestMapping("/api/admin/property-requests")
public class AdminPropertyRequestController {

    private static final int MAX_LIMIT = 200;

    private final PropertyRequestService service;

    public AdminPropertyRequestController(PropertyRequestService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<List<AdminPropertyRequestView>> list(CallerInfo caller,
                                                               @RequestParam(defaultValue = "50") int limit) {
        if (!caller.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");
        }
        int safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        return ResponseEntity.ok(service.listRecent(safeLimit));
    }
}
