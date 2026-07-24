package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationBoundsResponse;
import com.example.realestate.discover.navigation.NavigationNode;
import com.example.realestate.discover.navigation.NavigationNodeRepository;
import com.example.realestate.discover.navigation.NavigationTreeGenerationService;
import com.example.realestate.discover.navigation.NavigationTreeValidationService;
import com.example.realestate.discover.navigation.OverrideKind;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverride;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;
import com.example.realestate.discover.navigation.ValidationNode;
import com.example.realestate.discover.navigation.ValidationReport;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Admin controlled-overrides orchestration for the navigation hierarchy (#1955 Areas PR A, SLICE
 * 2f+2g). Wraps {@link NavigationTreeGenerationService#generateAndStoreForRevision} (already
 * override-aware — see its javadoc) with the admin-facing request/response shapes, the PREPARED-
 * only lifecycle guard, and the persisted-checksum re-stamp.
 *
 * <p>Every mutating method ({@link #createOverride}, {@link #deleteOverride}) is ONE {@code
 * @Transactional}: the override row insert/delete, the tree regeneration (itself a delete+insert
 * of {@code sandbox_navigation_nodes}), and the {@code persisted_revision_checksum} re-stamp all
 * commit or roll back together. A {@link
 * com.example.realestate.discover.navigation.NavigationTreeValidationException} thrown by
 * regeneration rolls back EVERYTHING — including the override row itself — so an override that
 * would break the tree is never persisted at all.
 */
@Service
public class CityLaunchNavigationOverrideService {

    private static final Logger log = LoggerFactory.getLogger(CityLaunchNavigationOverrideService.class);
    private static final Set<OverrideKind> AREA_KEYED_KINDS =
            Set.of(OverrideKind.EXCLUDE_AREA, OverrideKind.REASSIGN_AREA_REGION, OverrideKind.MOVE_AREA);

    private final CityLaunchRevisionRepository revisionRepository;
    private final SandboxNavigationOverrideRepository overrideRepository;
    private final SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    private final NavigationNodeRepository navigationNodeRepository;
    private final NavigationTreeGenerationService generationService;
    private final NavigationTreeValidationService validationService;
    private final SandboxAreaRepository sandboxAreaRepository;
    private final SandboxAreaAliasRepository sandboxAreaAliasRepository;
    private final SandboxCityRegionRepository sandboxCityRegionRepository;
    private final SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    private final SandboxAreaGroupRepository sandboxAreaGroupRepository;
    private final SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;

    public CityLaunchNavigationOverrideService(
            CityLaunchRevisionRepository revisionRepository,
            SandboxNavigationOverrideRepository overrideRepository,
            SandboxNavigationNodeRepository sandboxNavigationNodeRepository,
            NavigationNodeRepository navigationNodeRepository,
            NavigationTreeGenerationService generationService,
            NavigationTreeValidationService validationService,
            SandboxAreaRepository sandboxAreaRepository,
            SandboxAreaAliasRepository sandboxAreaAliasRepository,
            SandboxCityRegionRepository sandboxCityRegionRepository,
            SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository,
            SandboxAreaGroupRepository sandboxAreaGroupRepository,
            SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository) {
        this.revisionRepository = revisionRepository;
        this.overrideRepository = overrideRepository;
        this.sandboxNavigationNodeRepository = sandboxNavigationNodeRepository;
        this.navigationNodeRepository = navigationNodeRepository;
        this.generationService = generationService;
        this.validationService = validationService;
        this.sandboxAreaRepository = sandboxAreaRepository;
        this.sandboxAreaAliasRepository = sandboxAreaAliasRepository;
        this.sandboxCityRegionRepository = sandboxCityRegionRepository;
        this.sandboxCityRegionMembershipRepository = sandboxCityRegionMembershipRepository;
        this.sandboxAreaGroupRepository = sandboxAreaGroupRepository;
        this.sandboxAreaGroupMemberRepository = sandboxAreaGroupMemberRepository;
    }

    // ── Reads ────────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AdminNavigationOverrideResponse> listOverrides(int cityId, long revisionId) {
        requireRevision(cityId, revisionId);
        return overrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId).stream()
                .map(AdminNavigationOverrideResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public NavigationPreviewTreeResponse getPreviewTree(int cityId, long revisionId) {
        requireRevision(cityId, revisionId);
        List<SandboxNavigationNode> nodes = sandboxNavigationNodeRepository.findByRevisionId(revisionId);

        Map<Long, String> idToKey = new HashMap<>();
        nodes.forEach(n -> idToKey.put(n.getId(), n.getNodeKey()));
        List<ValidationNode> validationNodes = nodes.stream()
                .map(n -> ValidationNode.fromSandboxNavigationNode(
                        revisionId, n, n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId())))
                .toList();
        ValidationReport report = validationService.validate(validationNodes);

        List<NavigationPreviewTreeResponse.PreviewNode> previewNodes = nodes.stream()
                .map(n -> new NavigationPreviewTreeResponse.PreviewNode(
                        n.getNodeKey(), n.getNodeType(),
                        n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId()),
                        n.getRegionKey(), n.getAreaKey(), n.getDisplayLabel(), n.getDepth(), n.getAncestorKeys(),
                        n.getRepresentativeAreaKeys(), n.getDisplayOrder(), n.getDescendantAreaCount(),
                        toBounds(n)))
                .toList();

        return new NavigationPreviewTreeResponse(
                revisionId, report.isValid() ? "VALID" : "INVALID",
                report.errors().stream().map(e -> e.code() + ": " + e.message()).toList(),
                previewNodes);
    }

    /**
     * Straight passthrough from the {@code sandbox_navigation_nodes} row's own centre/min/max
     * columns (V121, {@code NOT NULL}) — reuses {@link NavigationBoundsResponse}'s exact field
     * shape for wire consistency with the other admin/navigation endpoints (AC14 item 2).
     */
    private static NavigationBoundsResponse toBounds(SandboxNavigationNode n) {
        return new NavigationBoundsResponse(
                toDouble(n.getCentreLat()), toDouble(n.getCentreLon()),
                toDouble(n.getMinLat()), toDouble(n.getMinLon()),
                toDouble(n.getMaxLat()), toDouble(n.getMaxLon()));
    }

    private static Double toDouble(java.math.BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }

    @Transactional(readOnly = true)
    public NavigationTreeDiffResponse getDiff(int cityId, long revisionId, String against) {
        requireRevision(cityId, revisionId);
        return buildDiff(cityId, revisionId, normalizeAgainst(against));
    }

    // ── Mutations ────────────────────────────────────────────────────────────────────────────

    @Transactional
    public NavigationTreeDiffResponse createOverride(
            int cityId, long revisionId, AdminNavigationOverrideRequest request, UUID adminId) {
        CityLaunchRevision revision = requirePreparedRevisionForUpdate(cityId, revisionId);

        OverrideKind kind = parseKind(request.kind());
        validateShape(kind, request);

        boolean duplicate = AREA_KEYED_KINDS.contains(kind)
                ? overrideRepository.existsByRevisionIdAndSubjectAreaKeyAndOverrideKind(
                        revisionId, request.subjectAreaKey(), kind)
                : overrideRepository.existsByRevisionIdAndSubjectNodeKeyAndOverrideKind(
                        revisionId, request.subjectNodeKey(), kind);
        if (duplicate) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "An override of kind=" + kind + " already exists for this subject on this revision");
        }

        int nextApplyOrder = overrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId).size() + 1;
        overrideRepository.save(new SandboxNavigationOverride(
                revisionId, kind, request.subjectAreaKey(), request.subjectNodeKey(), request.targetRegionKey(),
                request.targetNodeKey(), request.newLabel(), request.newRepresentativeAreaKeys(), nextApplyOrder,
                request.reason(), adminId));

        log.info("Navigation override created cityId={} revisionId={} kind={} adminId={}",
                cityId, revisionId, kind, adminId);
        return regenerateAndRestamp(cityId, revision);
    }

    @Transactional
    public NavigationTreeDiffResponse deleteOverride(int cityId, long revisionId, long overrideId) {
        CityLaunchRevision revision = requirePreparedRevisionForUpdate(cityId, revisionId);

        int deleted = overrideRepository.deleteByRevisionIdAndId(revisionId, overrideId);
        if (deleted == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Navigation override not found");
        }

        log.info("Navigation override deleted cityId={} revisionId={} overrideId={}", cityId, revisionId, overrideId);
        return regenerateAndRestamp(cityId, revision);
    }

    // ── Shared regenerate + re-stamp (used by both mutations) ──────────────────────────────────

    private NavigationTreeDiffResponse regenerateAndRestamp(int cityId, CityLaunchRevision revision) {
        long revisionId = revision.getId();
        generationService.generateAndStoreForRevision(revisionId, cityId, Instant.now());

        List<SandboxArea> areas = sandboxAreaRepository.findByRevisionId(revisionId);
        List<SandboxAreaAlias> aliases = sandboxAreaAliasRepository.findByRevisionId(revisionId);
        List<SandboxCityRegion> regions = sandboxCityRegionRepository.findByRevisionId(revisionId);
        List<SandboxCityRegionMembership> memberships =
                sandboxCityRegionMembershipRepository.findByRevisionId(revisionId);
        List<SandboxAreaGroup> groups = sandboxAreaGroupRepository.findByRevisionId(revisionId);
        List<SandboxAreaGroupMember> groupMembers = sandboxAreaGroupMemberRepository.findByRevisionId(revisionId);
        List<SandboxNavigationNode> navNodes = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        List<SandboxNavigationOverride> overrides = overrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId);

        revision.setPersistedRevisionChecksum(RevisionChecksum.compute(
                areas, aliases, regions, memberships, groups, groupMembers, navNodes, overrides));

        return buildDiff(cityId, revisionId, "BASE");
    }

    // ── Diff ─────────────────────────────────────────────────────────────────────────────────

    private NavigationTreeDiffResponse buildDiff(int cityId, long revisionId, String against) {
        List<DiffNode> after = sandboxDiffNodes(sandboxNavigationNodeRepository.findByRevisionId(revisionId));
        List<DiffNode> before;
        if ("PREVIOUS_REVISION".equals(against)) {
            before = findPreviousRevisionId(cityId, revisionId)
                    .map(id -> sandboxDiffNodes(sandboxNavigationNodeRepository.findByRevisionId(id)))
                    .orElse(List.of());
        } else {
            before = productionDiffNodes(
                    navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(cityId));
        }

        Map<String, DiffNode> beforeByKey = new HashMap<>();
        before.forEach(n -> beforeByKey.put(n.nodeKey(), n));
        Map<String, DiffNode> afterByKey = new HashMap<>();
        after.forEach(n -> afterByKey.put(n.nodeKey(), n));

        List<String> added = afterByKey.keySet().stream()
                .filter(k -> !beforeByKey.containsKey(k)).sorted().toList();
        List<String> removed = beforeByKey.keySet().stream()
                .filter(k -> !afterByKey.containsKey(k)).sorted().toList();

        List<NavigationTreeDiffResponse.MovedNode> moved = new ArrayList<>();
        List<NavigationTreeDiffResponse.RelabeledNode> relabeled = new ArrayList<>();
        List<NavigationTreeDiffResponse.RepresentativeChange> repChanges = new ArrayList<>();
        for (String key : afterByKey.keySet()) {
            DiffNode b = beforeByKey.get(key);
            if (b == null) {
                continue;
            }
            DiffNode a = afterByKey.get(key);
            if (!Objects.equals(b.parentNodeKey(), a.parentNodeKey())) {
                moved.add(new NavigationTreeDiffResponse.MovedNode(key, b.parentNodeKey(), a.parentNodeKey()));
            }
            if (!Objects.equals(b.displayLabel(), a.displayLabel())) {
                relabeled.add(new NavigationTreeDiffResponse.RelabeledNode(key, b.displayLabel(), a.displayLabel()));
            }
            if (!new HashSet<>(orEmpty(b.representativeAreaKeys())).equals(new HashSet<>(orEmpty(a.representativeAreaKeys())))) {
                repChanges.add(new NavigationTreeDiffResponse.RepresentativeChange(
                        key, b.representativeAreaKeys(), a.representativeAreaKeys()));
            }
        }
        moved.sort(Comparator.comparing(NavigationTreeDiffResponse.MovedNode::nodeKey));
        relabeled.sort(Comparator.comparing(NavigationTreeDiffResponse.RelabeledNode::nodeKey));
        repChanges.sort(Comparator.comparing(NavigationTreeDiffResponse.RepresentativeChange::nodeKey));

        String overridesFingerprint = RevisionChecksum.computeOverridesFingerprint(
                overrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId));

        return new NavigationTreeDiffResponse(
                revisionId, against, overridesFingerprint, added, removed, moved, relabeled, repChanges);
    }

    private static List<String> orEmpty(List<String> list) {
        return list == null ? List.of() : list;
    }

    private java.util.Optional<Long> findPreviousRevisionId(int cityId, long revisionId) {
        List<CityLaunchRevision> revisions = revisionRepository.findByCityId(cityId);
        CityLaunchRevision current = revisions.stream()
                .filter(r -> r.getId() == revisionId)
                .findFirst()
                .orElse(null);
        if (current == null) {
            return java.util.Optional.empty();
        }
        // Prefer the revision this one explicitly superseded (V118 supersession chain), else fall
        // back to the highest-numbered earlier revision for this city.
        return revisions.stream()
                .filter(r -> Objects.equals(r.getSupersededBy(), revisionId))
                .map(CityLaunchRevision::getId)
                .findFirst()
                .or(() -> revisions.stream()
                        .filter(r -> r.getId() != revisionId && r.getRevisionNumber() < current.getRevisionNumber())
                        .max(Comparator.comparing(CityLaunchRevision::getRevisionNumber))
                        .map(CityLaunchRevision::getId));
    }

    private List<DiffNode> sandboxDiffNodes(List<SandboxNavigationNode> nodes) {
        Map<Long, String> idToKey = new HashMap<>();
        nodes.forEach(n -> idToKey.put(n.getId(), n.getNodeKey()));
        return nodes.stream()
                .map(n -> new DiffNode(n.getNodeKey(), n.getNodeType(),
                        n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId()),
                        n.getDisplayLabel(), n.getRepresentativeAreaKeys()))
                .toList();
    }

    private List<DiffNode> productionDiffNodes(List<NavigationNode> nodes) {
        Map<Long, String> idToKey = new HashMap<>();
        nodes.forEach(n -> idToKey.put(n.getId(), n.getNodeKey()));
        return nodes.stream()
                .map(n -> new DiffNode(n.getNodeKey(), n.getNodeType(),
                        n.getParentNodeId() == null ? null : idToKey.get(n.getParentNodeId()),
                        n.getDisplayLabel(), n.getRepresentativeAreaKeys()))
                .toList();
    }

    private record DiffNode(String nodeKey, String nodeType, String parentNodeKey, String displayLabel,
                             List<String> representativeAreaKeys) {}

    // ── Guards ───────────────────────────────────────────────────────────────────────────────

    private CityLaunchRevision requireRevision(int cityId, long revisionId) {
        return revisionRepository.findById(revisionId)
                .filter(r -> Objects.equals(r.getCityId(), cityId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "City launch revision not found"));
    }

    private CityLaunchRevision requirePreparedRevisionForUpdate(int cityId, long revisionId) {
        CityLaunchRevision revision = revisionRepository.findByIdForUpdate(revisionId)
                .filter(r -> Objects.equals(r.getCityId(), cityId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "City launch revision not found"));
        if (revision.getLifecycleStatus() != LifecycleStatus.PREPARED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Navigation overrides can only be mutated while the revision is PREPARED (status="
                            + revision.getLifecycleStatus() + ")");
        }
        return revision;
    }

    private static String normalizeAgainst(String against) {
        return "PREVIOUS_REVISION".equalsIgnoreCase(against) ? "PREVIOUS_REVISION" : "BASE";
    }

    private static OverrideKind parseKind(String kind) {
        try {
            return OverrideKind.valueOf(kind);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new IllegalArgumentException("Unknown override kind: " + kind);
        }
    }

    /** Mirrors the V122 kind-shape CHECK constraint, enforced again here (defense in depth). */
    private static void validateShape(OverrideKind kind, AdminNavigationOverrideRequest r) {
        boolean subjectXor = (r.subjectAreaKey() != null) != (r.subjectNodeKey() != null);
        if (!subjectXor) {
            throw new IllegalArgumentException("Exactly one of subjectAreaKey/subjectNodeKey must be set");
        }
        boolean shapeOk = switch (kind) {
            case EXCLUDE_AREA -> r.subjectAreaKey() != null && r.targetRegionKey() == null
                    && r.targetNodeKey() == null && r.newLabel() == null && r.newRepresentativeAreaKeys() == null;
            case REASSIGN_AREA_REGION -> r.subjectAreaKey() != null && r.targetRegionKey() != null
                    && r.targetNodeKey() == null && r.newLabel() == null && r.newRepresentativeAreaKeys() == null;
            case MOVE_AREA -> r.subjectAreaKey() != null && r.targetNodeKey() != null && r.targetRegionKey() == null
                    && r.newLabel() == null && r.newRepresentativeAreaKeys() == null;
            case RELABEL -> r.subjectNodeKey() != null && r.newLabel() != null && !r.newLabel().isBlank()
                    && r.targetRegionKey() == null && r.targetNodeKey() == null && r.newRepresentativeAreaKeys() == null;
            case SET_REPRESENTATIVES -> r.subjectNodeKey() != null && r.newRepresentativeAreaKeys() != null
                    && !r.newRepresentativeAreaKeys().isEmpty() && r.targetRegionKey() == null
                    && r.targetNodeKey() == null && r.newLabel() == null;
        };
        if (!shapeOk) {
            throw new IllegalArgumentException("Request fields do not match the required shape for kind=" + kind);
        }
    }
}
