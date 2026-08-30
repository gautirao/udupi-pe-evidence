package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverride;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Admin "Edit revision" (#2121): derives a new, editable {@code PREPARED} candidate revision as a
 * byte-faithful copy of the current LIVE (PROMOTED, {@code superseded_by IS NULL}) revision's own
 * {@code sandbox_*} row set — never mutating LIVE, and never re-deriving from raw canonical
 * geography (unlike {@link CityLaunchPreparationService#prepare}/{@code rerunSuperseding}).
 *
 * <p>{@link CityLaunchPromotionService#launch} never deletes a promoted revision's own
 * {@code sandbox_*} rows (they remain readable by {@code revisionId} indefinitely — confirmed by
 * the #2121 plan's verified facts), which is what makes cloning LIVE's sandbox rows safe rather
 * than a re-read of mutable production geography.
 *
 * <p>The new candidate is admitted directly as {@code lifecycle_status = PREPARED} (no
 * PREPARING-&gt;PREPARED transition, no async step — unlike {@code prepare()}, this method already
 * has the fully-formed data in hand synchronously) so the existing PREPARED-only override/validate/
 * promote machinery ({@link CityLaunchNavigationOverrideService}, {@link CityLaunchValidationService},
 * {@link CityLaunchPromotionService}) can operate on it unchanged.
 */
@Service
public class CityLaunchCandidateService {

    private static final Logger log = LoggerFactory.getLogger(CityLaunchCandidateService.class);

    /**
     * Reuses {@link CityLaunchPreparationService}'s {@code PREPARE_ADVISORY_LOCK_NAMESPACE} —
     * SAME namespace/constant per the #2121 plan, not a new one. Serializes a concurrent
     * {@code editFromLive} only against a concurrent {@code prepare()} for the SAME city, since
     * only {@code prepare()} (via {@code ensureCanonicalGeography}) actually acquires this lock —
     * {@code rerunSuperseding()} and {@link CityLaunchPromotionService#launch} never take it.
     * Protection against a concurrent {@code rerunSuperseding()}/{@code launch()} instead comes
     * from the {@code uq_clr_inflight} unique index and Postgres's own row-level locking on the
     * {@code FOR UPDATE} read of the current LIVE/in-flight revision.
     */
    private static final int PREPARE_ADVISORY_LOCK_NAMESPACE = 2163;

    private final CityLaunchRevisionRepository revisionRepository;
    private final JdbcOperations jdbcOperations;
    private final SandboxAreaRepository sandboxAreaRepository;
    private final SandboxAreaAliasRepository sandboxAreaAliasRepository;
    private final SandboxCityRegionRepository sandboxCityRegionRepository;
    private final SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    private final SandboxAreaGroupRepository sandboxAreaGroupRepository;
    private final SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    private final SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    private final SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository;
    private final SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository;

    public CityLaunchCandidateService(
            CityLaunchRevisionRepository revisionRepository,
            JdbcOperations jdbcOperations,
            SandboxAreaRepository sandboxAreaRepository,
            SandboxAreaAliasRepository sandboxAreaAliasRepository,
            SandboxCityRegionRepository sandboxCityRegionRepository,
            SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository,
            SandboxAreaGroupRepository sandboxAreaGroupRepository,
            SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository,
            SandboxNavigationNodeRepository sandboxNavigationNodeRepository,
            SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository,
            SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository) {
        this.revisionRepository = revisionRepository;
        this.jdbcOperations = jdbcOperations;
        this.sandboxAreaRepository = sandboxAreaRepository;
        this.sandboxAreaAliasRepository = sandboxAreaAliasRepository;
        this.sandboxCityRegionRepository = sandboxCityRegionRepository;
        this.sandboxCityRegionMembershipRepository = sandboxCityRegionMembershipRepository;
        this.sandboxAreaGroupRepository = sandboxAreaGroupRepository;
        this.sandboxAreaGroupMemberRepository = sandboxAreaGroupMemberRepository;
        this.sandboxNavigationNodeRepository = sandboxNavigationNodeRepository;
        this.sandboxNavigationOverrideRepository = sandboxNavigationOverrideRepository;
        this.sandboxAgriDestinationClassificationRepository = sandboxAgriDestinationClassificationRepository;
    }

    /**
     * @param cityId        path-supplied city id
     * @param liveRevisionId the caller's (UI's) snapshot of the current LIVE revision id —
     *                       compared against the FOR-UPDATE-loaded actual current LIVE revision as
     *                       stale-read protection; a mismatch means the admin's UI is looking at a
     *                       city that has since been re-launched
     * @param callerId      the AUTHENTICATED caller's id (from {@code CallerInfo}), never a
     *                      client-supplied value
     */
    @Transactional
    public PrepareResponse editFromLive(int cityId, long liveRevisionId, UUID callerId) {
        // Same advisory-lock namespace as CityLaunchPreparationService.ensureCanonicalGeography —
        // serializes this method against a concurrent prepare() for this city only (the only other
        // caller that actually acquires this lock). A concurrent rerunSuperseding()/launch() is
        // instead guarded by uq_clr_inflight and Postgres's own row-level locking on the FOR UPDATE
        // read below, not by this advisory lock.
        jdbcOperations.query(
                "SELECT pg_advisory_xact_lock(?, ?)", (rs) -> null, PREPARE_ADVISORY_LOCK_NAMESPACE, cityId);

        CityLaunchRevision live = revisionRepository.findPromotedByCityIdForUpdate(cityId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "No LIVE (PROMOTED) revision found for this city"));

        if (!Objects.equals(live.getId(), liveRevisionId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The current LIVE revision (id=" + live.getId() + ") no longer matches the requested "
                            + "revision (id=" + liveRevisionId + ") — reload and try again");
        }

        List<SandboxArea> sourceAreas = sandboxAreaRepository.findByRevisionId(liveRevisionId);
        if (sourceAreas.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The current LIVE revision has no sandbox geography rows to clone (a legacy revision "
                            + "predating the sandbox tables) — cannot create an editable candidate");
        }

        List<SandboxAreaAlias> sourceAliases = sandboxAreaAliasRepository.findByRevisionId(liveRevisionId);
        List<SandboxCityRegion> sourceRegions = sandboxCityRegionRepository.findByRevisionId(liveRevisionId);
        List<SandboxCityRegionMembership> sourceMemberships =
                sandboxCityRegionMembershipRepository.findByRevisionId(liveRevisionId);
        List<SandboxAreaGroup> sourceGroups = sandboxAreaGroupRepository.findByRevisionId(liveRevisionId);
        List<SandboxAreaGroupMember> sourceGroupMembers =
                sandboxAreaGroupMemberRepository.findByRevisionId(liveRevisionId);
        List<SandboxNavigationNode> sourceNavNodes = sandboxNavigationNodeRepository.findByRevisionId(liveRevisionId);
        List<SandboxNavigationOverride> sourceOverrides =
                sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(liveRevisionId);
        List<SandboxAgriDestinationClassification> sourceAgriDestinations =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(liveRevisionId);

        int nextRevisionNumber = nextRevisionNumber(cityId);
        CityLaunchRevision candidate = new CityLaunchRevision(cityId, nextRevisionNumber, callerId);
        candidate.setPrepState(PrepState.DONE);
        candidate.setLifecycleStatus(LifecycleStatus.PREPARED);
        candidate.setClonedFromRevisionId(liveRevisionId);
        candidate.setPreparedAt(Instant.now());

        CityLaunchRevision savedCandidate;
        try {
            // Forces uq_clr_inflight to be evaluated NOW — a concurrent second in-flight revision
            // for this city (from prepare(), rerunSuperseding(), or a concurrent editFromLive())
            // fails right here, mirroring CityLaunchPreparationService#insertPreparingRevision.
            savedCandidate = revisionRepository.saveAndFlush(candidate);
        } catch (DataIntegrityViolationException e) {
            throw new CityPreparationConflictException(
                    "A city launch preparation is already in progress for this city");
        }
        long newRevisionId = savedCandidate.getId();

        // ── Copy all 9 sandbox row sets, remapping FKs old-surrogate-id -> new-surrogate-id.
        // Every *_id remap map is keyed by the SOURCE (LIVE revision's) sandbox row id and valued
        // by the freshly-INSERTed candidate row's id.
        Map<Long, Long> areaIdRemap = new HashMap<>();
        List<SandboxArea> newAreas = new ArrayList<>(sourceAreas.size());
        for (SandboxArea a : sourceAreas) {
            SandboxArea copy = sandboxAreaRepository.save(new SandboxArea(
                    newRevisionId, a.getAreaKey(), a.getName(), a.getDistrict(),
                    a.getGeoCenterLat(), a.getGeoCenterLon(), a.getMinLat(), a.getMinLon(),
                    a.getMaxLat(), a.getMaxLon(), a.getGeometrySource(), a.getOsmElementType(),
                    a.getOsmElementId(), a.getLifecycleStatus()));
            areaIdRemap.put(a.getId(), copy.getId());
            newAreas.add(copy);
        }

        Map<Long, Long> groupIdRemap = new HashMap<>();
        List<SandboxAreaGroup> newGroups = new ArrayList<>(sourceGroups.size());
        for (SandboxAreaGroup g : sourceGroups) {
            SandboxAreaGroup copy = sandboxAreaGroupRepository.save(new SandboxAreaGroup(
                    newRevisionId, g.getSlug(), g.getName(), g.getSubtitle(), g.getRegionLabel(),
                    g.getDisplayOrder(), g.isActive(), g.getFocusLat(), g.getFocusLon(),
                    g.getMinLat(), g.getMinLon(), g.getMaxLat(), g.getMaxLon()));
            groupIdRemap.put(g.getId(), copy.getId());
            newGroups.add(copy);
        }

        List<SandboxAreaAlias> newAliases = new ArrayList<>(sourceAliases.size());
        for (SandboxAreaAlias al : sourceAliases) {
            Long newAreaId = areaIdRemap.get(al.getSandboxAreaId());
            if (newAreaId == null) {
                // Unreachable post-prep validation — every sandbox_area_aliases.sandbox_area_id
                // referenced for a revision is guaranteed to exist in that same revision's
                // sandbox_areas. Defensive, mirrors CityLaunchPromotionService's own guards.
                continue;
            }
            newAliases.add(sandboxAreaAliasRepository.save(
                    new SandboxAreaAlias(newRevisionId, newAreaId, al.getAlias(), al.getAliasNormalised())));
        }

        List<SandboxCityRegion> newRegions = new ArrayList<>(sourceRegions.size());
        for (SandboxCityRegion r : sourceRegions) {
            // No surrogate FK remap needed — region_key is a natural key, not a sandbox surrogate id.
            newRegions.add(sandboxCityRegionRepository.save(new SandboxCityRegion(
                    newRevisionId, r.getRegionKey(), r.getDisplayLabel(), r.getDisplayOrder(),
                    r.getCentreLat(), r.getCentreLon(), r.getMinLat(), r.getMinLon(),
                    r.getMaxLat(), r.getMaxLon(), r.getPolicyFingerprint())));
        }

        List<SandboxCityRegionMembership> newMemberships = new ArrayList<>(sourceMemberships.size());
        for (SandboxCityRegionMembership m : sourceMemberships) {
            Long newAreaId = areaIdRemap.get(m.getSandboxAreaId());
            if (newAreaId == null) {
                continue; // unreachable post-prep validation
            }
            newMemberships.add(sandboxCityRegionMembershipRepository.save(new SandboxCityRegionMembership(
                    newRevisionId, newAreaId, m.getRegionKey(), m.getAssignmentSource())));
        }

        List<SandboxAreaGroupMember> newGroupMembers = new ArrayList<>(sourceGroupMembers.size());
        for (SandboxAreaGroupMember gm : sourceGroupMembers) {
            Long newGroupId = groupIdRemap.get(gm.getSandboxAreaGroupId());
            Long newAreaId = areaIdRemap.get(gm.getSandboxAreaId());
            if (newGroupId == null || newAreaId == null) {
                continue; // unreachable post-prep validation
            }
            newGroupMembers.add(sandboxAreaGroupMemberRepository.save(
                    new SandboxAreaGroupMember(newRevisionId, newGroupId, newAreaId, gm.getDisplayOrder())));
        }

        // Navigation nodes: parent_node_id is a self-referencing SANDBOX surrogate id, so rows must
        // be inserted depth-ascending — every node's parent has a strictly smaller depth, so its
        // new id is always already known (mirrors CityLaunchPromotionService#promoteNavigationNodes'
        // identical ordering rationale). area_key/ancestor_keys/representative_area_keys are natural
        // keys, copied verbatim, no remap needed.
        Map<Long, Long> nodeIdRemap = new HashMap<>();
        List<SandboxNavigationNode> newNavNodes = new ArrayList<>(sourceNavNodes.size());
        for (SandboxNavigationNode n : sourceNavNodes.stream()
                .sorted(Comparator.comparing(SandboxNavigationNode::getDepth)
                        .thenComparing(SandboxNavigationNode::getDisplayOrder,
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(SandboxNavigationNode::getNodeKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            Long newParentId = null;
            if (n.getParentNodeId() != null) {
                newParentId = nodeIdRemap.get(n.getParentNodeId());
                if (newParentId == null) {
                    // Unreachable given depth-ascending insertion order (same invariant
                    // CityLaunchPromotionService#promoteNavigationNodes relies on).
                    throw new IllegalStateException(
                            "navigation node parent sandboxId=" + n.getParentNodeId() + " not yet cloned "
                                    + "(unreachable: depth-ascending insertion order) cityId=" + cityId);
                }
            }
            SandboxNavigationNode copy = sandboxNavigationNodeRepository.save(new SandboxNavigationNode(
                    newRevisionId, n.getRegionKey(), n.getNodeType(), newParentId, n.getNodeKey(), n.getAreaKey(),
                    n.getRepresentativeAreaKeys(), n.getDisplayLabel(), n.getDisplayOrder(), n.getDepth(),
                    n.getAncestorKeys(), n.getDescendantAreaCount(), n.getCentreLat(), n.getCentreLon(),
                    n.getMinLat(), n.getMinLon(), n.getMaxLat(), n.getMaxLon(), n.getBearingDegrees(),
                    n.getPolicyFingerprint(), n.getGeneratedAt()));
            nodeIdRemap.put(n.getId(), copy.getId());
            newNavNodes.add(copy);
        }

        // Overrides: subject/target keys (area_key/node_key) are natural keys, not sandbox
        // surrogate ids — no remap needed. applyOrder is copied verbatim to preserve replay order.
        List<SandboxNavigationOverride> newOverrides = new ArrayList<>(sourceOverrides.size());
        for (SandboxNavigationOverride o : sourceOverrides) {
            newOverrides.add(sandboxNavigationOverrideRepository.save(new SandboxNavigationOverride(
                    newRevisionId, o.getOverrideKind(), o.getSubjectAreaKey(), o.getSubjectNodeKey(),
                    o.getTargetRegionKey(), o.getTargetNodeKey(), o.getNewLabel(),
                    o.getNewRepresentativeAreaKeys(), o.getApplyOrder(), o.getReason(), o.getCreatedBy())));
        }

        // Agri destination classification: area_key is a natural key — no remap needed.
        List<SandboxAgriDestinationClassification> newAgriDestinations =
                new ArrayList<>(sourceAgriDestinations.size());
        for (SandboxAgriDestinationClassification a : sourceAgriDestinations) {
            newAgriDestinations.add(sandboxAgriDestinationClassificationRepository.save(
                    new SandboxAgriDestinationClassification(
                            newRevisionId, a.getAreaKey(), a.getOriginLat(), a.getOriginLon(),
                            a.getDistanceKm(), a.getBearingDeg(), a.getDirectionKey(), a.getDistanceBandKey(),
                            a.getGeneratorVersion(), a.getGeneratedAt())));
        }

        // Recomputed over the NEWLY-copied rows — NEVER copied from the source revision's own
        // persisted_revision_checksum, per the #2121 plan.
        String checksum = RevisionChecksum.compute(
                newAreas, newAliases, newRegions, newMemberships, newGroups, newGroupMembers,
                newNavNodes, newOverrides, newAgriDestinations);
        savedCandidate.setPersistedRevisionChecksum(checksum);

        log.info("City launch candidate cloned from LIVE cityId={} liveRevisionId={} candidateRevisionId={} "
                        + "adminId={} areas={} aliases={} regions={} memberships={} groups={} groupMembers={} "
                        + "navigationNodes={} overrides={} agriDestinations={}",
                cityId, liveRevisionId, newRevisionId, callerId, newAreas.size(), newAliases.size(),
                newRegions.size(), newMemberships.size(), newGroups.size(), newGroupMembers.size(),
                newNavNodes.size(), newOverrides.size(), newAgriDestinations.size());

        return new PrepareResponse(newRevisionId, "prepared");
    }

    private int nextRevisionNumber(int cityId) {
        return revisionRepository.findByCityId(cityId).stream()
                .map(CityLaunchRevision::getRevisionNumber)
                .max(Comparator.naturalOrder())
                .orElse(0) + 1;
    }
}
