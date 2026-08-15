package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.AreaGroupsResponse;
import com.example.realestate.discover.AreaSummaryResponse;
import com.example.realestate.discover.CityAreaListingsResponse;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.RegionScopedAreaGroup;
import com.example.realestate.discover.RegionSummaryResponse;
import com.example.realestate.security.CallerInfo;
import com.example.realestate.security.IsAdmin;
import com.example.realestate.discover.navigation.NavigationCountsResponse;
import com.example.realestate.discover.navigation.NavigationResolveResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Admin city-launch preview endpoints (#1911 PR3).
 *
 * <p>Renders the SAME production Discover response shapes ({@link RegionSummaryResponse},
 * {@link RegionScopedAreaGroup.Response}, {@link AreaSummaryResponse},
 * {@link DiscoverMarkersResponse}, {@link CityAreaListingsResponse},
 * {@link DiscoverListingResponse}, {@link AreaGroupsResponse}) against a
 * {@link CityLaunchRevision}'s {@code sandbox_*}
 * staging graph, so an admin can see what a city launch will look like to a real Discover user
 * before promotion — without touching any public Discover controller/service/DTO and without
 * persisting anything. See {@link CityLaunchPreviewService} for the viewability guard, field
 * mapping, and simulated-listing derivation.
 *
 * <p>All six endpoints are {@link IsAdmin} (any ROLE_ADMIN caller — no per-city scoping, matching
 * {@link AdminCityLaunchController}'s documented single-operator MVP decision) and always respond
 * {@code Cache-Control: no-store} — this is admin-only, revision-scoped, ephemeral data that must
 * never be cached, and the distinct {@code /preview/...} path already gives it a distinct HTTP
 * cache key from the public Discover endpoints it mirrors.
 */
@RestController
@RequestMapping("/api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/preview")
public class AdminCityLaunchPreviewController {

    private static final Logger log = LoggerFactory.getLogger(AdminCityLaunchPreviewController.class);

    private final CityLaunchPreviewService previewService;

    public AdminCityLaunchPreviewController(CityLaunchPreviewService previewService) {
        this.previewService = previewService;
    }

    /** GET .../preview/regions -> {@link RegionSummaryResponse}. */
    @IsAdmin
    @GetMapping("/regions")
    public ResponseEntity<RegionSummaryResponse> getRegions(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET preview/regions cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getRegions(cityId, revisionId));
    }

    /** GET .../preview/regions/{regionKey}/groups -> {@link RegionScopedAreaGroup.Response}. */
    @IsAdmin
    @GetMapping("/regions/{regionKey}/groups")
    public ResponseEntity<RegionScopedAreaGroup.Response> getRegionScopedGroups(
            @PathVariable int cityId, @PathVariable long revisionId,
            @PathVariable String regionKey, CallerInfo caller) {
        log.debug("GET preview/regions/{}/groups cityId={} revisionId={} adminId={}",
                regionKey, cityId, revisionId, caller.userId());
        return noStore(previewService.getRegionScopedGroups(cityId, revisionId, regionKey));
    }

    /** GET .../preview/areas -> {@link AreaSummaryResponse}. */
    @IsAdmin
    @GetMapping("/areas")
    public ResponseEntity<AreaSummaryResponse> getAreas(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET preview/areas cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getAreas(cityId, revisionId));
    }

    /** GET .../preview/markers?areaKeys=... -> {@link DiscoverMarkersResponse}. */
    @IsAdmin
    @GetMapping("/markers")
    public ResponseEntity<DiscoverMarkersResponse> getMarkers(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            CallerInfo caller) {
        log.debug("GET preview/markers cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getMarkers(cityId, revisionId, areaKeys));
    }

    /** GET .../preview/listings?areaKeys=... -> {@link CityAreaListingsResponse}. */
    @IsAdmin
    @GetMapping("/listings")
    public ResponseEntity<CityAreaListingsResponse> getListings(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            CallerInfo caller) {
        log.debug("GET preview/listings cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getListings(cityId, revisionId, areaKeys));
    }

    /** GET .../preview/listings/{areaKey} -> {@link DiscoverListingResponse}. */
    @IsAdmin
    @GetMapping("/listings/{areaKey}")
    public ResponseEntity<DiscoverListingResponse> getListingDetail(
            @PathVariable int cityId, @PathVariable long revisionId,
            @PathVariable String areaKey, CallerInfo caller) {
        log.debug("GET preview/listings/{} cityId={} revisionId={} adminId={}",
                areaKey, cityId, revisionId, caller.userId());
        return noStore(previewService.getListingDetail(cityId, revisionId, areaKey));
    }

    /**
     * GET .../preview/area-groups -&gt; {@link AreaGroupsResponse}.
     *
     * <p>Unscoped — the whole revision's active area groups, mirroring the production
     * {@code GET /api/discover/area-groups} endpoint that the frontend's unscoped
     * {@code useAreaGroups} hook calls (#1911 PR3 rework). Distinct from
     * {@link #getRegionScopedGroups} (E2), which returns only one region's subset of a group's
     * members.
     */
    @IsAdmin
    @GetMapping("/area-groups")
    public ResponseEntity<AreaGroupsResponse> getAreaGroups(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET preview/area-groups cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getAreaGroups(cityId, revisionId));
    }

    @IsAdmin
    @GetMapping("/navigation/resolve")
    public ResponseEntity<NavigationResolveResponse> resolveNavigation(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam("node") String node, CallerInfo caller) {
        log.debug("GET preview/navigation/resolve cityId={} revisionId={} node={} adminId={}", cityId, revisionId, node, caller.userId());
        return noStore(previewService.resolveNavigation(cityId, revisionId, node));
    }

    /**
     * GET .../preview/agri -&gt; {@link AgriPreviewResponse} (#2151 PR A). Row count, direction/
     * distance-band distributions, areas excluded for missing coordinates, and the origin used —
     * everything an admin needs to judge Agri generation quality before ticking the
     * {@code agriDestinations} validation checklist item.
     */
    @IsAdmin
    @GetMapping("/agri")
    public ResponseEntity<AgriPreviewResponse> getAgriPreview(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET preview/agri cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getAgriPreview(cityId, revisionId));
    }

    /**
     * GET .../preview/identity -&gt; {@link PreviewIdentityResponse} (#2151 Track 1). The
     * previewed revision's real owning-city slug/name, so the admin preview page can resolve
     * city identity instead of falling back to a default city.
     */
    @IsAdmin
    @GetMapping("/identity")
    public ResponseEntity<PreviewIdentityResponse> getPreviewIdentity(
            @PathVariable int cityId, @PathVariable long revisionId, CallerInfo caller) {
        log.debug("GET preview/identity cityId={} revisionId={} adminId={}", cityId, revisionId, caller.userId());
        return noStore(previewService.getPreviewIdentity(cityId, revisionId));
    }

    @IsAdmin
    @GetMapping("/navigation/{nodeKey}/counts")
    public ResponseEntity<NavigationCountsResponse> getNavigationCounts(
            @PathVariable int cityId, @PathVariable long revisionId,
            @PathVariable String nodeKey, CallerInfo caller) {
        log.debug("GET preview/navigation/{}/counts cityId={} revisionId={} adminId={}", nodeKey, cityId, revisionId, caller.userId());
        return noStore(previewService.getNavigationCounts(cityId, revisionId, nodeKey));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
