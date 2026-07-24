package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.CanonicalGeographyReader;
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
 * Orchestrates one revision's navigation-tree generation: loads canonical geography (SLICE 2a's
 * {@link CanonicalGeographyReader}) + {@code city_region_policy} knobs ({@link
 * NavigationPolicyReader}), runs {@link NavigationTreeGenerator} (D4), validates the result with
 * {@link NavigationTreeValidationService} (AC7 — a superset of the V121 DB constraints, checked
 * BEFORE any write), and only then persists via {@link NavigationTreeSandboxWriter}. A failing
 * validation throws {@link NavigationTreeValidationException} and writes NOTHING.
 *
 * <p>Reads geometry ONLY — never {@code property_listings} — and never touches production {@code
 * navigation_nodes} or any promotion path; those are later, separately-scoped #1955 slices. Not
 * wired into {@code CityLaunchPreparationService}'s prepare flow — that wiring, if any, belongs to
 * a future slice.
 */
@Service
public class NavigationTreeGenerationService {

    private static final Logger log = LoggerFactory.getLogger(NavigationTreeGenerationService.class);

    private final CanonicalGeographyReader geographyReader;
    private final NavigationPolicyReader policyReader;
    private final NavigationTreeGenerator generator;
    private final NavigationTreeValidationService validationService;
    private final NavigationTreeSandboxWriter sandboxWriter;
    private final NavigationTreeOverrideApplier overrideApplier;
    private final SandboxNavigationOverrideRepository overrideRepository;

    public NavigationTreeGenerationService(
            CanonicalGeographyReader geographyReader, NavigationPolicyReader policyReader,
            NavigationTreeGenerator generator, NavigationTreeValidationService validationService,
            NavigationTreeSandboxWriter sandboxWriter, NavigationTreeOverrideApplier overrideApplier,
            SandboxNavigationOverrideRepository overrideRepository) {
        this.geographyReader = geographyReader;
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
    public List<Long> generateAndStoreForRevision(Long revisionId, Integer cityId, Instant generatedAt) {
        CanonicalGeographyReader.CanonicalCity city = geographyReader.findCity(cityId)
                .orElseThrow(() -> new IllegalArgumentException("No city for city_id=" + cityId));
        NavigationPolicyReader.CityRegionPolicyRow policyRow = policyReader.findPolicy(cityId)
                .orElseThrow(() -> new IllegalStateException(
                        "No city_region_policy row for city_id=" + cityId + " — cannot generate a navigation tree"));

        CanonicalGeographyReader.CanonicalGeography geography = geographyReader.loadGeography(cityId);

        Map<String, CanonicalGeographyReader.CanonicalArea> areaByKey = geography.areas().stream()
                .collect(Collectors.toMap(CanonicalGeographyReader.CanonicalArea::areaKey, a -> a, (a, b) -> a));

        Map<String, List<String>> areaKeysByRegion = geography.memberships().stream()
                .collect(Collectors.groupingBy(
                        CanonicalGeographyReader.CanonicalCityRegionMembership::regionKey,
                        LinkedHashMap::new,
                        Collectors.mapping(CanonicalGeographyReader.CanonicalCityRegionMembership::areaKey,
                                Collectors.toList())));

        List<GeneratorRegionInput> regionInputs = new ArrayList<>();
        for (Map.Entry<String, List<String>> e : areaKeysByRegion.entrySet()) {
            List<GeneratorArea> members = new ArrayList<>();
            for (String areaKey : e.getValue()) {
                CanonicalGeographyReader.CanonicalArea area = areaByKey.get(areaKey);
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
            regionInputs.add(new GeneratorRegionInput(e.getKey(), members));
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

        List<String> directionLabelPairs = policyReader.findSortedDirectionLabelPairs(city.slug());
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

        ValidationReport report = validationService.validate(
                validationNodes, expectedAreaKeys, policyRow.knobs().maxSafetyDepth(), overrides, validRegionKeys,
                canonicalAreaKeys);
        if (!report.isValid()) {
            throw new NavigationTreeValidationException(report);
        }

        List<Long> ids = sandboxWriter.persist(revisionId, generated);
        log.info("NavigationTreeGenerationService: revision_id={} city_id={} overrides={} — generated and "
                        + "stored {} nodes",
                revisionId, cityId, overrides.size(), ids.size());
        return ids;
    }

    private GeneratorArea toGeneratorArea(CanonicalGeographyReader.CanonicalArea a) {
        BigDecimal centreLat = bd(a.geoCenterLat());
        BigDecimal centreLon = bd(a.geoCenterLon());
        BigDecimal minLat = bd(a.minLat());
        BigDecimal minLon = bd(a.minLon());
        BigDecimal maxLat = bd(a.maxLat());
        BigDecimal maxLon = bd(a.maxLon());
        if (Objects.isNull(centreLat) || Objects.isNull(centreLon) || Objects.isNull(minLat)
                || Objects.isNull(minLon) || Objects.isNull(maxLat) || Objects.isNull(maxLon)) {
            return null;
        }
        return new GeneratorArea(a.areaKey(), a.name(), centreLat, centreLon, minLat, minLon, maxLat, maxLon);
    }

    private static BigDecimal bd(Double v) {
        return v == null ? null : BigDecimal.valueOf(v);
    }
}
