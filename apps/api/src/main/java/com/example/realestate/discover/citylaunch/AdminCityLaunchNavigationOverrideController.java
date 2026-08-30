package com.example.realestate.discover.citylaunch;

import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin controlled-overrides + sandbox preview/diff for the navigation hierarchy (#1955 Areas PR
 * A, SLICE 2f+2g). All routes {@link IsAdmin}, no-store — same admin-only, ephemeral-data contract
 * as {@link AdminCityLaunchPreviewController}. The tree/diff/overrides GET routes read the
 * revision's SANDBOX state directly (never the promoted-production cache the public {@code
 * NavigationController} serves), and the mutating routes reuse {@link
 * CityLaunchNavigationOverrideService}'s ONE-transaction regenerate+re-stamp for every write.
 */
@RestController
@RequestMapping("/api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/navigation")
public class AdminCityLaunchNavigationOverrideController {

    private static final Logger log = LoggerFactory.getLogger(AdminCityLaunchNavigationOverrideController.class);

    private final CityLaunchNavigationOverrideService service;

    public AdminCityLaunchNavigationOverrideController(CityLaunchNavigationOverrideService service) {
        this.service = service;
    }

    /** GET .../navigation/tree — the revision's sandbox navigation tree + a display-time validation status. */
    @IsAdmin
    @GetMapping("/tree")
    public ResponseEntity<NavigationPreviewTreeResponse> getTree(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET navigation/tree cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(service.getPreviewTree(cityId, revisionId));
    }

    /** GET .../navigation/diff?against=BASE|PREVIOUS_REVISION — structural diff. */
    @IsAdmin
    @GetMapping("/diff")
    public ResponseEntity<NavigationTreeDiffResponse> getDiff(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "against", required = false, defaultValue = "BASE") String against,
            CallerInfo caller) {
        log.debug("GET navigation/diff cityId={} revisionId={} against={} adminId={}",
                cityId, revisionId, against, caller.userId());
        return noStore(service.getDiff(cityId, revisionId, against));
    }

    /** GET .../navigation/overrides — every controlled override currently applied to this revision. */
    @IsAdmin
    @GetMapping("/overrides")
    public ResponseEntity<List<AdminNavigationOverrideResponse>> listOverrides(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET navigation/overrides cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(service.listOverrides(cityId, revisionId));
    }

    /**
     * POST .../navigation/overrides — inserts one override, regenerates the tree, re-stamps the
     * checksum, all in one transaction. 200 + diff on success; 422 (via {@code
     * NavigationTreeValidationException}) if the resulting tree fails the 13-invariant check; 409
     * on a duplicate (area/node, kind) or a non-PREPARED revision; 400 on a malformed request shape.
     */
    @IsAdmin
    @PostMapping("/overrides")
    public ResponseEntity<NavigationTreeDiffResponse> createOverride(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestBody AdminNavigationOverrideRequest request, CallerInfo caller) {
        log.info("POST navigation/overrides cityId={} revisionId={} kind={} adminId={}",
                cityId, revisionId, request.kind(), caller.userId());
        return noStore(service.createOverride(cityId, revisionId, request, caller.userId()));
    }

    /**
     * DELETE .../navigation/overrides/{overrideId} — removes one override, regenerates, re-stamps.
     * 200 + diff on success; 404 if the override doesn't exist on this revision; 409 if the
     * revision is not PREPARED.
     */
    @IsAdmin
    @DeleteMapping("/overrides/{overrideId}")
    public ResponseEntity<NavigationTreeDiffResponse> deleteOverride(
            @PathVariable int cityId, @PathVariable long revisionId, @PathVariable long overrideId,
            CallerInfo caller) {
        log.info("DELETE navigation/overrides/{} cityId={} revisionId={} adminId={}",
                overrideId, cityId, revisionId, caller.userId());
        return noStore(service.deleteOverride(cityId, revisionId, overrideId));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
