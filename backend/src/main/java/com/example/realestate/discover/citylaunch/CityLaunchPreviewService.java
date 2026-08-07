package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.AreaGroupResponse;
import com.example.realestate.discover.AreaGroupsResponse;
import com.example.realestate.discover.AreaListingCard;
import com.example.realestate.discover.AreaListingsEntry;
import com.example.realestate.discover.AreaSummary;
import com.example.realestate.discover.AreaSummaryResponse;
import com.example.realestate.discover.CityAreaListingsResponse;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.RegionScopedAreaGroup;
import com.example.realestate.discover.RegionSummaryResponse;
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

    private static final String CITY_SLUG_SQL = "SELECT slug FROM public.cities WHERE id = ?";

    private final CityLaunchRevisionRepository revisionRepository;
    private final SandboxCityRegionRepository regionRepository;
    private final SandboxCityRegionMembershipRepository membershipRepository;
    private final SandboxAreaGroupRepository areaGroupRepository;
    private final SandboxAreaGroupMemberRepository areaGroupMemberRepository;
    private final SandboxAreaRepository areaRepository;
    private final SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    private final JdbcOperations jdbcOperations;

    public CityLaunchPreviewService(
            CityLaunchRevisionRepository revisionRepository,
            SandboxCityRegionRepository regionRepository,
            SandboxCityRegionMembershipRepository membershipRepository,
            SandboxAreaGroupRepository areaGroupRepository,
            SandboxAreaGroupMemberRepository areaGroupMemberRepository,
            SandboxAreaRepository areaRepository,
            SandboxNavigationNodeRepository sandboxNavigationNodeRepository,
            JdbcOperations jdbcOperations) {
        this.revisionRepository = revisionRepository;
        this.regionRepository = regionRepository;
        this.membershipRepository = membershipRepository;
        this.areaGroupRepository = areaGroupRepository;
        this.areaGroupMemberRepository = areaGroupMemberRepository;
        this.areaRepository = areaRepository;
        this.sandboxNavigationNodeRepository = sandboxNavigationNodeRepository;
        this.jdbcOperations = jdbcOperations;
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
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        List<AreaSummary> areas = graph.inScopeAreas().stream()
                .map(scoped -> toAreaSummary(revisionId, scoped))
                .toList();
        return new AreaSummaryResponse(citySlug, areas);
    }

    @Transactional(readOnly = true)
    public DiscoverMarkersResponse getMarkers(int cityId, long revisionId, List<String> areaKeys) {
        loadPreviewableRevision(cityId, revisionId);
        String citySlug = resolveCitySlug(cityId);
        PreviewGraph graph = loadGraph(revisionId);

        Set<String> requested = areaKeys == null ? null : Set.copyOf(areaKeys);
        List<DiscoverMarker> markers = graph.inScopeAreas().stream()
                .filter(scoped -> requested == null || requested.contains(scoped.area().getAreaKey()))
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
        long schoolTotal = 0L; // Schools are not simulated in preview yet
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
                nodeKey, total, schoolTotal, areaCounts, areaSchoolCounts, children, revisionId);
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

    private AreaSummary toAreaSummary(long revisionId, ScopedArea scoped) {
        SandboxArea area = scoped.area();
        SimulatedListingFactory.SimulatedListing listing = SimulatedListingFactory.of(revisionId, area);
        Long medianPricePaise = listing == null ? null : listing.pricePaise();
        return new AreaSummary(
                area.getAreaKey(),
                area.getName(),
                scoped.point().lat(),
                scoped.point().lon(),
                area.getMinLat(),
                area.getMinLon(),
                area.getMaxLat(),
                area.getMaxLon(),
                1L,
                medianPricePaise,
                null, // trendDirection — honest null, never fabricated
                null, // confidenceTier — honest null, never fabricated
                0L,
                null); // agriAcreage — honest null, never fabricated
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
