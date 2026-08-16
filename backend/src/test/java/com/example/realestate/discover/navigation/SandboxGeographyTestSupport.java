package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.AssignmentSource;
import com.example.realestate.discover.citylaunch.CanonicalGeographyReader;
import com.example.realestate.discover.citylaunch.SandboxArea;
import com.example.realestate.discover.citylaunch.SandboxCityRegion;
import com.example.realestate.discover.citylaunch.SandboxCityRegionMembership;
import com.example.realestate.discover.citylaunch.SandboxAreaRepository;
import com.example.realestate.discover.citylaunch.SandboxCityRegionMembershipRepository;
import com.example.realestate.discover.citylaunch.SandboxCityRegionRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * #2157: {@link NavigationTreeGenerationService#generateAndStoreForRevision} no longer reads
 * canonical geography itself — it consumes CAPTURED {@code sandbox_areas}/{@code
 * sandbox_city_regions}/{@code sandbox_city_region_memberships} rows for the revision, exactly as
 * {@code CityLaunchGraphWriter} writes them in production. Several pre-existing ITs in this package
 * seed real/synthetic geography directly into {@code public.areas}/{@code city_regions}/{@code
 * city_region_memberships} via raw JDBC and then drove {@code generateAndStoreForRevision} straight
 * off that canonical data. This shared test helper reproduces {@code CityLaunchGraphWriter}'s own
 * capture step (read canonical geography once, persist it into the three sandbox tables) so those
 * ITs can keep seeding canonical geography the same way while calling the new, capture-based
 * generation signature.
 */
final class SandboxGeographyTestSupport {

    private SandboxGeographyTestSupport() {}

    record Captured(List<SandboxArea> areas, List<SandboxCityRegion> regions,
                     List<SandboxCityRegionMembership> memberships) {}

    /**
     * Reads {@code cityId}'s canonical geography ONCE (mirroring {@code
     * CityLaunchGraphWriter#writeGraphTransactional}'s own single read) and persists it into the
     * {@code sandbox_areas}/{@code sandbox_city_regions}/{@code sandbox_city_region_memberships}
     * tables for {@code revisionId}, returning the saved rows for direct use as {@link
     * NavigationTreeGenerationService#generateAndStoreForRevision}'s captured-input arguments.
     */
    static Captured captureSandboxGeography(
            CanonicalGeographyReader geographyReader,
            SandboxAreaRepository sandboxAreaRepository,
            SandboxCityRegionRepository sandboxCityRegionRepository,
            SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository,
            int cityId, long revisionId) {
        CanonicalGeographyReader.CanonicalGeography geography = geographyReader.loadGeography(cityId);

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

        List<SandboxCityRegion> savedRegions = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalCityRegion region : geography.regions()) {
            savedRegions.add(sandboxCityRegionRepository.save(new SandboxCityRegion(
                    revisionId, region.regionKey(), region.displayLabel(), region.displayOrder(),
                    region.centreLat(), region.centreLon(),
                    region.minLat(), region.minLon(), region.maxLat(), region.maxLon(),
                    region.policyFingerprint())));
        }

        List<SandboxCityRegionMembership> savedMemberships = new ArrayList<>();
        for (CanonicalGeographyReader.CanonicalCityRegionMembership membership : geography.memberships()) {
            Long sandboxAreaId = sandboxAreaIdByKey.get(membership.areaKey());
            if (sandboxAreaId == null) {
                continue; // unreachable for well-formed fixtures; defensive against a future gap
            }
            savedMemberships.add(sandboxCityRegionMembershipRepository.save(new SandboxCityRegionMembership(
                    revisionId, sandboxAreaId, membership.regionKey(),
                    AssignmentSource.valueOf(membership.assignmentSource()))));
        }

        return new Captured(savedAreas, savedRegions, savedMemberships);
    }
}
