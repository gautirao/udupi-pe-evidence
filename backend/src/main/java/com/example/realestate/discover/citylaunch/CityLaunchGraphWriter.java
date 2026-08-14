package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.AgriDestinationClassificationGenerator;
import com.example.realestate.discover.navigation.NavigationPolicyReader;
import com.example.realestate.discover.navigation.NavigationTreeGenerationService;
import com.example.realestate.discover.navigation.NavigationTreeValidationException;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverride;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Lazy;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.example.realestate.discover.citylaunch.config.CityLaunchAsyncConfig.EXECUTOR_NAME;

/**
 * Background offline-prep pipeline: reads a city's canonical geography and writes it into the
 * {@code sandbox_*} graph for one {@link CityLaunchRevision} (#1911 PR2).
 *
 * <p>A SEPARATE bean from {@link CityLaunchPreparationService} on purpose — {@code @Async}
 * self-invocation (calling an {@code @Async} method on {@code this} from within the same bean) is
 * a documented Spring AOP proxy limitation and silently runs synchronously. Injecting this bean
 * into {@link CityLaunchPreparationService} and calling through the injected reference goes
 * through the real proxy, so {@link #writeGraphAsync} genuinely dispatches to
 * {@value CityLaunchAsyncConfig#EXECUTOR_NAME}.
 *
 * <h3>Failure isolation</h3>
 * {@link #writeGraphAsync} wraps the entire graph write in try/catch. On ANY exception —
 * validation failure (AC4, thrown before any INSERT) or a mid-write DB constraint violation — the
 * {@code @Transactional} {@link #writeGraphTransactional} rolls back, leaving ZERO sandbox rows
 * for the revision. {@link #markFailed} then runs in a SEPARATE
 * {@code @Transactional(propagation = REQUIRES_NEW)} transaction to record the FAILED state; if
 * this were not REQUIRES_NEW it would roll back together with the graph-write transaction and the
 * FAILED marker would be lost, leaving the revision stuck in PREPARING forever.
 */
@Component
public class CityLaunchGraphWriter {

    private static final Logger log = LoggerFactory.getLogger(CityLaunchGraphWriter.class);

    private final CityLaunchRevisionRepository revisionRepository;
    private final CanonicalGeographyReader geographyReader;
    private final SandboxAreaRepository sandboxAreaRepository;
    private final SandboxAreaAliasRepository sandboxAreaAliasRepository;
    private final SandboxCityRegionRepository sandboxCityRegionRepository;
    private final SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    private final SandboxAreaGroupRepository sandboxAreaGroupRepository;
    private final SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    private final NavigationPolicyReader navigationPolicyReader;
    private final NavigationTreeGenerationService navigationTreeGenerationService;
    private final SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    private final SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository;
    private final AgriDestinationClassificationGenerator agriDestinationClassificationGenerator;
    private final JdbcOperations jdbcOperations;
    private final CityLaunchSseService sseService;

    /**
     * Self-reference to the Spring-proxied instance of this very bean, injected lazily.
     *
     * <p>{@link #writeGraphAsync} must invoke {@link #writeGraphTransactional} THROUGH the proxy
     * (via {@code self.writeGraphTransactional(...)}), never via a bare {@code this.} call —
     * {@code @Transactional} advice is proxy-based, so a same-class ("self-invocation") call
     * bypasses the interceptor entirely and the method would silently run with NO transaction,
     * defeating the "mid-write failure rolls back to zero rows" guarantee. {@code @Lazy} breaks
     * the constructor circular-dependency this self-injection would otherwise create.
     */
    private final CityLaunchGraphWriter self;

