package com.example.realestate.discover.navigation;

import com.example.realestate.discover.citylaunch.CanonicalGeographyReader;
import com.example.realestate.discover.citylaunch.CityLaunchRevision;
import com.example.realestate.discover.citylaunch.CityLaunchRevisionRepository;
import com.example.realestate.discover.citylaunch.SandboxAreaRepository;
import com.example.realestate.discover.citylaunch.SandboxCityRegionMembershipRepository;
import com.example.realestate.discover.citylaunch.SandboxCityRegionRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * #2313 — ISOLATED-DB PROOF that {@link NavigationTreeGenerationService#generateAndStoreForRevision}
 * excludes a soft-excluded ({@code lifecycle_status != ACTIVE}) area from the persisted navigation
 * tree while its ACTIVE siblings in the same region are unaffected — the exact real-data scenario
 * behind Mukkidipeta (mis-geocoded outlier under Bangalore Direction {@code d:n}, now marked
 * {@code INACTIVE} by V129) stretching its DIRECTION node's bounding box.
 *
 * <p>Same isolation rationale as {@link NavigationTreeRealScaleRegenerationIT}: its own ephemeral
 * Testcontainers Postgres, structurally independent of the shared, hand-managed {@code
 * pg-test-fixture} container used by concurrent local dev/E2E workflows — this test never touches
 * that container.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-nav-inactive-exclusion-it",
        "spring.task.scheduling.enabled=false"
})
class NavigationTreeInactiveAreaExclusionIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    // JwtConfig's securityFilterChain bean requires a JwtDecoder even under webEnvironment=NONE —
    // mirrors NavigationTreeRealScaleRegenerationIT's no-op decoder (no test here issues HTTP).
    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    @Autowired private NavigationTreeGenerationService generationService;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private CanonicalGeographyReader geographyReader;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;

    private SandboxGeographyTestSupport.Captured captureSandboxGeography(int cityId, long revisionId) {
        return SandboxGeographyTestSupport.captureSandboxGeography(
                geographyReader, sandboxAreaRepository, sandboxCityRegionRepository,
                sandboxCityRegionMembershipRepository, cityId, revisionId);
    }

    private static final java.util.UUID ADMIN_ID = java.util.UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
        testCitySlugs.clear();
    }

    private record CityFixture(int cityId, String slug, List<String> activeAreaKeys, String inactiveAreaKey) {}

    /** Seeds ONE city with ONE region containing 3 ACTIVE areas and 1 INACTIVE area (the
     *  Mukkidipeta shape: a soft-excluded sibling alongside legitimate ACTIVE siblings in the same
     *  region), well under {@code max_direct_children} so the region stays flat (no CLUSTER),
     *  isolating the assertion to the ACTIVE-filter behaviour alone. */
    private CityFixture seedCityWithInactiveSibling(String slug) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-synthetic-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 8, 3, 6, true, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);

        String regionKey = slug + "-north";
        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, 'north', 1)",
                cityId, regionKey);

        List<String> activeAreaKeys = new ArrayList<>();
        String inactiveAreaKey = null;
        double spacing = 0.002;
        for (int i = 0; i < 4; i++) {
            // #2313's real shape: 4 sibling areas in one region, the LAST one is the mis-geocoded
            // outlier — seeded ~66km away (far outside the other siblings' cluster) and marked
            // INACTIVE, exactly mirroring Mukkidipeta vs. its real North Bangalore siblings.
            boolean isOutlier = i == 3;
            String areaKey = "IN|KA|" + slug + "|north-" + String.format("%03d", i);
            double lat = isOutlier ? 13.0 + 0.60 : 13.0 + i * spacing;
            double lon = isOutlier ? 74.7 + 0.60 : 74.7 + i * spacing;
            String lifecycleStatus = isOutlier ? "INACTIVE" : "ACTIVE";
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon, lifecycle_status) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    areaKey, cityId, "Area north " + i, slug + "-north", lat, lon,
                    lat - 0.0005, lon - 0.0005, lat + 0.0005, lon + 0.0005, lifecycleStatus);
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                    cityId, areaKey, regionKey);
            if (isOutlier) {
                inactiveAreaKey = areaKey;
            } else {
                activeAreaKeys.add(areaKey);
            }
        }

        return new CityFixture(cityId, slug, activeAreaKeys, inactiveAreaKey);
    }

    @Test
    @DisplayName("#2313: generateAndStoreForRevision excludes an INACTIVE sibling area from the "
            + "persisted navigation tree while its ACTIVE siblings in the same region are unaffected")
    void generateAndStoreForRevision_excludesInactiveArea_keepsActiveSiblings() {
        CityFixture fixture = seedCityWithInactiveSibling("p2313-inactive-excl");

        CityLaunchRevision revision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(fixture.cityId(), 1, ADMIN_ID));
        Long revisionId = revision.getId();
        SandboxGeographyTestSupport.Captured captured = captureSandboxGeography(fixture.cityId(), revisionId);

        // The captured sandbox_areas snapshot must still carry the INACTIVE row through (it stays
        // available to other consumers — schools/listings/agri — only navigation excludes it).
        assertThat(captured.areas()).extracting(a -> a.getAreaKey())
                .contains(fixture.inactiveAreaKey());

        assertThatCode(() ->
                generationService.generateAndStoreForRevision(revisionId, fixture.cityId(), fixture.slug(),
                        captured.areas(), captured.regions(), captured.memberships(), Instant.now()))
                .doesNotThrowAnyException();

        List<SandboxNavigationNode> persisted = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(persisted).isNotEmpty();

        Set<String> persistedAreaLeafKeys = persisted.stream()
                .filter(n -> "AREA".equals(n.getNodeType()))
                .map(SandboxNavigationNode::getAreaKey)
                .collect(Collectors.toSet());

        assertThat(persistedAreaLeafKeys)
                .as("the INACTIVE outlier must never appear as a persisted AREA leaf")
                .doesNotContain(fixture.inactiveAreaKey());
        assertThat(persistedAreaLeafKeys)
                .as("all ACTIVE siblings must remain, unaffected by the INACTIVE exclusion")
                .containsExactlyInAnyOrderElementsOf(fixture.activeAreaKeys());
    }
}
