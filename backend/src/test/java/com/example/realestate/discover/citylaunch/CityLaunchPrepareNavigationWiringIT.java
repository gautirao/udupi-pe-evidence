package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test (real Postgres) proving the #1955 Areas PR A, SLICE 2e AC5
 * end-to-end integration seam: {@link CityLaunchGraphWriter} now generates a navigation tree
 * during prepare for a city that HAS a {@code city_region_policy} row, and the resulting {@code
 * persisted_revision_checksum} covers the generated {@code sandbox_navigation_nodes} rows (the
 * seven-arg {@code RevisionChecksum} overload) — closing the seam {@code
 * CityLaunchPromotionServiceIT} deliberately characterizes as a zero-row no-op for its own
 * (policy-less) fixtures.
 *
 * <p>Mirrors {@link CityLaunchPromotionServiceIT}'s Testcontainers harness (full {@code
 * @SpringBootTest}, real commits — required for the async graph-write's {@code afterCommit} kick).
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
        "AI_API_KEY=test-dummy-not-used-in-city-launch-it",
        "spring.task.scheduling.enabled=false"
})
class CityLaunchPrepareNavigationWiringIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

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

    @Autowired private CityLaunchPreparationService preparationService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxAreaAliasRepository sandboxAreaAliasRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    @Autowired private SandboxAreaGroupRepository sandboxAreaGroupRepository;
    @Autowired private SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    @Autowired private SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository;
    @Autowired private JdbcTemplate jdbc;

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

    private static void pollUntil(Runnable assertion) {
        long deadline = System.currentTimeMillis() + 15_000;
        AssertionError lastError;
        do {
            try {
                assertion.run();
                return;
            } catch (AssertionError e) {
                lastError = e;
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        } while (System.currentTimeMillis() < deadline);
        throw lastError;
    }

    /** 3 areas, 1 region, and a {@code city_region_policy} row with a permissive
     *  {@code min_areas_per_cluster=1} so this minimal fixture never trips a "too few areas to
     *  form a cluster" rejection unrelated to the wiring under test. */
    private int seedCityWithPolicyAndGeography(String slug) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 8, 1, 6, true, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);

        for (int i = 1; i <= 3; i++) {
            double lat = 13.0 + i * 0.01;
            double lon = 74.7 + i * 0.01;
            // NavigationTreeGenerationService#toGeneratorArea excludes any area missing a full
            // bounding box (min/max lat/lon), not just the centroid — seed a tiny synthetic box
            // around the centroid so every seeded area actually participates in generation.
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    slug + "|area-" + i, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (int i = 1; i <= 3; i++) {
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'AUTO')",
                    cityId, slug + "|area-" + i, slug + "-north");
        }

        return cityId;
    }

    @Test
    @DisplayName("AC5: a city WITH a city_region_policy row generates a real navigation tree during "
            + "prepare, and persisted_revision_checksum covers it (seven-arg overload)")
    void prepare_cityWithPolicyRow_generatesNavigationTree_checksumCoversIt() {
        int cityId = seedCityWithPolicyAndGeography("navwire1");

        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        pollUntil(() -> assertThat(revisionRepository.findById(prep.revisionId()).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        long revisionId = prep.revisionId();
        List<SandboxNavigationNode> navNodes = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(navNodes).as("navigation-tree generation must have run during prepare").isNotEmpty();

        // Every generated AREA leaf corresponds to a seeded area; no orphan/placeholder rows.
        assertThat(navNodes.stream().filter(n -> "AREA".equals(n.getNodeType())).count()).isEqualTo(3);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getPersistedRevisionChecksum()).isNotBlank();

        // The persisted checksum must be the SEVEN-arg digest (areas..groupMembers + navigationNodes)
        // — recomputing with the SIX-arg (pre-#1955) overload must DISAGREE, proving the
        // navigation-node section genuinely participates in the persisted checksum, not just an
        // ignored no-op section.
        List<SandboxArea> sandboxAreas = sandboxAreaRepository.findByRevisionId(revisionId);
        List<SandboxAreaAlias> sandboxAliases = sandboxAreaAliasRepository.findByRevisionId(revisionId);
        List<SandboxCityRegion> sandboxRegions = sandboxCityRegionRepository.findByRevisionId(revisionId);
        List<SandboxCityRegionMembership> sandboxMemberships =
                sandboxCityRegionMembershipRepository.findByRevisionId(revisionId);
        List<SandboxAreaGroup> sandboxGroups = sandboxAreaGroupRepository.findByRevisionId(revisionId);
        List<SandboxAreaGroupMember> sandboxGroupMembers = sandboxAreaGroupMemberRepository.findByRevisionId(revisionId);
        // #2151 PR A: prepare now ALSO generates sandbox_agri_destination_classification during the
        // same run, and the persisted checksum is the NINE-arg digest (areas..groupMembers +
        // navigationNodes + overrides + agriDestinations) — see RevisionChecksum class javadoc.
        List<SandboxAgriDestinationClassification> sandboxAgriDestinations =
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId);

        String sevenArgChecksum = RevisionChecksum.compute(
                sandboxAreas, sandboxAliases, sandboxRegions, sandboxMemberships, sandboxGroups,
                sandboxGroupMembers, navNodes);
        String sixArgChecksum = RevisionChecksum.compute(
                sandboxAreas, sandboxAliases, sandboxRegions, sandboxMemberships, sandboxGroups, sandboxGroupMembers);
        String nineArgChecksum = RevisionChecksum.compute(
                sandboxAreas, sandboxAliases, sandboxRegions, sandboxMemberships, sandboxGroups,
                sandboxGroupMembers, navNodes, List.of(), sandboxAgriDestinations);

        assertThat(revision.getPersistedRevisionChecksum()).isEqualTo(nineArgChecksum);
        assertThat(sevenArgChecksum).isNotEqualTo(sixArgChecksum);
        assertThat(nineArgChecksum)
                .as("Agri destination classification rows must genuinely participate in the persisted "
                        + "checksum, not just an ignored no-op trailing section")
                .isNotEqualTo(sevenArgChecksum);
    }
}
