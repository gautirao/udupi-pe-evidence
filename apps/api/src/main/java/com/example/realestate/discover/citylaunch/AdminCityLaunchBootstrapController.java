package com.example.realestate.discover.citylaunch;

import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin "type a city name, Start launch" bootstrap endpoint (#2676 Slice A).
 *
 * <p>Separate controller from {@link AdminCityLaunchController} (which owns the EXISTING
 * numeric-cityId prepare/rerun/edit surface) so this new pre-city-creation entry point is
 * additive and cannot be confused with, or accidentally change the behaviour of, the
 * unmodified #1911/#2163 pipeline — same file-per-concern split as {@code
 * AdminCityLaunchLaunchController}/{@code AdminCityLaunchPreviewController}/{@code
 * AdminCityLaunchValidationController}.
 *
 * <p>{@code created_by}/{@code requested_by} on the new job comes ONLY from {@link
 * CallerInfo#userId()} — same discipline as {@link AdminCityLaunchController}'s javadoc.
 */
@RestController
@RequestMapping("/api/admin/city-launch/bootstrap")
public class AdminCityLaunchBootstrapController {

    private static final Logger log = LoggerFactory.getLogger(AdminCityLaunchBootstrapController.class);

    private final CityBootstrapService bootstrapService;

    public AdminCityLaunchBootstrapController(CityBootstrapService bootstrapService) {
        this.bootstrapService = bootstrapService;
    }

    /** POST /api/admin/city-launch/bootstrap — 202 Accepted; starts async name resolution. */
    @IsAdmin
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CityBootstrapJobDto startBootstrap(@RequestBody StartCityBootstrapRequest request, CallerInfo caller) {
        log.info("POST /api/admin/city-launch/bootstrap name='{}' adminId={}", request.name(), caller.userId());
        return bootstrapService.startBootstrap(request.name(), caller.userId());
    }

    /** GET /api/admin/city-launch/bootstrap/{jobId} — current job status/progress. */
    @IsAdmin
    @GetMapping("/{jobId}")
    public CityBootstrapJobDto getJob(@PathVariable long jobId, CallerInfo caller) {
        return bootstrapService.getJob(jobId);
    }

    /** POST /api/admin/city-launch/bootstrap/{jobId}/confirm — operator's explicit disambiguation choice. */
    @IsAdmin
    @PostMapping("/{jobId}/confirm")
    public CityBootstrapJobDto confirmDisambiguation(
            @PathVariable long jobId, @RequestBody ConfirmCityBootstrapRequest request, CallerInfo caller) {
        log.info("POST /api/admin/city-launch/bootstrap/{}/confirm candidateIndex={} adminId={}",
                jobId, request.candidateIndex(), caller.userId());
        return bootstrapService.confirmDisambiguation(jobId, request.candidateIndex(), caller.userId());
    }
}
