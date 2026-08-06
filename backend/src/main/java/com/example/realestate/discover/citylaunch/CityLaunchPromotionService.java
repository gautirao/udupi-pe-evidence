package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.CityNavigationRevisionPromoted;
import com.example.realestate.discover.navigation.NavigationNode;
import com.example.realestate.discover.navigation.NavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverride;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Guarded promotion of one VALIDATED {@link CityLaunchRevision}'s {@code sandbox_*} rows into
 * production geography, then city activation — the ONE and only production-geography write path
 * in #1911 (PR5).
 *
 * <p>REPLICATES the V115/V116 {@code AreaOnboardingApplyService} mechanism (guarded CAS lifecycle
 * transition + persisted-vs-recomputed checksum verify + {@code SELECT ... FOR UPDATE} ascending-key
 * total order + compare-before-write idempotency) inside this NEW service. Does NOT call {@code
 * AreaOnboardingApplyService.apply()} and does NOT edit that frozen file — {@code apply()} writes
 * ONLY the {@code areas} table and is structurally incapable of the full geography promotion this
 * class performs.
 *
 * <h2>Single transaction (AC9)</h2>
 * {@link #launch} is ONE {@code @Transactional} method: the guarded CAS to PROMOTING, the checksum
 * verify, the seven-table write (six geography tables via compare-before-write, plus {@code
 * navigation_nodes} via replace-discipline — #1955 Areas PR A, SLICE 2c), the final CAS to
 * PROMOTED, and the city activation flip all commit or roll back together. A crash/exception at
 * any point after the first CAS rolls the whole transaction back — the revision reverts to
 * VALIDATED with ZERO partial geography and no partial city activation.
 *
 * <h2>Guarded CAS is the SOLE authority (AC3)</h2>
 * {@link #launch}'s FIRST statement is {@link CityLaunchRevisionRepository#transitionValidatedToPromoting}
 * — its SQL {@code WHERE} clause (id + city_id scoped, {@code superseded_by IS NULL}, {@code
 * lifecycle_status = 'VALIDATED'}) is the row lock and the authority, never a Java pre-check. 0 rows
 * affected means ZERO writes happen; {@link #handleNotPromoting} then reads the current status to
 * shape a 404 (wrong city/missing revision) / 200-idempotent-noop (already PROMOTED) / 409
 * (any other in-flight/terminal status) response.
 *
 * <h2>Checksum gate (AC5)</h2>
 * {@link RevisionChecksum#compute(List, List, List, List, List, List, List)} is recomputed over the
 * CURRENT {@code sandbox_*} row set (now including {@code sandbox_navigation_nodes}) and compared
 * to {@code persisted_revision_checksum} (written once, at PREPARED, by {@link
 * CityLaunchGraphWriter} — via the SAME seven-arg overload as of #1955 Areas PR A, SLICE 2e, which
 * wired navigation-tree generation into the prepare pipeline; see {@link RevisionChecksum} class
 * javadoc) — the SAME routine, so a match is guaranteed by construction unless the sandbox rows
 * were mutated out-of-band since prep completion. A mismatch throws BEFORE any production write,
 * rolling the PROMOTING transition back to VALIDATED too. A revision prepared before this slice (or
 * for a city with no {@code city_region_policy} row — see {@code CityLaunchGraphWriter}'s
 * precondition gate) legitimately has an empty {@code sandbox_navigation_nodes} set; the seven-arg
 * overload is a no-op on an empty seventh section either way (see {@link RevisionChecksum} class
 * javadoc), so both cases still verify correctly.
 *
 * <h2>Lock order (AC6)</h2>
 * Production {@code areas} rows are locked {@code FOR UPDATE} ascending by {@code area_key} FIRST —
 * IDENTICAL to {@code AreaOnboardingApplyService.apply()}'s order — so a concurrent {@code apply()}
 * and a concurrent {@code launch()} touching an overlapping area set always serialize rather than
 * deadlock. The other five geography tables are locked ascending by their own natural key
 * afterward; {@code apply()} never touches those five tables, so there is no cross-service
 * lock-order hazard there. {@code navigation_nodes} is promoted LAST of all seven — its {@code
 * area_key} column FKs {@code public.areas}, so every area it might reference already exists in
 * production by the time it runs; see {@link #promoteNavigationNodes} javadoc for why it uses
 * replace-discipline rather than the other six tables' compare-before-write.
 */
@Service
public class CityLaunchPromotionService {

    private static final Logger log = LoggerFactory.getLogger(CityLaunchPromotionService.class);

    private final CityLaunchRevisionRepository revisionRepository;
    private final SandboxAreaRepository sandboxAreaRepository;
    private final SandboxAreaAliasRepository sandboxAreaAliasRepository;
    private final SandboxCityRegionRepository sandboxCityRegionRepository;
    private final SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    private final SandboxAreaGroupRepository sandboxAreaGroupRepository;
    private final SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    private final SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    private final SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository;
    private final NavigationNodeRepository navigationNodeRepository;
    private final JdbcOperations jdbcOperations;
    private final ApplicationEventPublisher eventPublisher;

    public CityLaunchPromotionService(
            CityLaunchRevisionRepository revisionRepository,
            SandboxAreaRepository sandboxAreaRepository,
            SandboxAreaAliasRepository sandboxAreaAliasRepository,
            SandboxCityRegionRepository sandboxCityRegionRepository,
            SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository,
            SandboxAreaGroupRepository sandboxAreaGroupRepository,
            SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository,
            SandboxNavigationNodeRepository sandboxNavigationNodeRepository,
            SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository,
            NavigationNodeRepository navigationNodeRepository,
            JdbcOperations jdbcOperations,
            ApplicationEventPublisher eventPublisher) {
        this.revisionRepository = revisionRepository;
        this.sandboxAreaRepository = sandboxAreaRepository;
        this.sandboxAreaAliasRepository = sandboxAreaAliasRepository;
        this.sandboxCityRegionRepository = sandboxCityRegionRepository;
        this.sandboxCityRegionMembershipRepository = sandboxCityRegionMembershipRepository;
        this.sandboxAreaGroupRepository = sandboxAreaGroupRepository;
        this.sandboxAreaGroupMemberRepository = sandboxAreaGroupMemberRepository;
        this.sandboxNavigationNodeRepository = sandboxNavigationNodeRepository;
        this.sandboxNavigationOverrideRepository = sandboxNavigationOverrideRepository;
        this.navigationNodeRepository = navigationNodeRepository;
        this.jdbcOperations = jdbcOperations;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public PromotionReport launch(int cityId, long revisionId, String adminId) {
        int casRows = revisionRepository.transitionValidatedToPromoting(revisionId, cityId);
        if (casRows == 0) {
            return handleNotPromoting(cityId, revisionId);
        }

        List<SandboxArea> sandboxAreas = sandboxAreaRepository.findByRevisionId(revisionId);
        List<SandboxAreaAlias> sandboxAliases = sandboxAreaAliasRepository.findByRevisionId(revisionId);
        List<SandboxCityRegion> sandboxRegions = sandboxCityRegionRepository.findByRevisionId(revisionId);
        List<SandboxCityRegionMembership> sandboxMemberships =
                sandboxCityRegionMembershipRepository.findByRevisionId(revisionId);
        List<SandboxAreaGroup> sandboxGroups = sandboxAreaGroupRepository.findByRevisionId(revisionId);
        List<SandboxAreaGroupMember> sandboxGroupMembers =
                sandboxAreaGroupMemberRepository.findByRevisionId(revisionId);
        List<SandboxNavigationNode> sandboxNavigationNodes =
                sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        List<SandboxNavigationOverride> sandboxNavigationOverrides =
                sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId);

        CityLaunchRevision revision = revisionRepository.findByIdForUpdate(revisionId)
                .orElseThrow(() -> new IllegalStateException(
                        "City launch revision " + revisionId + " vanished mid-promotion (unreachable: we just "
                                + "CAS'd it to PROMOTING in this same transaction)"));

        String persistedChecksum = revision.getPersistedRevisionChecksum();
        if (persistedChecksum == null) {
            // Should never happen post-grant: CityLaunchGraphWriter always stamps this at PREPARED.
            // Treated as a hard error rather than silently skipping the checksum gate.
            log.error("City launch persisted_revision_checksum is NULL cityId={} revisionId={} — refusing to "
                    + "promote", cityId, revisionId);
            throw new IllegalStateException(
                    "persisted_revision_checksum is NULL for revision " + revisionId
                            + " — cannot verify checksum, refusing to promote");
        }

        String recomputedChecksum = RevisionChecksum.compute(
                sandboxAreas, sandboxAliases, sandboxRegions, sandboxMemberships, sandboxGroups, sandboxGroupMembers,
                sandboxNavigationNodes, sandboxNavigationOverrides);
        if (!recomputedChecksum.equals(persistedChecksum)) {
            log.warn("City launch checksum mismatch cityId={} revisionId={} recomputed={} persisted={} — "
                    + "rejecting, zero writes", cityId, revisionId, recomputedChecksum, persistedChecksum);
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Sandbox geography checksum mismatch — it may have drifted since preparation; re-run "
                            + "prepare and re-validate before launching");
        }

        // ── Compare-before-write, ascending by natural key, areas FIRST (AC6 lock-order checkpoint).
        int areasPromoted = promoteAreas(cityId, sandboxAreas);
        Map<Long, String> areaKeyBySandboxAreaId = new HashMap<>();
        for (SandboxArea a : sandboxAreas) {
            areaKeyBySandboxAreaId.put(a.getId(), a.getAreaKey());
        }

        int aliasesPromoted = promoteAliases(cityId, sandboxAliases, areaKeyBySandboxAreaId);
        int regionsPromoted = promoteRegions(cityId, sandboxRegions);
        int membershipsPromoted = promoteMemberships(cityId, sandboxMemberships, areaKeyBySandboxAreaId);

        Map<Long, String> groupSlugBySandboxGroupId = new HashMap<>();
        for (SandboxAreaGroup g : sandboxGroups) {
            groupSlugBySandboxGroupId.put(g.getId(), g.getSlug());
        }
        int groupsPromoted = promoteGroups(cityId, sandboxGroups);
        int groupMembersPromoted = promoteGroupMembers(
                cityId, sandboxGroupMembers, groupSlugBySandboxGroupId, areaKeyBySandboxAreaId);

        // ── Seventh table, LAST in lock order (#1955 Areas PR A, SLICE 2c): navigation_nodes.area_key
        // FKs public.areas, which promoteAreas() above has already ensured exist in production for
        // this city. Uses REPLACE-discipline (clear then insert), not compare-before-write — see
        // promoteNavigationNodes() javadoc for why a tree's node set can't use the same natural-key
        // idempotency as the six geography tables above.
        int navigationNodesPromoted = promoteNavigationNodes(cityId, sandboxNavigationNodes);

        Instant now = Instant.now();
        int finalCasRows = revisionRepository.transitionPromotingToPromoted(revisionId, cityId, now, recomputedChecksum);
        if (finalCasRows != 1) {
            // Unreachable in practice: this transaction holds the row (findByIdForUpdate above) and
            // set it to PROMOTING itself moments earlier; asserted defensively rather than silently
            // tolerated, matching AreaOnboardingApplyService's own-affected-row-count assertions.
            throw new IllegalStateException(
                    "Final CAS PROMOTING->PROMOTED affected " + finalCasRows + " row(s) (expected 1) for "
                            + "revisionId=" + revisionId + " — aborting, rolling back");
        }

        int cityActivatedRows = jdbcOperations.update(
                "UPDATE public.cities SET is_active = true WHERE id = ? AND is_active = false", cityId);
        boolean cityActivated = cityActivatedRows == 1;

        log.info("City launch PROMOTED cityId={} revisionId={} adminId={} areas={} aliases={} regions={} "
                        + "memberships={} groups={} groupMembers={} navigationNodes={} cityActivated={} checksum={}",
                cityId, revisionId, adminId, areasPromoted, aliasesPromoted, regionsPromoted, membershipsPromoted,
                groupsPromoted, groupMembersPromoted, navigationNodesPromoted, cityActivated, recomputedChecksum);

        // #1955 Areas PR A, SLICE 2d: refresh signal for the navigation-hierarchy cache — published
        // here (inside the transaction) but only DELIVERED to NavigationGraphRefreshListener
        // AFTER_COMMIT, so a rollback anywhere above this line never fires a refresh for a
        // promotion that didn't actually happen. Never published on the idempotent-no-op path in
        // handleNotPromoting(), since nothing changed there.
        eventPublisher.publishEvent(new CityNavigationRevisionPromoted(cityId, revisionId));

        return new PromotionReport(revisionId, "PROMOTED", now, areasPromoted, aliasesPromoted, regionsPromoted,
                membershipsPromoted, groupsPromoted, groupMembersPromoted, navigationNodesPromoted, cityActivated,
                false);
    }

    // ── CAS-failure disposition (AC3/AC4) ───────────────────────────────────────────────────────

    private PromotionReport handleNotPromoting(int cityId, long revisionId) {
        CityLaunchRevision revision = revisionRepository.findById(revisionId)
                .filter(r -> Objects.equals(r.getCityId(), cityId))
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "City launch revision not found"));

        if (revision.getLifecycleStatus() == LifecycleStatus.PROMOTED) {
            log.info("City launch idempotent no-op cityId={} revisionId={} promotedAt={}",
                    cityId, revisionId, revision.getPromotedAt());
            return new PromotionReport(revisionId, "PROMOTED", revision.getPromotedAt(),
                    0, 0, 0, 0, 0, 0, 0, false, true);
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT,
                "City launch revision is not promotable (status=" + revision.getLifecycleStatus() + ")");
    }

    // ── Per-table compare-before-write, ascending by natural key ───────────────────────────────

    private int promoteAreas(int cityId, List<SandboxArea> sandboxAreas) {
        int count = 0;
        for (SandboxArea a : sandboxAreas.stream()
                .sorted(Comparator.comparing(SandboxArea::getAreaKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            ExistingArea existing = jdbcOperations.query(
                    "SELECT area_key, city_id, name, district, geo_center_lat, geo_center_lon, min_lat, min_lon, "
                            + "max_lat, max_lon, geometry_source, osm_element_type, osm_element_id, lifecycle_status "
                            + "FROM public.areas WHERE area_key = ? FOR UPDATE",
                    rs -> rs.next() ? new ExistingArea(rs.getString("area_key"), rs.getInt("city_id"),
                            rs.getString("name"), rs.getString("district"),
                            (Double) rs.getObject("geo_center_lat"), (Double) rs.getObject("geo_center_lon"),
                            (Double) rs.getObject("min_lat"), (Double) rs.getObject("min_lon"),
                            (Double) rs.getObject("max_lat"), (Double) rs.getObject("max_lon"),
                            rs.getString("geometry_source"), rs.getString("osm_element_type"),
                            (Long) rs.getObject("osm_element_id"), rs.getString("lifecycle_status"))
                            : null,
                    a.getAreaKey());

            if (existing == null) {
                jdbcOperations.update(
                        "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, "
                                + "geo_center_lon, min_lat, min_lon, max_lat, max_lon, geometry_source, "
                                + "osm_element_type, osm_element_id, lifecycle_status) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        a.getAreaKey(), cityId, a.getName(), a.getDistrict(), a.getGeoCenterLat(), a.getGeoCenterLon(),
                        a.getMinLat(), a.getMinLon(), a.getMaxLat(), a.getMaxLon(), a.getGeometrySource(),
                        a.getOsmElementType(), a.getOsmElementId(), a.getLifecycleStatus());
            } else if (existing.cityId() != cityId
                    || !Objects.equals(existing.name(), a.getName())
                    || !Objects.equals(existing.district(), a.getDistrict())
                    || !Objects.equals(existing.geoCenterLat(), a.getGeoCenterLat())
                    || !Objects.equals(existing.geoCenterLon(), a.getGeoCenterLon())
                    || !Objects.equals(existing.minLat(), a.getMinLat())
                    || !Objects.equals(existing.minLon(), a.getMinLon())
                    || !Objects.equals(existing.maxLat(), a.getMaxLat())
                    || !Objects.equals(existing.maxLon(), a.getMaxLon())
                    || !Objects.equals(existing.geometrySource(), a.getGeometrySource())
                    || !Objects.equals(existing.osmElementType(), a.getOsmElementType())
                    || !Objects.equals(existing.osmElementId(), a.getOsmElementId())
                    || !Objects.equals(existing.lifecycleStatus(), a.getLifecycleStatus())) {
                throw canonicalDrift("areas", a.getAreaKey());
            }
            count++;
        }
        return count;
    }

    private int promoteAliases(int cityId, List<SandboxAreaAlias> sandboxAliases, Map<Long, String> areaKeyBySandboxAreaId) {
        int count = 0;
        for (SandboxAreaAlias al : sandboxAliases.stream()
                .sorted(Comparator.comparing(SandboxAreaAlias::getAliasNormalised,
                        Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            String areaKey = areaKeyBySandboxAreaId.get(al.getSandboxAreaId());
            if (areaKey == null) {
                continue; // unreachable post-prep validation; defensive, mirrors GraphWriter's own guards
            }
            ExistingAlias existing = jdbcOperations.query(
                    "SELECT city_id, area_key, alias, alias_normalised FROM public.area_alias "
                            + "WHERE city_id = ? AND alias_normalised = ? FOR UPDATE",
                    rs -> rs.next() ? new ExistingAlias(rs.getInt("city_id"), rs.getString("area_key"),
                            rs.getString("alias"), rs.getString("alias_normalised")) : null,
                    cityId, al.getAliasNormalised());

            if (existing == null) {
                jdbcOperations.update(
                        "INSERT INTO public.area_alias (city_id, area_key, alias, alias_normalised) "
                                + "VALUES (?, ?, ?, ?)",
                        cityId, areaKey, al.getAlias(), al.getAliasNormalised());
            } else if (!Objects.equals(existing.areaKey(), areaKey) || !Objects.equals(existing.alias(), al.getAlias())) {
                throw canonicalDrift("area_alias", al.getAliasNormalised());
            }
            count++;
        }
        return count;
    }

    private int promoteRegions(int cityId, List<SandboxCityRegion> sandboxRegions) {
        int count = 0;
        for (SandboxCityRegion r : sandboxRegions.stream()
                .sorted(Comparator.comparing(SandboxCityRegion::getRegionKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            ExistingRegion existing = jdbcOperations.query(
                    "SELECT region_key, display_label, display_order, centre_lat, centre_lon, min_lat, min_lon, "
                            + "max_lat, max_lon, policy_fingerprint FROM public.city_regions "
                            + "WHERE city_id = ? AND region_key = ? FOR UPDATE",
                    rs -> rs.next() ? new ExistingRegion(rs.getString("region_key"), rs.getString("display_label"),
                            (Integer) rs.getObject("display_order"), (BigDecimal) rs.getObject("centre_lat"),
                            (BigDecimal) rs.getObject("centre_lon"), (BigDecimal) rs.getObject("min_lat"),
                            (BigDecimal) rs.getObject("min_lon"), (BigDecimal) rs.getObject("max_lat"),
                            (BigDecimal) rs.getObject("max_lon"), rs.getString("policy_fingerprint")) : null,
                    cityId, r.getRegionKey());

            if (existing == null) {
                jdbcOperations.update(
                        "INSERT INTO public.city_regions (city_id, region_key, display_label, display_order, "
                                + "centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon, policy_fingerprint) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        cityId, r.getRegionKey(), r.getDisplayLabel(), r.getDisplayOrder(), r.getCentreLat(),
                        r.getCentreLon(), r.getMinLat(), r.getMinLon(), r.getMaxLat(), r.getMaxLon(),
                        r.getPolicyFingerprint());
            } else if (!Objects.equals(existing.displayLabel(), r.getDisplayLabel())
                    || !Objects.equals(existing.displayOrder(), r.getDisplayOrder())
                    || !bdEquals(existing.centreLat(), r.getCentreLat())
                    || !bdEquals(existing.centreLon(), r.getCentreLon())
                    || !bdEquals(existing.minLat(), r.getMinLat())
                    || !bdEquals(existing.minLon(), r.getMinLon())
                    || !bdEquals(existing.maxLat(), r.getMaxLat())
                    || !bdEquals(existing.maxLon(), r.getMaxLon())
                    || !Objects.equals(existing.policyFingerprint(), r.getPolicyFingerprint())) {
                throw canonicalDrift("city_regions", r.getRegionKey());
            }
            count++;
        }
        return count;
    }

    private int promoteMemberships(int cityId, List<SandboxCityRegionMembership> sandboxMemberships,
                                    Map<Long, String> areaKeyBySandboxAreaId) {
        int count = 0;
        for (SandboxCityRegionMembership m : sandboxMemberships.stream()
                .sorted(Comparator.comparing(
                        (SandboxCityRegionMembership x) -> areaKeyBySandboxAreaId.get(x.getSandboxAreaId()),
                        Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            String areaKey = areaKeyBySandboxAreaId.get(m.getSandboxAreaId());
            if (areaKey == null) {
                continue; // unreachable post-prep validation
            }
            ExistingMembership existing = jdbcOperations.query(
                    "SELECT area_key, region_key, assignment_source FROM public.city_region_memberships "
                            + "WHERE city_id = ? AND area_key = ? FOR UPDATE",
                    rs -> rs.next() ? new ExistingMembership(rs.getString("area_key"), rs.getString("region_key"),
                            rs.getString("assignment_source")) : null,
                    cityId, areaKey);

            String assignmentSource = m.getAssignmentSource() == null ? null : m.getAssignmentSource().name();
            if (existing == null) {
                jdbcOperations.update(
                        "INSERT INTO public.city_region_memberships (city_id, area_key, region_key, "
                                + "assignment_source) VALUES (?, ?, ?, ?)",
                        cityId, areaKey, m.getRegionKey(), assignmentSource);
            } else if (!Objects.equals(existing.regionKey(), m.getRegionKey())
                    || !Objects.equals(existing.assignmentSource(), assignmentSource)) {
                throw canonicalDrift("city_region_memberships", areaKey);
            }
            count++;
        }
        return count;
    }

    private int promoteGroups(int cityId, List<SandboxAreaGroup> sandboxGroups) {
        int count = 0;
        for (SandboxAreaGroup g : sandboxGroups.stream()
                .sorted(Comparator.comparing(SandboxAreaGroup::getSlug, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            ExistingGroup existing = jdbcOperations.query(
                    "SELECT id, slug, name, subtitle, region_label, display_order, is_active, focus_lat, "
                            + "focus_lon, min_lat, min_lon, max_lat, max_lon FROM public.area_groups "
                            + "WHERE city_id = ? AND slug = ? FOR UPDATE",
                    rs -> rs.next() ? new ExistingGroup(rs.getInt("id"), rs.getString("slug"), rs.getString("name"),
                            rs.getString("subtitle"), rs.getString("region_label"),
                            (Integer) rs.getObject("display_order"), rs.getBoolean("is_active"),
                            (Double) rs.getObject("focus_lat"), (Double) rs.getObject("focus_lon"),
                            (Double) rs.getObject("min_lat"), (Double) rs.getObject("min_lon"),
                            (Double) rs.getObject("max_lat"), (Double) rs.getObject("max_lon")) : null,
                    cityId, g.getSlug());

            if (existing == null) {
                jdbcOperations.update(
                        "INSERT INTO public.area_groups (city_id, slug, name, subtitle, region_label, "
                                + "display_order, is_active, focus_lat, focus_lon, min_lat, min_lon, max_lat, "
                                + "max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        cityId, g.getSlug(), g.getName(), g.getSubtitle(), g.getRegionLabel(), g.getDisplayOrder(),
                        g.isActive(), g.getFocusLat(), g.getFocusLon(), g.getMinLat(), g.getMinLon(), g.getMaxLat(),
                        g.getMaxLon());
            } else if (!Objects.equals(existing.name(), g.getName())
                    || !Objects.equals(existing.subtitle(), g.getSubtitle())
                    || !Objects.equals(existing.regionLabel(), g.getRegionLabel())
                    || !Objects.equals(existing.displayOrder(), g.getDisplayOrder())
                    || existing.active() != g.isActive()
                    || !Objects.equals(existing.focusLat(), g.getFocusLat())
                    || !Objects.equals(existing.focusLon(), g.getFocusLon())
                    || !Objects.equals(existing.minLat(), g.getMinLat())
                    || !Objects.equals(existing.minLon(), g.getMinLon())
                    || !Objects.equals(existing.maxLat(), g.getMaxLat())
                    || !Objects.equals(existing.maxLon(), g.getMaxLon())) {
                throw canonicalDrift("area_groups", g.getSlug());
            }
            count++;
        }
        return count;
    }

    private int promoteGroupMembers(int cityId, List<SandboxAreaGroupMember> sandboxGroupMembers,
                                     Map<Long, String> groupSlugBySandboxGroupId, Map<Long, String> areaKeyBySandboxAreaId) {
        int count = 0;
        for (SandboxAreaGroupMember gm : sandboxGroupMembers.stream()
                .sorted(Comparator
                        .comparing((SandboxAreaGroupMember x) -> groupSlugBySandboxGroupId.get(x.getSandboxAreaGroupId()),
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(x -> areaKeyBySandboxAreaId.get(x.getSandboxAreaId()),
                                Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            String groupSlug = groupSlugBySandboxGroupId.get(gm.getSandboxAreaGroupId());
            String areaKey = areaKeyBySandboxAreaId.get(gm.getSandboxAreaId());
            if (groupSlug == null || areaKey == null) {
                continue; // unreachable post-prep validation
            }
            Integer productionGroupId = jdbcOperations.query(
                    "SELECT id FROM public.area_groups WHERE city_id = ? AND slug = ?",
                    rs -> rs.next() ? rs.getInt("id") : null, cityId, groupSlug);
            if (productionGroupId == null) {
                // Unreachable: promoteGroups() runs before this and either inserted or verified this
                // exact slug already exists for this city.
                throw new IllegalStateException(
                        "area_group slug=" + groupSlug + " missing in production after promoteGroups() "
                                + "(unreachable) cityId=" + cityId);
            }

            ExistingGroupMember existing = jdbcOperations.query(
                    "SELECT area_group_id, area_key, display_order FROM public.area_group_members "
                            + "WHERE area_group_id = ? AND area_key = ? FOR UPDATE",
                    rs -> rs.next() ? new ExistingGroupMember(rs.getInt("area_group_id"), rs.getString("area_key"),
                            (Integer) rs.getObject("display_order")) : null,
                    productionGroupId, areaKey);

            if (existing == null) {
                jdbcOperations.update(
                        "INSERT INTO public.area_group_members (area_group_id, area_key, display_order) "
                                + "VALUES (?, ?, ?)",
                        productionGroupId, areaKey, gm.getDisplayOrder());
            } else if (!Objects.equals(existing.displayOrder(), gm.getDisplayOrder())) {
                throw canonicalDrift("area_group_members", groupSlug + "/" + areaKey);
            }
            count++;
        }
        return count;
    }

    /**
     * SEVENTH table, LAST in lock order (#1955 Areas PR A, SLICE 2c): {@code navigation_nodes.area_key}
     * FKs {@code public.areas}, promoted FIRST above, so every AREA node's referenced area is
     * guaranteed to already exist in production by the time this runs.
     *
     * <p><b>REPLACE-discipline, not compare-before-write.</b> The six tables above compare each
     * sandbox row against any pre-existing production row sharing its natural key and reject on
     * drift, which works because their natural keys (area_key, alias_normalised, region_key, slug,
     * ...) are geography identities that stay stable across revisions. A navigation tree's CLUSTER
     * shape is different: a re-launch of the SAME city may legitimately re-partition into a
     * different set of {@code node_key}s (the clustering policy or input geometry changed), so
     * there is no stable natural key to compare-before-write against. Clearing every prior
     * production row for this city before inserting the new revision's tree is therefore required
     * — it is also what keeps the partial unique index {@code uq_navigation_nodes_city_area
     * (city_id, area_key WHERE node_type='AREA')} from ever seeing a stale prior-revision AREA leaf
     * collide with this revision's leaf for the same area.
     *
     * <p><b>Verbatim copy, never regenerated.</b> Every column is carried across unchanged except
     * {@code parent_node_id}, which is remapped from the sandbox row's surrogate id to the newly
     * INSERTed production surrogate id via a {@code node_key}-keyed map built incrementally as rows
     * are inserted in depth-ascending order (a node's parent always has a strictly smaller depth,
     * so its production id is always already known). {@code ancestor_keys} are copied VERBATIM
     * (they are already {@code node_key}s, not surrogate ids — no remap needed).
     */
    private int promoteNavigationNodes(int cityId, List<SandboxNavigationNode> sandboxNodes) {
        navigationNodeRepository.deleteByCityId(cityId);

        Map<Long, Long> productionIdBySandboxId = new HashMap<>();
        int count = 0;
        for (SandboxNavigationNode n : sandboxNodes.stream()
                .sorted(Comparator.comparing(SandboxNavigationNode::getDepth)
                        .thenComparing(SandboxNavigationNode::getDisplayOrder,
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(SandboxNavigationNode::getNodeKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList()) {
            Long parentProductionId = null;
            if (n.getParentNodeId() != null) {
                parentProductionId = productionIdBySandboxId.get(n.getParentNodeId());
                if (parentProductionId == null) {
                    // Unreachable given depth-ascending insertion order: every node's parent has a
                    // strictly smaller depth and was therefore already inserted (and mapped) in an
                    // earlier iteration of this same loop.
                    throw new IllegalStateException(
                            "navigation node parent sandboxId=" + n.getParentNodeId() + " not yet promoted "
                                    + "(unreachable: depth-ascending insertion order) cityId=" + cityId);
                }
            }

            NavigationNode saved = navigationNodeRepository.save(new NavigationNode(
                    cityId, n.getRegionKey(), n.getNodeType(), parentProductionId, n.getNodeKey(), n.getAreaKey(),
                    n.getRepresentativeAreaKeys(), n.getDisplayLabel(), n.getDisplayOrder(), n.getDepth(),
                    n.getAncestorKeys(), n.getDescendantAreaCount(), n.getCentreLat(), n.getCentreLon(),
                    n.getMinLat(), n.getMinLon(), n.getMaxLat(), n.getMaxLon(), n.getBearingDegrees(),
                    n.getPolicyFingerprint(), n.getGeneratedAt()));
            productionIdBySandboxId.put(n.getId(), saved.getId());
            count++;
        }
        return count;
    }

    private static boolean bdEquals(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) {
            return a == b;
        }
        return a.compareTo(b) == 0;
    }

    private static ResponseStatusException canonicalDrift(String table, String key) {
        return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                "Canonical drift detected in " + table + " at key=" + key
                        + " — an existing production row differs from the sandbox snapshot; refusing to "
                        + "overwrite, zero writes performed");
    }

    // ── Existing-production-row read models (compare-before-write) ─────────────────────────────

    private record ExistingArea(
            String areaKey, int cityId, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String osmElementType, Long osmElementId, String lifecycleStatus) {}

    private record ExistingAlias(int cityId, String areaKey, String alias, String aliasNormalised) {}

    private record ExistingRegion(
            String regionKey, String displayLabel, Integer displayOrder,
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
            String policyFingerprint) {}

    private record ExistingMembership(String areaKey, String regionKey, String assignmentSource) {}

    private record ExistingGroup(
            int id, String slug, String name, String subtitle, String regionLabel, Integer displayOrder,
            boolean active, Double focusLat, Double focusLon, Double minLat, Double minLon, Double maxLat,
            Double maxLon) {}

    private record ExistingGroupMember(int areaGroupId, String areaKey, Integer displayOrder) {}
}
