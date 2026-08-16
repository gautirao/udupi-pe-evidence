package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.SandboxArea;
import com.example.realestate.discover.citylaunch.SandboxCityRegion;
import com.example.realestate.discover.citylaunch.SandboxCityRegionMembership;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Orchestrates one revision's navigation-tree generation: consumes the CAPTURED revision geography
 * ({@link SandboxArea}/{@link SandboxCityRegion}/{@link SandboxCityRegionMembership} lists the
 * caller already read/persisted for this revision) + {@code city_region_policy} knobs ({@link
 * NavigationPolicyReader}), runs {@link NavigationTreeGenerator} (D4), validates the result with
 * {@link NavigationTreeValidationService} (AC7 — a superset of the V121 DB constraints, checked
 * BEFORE any write), and only then persists via {@link NavigationTreeSandboxWriter}. A failing
 * validation throws {@link NavigationTreeValidationException} and writes NOTHING.
 *
 * <h2>Snapshot consistency (correctness fix, #2157)</h2>
 * This service deliberately does NOT read canonical geography itself. It used to — via a
 * city-lookup + geography-load pair of reads against production {@code public.cities}/{@code
 * areas}/{@code city_regions}/{@code city_region_memberships} — but under PostgreSQL READ COMMITTED,
 * being inside the same {@code @Transactional} method as the caller's own geography read does NOT
 * guarantee the same snapshot: each statement takes its own snapshot, so a second, independent read
 * here could observe a DIFFERENT snapshot of {@code public.areas}/{@code city_regions}/{@code
 * city_region_memberships} than the one already written into {@code sandbox_areas}/{@code
 * sandbox_city_regions}/{@code sandbox_city_region_memberships} for this revision. That would let
 * {@code sandbox_navigation_nodes} disagree with its own revision's sandbox geography, and the
 * checksum computed over both would bind that inconsistent pair undetected. Consuming the
 * ALREADY-CAPTURED sandbox lists the caller passes in closes that gap — there is only ever ONE read
 * of geometry per revision, mirroring {@code AgriDestinationClassificationGenerator} (#2151 PR A).
 *
 * <p>Reads geometry ONLY — never {@code property_listings} — and never touches production {@code
 * navigation_nodes} or any promotion path; those are later, separately-scoped #1955 slices. Not
 * wired into {@code CityLaunchPreparationService}'s prepare flow — that wiring, if any, belongs to
 * a future slice.
 */
@Service
public class NavigationTreeGenerationService {

    private static final Logger log = LoggerFactory.getLogger(NavigationTreeGenerationService.class);

    private final NavigationPolicyReader policyReader;
    private final NavigationTreeGenerator generator;
    private final NavigationTreeValidationService validationService;
    private final NavigationTreeSandboxWriter sandboxWriter;
    private final NavigationTreeOverrideApplier overrideApplier;
    private final SandboxNavigationOverrideRepository overrideRepository;

    public NavigationTreeGenerationService(
            NavigationPolicyReader policyReader,
            NavigationTreeGenerator generator, NavigationTreeValidationService validationService,
            NavigationTreeSandboxWriter sandboxWriter, NavigationTreeOverrideApplier overrideApplier,
            SandboxNavigationOverrideRepository overrideRepository) {
        this.policyReader = policyReader;
        this.generator = generator;
        this.validationService = validationService;
        this.sandboxWriter = sandboxWriter;
        this.overrideApplier = overrideApplier;
        this.overrideRepository = overrideRepository;
    }

    /**
     * Generates (or REGENERATES — see {@link NavigationTreeSandboxWriter#persist}'s
     * replace-discipline) one revision's navigation tree.
     *
     * <p>#1955 Areas PR A, SLICE 2f+2g: OVERRIDE-AWARE by construction — every call loads this
     * revision's {@code sandbox_navigation_override} rows (via {@link
     * SandboxNavigationOverrideRepository#findByRevisionIdOrderByApplyOrderAsc}) and replays them
     * as deterministic generation inputs through {@link NavigationTreeOverrideApplier}, in the
     * FIXED canonical order: EXCLUDE_AREA + REASSIGN_AREA_REGION pre-bisection (mutating region
     * membership before {@link NavigationTreeGenerator} runs), then MOVE_AREA +
     * RELABEL/SET_REPRESENTATIVES post-bisection (mutating the generated tree). An empty override
     * list (every pre-#1955-SLICE-2f revision, and the very first generation of any new revision)
     * is a no-op at both applier phases, so this method's behaviour for a revision with zero
     * overrides is UNCHANGED from before this slice — the same call from {@link
     * com.example.realestate.discover.citylaunch.CityLaunchGraphWriter}'s initial prepare path
     * needs no separate override-unaware variant.
     */
    @Transactional
    public List<Long> generateAndStoreForRevision(
            Long revisionId, Integer cityId, String citySlug,
            List<SandboxArea> areas, List<SandboxCityRegion> regions,
            List<SandboxCityRegionMembership> memberships, Instant generatedAt) {
        NavigationPolicyReader.CityRegionPolicyRow policyRow = policyReader.findPolicy(cityId)
                .orElseThrow(() -> new IllegalStateException(
                        "No city_region_policy row for city_id=" + cityId + " — cannot generate a navigation tree"));

        // #2086 code-review fix: areaByKey is LOOKUP-ONLY (areaByKey.get(...) below) — its iteration
        // order is never observed, so it carries no determinism obligation of its own. Determinism
        // rests entirely on NavigationTreeGenerator's own sorts (generateRegion:183-185,
        // generateCity:126-129); do NOT add a `.values()`/entrySet() iteration over this map without
        // re-establishing an explicit sort first.
        Map<String, SandboxArea> areaByKey = areas.stream()
                .collect(Collectors.toMap(SandboxArea::getAreaKey, a -> a, (a, b) -> a));

        // #2157: SandboxCityRegionMembership stores sandbox_area_id (an FK to SandboxArea.getId()),
        // NOT area_key — unlike CanonicalCityRegionMembership, which carries area_key directly. Build
        // the sandbox_area_id -> area_key join ONCE, up front (mirroring the sandboxAreaIdByKey map
        // CityLaunchGraphWriter builds while WRITING these same rows), rather than a nested-loop
        // lookup inside the grouping below.
        Map<Long, String> areaKeyBySandboxAreaId = areas.stream()
                .collect(Collectors.toMap(SandboxArea::getId, SandboxArea::getAreaKey, (a, b) -> a));

        Map<String, List<String>> areaKeysByRegion = new LinkedHashMap<>();
        for (SandboxCityRegionMembership membership : memberships) {
            String areaKey = areaKeyBySandboxAreaId.get(membership.getSandboxAreaId());
            if (areaKey == null) {
                // A membership whose sandbox_area_id has no matching SandboxArea in this revision's
                // captured input is a data-quality gap, not a generator concern — surfaced via log
                // (mirroring the null-geometry skip below) rather than silently dropped with no trace.
                log.warn("NavigationTreeGenerationService: revision_id={} city_id={} sandbox_area_id={} "
                                + "region_key={} has no matching SandboxArea in the captured revision input "
                                + "— membership excluded from this generation run",
                        revisionId, cityId, membership.getSandboxAreaId(), membership.getRegionKey());
                continue;
            }
            areaKeysByRegion.computeIfAbsent(membership.getRegionKey(), k -> new ArrayList<>()).add(areaKey);
        }

        // #1956 D4: canonical region displayOrder/displayLabel (city_regions, already captured into
        // sandbox_city_regions) — threaded through GeneratorRegionInput so the generator can number
        // each region's DIRECTION root in CANONICAL region order (CENTRAL, N, E, S, W), not the
        // region_key alphabetical sort generateCity uses for processing determinism.
        Map<String, SandboxCityRegion> regionByKey = regions.stream()
                .collect(Collectors.toMap(SandboxCityRegion::getRegionKey, r -> r, (a, b) -> a));

        List<GeneratorRegionInput> regionInputs = new ArrayList<>();
        for (Map.Entry<String, List<String>> e : areaKeysByRegion.entrySet()) {
            List<GeneratorArea> members = new ArrayList<>();
            for (String areaKey : e.getValue()) {
                SandboxArea area = areaByKey.get(areaKey);
                if (area == null) {
                    continue;
                }
                GeneratorArea generatorArea = toGeneratorArea(area);
                if (generatorArea == null) {
                    // Missing geometry on an otherwise-canonical area is a data-quality gap, not a
                    // generator concern — surfaced via log, not silently baked into the tree.
                    log.warn("NavigationTreeGenerationService: city_id={} area_key={} has incomplete "
                            + "geometry (null centroid/bounds) — excluded from this generation run",
                            cityId, areaKey);
                    continue;
                }
                members.add(generatorArea);
            }
            SandboxCityRegion regionMeta = regionByKey.get(e.getKey());
            int regionDisplayOrder = regionMeta != null && regionMeta.getDisplayOrder() != null
                    ? regionMeta.getDisplayOrder() : 0;
            // #2086 code-review fix (N4): a region's raw display_label is no longer threaded to the
            // generator at all — design.R1 derives a DIRECTION's label from member geography via
            // NavigationTreeGenerator#deriveLabel, and generateRegion's parameter list no longer
            // accepts a region display label to read (see that method's javadoc). The
            // GeneratorRegionInput#displayLabel field itself still exists (other callers/tests rely
            // on its back-compat default), so e.getKey() is passed here as an inert placeholder
            // rather than removing the field from the record.
            regionInputs.add(new GeneratorRegionInput(e.getKey(), members, regionDisplayOrder, e.getKey()));
        }

        List<SandboxNavigationOverride> overrideRows =
                overrideRepository.findByRevisionIdOrderByApplyOrderAsc(revisionId);
        List<NavigationOverride> overrides = overrideRows.stream()
                .map(SandboxNavigationOverride::toNavigationOverride)
                .toList();

        // Canonical (PRE-override) ACTIVE-area universe — captured BEFORE applyPreBisection mutates
        // regionInputs, so an EXCLUDE_AREA/REASSIGN_AREA_REGION override's subject is validated
        // against "was this a real active area at all", never against the POST-exclude set (which
        // would make every valid EXCLUDE_AREA override look orphaned against its own subject).
        Set<String> canonicalAreaKeys = regionInputs.stream()
                .flatMap(r -> r.members().stream())
                .map(GeneratorArea::areaKey)
                .collect(Collectors.toSet());

        regionInputs = overrideApplier.applyPreBisection(regionInputs, overrides);

        List<String> directionLabelPairs = policyReader.findSortedDirectionLabelPairs(citySlug);
        String fingerprint = NavigationPolicyFingerprint.compute(
                policyRow.regionModel(), policyRow.centralRadiusKm(), directionLabelPairs, policyRow.knobs());

        List<GeneratedNode> generated = generator.generateCity(
                regionInputs, policyRow.knobs(), fingerprint, generatedAt);

        generated = overrideApplier.applyPostBisection(generated, overrides);

        List<ValidationNode> validationNodes = generated.stream()
                .map(n -> ValidationNode.fromGeneratedNode(revisionId, n))
                .toList();
        Set<String> expectedAreaKeys = regionInputs.stream()
                .flatMap(r -> r.members().stream())
                .map(GeneratorArea::areaKey)
                .collect(Collectors.toSet());
        Set<String> validRegionKeys = areaKeysByRegion.keySet();

        // #2086 S1b: wires check #16 (label provenance) into the real generation path — node_key
        // is unique by construction (see NavigationTreeGenerator#deriveClusterNodeKey's collision
        // disambiguation and NavigationKeys#areaNodeKey's per-area_key derivation), so
        // Collectors.toMap's default (first-wins) merge behaviour can never actually be invoked by a
        // real collision here; a (a, b) -> a merge function is supplied only as a defensive
        // fail-soft guard against Collectors.toMap's default throw, never expected to fire.
        Map<String, String> displayLabelByNodeKey = generated.stream()
                .collect(Collectors.toMap(GeneratedNode::nodeKey, GeneratedNode::displayLabel, (a, b) -> a));

        ValidationReport report = validationService.validate(
                validationNodes, expectedAreaKeys, policyRow.knobs().maxSafetyDepth(), overrides, validRegionKeys,
                canonicalAreaKeys, displayLabelByNodeKey);
        if (!report.isValid()) {
            throw new NavigationTreeValidationException(report);
        }

        List<Long> ids = sandboxWriter.persist(revisionId, generated);
        log.info("NavigationTreeGenerationService: revision_id={} city_id={} overrides={} — generated and "
                        + "stored {} nodes",
                revisionId, cityId, overrides.size(), ids.size());
        return ids;
    }

    private GeneratorArea toGeneratorArea(SandboxArea a) {
        BigDecimal centreLat = bd(a.getGeoCenterLat());
        BigDecimal centreLon = bd(a.getGeoCenterLon());
        BigDecimal minLat = bd(a.getMinLat());
        BigDecimal minLon = bd(a.getMinLon());
        BigDecimal maxLat = bd(a.getMaxLat());
        BigDecimal maxLon = bd(a.getMaxLon());
        if (Objects.isNull(centreLat) || Objects.isNull(centreLon) || Objects.isNull(minLat)
                || Objects.isNull(minLon) || Objects.isNull(maxLat) || Objects.isNull(maxLon)) {
            return null;
        }
        return new GeneratorArea(a.getAreaKey(), a.getName(), centreLat, centreLon, minLat, minLon, maxLat, maxLon);
    }

    private static BigDecimal bd(Double v) {
        return v == null ? null : BigDecimal.valueOf(v);
    }
}
