package com.example.realestate.discover.citylaunch;

import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin city-launch guarded Launch endpoint (#1911 PR5) — the ONLY production-geography write path
 * in the feature. A NEW controller (not {@link AdminCityLaunchController}) so its IT never needs the
 * FROZEN {@code AdminCityLaunchControllerIT.java}.
 *
 * <p>{@code @IsAdmin}, mirroring {@link AdminCityLaunchValidationController}'s single-operator-MVP,
 * no-per-city-scoping decision. {@code cityId}/{@code revisionId} scoping and the "currently
 * VALIDATED, not superseded" precondition are enforced by {@link CityLaunchPromotionService} —
 * authoritatively in its guarded SQL CAS {@code UPDATE}, never by a client-supplied value.
 */
@RestController
@RequestMapping("/api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/launch")
public class AdminCityLaunchLaunchController {

    private static final Logger log = LoggerFactory.getLogger(AdminCityLaunchLaunchController.class);

    private final CityLaunchPromotionService promotionService;

    public AdminCityLaunchLaunchController(CityLaunchPromotionService promotionService) {
        this.promotionService = promotionService;
    }

    /**
     * POST .../launch — promotes a VALIDATED revision's sandbox geography into production and
     * activates the city. {@code request.confirmCityName} is deliberately never read: it is a
     * UI-only type-to-confirm guard (AC2); the server's write authority is entirely the guarded CAS
     * + checksum verification inside {@link CityLaunchPromotionService#launch}.
     */
    @IsAdmin
    @PostMapping
    public PromotionReport launch(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestBody(required = false) LaunchRequest request, CallerInfo caller) {
        log.info("POST city-launch launch cityId={} revisionId={} adminId={}",
                cityId, revisionId, caller.userId());
        return promotionService.launch(cityId, revisionId, caller.userId().toString());
    }
}
