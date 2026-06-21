package com.example.realestate.intelligence;

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
 * Admin-only REST controller for the intelligence validator page.
 *
 * <p>All endpoints require ADMIN role. The {@code isAdmin()} check is the first
 * line of every handler — pattern from AdminListingController.
 *
 * <p>This controller is intentionally read-only. No writes, no mutations.
 */
@RestController
@RequestMapping("/api/admin/intelligence")
public class AdminIntelligenceController {

    private static final Logger log = LoggerFactory.getLogger(AdminIntelligenceController.class);

    private final AdminIntelligenceService adminIntelligenceService;

    public AdminIntelligenceController(AdminIntelligenceService adminIntelligenceService) {
        this.adminIntelligenceService = adminIntelligenceService;
    }

    /**
     * GET /api/admin/intelligence/areas?city=&lt;optional&gt;
     *
     * <p>Returns one row per area_key aggregated over the LIVE-90d listing set,
     * plus a data-confidence label derived from the live listing count.
     *
     * <p>city filter is optional: absent or blank = return all areas.
     * No matches returns an empty list (200, not 404).
     *
     * @param caller the resolved caller (admin check is the first guard)
     * @param city   optional district/city filter
     * @return 200 list of area rows; 403 if non-admin
     */
    @GetMapping("/areas")
    public ResponseEntity<List<AreaIntelligenceResponse>> getAreas(
            CallerInfo caller,
            @RequestParam(name = "city", required = false) String city) {

        if (!caller.isAdmin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Requires admin role");
        }

        log.info("GET /api/admin/intelligence/areas city='{}' adminId={}", city, caller.userId());

        List<AreaIntelligenceResponse> areas = adminIntelligenceService.getAreaIntelligence(city);
        return ResponseEntity.ok(areas);
    }
}
