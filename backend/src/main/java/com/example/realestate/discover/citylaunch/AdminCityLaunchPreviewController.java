package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.AgriDestinationsResponse;
import com.example.realestate.discover.AgriMapListingsResponse;
import com.example.realestate.discover.AreaGroupsResponse;
import com.example.realestate.discover.AreaSummaryResponse;
import com.example.realestate.discover.CityAreaListingsResponse;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.RegionScopedAreaGroup;
import com.example.realestate.discover.RegionSummaryResponse;
import com.example.realestate.discover.RegionalAreaGroupsResponse;
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

    /**
     * GET .../preview/areas[?propertyType=...&amp;purpose=...] -> {@link AreaSummaryResponse}.
     *
     * <p>{@code propertyType} (#2171) is OPTIONAL and additive, mirroring production {@code GET
     * /api/discover/areas}'s contract: absent/not {@code agricultural_land} -&gt; byte-identical
     * generic per-area {@code listingCount}; {@code agricultural_land} -&gt; each area's {@code
     * listingCount}/{@code agriAcreage} become the revision's real Agri parcel counts.
     *
     * <p>{@code purpose} (#2174) is OPTIONAL, {@code "sale"}/{@code "rent"}, and only meaningful
     * alongside {@code propertyType=agricultural_land} — same param name and semantics as
     * production {@code GET /api/discover/areas}'s {@code purpose} and this preview namespace's own
     * {@code .../preview/regional-area-groups}'s {@code listingPurpose} (both thread into the same
     * {@link com.example.realestate.discover.AgriDestinationPort}-backed count, so the map bubble
     * and the Agri corridor panel agree by construction — see {@link
     * CityLaunchPreviewService#getAreas(int, long, String, String)}), never a second, independently
     * -maintained counting mechanism.
     */
    @IsAdmin
    @GetMapping("/areas")
    public ResponseEntity<AreaSummaryResponse> getAreas(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "propertyType", required = false) String propertyType,
            @RequestParam(name = "purpose", required = false) String purpose,
            CallerInfo caller) {
        log.debug("GET preview/areas cityId={} revisionId={} propertyType={} purpose={} adminId={}",
                cityId, revisionId, propertyType, purpose, caller.userId());
        return noStore(previewService.getAreas(cityId, revisionId, propertyType, purpose));
    }

    /**
     * GET .../preview/markers?areaKeys=...&amp;node=... -> {@link DiscoverMarkersResponse}.
     *
     * <p>{@code node} (#2202) is OPTIONAL, mirroring this same service's {@code
     * getNavigationCounts}/{@code /navigation/{nodeKey}/counts} node-resolution pattern: absent/
     * blank/{@code "root"} means no node-based filter (byte-identical to the pre-#2202 {@code
     * areaKeys}-only contract); any other value is resolved against this revision's own navigation
     * graph and, on a hit, REPLACES {@code areaKeys} with that node's descendant area keys — node
     * wins over areaKeys when both are supplied. An unknown node key -&gt; 404.
     */
    @IsAdmin
    @GetMapping("/markers")
    public ResponseEntity<DiscoverMarkersResponse> getMarkers(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "areaKeys", required = false) List<String> areaKeys,
            @RequestParam(name = "node", required = false) String node,
            CallerInfo caller) {
        log.debug("GET preview/markers cityId={} revisionId={} node={} adminId={}",
                cityId, revisionId, node, caller.userId());
        return noStore(previewService.getMarkers(cityId, revisionId, areaKeys, node));
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

    /**
     * GET .../preview/regional-area-groups?listingPurpose=... -&gt; {@link RegionalAreaGroupsResponse}
     * (#2151 PR B Track 2). Revision-scoped Agri corridor groups, read from this revision's own
     * {@code sandbox_agri_destination_classification} rows — never production. Fixes the Admin City
     * Launch preview's Agricultural land panel "Could not load corridors" bug: the panel's
     * {@code useRegionalAreaGroups} hook can now call a revision-aware endpoint instead of the
     * production {@code /api/discover/regional-area-groups}, which never sees sandbox geometry.
     *
     * <p>503 {@code AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION} when this revision has zero
     * sandbox Agri rows (city preparation needs to be re-run) — distinct from production's
     * {@code AGRI_DESTINATIONS_NOT_YET_PROMOTED}.
     */
    @IsAdmin
    @GetMapping("/regional-area-groups")
    public ResponseEntity<RegionalAreaGroupsResponse> getRegionalAreaGroupsPreview(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose,
            CallerInfo caller) {
        log.debug("GET preview/regional-area-groups cityId={} revisionId={} adminId={}",
                cityId, revisionId, caller.userId());
        return noStore(previewService.getRegionalAreaGroupsPreview(cityId, revisionId, listingPurpose));
    }

    /**
     * GET .../preview/agri-destinations?direction=...&amp;maxKm=...&amp;listingPurpose=... -&gt;
     * {@link AgriDestinationsResponse} (#2151 PR B Track 2). Same revision-scoped sandbox read as
     * {@link #getRegionalAreaGroupsPreview}, see that method's javadoc for the 503 contract.
     */
    @IsAdmin
    @GetMapping("/agri-destinations")
    public ResponseEntity<AgriDestinationsResponse> getAgriDestinationsPreview(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "direction", required = false) String direction,
            @RequestParam(name = "maxKm", required = false) Double maxKm,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose,
            CallerInfo caller) {
        log.debug("GET preview/agri-destinations cityId={} revisionId={} direction={} maxKm={} adminId={}",
                cityId, revisionId, direction, maxKm, caller.userId());
        return noStore(previewService.getAgriDestinationsPreview(cityId, revisionId, direction, maxKm, listingPurpose));
    }

    /**
     * GET .../preview/agri-map-listings?areaKey=...&amp;listingPurpose=... -&gt;
     * {@link AgriMapListingsResponse} (#2151 PR B Track 2). Parcels are read from the LIVE {@code
     * property_listings} table (a revision preview scopes GEOGRAPHY, not inventory); always the
     * exact-coords/real-price shape ({@code @IsAdmin} — never the anonymous-coarsened one).
     */
    @IsAdmin
    @GetMapping("/agri-map-listings")
    public ResponseEntity<AgriMapListingsResponse> getAgriMapListingsPreview(
            @PathVariable int cityId, @PathVariable long revisionId,
            @RequestParam(name = "areaKey") String areaKey,
            @RequestParam(name = "listingPurpose", required = false) String listingPurpose,
            CallerInfo caller) {
        log.debug("GET preview/agri-map-listings cityId={} revisionId={} areaKey={} adminId={}",
                cityId, revisionId, areaKey, caller.userId());
        return noStore(previewService.getAgriMapListingsPreview(cityId, revisionId, areaKey, listingPurpose));
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
