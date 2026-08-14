package com.example.realestate.discover.citylaunch;

import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin city-launch validation checklist workflow (#1911 PR4): per-section confirmation flags plus
 * the atomic PREPARED -&gt; VALIDATED transition for a {@link CityLaunchRevision}.
 *
 * <p>All four endpoints are {@link IsAdmin}, mirroring {@link AdminCityLaunchController}'s
 * single-operator-MVP, no-per-city-scoping decision. {@code revisionId}/{@code cityId} scoping and
 * the "not superseded, still PREPARED/VALIDATED" editability guard are enforced by
 * {@link CityLaunchValidationService} — both in its own pre-check (for correct HTTP status) AND,
 * authoritatively, in every guarded SQL {@code UPDATE} on
 * {@link CityLaunchRevisionRepository}.
 */
@RestController
@RequestMapping("/api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/validation")
public class AdminCityLaunchValidationController {

    private static final Logger log = LoggerFactory.getLogger(AdminCityLaunchValidationController.class);

    private final CityLaunchValidationService validationService;

    public AdminCityLaunchValidationController(CityLaunchValidationService validationService) {
        this.validationService = validationService;
    }

    /** GET .../validation — current checklist state for the revision. */
    @IsAdmin
    @GetMapping
    public ValidationStateDto getState(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET city-launch validation cityId={} revisionId={} adminId={}",
                cityId, revisionId, caller.userId());
        return validationService.getValidationState(cityId, revisionId);
    }

    /** PUT .../validation/checks/{checkKey} {"value":bool} — toggles one checklist item. */
    @IsAdmin
    @PutMapping("/checks/{checkKey}")
    public ValidationStateDto toggleCheck(
            @PathVariable int cityId, @PathVariable long revisionId, @PathVariable String checkKey,
            @RequestBody(required = false) ToggleCheckRequest request, CallerInfo caller) {
        if (request == null || request.value() == null) {
            throw new IllegalArgumentException("value is required");
        }
        log.info("PUT city-launch validation check cityId={} revisionId={} checkKey={} value={} adminId={}",
                cityId, revisionId, checkKey, request.value(), caller.userId());
        return validationService.toggleCheck(cityId, revisionId, checkKey, request.value());
    }

    /** POST .../validation/reset — clears all six checklist items. */
    @IsAdmin
    @PostMapping("/reset")
    public ValidationStateDto reset(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.info("POST city-launch validation reset cityId={} revisionId={} adminId={}",
                cityId, revisionId, caller.userId());
        return validationService.reset(cityId, revisionId);
    }

    /** POST .../validation/mark-validated — atomic PREPARED -&gt; VALIDATED transition. */
    @IsAdmin
    @PostMapping("/mark-validated")
    public ValidationStateDto markValidated(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.info("POST city-launch validation mark-validated cityId={} revisionId={} adminId={}",
                cityId, revisionId, caller.userId());
        return validationService.markValidated(cityId, revisionId);
    }
}
