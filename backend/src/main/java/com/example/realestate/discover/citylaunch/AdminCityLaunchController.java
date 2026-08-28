package com.example.realestate.discover.citylaunch;

import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin city launch & preview workflow — city selection, preparation, and progress (#1911 PR2).
 *
 * <p>All three endpoints are {@link IsAdmin}: any ROLE_ADMIN caller may act on any city (single-
 * operator MVP, no per-city scoping — an intentional, documented decision, not a gap).
 *
 * <p>{@code POST .../prepare} deliberately binds no request body. {@code created_by} on the new
 * {@link CityLaunchRevision} comes ONLY from {@link CallerInfo#userId()}, resolved from the JWT by
 * {@link com.example.realestate.security.CallerInfoResolver} — there is no code path by which a
 * client-supplied value could reach it, even if a client sends a JSON body attempting to set one.
 */
@RestController
@RequestMapping("/api/admin/city-launch")
public class AdminCityLaunchController {

    private static final Logger log = LoggerFactory.getLogger(AdminCityLaunchController.class);

    private final CityLaunchReadService readService;
    private final CityLaunchPreparationService preparationService;
    private final CityLaunchSseService sseService;
    private final CityLaunchCandidateService candidateService;

    public AdminCityLaunchController(
            CityLaunchReadService readService,
            CityLaunchPreparationService preparationService,
            CityLaunchSseService sseService,
            CityLaunchCandidateService candidateService) {
        this.readService = readService;
        this.preparationService = preparationService;
        this.sseService = sseService;
        this.candidateService = candidateService;
    }

    /** GET /api/admin/city-launch/cities — every city's derived launch status. */
    @IsAdmin
    @GetMapping("/cities")
    public List<CityLaunchStatusDto> listCities(CallerInfo caller) {
        log.debug("GET /api/admin/city-launch/cities adminId={}", caller.userId());
        return readService.listCities();
    }

    /** POST /api/admin/city-launch/cities/{cityId}/prepare — 202 Accepted; starts async prep. */
    @IsAdmin
    @PostMapping("/cities/{cityId}/prepare")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public PrepareResponse prepare(@PathVariable int cityId, CallerInfo caller) {
        log.info("POST /api/admin/city-launch/cities/{}/prepare adminId={}", cityId, caller.userId());
        return preparationService.prepare(cityId, caller.userId());
    }

    /** GET /api/admin/city-launch/cities/{cityId}/prepare — latest revision's progress detail. */
    @IsAdmin
    @GetMapping("/cities/{cityId}/prepare")
    public CityLaunchProgressDto getProgress(@PathVariable int cityId, CallerInfo caller) {
        log.debug("GET /api/admin/city-launch/cities/{}/prepare adminId={}", cityId, caller.userId());
        return readService.getProgress(cityId);
    }

    /** GET /api/admin/city-launch/cities/{cityId}/prepare/events — SSE stream for prep progress. */
    @IsAdmin
    @GetMapping(value = "/cities/{cityId}/prepare/events", produces = "text/event-stream")
    public org.springframework.web.servlet.mvc.method.annotation.SseEmitter getProgressEvents(
            @PathVariable int cityId, CallerInfo caller) {
        log.debug("GET /api/admin/city-launch/cities/{}/prepare/events adminId={}", cityId, caller.userId());
        return sseService.subscribe(cityId);
    }

    /**
     * POST .../cities/{cityId}/revisions/{revisionId}/rerun — 202 Accepted; atomically supersedes
     * {@code revisionId} (must currently be PREPARED or VALIDATED) and starts a fresh preparation
     * run (#1911 PR4). 409 if {@code revisionId} is not currently in-flight (already superseded,
     * or a concurrent caller superseded it first).
     */
    @IsAdmin
    @PostMapping("/cities/{cityId}/revisions/{revisionId}/rerun")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public PrepareResponse rerun(@PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.info("POST /api/admin/city-launch/cities/{}/revisions/{}/rerun adminId={}",
                cityId, revisionId, caller.userId());
        return preparationService.rerunSuperseding(cityId, revisionId, caller.userId());
    }

    /**
     * POST .../cities/{cityId}/revisions/{revisionId}/edit — 201 Created; derives a new, editable
     * {@code PREPARED} candidate revision as a byte-faithful copy of the current LIVE (PROMOTED,
     * not-yet-superseded) revision's own sandbox rows (#2121). {@code revisionId} must be the
     * CURRENT LIVE revision id — 404 if the city has no LIVE revision, 409 if {@code revisionId} is
     * stale (a different revision is now LIVE) or if LIVE has no sandbox rows to clone (a legacy
     * pre-sandbox revision).
     */
    @IsAdmin
    @PostMapping("/cities/{cityId}/revisions/{revisionId}/edit")
    @ResponseStatus(HttpStatus.CREATED)
    public PrepareResponse editFromLive(@PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.info("POST /api/admin/city-launch/cities/{}/revisions/{}/edit adminId={}",
                cityId, revisionId, caller.userId());
        return candidateService.editFromLive(cityId, revisionId, caller.userId());
    }
}