    public CityLaunchGraphWriter(
            CityLaunchRevisionRepository revisionRepository,
            CanonicalGeographyReader geographyReader,
            SandboxAreaRepository sandboxAreaRepository,
            SandboxAreaAliasRepository sandboxAreaAliasRepository,
            SandboxCityRegionRepository sandboxCityRegionRepository,
            SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository,
            SandboxAreaGroupRepository sandboxAreaGroupRepository,
            SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository,
            NavigationPolicyReader navigationPolicyReader,
            NavigationTreeGenerationService navigationTreeGenerationService,
            SandboxNavigationNodeRepository sandboxNavigationNodeRepository,
            SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository,
            AgriDestinationClassificationGenerator agriDestinationClassificationGenerator,
            JdbcOperations jdbcOperations,
            CityLaunchSseService sseService,
            @Lazy CityLaunchGraphWriter self) {
        this.revisionRepository = revisionRepository;
        this.geographyReader = geographyReader;
        this.sandboxAreaRepository = sandboxAreaRepository;
        this.sandboxAreaAliasRepository = sandboxAreaAliasRepository;
        this.sandboxCityRegionRepository = sandboxCityRegionRepository;
        this.sandboxCityRegionMembershipRepository = sandboxCityRegionMembershipRepository;
        this.sandboxAreaGroupRepository = sandboxAreaGroupRepository;
        this.sandboxAreaGroupMemberRepository = sandboxAreaGroupMemberRepository;
        this.navigationPolicyReader = navigationPolicyReader;
        this.navigationTreeGenerationService = navigationTreeGenerationService;
        this.sandboxNavigationNodeRepository = sandboxNavigationNodeRepository;
        this.sandboxNavigationOverrideRepository = sandboxNavigationOverrideRepository;
        this.agriDestinationClassificationGenerator = agriDestinationClassificationGenerator;
        this.jdbcOperations = jdbcOperations;
        this.sseService = sseService;
        this.self = self;
    }

    /**
     * Entry point invoked by {@link CityLaunchPreparationService} AFTER the admission transaction
     * has committed (via a {@code TransactionSynchronization#afterCommit} callback), so the
     * revision row created by admission is guaranteed visible to this method's own transaction —
     * no cross-thread visibility race against an uncommitted admission write.
     */
    @Async(EXECUTOR_NAME)
    public void writeGraphAsync(Long revisionId, Integer cityId) {
        short[] stageReached = {0};
        try {
            self.writeGraphTransactional(revisionId, cityId, stageReached);
        } catch (Exception e) {
            log.error("City launch graph write failed revisionId={} cityId={} stageReached={}",
                    revisionId, cityId, stageReached[0], e);
            self.markFailed(revisionId, sanitizedFailureReason(e), stageReached[0]);
        }
    }

    /**
     * Loads canonical geography, validates it UP FRONT (AC4 — before any INSERT), then writes the
     * six sandbox tables in FK-safe order: areas -> aliases -> city_regions -> memberships ->
     * area_groups -> group_members, advancing {@code prep_stage} 1..6 as each stage completes.
     * {@code stageReached} is a plain in-memory (non-persisted) marker so a caught exception can
     * report how far the write got even though the DB transaction itself rolls back.
     */
    @Transactional
    public void writeGraphTransactional(Long revisionId, Integer cityId, short[] stageReached) {
        CityLaunchRevision revision = revisionRepository.findByIdForUpdate(revisionId)
                .orElseThrow(() -> new IllegalStateException("Revision not found: " + revisionId));

        CanonicalGeographyReader.CanonicalGeography geography = geographyReader.loadGeography(cityId);
        CityOrigin origin = loadCityOrigin(cityId);
        validate(geography, origin);

        Map<String, Long> sandboxAreaIdByKey = new HashMap<>();
        List<SandboxArea> savedAreas = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalArea area : geography.areas()) {
            SandboxArea saved = sandboxAreaRepository.save(new SandboxArea(
                    revisionId, area.areaKey(), area.name(), area.district(),
                    area.geoCenterLat(), area.geoCenterLon(),
                    area.minLat(), area.minLon(), area.maxLat(), area.maxLon(),
                    area.geometrySource(), area.osmElementType(), area.osmElementId(),
                    area.lifecycleStatus()));
            sandboxAreaIdByKey.put(area.areaKey(), saved.getId());
            savedAreas.add(saved);
        }
        revision.setPrepStage((short) 1);
        stageReached[0] = 1;
        sseService.emitProgress(revision);

