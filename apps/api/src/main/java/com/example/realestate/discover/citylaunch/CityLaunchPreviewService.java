package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.AgriDestinationBucketResponse;
import com.example.realestate.discover.AgriDestinationsResponse;
import com.example.realestate.discover.AgriDestinationsService;
import com.example.realestate.discover.AgriMapListingsResponse;
import com.example.realestate.discover.AreaGroupResponse;
import com.example.realestate.discover.AreaGroupsResponse;
import com.example.realestate.discover.AreaListingCard;
import com.example.realestate.discover.AreaListingsEntry;
import com.example.realestate.discover.AreaSummary;
import com.example.realestate.discover.AreaSummaryResponse;
import com.example.realestate.discover.CityAreaListingsResponse;
import com.example.realestate.discover.DiscoverAgriMapListingsService;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.RegionScopedAreaGroup;
import com.example.realestate.discover.RegionSummaryResponse;
import com.example.realestate.discover.RegionalAreaGroupsResponse;
import com.example.realestate.discover.RegionalAreaGroupsService;
import com.example.realestate.discover.navigation.NavigationCountsResponse;
import com.example.realestate.discover.navigation.NavigationGraph;
import com.example.realestate.discover.navigation.NavigationNode;
import com.example.realestate.discover.navigation.NavigationNodeResponse;
import com.example.realestate.discover.navigation.NavigationResolution;
import com.example.realestate.discover.navigation.NavigationResolveResponse;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * Assembles the admin city-launch preview response for a revision's {@code sandbox_*} staging
 * graph, reusing the exact production Discover DTOs (#1911 PR3).
 *
 * <p><b>Viewability guard</b> (checked once, before any assembly, on every method): the revision
 * must exist, must belong to the requested {@code cityId}, and must be {@code prep_state == DONE}
 * with {@code lifecycle_status} in {PREPARED, VALIDATED, PROMOTING, PROMOTED}. Anything else is
 * rejected with a sanitized 404/409 — never internal detail, SQL, or an enum dump.
 *
 * <p><b>Field mapping</b> (the PR2 lesson): {@code sandbox_city_region_membership} is keyed on
 * {@code sandbox_area_id} (a {@link Long}), never {@code area_key} directly — every membership is
 * resolved {@code sandboxAreaId -> SandboxArea -> areaKey} via a map built once per request. An
 * area only participates in this preview (areas/markers/listings/counts/region-membership) when
 * its {@code lifecycle_status == "ACTIVE"} AND it has a safe interior point (see
 * {@link SimulatedListingFactory#interiorPoint}) — non-ACTIVE and geometry-less areas are silently
 * excluded, never defaulted or fabricated.
 *
 * <p>Since a sandbox revision has zero real {@code property_listings} rows, exactly one
 * {@link SimulatedListingFactory simulated listing} is materialized per in-scope area so that
 * region/group/area counts reflect what the city will look like once promoted. Nothing produced
 * here is ever persisted.
 */
@Service
public class CityLaunchPreviewService {

    private static final Logger log = LoggerFactory.getLogger(CityLaunchPreviewService.class);

    private static final Set<LifecycleStatus> PREVIEWABLE_STATUSES = EnumSet.of(
            LifecycleStatus.PREPARED, LifecycleStatus.VALIDATED,
            LifecycleStatus.PROMOTING, LifecycleStatus.PROMOTED);

    private static final String ACTIVE_STATUS = "ACTIVE";

    // #2171: the only propertyType value /preview/areas currently filters by — mirrors
    // RegionalAreaGroupsService.getRegionalGroups' identical normalized-equality check.
    private static final String AGRICULTURAL_LAND_PROPERTY_TYPE = "agricultural_land";

    private static final String CITY_SLUG_SQL = "SELECT slug FROM public.cities WHERE id = ?";

    private static final String CITY_IDENTITY_SQL = "SELECT slug, name FROM public.cities WHERE id = ?";

    private final CityLaunchRevisionRepository revisionRepository;
    private final SandboxCityRegionRepository regionRepository;
    private final SandboxCityRegionMembershipRepository membershipRepository;
    private final SandboxAreaGroupRepository areaGroupRepository;
    private final SandboxAreaGroupMemberRepository areaGroupMemberRepository;
    private final SandboxAreaRepository areaRepository;
    private final SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    private final SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository;
    private final JdbcOperations jdbcOperations;
    private final RegionalAreaGroupsService regionalAreaGroupsService;
    private final AgriDestinationsService agriDestinationsService;
    private final DiscoverAgriMapListingsService discoverAgriMapListingsService;

    public CityLaunchPreviewService(
            CityLaunchRevisionRepository revisionRepository,
            SandboxCityRegionRepository regionRepository,
            SandboxCityRegionMembershipRepository membershipRepository,
            SandboxAreaGroupRepository areaGroupRepository,
            SandboxAreaGroupMemberRepository areaGroupMemberRepository,
            SandboxAreaRepository areaRepository,
            SandboxNavigationNodeRepository sandboxNavigationNodeRepository,
            SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository,
            JdbcOperations jdbcOperations,
            RegionalAreaGroupsService regionalAreaGroupsService,
            AgriDestinationsService agriDestinationsService,
            DiscoverAgriMapListingsService discoverAgriMapListingsService) {
        this.revisionRepository = revisionRepository;
        this.regionRepository = regionRepository;
        this.membershipRepository = membershipRepository;
        this.areaGroupRepository = areaGroupRepository;
        this.areaGroupMemberRepository = areaGroupMemberRepository;
        this.areaRepository = areaRepository;
        this.sandboxNavigationNodeRepository = sandboxNavigationNodeRepository;
        this.sandboxAgriDestinationClassificationRepository = sandboxAgriDestinationClassificationRepository;
        this.jdbcOperations = jdbcOperations;
        this.regionalAreaGroupsService = regionalAreaGroupsService;
        this.agriDestinationsService = agriDestinationsService;
        this.discoverAgriMapListingsService = discoverAgriMapListingsService;
    }

    // ── Public API (E1-E6) ──────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public RegionSummaryResponse getRegions(int cityId, long revisionId) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        List<RegionSummaryResponse.Region> regions = graph.regions().stream()
                .map(region -> buildRegionSummary(region, graph))
                .toList();
        return new RegionSummaryResponse(cityId, citySlug, regions);
    }

    @Transactional(readOnly = true)
    public RegionScopedAreaGroup.Response getRegionScopedGroups(int cityId, long revisionId, String regionKey) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        // Every group in a region-scoped response shares ONE regionDisplayOrder: the region's own
        // canonical city_regions.display_order (never a per-group area_groups.display_order) — see
        // RegionScopedAreaGroup javadoc. Resolved once per request; null if regionKey doesn't
        // resolve to a region in this revision (groups will then filter to empty via candidates).
        Integer regionDisplayOrder = graph.regions().stream()
                .filter(region -> regionKey.equals(region.getRegionKey()))
                .map(SandboxCityRegion::getDisplayOrder)
                .findFirst()
                .orElse(null);

        List<RegionScopedAreaGroup> groups = graph.areaGroups().stream()
                .map(group -> buildRegionScopedGroup(group, regionKey, regionDisplayOrder, graph))
                .filter(Objects::nonNull)
                .toList();
        return new RegionScopedAreaGroup.Response(citySlug, regionKey, groups);
    }

    @Transactional(readOnly = true)
    public AreaSummaryResponse getAreas(int cityId, long revisionId) {
        return getAreas(cityId, revisionId, null, null);
    }

    /**
     * #2171: {@code propertyType}-aware overload backing {@code GET .../preview/areas?propertyType=...}.
     * Delegates to the {@code purpose}-aware 4-arg overload with {@code purpose = null} (no intent
     * filter — byte-identical to this method's pre-purpose-parity behaviour).
     */
    @Transactional(readOnly = true)
    public AreaSummaryResponse getAreas(int cityId, long revisionId, String propertyType) {
        return getAreas(cityId, revisionId, propertyType, null);
    }

    /**
     * #2171/#2174: {@code propertyType}+{@code purpose}-aware overload backing {@code GET
     * .../preview/areas?propertyType=...&purpose=...}. When {@code propertyType} normalizes to
     * {@code agricultural_land}, each in-scope area's {@code listingCount}/{@code agriAcreage} are
     * the REAL revision-scoped Agri parcel counts, optionally scoped to {@code purpose} ({@code
     * "sale"}/{@code "rent"}/{@code null} = blended) — read via {@link
     * AgriDestinationsService#getDestinations(String, String, Double, String, Long)} (the SAME
     * {@link com.example.realestate.discover.AgriDestinationPort}-backed call, with the SAME
     * {@code purpose} value, already powering {@link #getRegionalAreaGroupsPreview}/{@link
     * #getAgriDestinationsPreview}), never a second, independently-maintained counting mechanism —
     * so the map bubble and the Agri corridor panel can never diverge for the same
     * revision/area/purpose (#2174: this is what makes the bubble↔panel parity hold even when the
     * Buy/Rent toggle is applied, not just when propertyType is applied).
     *
     * <p>{@code purpose} is ignored (as if {@code null}) when {@code propertyType} does not
     * normalize to {@code agricultural_land} — mirrors production {@code GET /api/discover/areas}
     * (see {@link com.example.realestate.discover.AreaSummaryService#getAreasByCity(String, String,
     * String)}), where {@code purpose} is likewise only meaningful alongside the Agri filter today.
     *
     * <p>A revision with zero {@code sandbox_agri_destination_classification} rows fails closed with
     * the SAME 503 {@code AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION} those endpoints already throw
     * (propagated from the port, not caught here) — this endpoint composes onto the same fail-closed
     * contract rather than silently returning zero counts.
     *
     * <p>{@code propertyType} absent or not {@code agricultural_land}: byte-identical to the
     * pre-#2171 behaviour (generic, unfiltered per-area {@code listingCount = 1}, {@code
     * agriAcreage = null}) — this is an additive capability, not a behaviour change for existing
     * callers.
     */
    @Transactional(readOnly = true)
    public AreaSummaryResponse getAreas(int cityId, long revisionId, String propertyType, String purpose) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        boolean isAgri = AGRICULTURAL_LAND_PROPERTY_TYPE.equals(normalizePropertyType(propertyType));
        Map<String, AgriDestinationBucketResponse> agriBucketsByAreaKey =
                isAgri ? loadAgriBucketsByAreaKey(citySlug, revisionId, purpose) : null;

        List<AreaSummary> areas = graph.inScopeAreas().stream()
                .map(scoped -> toAreaSummary(revisionId, scoped, agriBucketsByAreaKey))
                .toList();
        return new AreaSummaryResponse(citySlug, areas);
    }

    private static String normalizePropertyType(String propertyType) {
        return propertyType == null ? null : propertyType.trim().toLowerCase();
    }

    /** One port call for the whole revision, reused across every in-scope area (#2171/#2174). */
    private Map<String, AgriDestinationBucketResponse> loadAgriBucketsByAreaKey(
            String citySlug, long revisionId, String purpose) {
        AgriDestinationsResponse response =
                agriDestinationsService.getDestinations(citySlug, null, null, purpose, revisionId);
        Map<String, AgriDestinationBucketResponse> byAreaKey = new HashMap<>();
        for (AgriDestinationBucketResponse bucket : response.destinations()) {
            byAreaKey.put(bucket.areaKey(), bucket);
        }
        return byAreaKey;
    }

    @Transactional(readOnly = true)
    public DiscoverMarkersResponse getMarkers(int cityId, long revisionId, List<String> areaKeys) {
        return getMarkers(cityId, revisionId, areaKeys, null);
    }

    /**
     * #2202: {@code node}-aware overload backing {@code GET .../preview/markers?node=...}. Mirrors
     * {@link #getNavigationCounts}'s node resolution exactly: {@code node} absent/blank/{@code
     * "root"} means no node-based filter (byte-identical to the {@code areaKeys}-only path above);
     * otherwise the node is resolved against THIS revision's own {@link NavigationGraph} (built by
     * {@link #buildPreviewNavigationGraph}, never a production/other-revision graph — this is what
     * makes a node key unknown to this revision's sandbox 404 rather than silently resolving), a
     * miss throws the same 404 {@code getNavigationCounts} throws, and a hit's {@code
     * navGraph.descendantAreaKeysOf(node)} REPLACES {@code areaKeys} as the effective filter set —
     * node wins over areaKeys when both are supplied, matching live-mode {@code
     * DiscoverMarkersController}'s precedent. No descendant-count cap is applied (unbounded), since
     * this is a payload-scoping endpoint for a low-volume admin-only surface, not a bounded-browse
     * one.
     */
    @Transactional(readOnly = true)
    public DiscoverMarkersResponse getMarkers(int cityId, long revisionId, List<String> areaKeys, String node) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        Set<String> requested = areaKeys == null ? null : Set.copyOf(areaKeys);
        if (node != null && !node.isBlank() && !"root".equals(node)) {
            NavigationGraph navGraph = buildPreviewNavigationGraph(citySlug, revisionId);
            NavigationNode resolved = navGraph.nodeByKey(node);
            if (resolved == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown navigation node");
            }
            requested = Set.copyOf(navGraph.descendantAreaKeysOf(node));
        }

        Set<String> effectiveRequested = requested;
        List<DiscoverMarker> markers = graph.inScopeAreas().stream()
                .filter(scoped -> effectiveRequested == null || effectiveRequested.contains(scoped.area().getAreaKey()))
                .map(scoped -> SimulatedListingFactory.of(revisionId, scoped.area()))
                .filter(Objects::nonNull)
                .map(SimulatedListingFactory::toMarker)
                .toList();

        int count = markers.size();
        return new DiscoverMarkersResponse(citySlug, markers, false, count, count, count, false);
    }

    @Transactional(readOnly = true)
    public CityAreaListingsResponse getListings(int cityId, long revisionId, List<String> areaKeys) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        List<String> keys = areaKeys == null ? List.of() : areaKeys;
        List<AreaListingsEntry> entries = new ArrayList<>();
        for (String areaKey : keys) {
            ScopedArea scoped = graph.inScopeByAreaKey().get(areaKey);
            if (scoped == null) {
                entries.add(new AreaListingsEntry(areaKey, null, Boolean.TRUE, List.of()));
                continue;
            }
            SimulatedListingFactory.SimulatedListing listing =
                    SimulatedListingFactory.of(revisionId, scoped.area());
            List<AreaListingCard> cards = listing == null
                    ? List.of()
                    : List.of(SimulatedListingFactory.toListingCard(listing));
            entries.add(new AreaListingsEntry(areaKey, scoped.area().getName(), null, cards));
        }
        return new CityAreaListingsResponse(citySlug, 1, entries);
    }

    @Transactional(readOnly = true)
    public DiscoverListingResponse getListingDetail(int cityId, long revisionId, String areaKey) {
        loadPreviewableRevision(cityId, revisionId);
        PreviewGraph graph = loadGraph(revisionId);

        ScopedArea scoped = graph.inScopeByAreaKey().get(areaKey);
        SimulatedListingFactory.SimulatedListing listing =
                scoped == null ? null : SimulatedListingFactory.of(revisionId, scoped.area());
        if (listing == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY, "No previewable listing for the requested area");
        }
        return SimulatedListingFactory.toDetail(listing);
    }

    /**
     * E7: unscoped area groups (#1911 PR3 rework) — mirrors production
     * {@code GET /api/discover/area-groups}, which the frontend's UNSCOPED {@code useAreaGroups}
     * hook calls (distinct from {@link #getRegionScopedGroups}, whose per-region member subset
     * this method does NOT apply). Every ACTIVE {@code sandbox_area_groups} row for the revision
     * is included — even one with zero in-scope members, matching production's LEFT JOIN
     * behaviour where a group is never dropped just because it currently has no (or no
     * ACTIVE/geometry-valid) members. See {@link #buildUnscopedAreaGroup} for field mapping.
     */
    @Transactional(readOnly = true)
    public AreaGroupsResponse getAreaGroups(int cityId, long revisionId) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        Map<String, Integer> regionDisplayOrderByKey = new HashMap<>();
        for (SandboxCityRegion region : graph.regions()) {
            regionDisplayOrderByKey.put(region.getRegionKey(), region.getDisplayOrder());
        }

        List<AreaGroupResponse> groups = graph.areaGroups().stream()
                .sorted(Comparator
                        .comparingInt((SandboxAreaGroup g) -> g.getDisplayOrder() == null
                                ? Integer.MAX_VALUE : g.getDisplayOrder())
                        .thenComparing(SandboxAreaGroup::getSlug, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(group -> buildUnscopedAreaGroup(group, graph, regionDisplayOrderByKey))
                .toList();
        return new AreaGroupsResponse(citySlug, groups);
    }

    // ── E8: navigation endpoints ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public NavigationResolveResponse resolveNavigation(int cityId, long revisionId, String requestedNodeKey) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        NavigationGraph graph = buildPreviewNavigationGraph(citySlug, revisionId);

        if ("root".equals(requestedNodeKey)) {
            return new NavigationResolveResponse(requestedNodeKey, NavigationResolution.EXACT,
                    NavigationNodeResponse.forRoot(citySlug, graph), revisionId);
        }

        NavigationNode exact = graph.nodeByKey(requestedNodeKey);
        if (exact != null) {
            return new NavigationResolveResponse(requestedNodeKey, NavigationResolution.EXACT,
                    NavigationNodeResponse.forNode(graph, exact), revisionId);
        }

        // For preview, we fallback to CITY_ROOT rather than replicating the stale-key ladder.
        return new NavigationResolveResponse(requestedNodeKey, NavigationResolution.CITY_ROOT,
                NavigationNodeResponse.forRoot(citySlug, graph), revisionId);
    }

    @Transactional(readOnly = true)
    public NavigationCountsResponse getNavigationCounts(int cityId, long revisionId, String nodeKey) {
        loadPreviewableRevision(cityId, revisionId);
        PreviewGraph graph = loadGraph(revisionId);
        NavigationGraph navGraph = buildPreviewNavigationGraph(resolveCitySlug(cityId), revisionId);

        NavigationNode node = null;
        if (!"root".equals(nodeKey)) {
            node = navGraph.nodeByKey(nodeKey);
            if (node == null) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown navigation node");
            }
        }

        Map<String, Long> areaCounts = new HashMap<>();
        for (ScopedArea scoped : graph.inScopeAreas()) {
            areaCounts.put(scoped.area().getAreaKey(), 1L);
        }

        long total = node == null ? areaCounts.size() : sumAreaCountsForNode(navGraph, node, areaCounts);
        // #2170: schools have no per-revision simulation at all (unlike Agri's
        // sandbox_agri_destination_classification, #2167), so schoolTotal/areaSchoolCounts are
        // honestly zero/empty for every revision — but the response also carries
        // schoolsNotSimulatedForRevision=true so a caller can tell "not simulated" apart from a
        // genuine zero, rather than rendering both as the same flat wall of zeros.
        long schoolTotal = 0L;
        Map<String, Long> areaSchoolCounts = Map.of();

        List<NavigationCountsResponse.ChildCount> children = new ArrayList<>();
        List<String> childKeys = navGraph.childrenOf(node == null ? null : nodeKey);
        for (String childKey : childKeys) {
            NavigationNode child = navGraph.nodeByKey(childKey);
            long childTotal = sumAreaCountsForNode(navGraph, child, areaCounts);

            long matchingAreaCount = 0;
            for (String descendantAreaKey : navGraph.descendantAreaKeysOf(childKey)) {
                if (areaCounts.getOrDefault(descendantAreaKey, 0L) > 0) {
                    matchingAreaCount++;
                }
            }

            children.add(new NavigationCountsResponse.ChildCount(childKey, childTotal, 0L, matchingAreaCount));
        }

        return new NavigationCountsResponse(
                nodeKey, total, schoolTotal, areaCounts, areaSchoolCounts, children, revisionId, Boolean.TRUE);
    }

    private long sumAreaCountsForNode(NavigationGraph graph, NavigationNode node, Map<String, Long> areaCounts) {
        if ("AREA".equals(node.getNodeType())) {
            return areaCounts.getOrDefault(node.getAreaKey(), 0L);
        }
        long sum = 0;
        for (String areaKey : graph.descendantAreaKeysOf(node.getNodeKey())) {
            sum += areaCounts.getOrDefault(areaKey, 0L);
        }
        return sum;
    }

    private NavigationGraph buildPreviewNavigationGraph(String citySlug, long revisionId) {
        List<SandboxNavigationNode> sandboxNodes = sandboxNavigationNodeRepository.findByRevisionIdOrderByDepthAscDisplayOrderAsc(revisionId);
        List<NavigationNode> mappedNodes = sandboxNodes.stream()
                .map(s -> (NavigationNode) new MockNavigationNode(s))
                .toList();
        return NavigationGraph.build(citySlug, revisionId, mappedNodes);
    }

    private static class MockNavigationNode extends NavigationNode {
        private final Long mockId;

        public MockNavigationNode(SandboxNavigationNode s) {
            super(0, s.getRegionKey(), s.getNodeType(), s.getParentNodeId(),
                    s.getNodeKey(), s.getAreaKey(),
                    s.getRepresentativeAreaKeys() == null ? List.of() : s.getRepresentativeAreaKeys(),
                    s.getDisplayLabel(),
                    s.getDisplayOrder() == null ? 0 : s.getDisplayOrder(),
                    s.getDepth(),
                    s.getAncestorKeys() == null ? List.of() : s.getAncestorKeys(),
                    s.getDescendantAreaCount() == null ? 0 : s.getDescendantAreaCount(),
                    s.getCentreLat(), s.getCentreLon(),
                    s.getMinLat(), s.getMinLon(), s.getMaxLat(), s.getMaxLon(),
                    s.getBearingDegrees(), "preview", s.getGeneratedAt());
            this.mockId = s.getId();
        }

        @Override
        public Long getId() {
            return mockId;
        }
    }

    // ── E9: Agri destination classification preview (#2151 PR A) ───────────────────────────────

    /**
     * Row count, direction/distance-band distributions, missing-coordinate count, and the origin
     * used — everything an admin needs to judge Agri generation quality for this revision before
     * ticking the {@code agriDestinations} validation check. API-only; never read by any
     * shopper-facing surface.
     */
    @Transactional(readOnly = true)
    public AgriPreviewResponse getAgriPreview(int cityId, long revisionId) {
        loadPreviewableRevision(cityId, revisionId);

        List<SandboxAgriDestinationClassification> rows =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId);

        Map<String, Long> directionDistribution = new LinkedHashMap<>();
        Map<String, Long> distanceBandDistribution = new LinkedHashMap<>();
        Double originLat = null;
        Double originLon = null;
        for (SandboxAgriDestinationClassification row : rows) {
            directionDistribution.merge(row.getDirectionKey(), 1L, Long::sum);
            distanceBandDistribution.merge(row.getDistanceBandKey(), 1L, Long::sum);
            if (originLat == null) {
                originLat = row.getOriginLat();
                originLon = row.getOriginLon();
            }
        }

        // "Areas with missing coordinates" — this revision's ACTIVE sandbox_areas rows with a NULL
        // geo_center_lat/lon. Correctness fix (#2151 PR A): AgriDestinationClassificationGenerator
        // no longer re-queries production public.areas — it consumes the SAME captured sandbox_areas
        // rows this revision was written from (see that class's "Snapshot consistency" javadoc), so
        // this is now exactly the generator's actual input set, not merely a diagnostic proxy for a
        // separate production read.
        long missingCoordinates = areaRepository.findByRevisionId(revisionId).stream()
                .filter(a -> ACTIVE_STATUS.equals(a.getLifecycleStatus()))
                .filter(a -> a.getGeoCenterLat() == null || a.getGeoCenterLon() == null)
                .count();

        return new AgriPreviewResponse(
                rows.size(), directionDistribution, distanceBandDistribution,
                Math.toIntExact(missingCoordinates), originLat, originLon);
    }

    // ── E10: preview identity (#2151 Track 1) ───────────────────────────────────────────────

    /**
     * GET {@code .../preview/identity} — resolves the previewed revision's real owning-city
     * slug/name. The preview route only carries numeric {@code cityId}/{@code revisionId}, so
     * without this the frontend has no city identity to thread into the Discover subtree and
     * falls back to a default city. Guarded by the same {@link #loadPreviewableRevision}
     * viewability check as every other preview method — a non-previewable revision must yield no
     * identity, not partial/default data.
     */
    @Transactional(readOnly = true)
    public PreviewIdentityResponse getPreviewIdentity(int cityId, long revisionId) {
        CityLaunchRevision revision = loadPreviewableRevision(cityId, revisionId);

        List<PreviewIdentityResponse> rows = jdbcOperations.query(CITY_IDENTITY_SQL,
                (rs, i) -> new PreviewIdentityResponse(
                        cityId, rs.getString("slug"), rs.getString("name"), revision.getClonedFromRevisionId()),
                cityId);
        if (rows.isEmpty()) {
            throw notFound();
        }
        return rows.get(0);
    }

    // ── E11: revision-scoped Agri corridors/destinations/map-listings (#2151 PR B Track 2) ────

    /**
     * GET {@code .../preview/regional-area-groups} -&gt; {@link RegionalAreaGroupsResponse}. Reads
     * the revision's own {@code sandbox_agri_destination_classification} rows (never production
     * {@code agri_destination_classification}) via {@link RegionalAreaGroupsService}'s revision
     * overload — the fix for the Agri panel's "Could not load corridors" preview bug.
     */
    @Transactional(readOnly = true)
    public RegionalAreaGroupsResponse getRegionalAreaGroupsPreview(
            int cityId, long revisionId, String listingPurpose) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        return regionalAreaGroupsService.getRegionalGroupsForRevision(citySlug, listingPurpose, revisionId);
    }

    /**
     * GET {@code .../preview/agri-destinations} -&gt; {@link AgriDestinationsResponse}. Same
     * revision-scoped sandbox read as {@link #getRegionalAreaGroupsPreview}, via
     * {@link AgriDestinationsService}'s revision overload.
     */
    @Transactional(readOnly = true)
    public AgriDestinationsResponse getAgriDestinationsPreview(
            int cityId, long revisionId, String direction, Double maxKm, String listingPurpose) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        return agriDestinationsService.getDestinations(citySlug, direction, maxKm, listingPurpose, revisionId);
    }

    /**
     * GET {@code .../preview/agri-map-listings} -&gt; {@link AgriMapListingsResponse}. Parcels are
     * still read from the LIVE {@code property_listings} table (a revision preview scopes GEOGRAPHY,
     * not inventory — see the port's javadoc). {@code isAuthenticated = true} is passed explicitly
     * — this endpoint is {@code @IsAdmin}-gated already, so the anonymous-coarsening branch must
     * never apply here.
     */
    @Transactional(readOnly = true)
    public AgriMapListingsResponse getAgriMapListingsPreview(
            int cityId, long revisionId, String areaKey, String listingPurpose) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        return discoverAgriMapListingsService.findAgriMapListings(
                citySlug, areaKey, Optional.empty(), true, listingPurpose, revisionId);
    }

    // ── Viewability guard ────────────────────────────────────────────────────────────────────

    private CityLaunchRevision loadPreviewableRevision(int cityId, long revisionId) {
        CityLaunchRevision revision = revisionRepository.findById(revisionId)
                .orElseThrow(CityLaunchPreviewService::notFound);
        if (!Objects.equals(revision.getCityId(), Integer.valueOf(cityId))) {
            throw notFound();
        }
        boolean previewable = revision.getPrepState() == PrepState.DONE
                && PREVIEWABLE_STATUSES.contains(revision.getLifecycleStatus());
        if (!previewable) {
            log.info("City launch preview rejected: revisionId={} cityId={} prepState={} lifecycleStatus={}",
                    revisionId, cityId, revision.getPrepState(), revision.getLifecycleStatus());
            throw notPreviewable();
        }
        return revision;
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "City launch revision not found");
    }

    private static ResponseStatusException notPreviewable() {
        return new ResponseStatusException(HttpStatus.CONFLICT, "City launch revision is not previewable");
    }

    // ── Sandbox graph loading ────────────────────────────────────────────────────────────────

    private record ScopedArea(SandboxArea area, SimulatedListingFactory.InteriorPoint point) {}

    private record PreviewGraph(
            List<ScopedArea> inScopeAreas,
            Map<String, ScopedArea> inScopeByAreaKey,
            List<SandboxCityRegion> regions,
            Map<String, List<ScopedArea>> inScopeByRegionKey,
            List<SandboxAreaGroup> areaGroups,
            List<SandboxAreaGroupMember> groupMembers,
            Map<Long, SandboxArea> areasById,
            Map<Long, String> regionKeyBySandboxAreaId) {}

    private PreviewGraph loadGraph(long revisionId) {
        List<SandboxArea> allAreas = areaRepository.findByRevisionId(revisionId);
        Map<Long, SandboxArea> areasById = new HashMap<>();
        for (SandboxArea area : allAreas) {
            areasById.put(area.getId(), area);
        }

        List<ScopedArea> inScope = new ArrayList<>();
        Map<String, ScopedArea> inScopeByKey = new HashMap<>();
        for (SandboxArea area : allAreas) {
            if (!ACTIVE_STATUS.equals(area.getLifecycleStatus())) {
                continue; // e.g. MERGED — excluded from the entire preview
            }
            SimulatedListingFactory.InteriorPoint point = SimulatedListingFactory.interiorPoint(area);
            if (point == null) {
                continue; // no safe interior point — excluded, never a fabricated (0,0)
            }
            ScopedArea scoped = new ScopedArea(area, point);
            inScope.add(scoped);
            inScopeByKey.put(area.getAreaKey(), scoped);
        }

        // Membership rows are keyed on sandbox_area_id (Long) — resolve to areaKey via areasById,
        // never via a nonexistent membership.areaKey.
        List<SandboxCityRegionMembership> memberships = membershipRepository.findByRevisionId(revisionId);
        Map<Long, String> regionKeyBySandboxAreaId = new HashMap<>();
        Map<String, List<ScopedArea>> inScopeByRegionKey = new HashMap<>();
        for (SandboxCityRegionMembership membership : memberships) {
            regionKeyBySandboxAreaId.put(membership.getSandboxAreaId(), membership.getRegionKey());
            SandboxArea area = areasById.get(membership.getSandboxAreaId());
            if (area == null) {
                continue; // orphaned membership row — never expose
            }
            ScopedArea scoped = inScopeByKey.get(area.getAreaKey());
            if (scoped == null) {
                continue; // non-ACTIVE or no interior point — excluded from region membership
            }
            inScopeByRegionKey.computeIfAbsent(membership.getRegionKey(), k -> new ArrayList<>()).add(scoped);
        }

        List<SandboxCityRegion> regions = regionRepository.findByRevisionId(revisionId).stream()
                .sorted(Comparator.comparingInt(
                        r -> r.getDisplayOrder() == null ? Integer.MAX_VALUE : r.getDisplayOrder()))
                .toList();

        List<SandboxAreaGroup> areaGroups = areaGroupRepository.findByRevisionId(revisionId).stream()
                .filter(SandboxAreaGroup::isActive)
                .toList();
        List<SandboxAreaGroupMember> groupMembers = areaGroupMemberRepository.findByRevisionId(revisionId);

        return new PreviewGraph(inScope, inScopeByKey, regions, inScopeByRegionKey,
                areaGroups, groupMembers, areasById, regionKeyBySandboxAreaId);
    }

    // ── E1: regions ──────────────────────────────────────────────────────────────────────────

    private RegionSummaryResponse.Region buildRegionSummary(SandboxCityRegion region, PreviewGraph graph) {
        List<ScopedArea> members = graph.inScopeByRegionKey().getOrDefault(region.getRegionKey(), List.of());
        BoundsUnion union = unionBounds(members);
        RegionSummaryResponse.Centre centre = new RegionSummaryResponse.Centre(
                toDouble(region.getCentreLat()), toDouble(region.getCentreLon()));
        return new RegionSummaryResponse.Region(
                region.getRegionKey(),
                region.getDisplayLabel(),
                region.getDisplayOrder() == null ? 0 : region.getDisplayOrder(),
                union.bounds(),
                centre,
                members.size(),
                members.size(),
                "OK",
                union.status(),
                union.missingCount());
    }

    private record BoundsUnion(RegionSummaryResponse.Bounds bounds, String status, long missingCount) {}

    private BoundsUnion unionBounds(List<ScopedArea> members) {
        double minLat = Double.POSITIVE_INFINITY;
        double minLon = Double.POSITIVE_INFINITY;
        double maxLat = Double.NEGATIVE_INFINITY;
        double maxLon = Double.NEGATIVE_INFINITY;
        long complete = 0;
        long missing = 0;
        for (ScopedArea scoped : members) {
            SandboxArea area = scoped.area();
            if (SimulatedListingFactory.hasCompleteBbox(area)) {
                complete++;
                minLat = Math.min(minLat, area.getMinLat());
                minLon = Math.min(minLon, area.getMinLon());
                maxLat = Math.max(maxLat, area.getMaxLat());
                maxLon = Math.max(maxLon, area.getMaxLon());
            } else {
                missing++;
            }
        }
        if (complete == 0) {
            String status = members.isEmpty() ? "COMPLETE" : "APPROXIMATE";
            return new BoundsUnion(new RegionSummaryResponse.Bounds(null, null, null, null), status, missing);
        }
        String status = missing == 0 ? "COMPLETE" : "APPROXIMATE";
        return new BoundsUnion(new RegionSummaryResponse.Bounds(minLat, maxLat, minLon, maxLon), status, missing);
    }

    // ── E2: region-scoped groups ─────────────────────────────────────────────────────────────

    private record GroupCandidate(ScopedArea scoped, int displayOrder) {}

    private record GroupBounds(Double minLat, Double minLon, Double maxLat, Double maxLon,
                                Double focusLat, Double focusLon, String status) {}

    private RegionScopedAreaGroup buildRegionScopedGroup(
            SandboxAreaGroup group, String regionKey, Integer regionDisplayOrder, PreviewGraph graph) {
        List<GroupCandidate> candidates = new ArrayList<>();
        for (SandboxAreaGroupMember member : graph.groupMembers()) {
            if (!member.getSandboxAreaGroupId().equals(group.getId())) {
                continue;
            }
            if (!regionKey.equals(graph.regionKeyBySandboxAreaId().get(member.getSandboxAreaId()))) {
                continue;
            }
            SandboxArea area = graph.areasById().get(member.getSandboxAreaId());
            if (area == null) {
                continue;
            }
            ScopedArea scoped = graph.inScopeByAreaKey().get(area.getAreaKey());
            if (scoped == null) {
                continue; // non-ACTIVE / no interior point — excluded
            }
            candidates.add(new GroupCandidate(
                    scoped, member.getDisplayOrder() == null ? Integer.MAX_VALUE : member.getDisplayOrder()));
        }
        if (candidates.isEmpty()) {
            return null; // only include groups with >=1 member in the region
        }
        candidates.sort(Comparator.<GroupCandidate>comparingInt(GroupCandidate::displayOrder)
                .thenComparing(c -> c.scoped().area().getAreaKey()));

        List<String> areaKeys = candidates.stream().map(c -> c.scoped().area().getAreaKey()).toList();
        List<ScopedArea> scopedMembers = candidates.stream().map(GroupCandidate::scoped).toList();
        GroupBounds bounds = unionBoundsForGroup(scopedMembers);

        return new RegionScopedAreaGroup(
                group.getSlug(),
                group.getName(),
                group.getSubtitle(),
                regionKey,
                regionDisplayOrder == null ? 0 : regionDisplayOrder,
                areaKeys,
                scopedMembers.size(),
                bounds.focusLat(),
                bounds.focusLon(),
                bounds.minLat(),
                bounds.minLon(),
                bounds.maxLat(),
                bounds.maxLon(),
                bounds.status());
    }

    private GroupBounds unionBoundsForGroup(List<ScopedArea> members) {
        double minLat = Double.POSITIVE_INFINITY;
        double minLon = Double.POSITIVE_INFINITY;
        double maxLat = Double.NEGATIVE_INFINITY;
        double maxLon = Double.NEGATIVE_INFINITY;
        long complete = 0;
        for (ScopedArea scoped : members) {
            SandboxArea area = scoped.area();
            if (SimulatedListingFactory.hasCompleteBbox(area)) {
                complete++;
                minLat = Math.min(minLat, area.getMinLat());
                minLon = Math.min(minLon, area.getMinLon());
                maxLat = Math.max(maxLat, area.getMaxLat());
                maxLon = Math.max(maxLon, area.getMaxLon());
            }
        }
        if (complete == 0) {
            return new GroupBounds(null, null, null, null, null, null, RegionScopedAreaGroup.BOUNDS_UNAVAILABLE);
        }
        String status = complete == members.size()
                ? RegionScopedAreaGroup.BOUNDS_COMPLETE
                : RegionScopedAreaGroup.BOUNDS_APPROXIMATE;
        return new GroupBounds(minLat, minLon, maxLat, maxLon,
                (minLat + maxLat) / 2.0, (minLon + maxLon) / 2.0, status);
    }

    // ── E7: unscoped area groups ─────────────────────────────────────────────────────────────

    // One member's materialized region membership, with the region's canonical display_order —
    // mirrors AreaGroupsService.RegionMembership (deliberately NOT reused across classes: that
    // record/its enclosing deriveRegionKey are private to AreaGroupsService, and this preview
    // rework must never modify a production Discover file — see class javadoc AC11).
    private record RegionMembership(String regionKey, Integer displayOrder) {}

    /**
     * Field mapping for one {@link AreaGroupResponse} sourced from a {@link SandboxAreaGroup} and
     * its ACTIVE/geometry-valid members (the PR2/PR3 field-mapping discipline):
     * <ul>
     *   <li>{@code slug}/{@code name}/{@code subtitle}/{@code regionLabel}/{@code displayOrder} —
     *       straight passthrough from the {@code sandbox_area_groups} row (column-for-column
     *       mirror of {@code area_groups}).</li>
     *   <li>{@code areaKeys} — every member resolved {@code sandboxAreaId -> SandboxArea ->
     *       areaKey} (never a nonexistent {@code member.areaKey}), filtered to ACTIVE members with
     *       a safe interior point (excludes MERGED etc, same as every other E1-E6 endpoint),
     *       ordered by {@code member.display_order} then {@code areaKey} (deterministic tie-break,
     *       mirroring {@link #buildRegionScopedGroup}).</li>
     *   <li>{@code regionKey} — derived from {@code sandbox_city_region_memberships} using the
     *       SAME UNIFIED/SPLIT/DEGENERATE plurality algorithm as
     *       {@code AreaGroupsService.deriveRegionKey} (duplicated here, not reused, per AC11 —
     *       see {@link #deriveRegionKey}), computed over this group's in-scope members only.</li>
     *   <li>{@code focusLat}/{@code focusLon}/{@code minLat}/{@code minLon}/{@code maxLat}/
     *       {@code maxLon} — union of in-scope members' ACTIVE-area bboxes (reusing
     *       {@link #unionBoundsForGroup}, the same helper E2 uses), NOT the group's own stored
     *       {@code sandbox_area_groups.focus_lat}/{@code min_lat}/etc columns: those columns are
     *       typically unpopulated for a staged group, and every other preview endpoint already
     *       computes bounds as a live union over member geometry rather than trusting a stored
     *       group-level bbox (see {@link #buildRegionSummary}/{@link #buildRegionScopedGroup}) —
     *       null (omitted, {@code @JsonInclude(NON_NULL)}) when zero members have a complete
     *       bbox.</li>
     *   <li>{@code description} — {@link SandboxAreaGroup} carries no description column (it
     *       mirrors {@code area_groups} minus that field), so this is honestly {@code null}
     *       (omitted from JSON) rather than fabricated.</li>
     * </ul>
     */
    private AreaGroupResponse buildUnscopedAreaGroup(
            SandboxAreaGroup group, PreviewGraph graph, Map<String, Integer> regionDisplayOrderByKey) {
        List<GroupCandidate> candidates = new ArrayList<>();
        List<RegionMembership> memberRegions = new ArrayList<>();
        for (SandboxAreaGroupMember member : graph.groupMembers()) {
            if (!member.getSandboxAreaGroupId().equals(group.getId())) {
                continue;
            }
            SandboxArea area = graph.areasById().get(member.getSandboxAreaId());
            if (area == null) {
                continue; // orphaned membership row — never expose
            }
            ScopedArea scoped = graph.inScopeByAreaKey().get(area.getAreaKey());
            if (scoped == null) {
                continue; // non-ACTIVE / no interior point — excluded
            }
            candidates.add(new GroupCandidate(
                    scoped, member.getDisplayOrder() == null ? Integer.MAX_VALUE : member.getDisplayOrder()));
            String regionKey = graph.regionKeyBySandboxAreaId().get(member.getSandboxAreaId());
            if (regionKey != null) {
                memberRegions.add(new RegionMembership(regionKey, regionDisplayOrderByKey.get(regionKey)));
            }
        }
        candidates.sort(Comparator.<GroupCandidate>comparingInt(GroupCandidate::displayOrder)
                .thenComparing(c -> c.scoped().area().getAreaKey()));

        List<String> areaKeys = candidates.stream().map(c -> c.scoped().area().getAreaKey()).toList();
        List<ScopedArea> scopedMembers = candidates.stream().map(GroupCandidate::scoped).toList();
        GroupBounds bounds = unionBoundsForGroup(scopedMembers);
        String regionKey = deriveRegionKey(memberRegions);

        return new AreaGroupResponse(
                group.getSlug(),
                group.getName(),
                group.getSubtitle(),
                group.getRegionLabel(),
                group.getDisplayOrder() == null ? 0 : group.getDisplayOrder(),
                areaKeys,
                regionKey,
                bounds.focusLat(),
                bounds.focusLon(),
                bounds.minLat(),
                bounds.minLon(),
                bounds.maxLat(),
                bounds.maxLon(),
                null); // description — no sandbox_area_groups source column; honest null
    }

    // Duplicates AreaGroupsService.deriveRegionKey's UNIFIED/SPLIT/DEGENERATE plurality algorithm
    // exactly (never reused across classes — that method is private to a production Discover
    // class this rework must not touch, per AC11):
    //   DEGENERATE (no in-scope member has a sandbox_city_region_memberships row) -> null
    //   UNIFIED    (exactly one distinct member region_key)                       -> that key
    //   SPLIT      (>= 2 distinct member region_keys)                             -> PLURALITY
    //     (highest member count), ties broken deterministically by the region's own
    //     display_order ASC, then region_key ASC.
    private static String deriveRegionKey(List<RegionMembership> memberRegions) {
        if (memberRegions.isEmpty()) {
            return null;
        }
        Map<String, Integer> countByRegion = new LinkedHashMap<>();
        Map<String, Integer> displayOrderByRegion = new LinkedHashMap<>();
        for (RegionMembership m : memberRegions) {
            countByRegion.merge(m.regionKey(), 1, Integer::sum);
            displayOrderByRegion.putIfAbsent(m.regionKey(), m.displayOrder());
        }
        return countByRegion.keySet().stream()
                .sorted(Comparator
                        .comparingInt((String r) -> -countByRegion.get(r))
                        .thenComparingInt(r -> displayOrderByRegion.getOrDefault(r, Integer.MAX_VALUE))
                        .thenComparing(Comparator.naturalOrder()))
                .findFirst()
                .orElse(null);
    }

    // ── E3: areas ────────────────────────────────────────────────────────────────────────────

    /**
     * @param agriBucketsByAreaKey {@code null} for the blended (pre-#2171) path — {@code
     *                              listingCount = 1}/{@code agriAcreage = null} as before. Non-null
     *                              (agri-scoped, keyed by areaKey) — {@code listingCount} is the
     *                              area's real parcel count (0 when the area has no bucket, never
     *                              fabricated as 1) and {@code agriAcreage} is that bucket's parsed
     *                              acreage sum.
     */
    private AreaSummary toAreaSummary(
            long revisionId, ScopedArea scoped, Map<String, AgriDestinationBucketResponse> agriBucketsByAreaKey) {
        SandboxArea area = scoped.area();
        SimulatedListingFactory.SimulatedListing listing = SimulatedListingFactory.of(revisionId, area);
        Long medianPricePaise = listing == null ? null : listing.pricePaise();

        long listingCount = 1L;
        Double agriAcreage = null;
        if (agriBucketsByAreaKey != null) {
            AgriDestinationBucketResponse bucket = agriBucketsByAreaKey.get(area.getAreaKey());
            listingCount = bucket != null && bucket.parcelCount() != null ? bucket.parcelCount() : 0L;
            agriAcreage = bucket == null ? null : bucket.parcelAcreage();
        }

        return new AreaSummary(
                area.getAreaKey(),
                area.getName(),
                scoped.point().lat(),
                scoped.point().lon(),
                area.getMinLat(),
                area.getMinLon(),
                area.getMaxLat(),
                area.getMaxLon(),
                listingCount,
                medianPricePaise,
                null, // trendDirection — honest null, never fabricated
                null, // confidenceTier — honest null, never fabricated
                0L,
                agriAcreage);
    }

    // ── Shared helpers ───────────────────────────────────────────────────────────────────────

    private String resolveCitySlug(int cityId) {
        List<String> slugs = jdbcOperations.query(CITY_SLUG_SQL, (rs, i) -> rs.getString("slug"), cityId);
        return slugs.isEmpty() ? null : slugs.get(0);
    }

    private static Double toDouble(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }
}