        List<SandboxAreaAlias> savedAliases = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalAreaAlias alias : geography.aliases()) {
            Long sandboxAreaId = sandboxAreaIdByKey.get(alias.areaKey());
            if (sandboxAreaId == null) {
                continue; // unreachable post-validate(); defensive against a future validate() gap
            }
            savedAliases.add(sandboxAreaAliasRepository.save(new SandboxAreaAlias(
                    revisionId, sandboxAreaId, alias.alias(), alias.aliasNormalised())));
        }
        revision.setPrepStage((short) 2);
        stageReached[0] = 2;
        sseService.emitProgress(revision);

        List<SandboxCityRegion> savedRegions = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalCityRegion region : geography.regions()) {
            savedRegions.add(sandboxCityRegionRepository.save(new SandboxCityRegion(
                    revisionId, region.regionKey(), region.displayLabel(), region.displayOrder(),
                    region.centreLat(), region.centreLon(),
                    region.minLat(), region.minLon(), region.maxLat(), region.maxLon(),
                    region.policyFingerprint())));
        }
        revision.setPrepStage((short) 3);
        stageReached[0] = 3;
        sseService.emitProgress(revision);

        List<SandboxCityRegionMembership> savedMemberships = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalCityRegionMembership membership : geography.memberships()) {
            Long sandboxAreaId = sandboxAreaIdByKey.get(membership.areaKey());
            if (sandboxAreaId == null) {
                continue; // unreachable post-validate()
            }
            savedMemberships.add(sandboxCityRegionMembershipRepository.save(new SandboxCityRegionMembership(
                    revisionId, sandboxAreaId, membership.regionKey(),
                    AssignmentSource.valueOf(membership.assignmentSource()))));
        }
        revision.setPrepStage((short) 4);
        stageReached[0] = 4;
        sseService.emitProgress(revision);

        Map<String, Long> sandboxGroupIdBySlug = new HashMap<>();
        List<SandboxAreaGroup> savedGroups = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalAreaGroup group : geography.groups()) {
            SandboxAreaGroup saved = sandboxAreaGroupRepository.save(new SandboxAreaGroup(
                    revisionId, group.slug(), group.name(), group.subtitle(), group.regionLabel(),
                    group.displayOrder(), group.active(),
                    group.focusLat(), group.focusLon(),
                    group.minLat(), group.minLon(), group.maxLat(), group.maxLon()));
            sandboxGroupIdBySlug.put(group.slug(), saved.getId());
            savedGroups.add(saved);
        }
        revision.setPrepStage((short) 5);
        stageReached[0] = 5;
        sseService.emitProgress(revision);

        List<SandboxAreaGroupMember> savedGroupMembers = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalAreaGroupMember member : geography.groupMembers()) {
            Long sandboxGroupId = sandboxGroupIdBySlug.get(member.groupSlug());
            Long sandboxAreaId = sandboxAreaIdByKey.get(member.areaKey());
            if (sandboxGroupId == null || sandboxAreaId == null) {
                continue; // unreachable post-validate()
            }
            savedGroupMembers.add(sandboxAreaGroupMemberRepository.save(new SandboxAreaGroupMember(
                    revisionId, sandboxGroupId, sandboxAreaId, member.displayOrder())));
        }
        revision.setPrepStage((short) 6);
        stageReached[0] = 6;
        sseService.emitProgress(revision);

        // #1955 Areas PR A, SLICE 2e (AC5): close the 2c integration seam by generating the
        // navigation tree as part of prepare, BEFORE the checksum anchor below — so a PREPARED
        // revision's persisted_revision_checksum already covers sandbox_navigation_nodes via the
        // SAME seven-arg RevisionChecksum overload CityLaunchPromotionService recomputes at launch.
        //
        // Precondition-gated (not exception-swallowed): generation only runs when this city has a
        // city_region_policy row (V121 seeds one for every pre-existing row, but a city onboarded
        // before that migration, or a test fixture that only inserts `cities`, legitimately has
        // none). Without a policy row, this stays a genuine zero-row no-op — the SAME outcome as
        // before this slice — rather than failing the entire six-table geography prep on a
        // navigation-tree concern. When a policy row IS present and generation genuinely fails
        // validation, that exception propagates and fails prepare, exactly like every other
        // pre-INSERT validation failure in this method.
        List<SandboxNavigationNode> savedNavigationNodes;
        if (navigationPolicyReader.findPolicy(cityId).isPresent()) {
            navigationTreeGenerationService.generateAndStoreForRevision(revisionId, cityId, Instant.now());
            savedNavigationNodes = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        } else {
            log.info("CityLaunchGraphWriter: no city_region_policy row for cityId={} — skipping "
                            + "navigation-tree generation for revisionId={} (#1955 Areas PR A, best-effort "
                            + "at this integration seam)",
                    cityId, revisionId);
            savedNavigationNodes = List.of();
        }

        // #2151 PR A (decision.d2): Agri destination classification generation, as the pipeline's
        // 8th step — the AC3 hard precondition (origin non-null/non-zero) was already enforced in
        // validate() above, BEFORE any sandbox row (of any of the now-nine tables) was written, so
        // origin.lat()/origin.lon() are guaranteed safe to pass through here. Unlike the
        // navigation-tree generation above, this step is unconditional (no city_region_policy
        // precondition) — every city with valid geography gets an Agri classification.
        //
        // Correctness fix: passes `savedAreas` — the SAME sandbox_areas rows just persisted above
        // from `geography.areas()` — rather than letting the generator issue its own fresh
        // `SELECT ... FROM public.areas`. Two separate statements against a mutable production
        // table inside one @Transactional method are NOT guaranteed the same PostgreSQL READ
        // COMMITTED snapshot; a concurrent area status/coordinate change landing between the two
        // reads could previously make sandbox_areas and sandbox_agri_destination_classification
        // disagree about the same area for the SAME revision, silently poisoning the checksum. See
        // AgriDestinationClassificationGenerator's class javadoc "Snapshot consistency".
        List<SandboxAgriDestinationClassification> savedAgriDestinations =
                agriDestinationClassificationGenerator.generateAndStoreForRevision(
                        revisionId, savedAreas, origin.lat(), origin.lon(), Instant.now());

        // #1911 PR5 / #1955 Areas PR A SLICE 2e/2f+2g / #2151 PR A: compute + persist the "before"
        // checksum anchor over the row set just written (now nine tables), via the SAME
        // RevisionChecksum routine CityLaunchPromotionService recomputes at launch time — a match
        // is guaranteed by construction in the happy path; a mismatch at launch means genuine
        // out-of-band sandbox mutation between prep completion and promotion. No override row can
        // exist yet at this point (this revision was just created earlier in this same request), so
        // this list is always empty here — read via the repository anyway so there is exactly ONE
        // checksum call shape used everywhere (here, the override endpoints, and
        // CityLaunchPromotionService).
        List<SandboxNavigationOverride> savedOverrides =
                sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId);
        revision.setPersistedRevisionChecksum(RevisionChecksum.compute(
                savedAreas, savedAliases, savedRegions, savedMemberships, savedGroups, savedGroupMembers,
                savedNavigationNodes, savedOverrides, savedAgriDestinations));

        revision.setLifecycleStatus(LifecycleStatus.PREPARED);
        revision.setPrepState(PrepState.DONE);
        revision.setPreparedAt(Instant.now());
        emitTerminalProgressAfterCommit(revision);
    }

    /** City geo-center origin, as read directly from {@code public.cities} — see {@link
     *  #loadCityOrigin}. {@code lat}/{@code lon} are {@code null} when the column itself is NULL,
     *  distinct from a legitimate 0.0 coordinate, so {@link #validate} can reject both cases (AC3). */
    private record CityOrigin(Double lat, Double lon) {}

    /**
     * Reads {@code cities.geo_center_lat}/{@code geo_center_lon} directly (not via {@link
     * CanonicalGeographyReader}, which does not currently expose the city's own origin — only its
     * areas/regions/groups) so {@link #validate} can enforce the AC3 hard precondition BEFORE any
     * sandbox row is written. Uses {@code rs.getObject(...)} (never {@code rs.getDouble(...)}) so a
     * NULL column is preserved as Java {@code null} rather than silently coerced to {@code 0.0} —
     * the exact hazard #2151 finding F1 documents in {@code RegionalClassificationBackfillService}.
     * Widens via {@link CanonicalGeographyReader}'s {@code nullableDouble} pattern ({@code (Number)}
     * then {@code .doubleValue()}, never a hard {@code (Double)} cast) so a future {@code NUMERIC}
     * migration on this column family — which the driver would surface as {@code BigDecimal} —
     * cannot throw a {@code ClassCastException} here (correction pass finding #7).
     */
    private CityOrigin loadCityOrigin(Integer cityId) {
        return jdbcOperations.query(
                "SELECT geo_center_lat, geo_center_lon FROM public.cities WHERE id = ?",
                rs -> rs.next()
                        ? new CityOrigin(nullableDouble(rs.getObject("geo_center_lat")),
                                nullableDouble(rs.getObject("geo_center_lon")))
                        : new CityOrigin(null, null),
                cityId);
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    /**
     * AC4: mandatory identifier validation, run BEFORE any sandbox_* INSERT.
     *
     * <p>{@code public.areas.lifecycle_status} (V116) is read by {@link CanonicalGeographyReader}
     * and carried through to {@link CanonicalGeographyReader.CanonicalArea#lifecycleStatus()} — the
     * "ACTIVE area" AC4 requires is a SOURCE-truth check against that value, not a check against
     * every loaded area row (which would be trivially satisfied even by a city whose areas are all
     * MERGED/INACTIVE, since {@link SandboxArea} no longer defaults to ACTIVE).
     *
     * <p>#2151 PR A AC3: also enforces a HARD precondition — never a silent no-op — that the city's
     * configured origin ({@code geo_center_lat}/{@code geo_center_lon}) is present and non-zero,
     * BEFORE any sandbox row (of any of the nine tables, including {@code sandbox_areas} itself) is
     * written. This closes finding F1: {@code rs.getDouble()} silently turning a NULL origin into
     * {@code 0.0} (a plausible-but-wrong Gulf-of-Guinea origin) would otherwise let Agri destination
     * generation run to completion on a meaningless origin and REACH a PREPARED revision.
     */
    private void validate(CanonicalGeographyReader.CanonicalGeography geography, CityOrigin origin) {
        if (origin.lat() == null || origin.lon() == null || origin.lat() == 0.0 || origin.lon() == 0.0) {
            throw new GeographyValidationException(
                    "City is missing a configured geo_center_lat/geo_center_lon origin — cannot generate "
                            + "Agri destination classification (#2151 AC3)");
        }
        if (geography.areas().isEmpty()) {
            throw new GeographyValidationException("City has zero ACTIVE areas");
        }
        boolean hasActiveArea = geography.areas().stream()
                .anyMatch(area -> "ACTIVE".equals(area.lifecycleStatus()));
        if (!hasActiveArea) {
            throw new GeographyValidationException("City has zero ACTIVE areas");
        }
        Set<String> areaKeys = new HashSet<>();
        for (CanonicalGeographyReader.CanonicalArea area : geography.areas()) {
            if (area.areaKey() == null || area.areaKey().isBlank()) {
                throw new GeographyValidationException("An area is missing its area_key");
            }
            if (area.geoCenterLat() == null || area.geoCenterLon() == null) {
                throw new GeographyValidationException(
                        "Area " + area.areaKey() + " is missing its interior point (geo_center_lat/lon)");
            }
            areaKeys.add(area.areaKey());
        }

        if (geography.regions().isEmpty()) {
            throw new GeographyValidationException("City has zero city_regions rows");
        }
        Set<String> regionKeys = new HashSet<>();
        for (CanonicalGeographyReader.CanonicalCityRegion region : geography.regions()) {
            regionKeys.add(region.regionKey());
        }

        for (CanonicalGeographyReader.CanonicalCityRegionMembership membership : geography.memberships()) {
            if (!areaKeys.contains(membership.areaKey())) {
                throw new GeographyValidationException(
                        "city_region_memberships references unknown area_key " + membership.areaKey());
            }
            if (!regionKeys.contains(membership.regionKey())) {
                throw new GeographyValidationException(
                        "city_region_memberships references unknown region_key " + membership.regionKey());
            }
        }

        for (CanonicalGeographyReader.CanonicalAreaGroupMember member : geography.groupMembers()) {
            if (!areaKeys.contains(member.areaKey())) {
                throw new GeographyValidationException(
                        "area_group_members references unknown area_key " + member.areaKey());
            }
        }
    }

    /**
     * Records a FAILED revision in its OWN transaction, independent of (and after) the rolled-back
     * graph-write transaction. Public + REQUIRES_NEW so a caller (either this class's own
     * {@link #writeGraphAsync} catch block, or {@link CityLaunchPreparationService} reacting to a
     * saturated executor rejection) can mark FAILED even when the graph-write transaction never
     * started or already rolled back.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long revisionId, String reason, short stageReached) {
        revisionRepository.findByIdForUpdate(revisionId).ifPresentOrElse(revision -> {
            revision.setLifecycleStatus(LifecycleStatus.FAILED);
            revision.setPrepState(PrepState.FAILED);
            revision.setFailureReason(reason);
            revision.setPrepStage(stageReached);
            emitTerminalProgressAfterCommit(revision);
        }, () -> log.warn("markFailed: revision {} not found (already deleted?)", revisionId));
    }

    private void emitTerminalProgressAfterCommit(CityLaunchRevision revision) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    sseService.emitProgress(revision);
                }
            });
        } else {
            sseService.emitProgress(revision);
        }
    }

    // Never leaks the raw exception class name / message to a persisted column that a preview UI
    // might render verbatim — keeps failure_reason short and free of stack-trace-shaped text. The
    // raw exception (class name, message, stack trace) is still available server-side via the
    // log.error(...) call in writeGraphAsync's catch block, which logs it before this method runs.
    private static String sanitizedFailureReason(Exception e) {
        if (e instanceof GeographyValidationException) {
            return "Geography validation failed: " + e.getMessage();
        }
        if (e instanceof NavigationTreeValidationException) {
            // #1955 Areas PR A, SLICE 2e — generation only runs when a city_region_policy row is
            // present (see writeGraphTransactional), so this is a genuine tree-shape problem, not a
            // missing-policy no-op.
            return "Navigation tree validation failed";
        }
        return "City launch graph write failed";
    }
}
