package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres, NOT mocked) proving V121's {@code
 * navigation_nodes} + {@code sandbox_navigation_nodes} schema and {@link NavigationNode} /
 * {@link SandboxNavigationNode} entity mapping (#1955 Areas PR A, SLICE 2a).
 *
 * <p>Mirrors {@code CityLaunchRevisionSchemaIT}'s Testcontainers + Flyway configuration. This
 * slice ships schema + entity + repository persistence ONLY — no generator/promotion/cache/counts
 * service exists yet, so this test drives the repositories and raw JDBC directly.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class NavigationNodeSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired private NavigationNodeRepository navigationNodeRepository;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Integer bangaloreCityId;

    @BeforeEach
    void setUp() {
        bangaloreCityId = jdbcTemplate.queryForObject(
                "SELECT id FROM public.cities WHERE slug = 'bangalore'", Integer.class);
    }

    // ── Migration sanity ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("V121 applies cleanly: creates navigation_nodes + sandbox_navigation_nodes, and "
            + "seeds placeholder city_region_policy generator knobs on existing rows")
    void migrationAppliesCleanlyAndSeedsPolicyKnobs() {
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_schema = 'public' AND table_name IN "
                        + "('navigation_nodes', 'sandbox_navigation_nodes')",
                String.class);
        assertThat(tables).containsExactlyInAnyOrder("navigation_nodes", "sandbox_navigation_nodes");

        Integer maxDirectChildren = jdbcTemplate.queryForObject(
                "SELECT max_direct_children FROM public.city_region_policy WHERE city_id = ?",
                Integer.class, bangaloreCityId);
        String partitionMethod = jdbcTemplate.queryForObject(
                "SELECT partition_method FROM public.city_region_policy WHERE city_id = ?",
                String.class, bangaloreCityId);
        Boolean oneChildPrevention = jdbcTemplate.queryForObject(
                "SELECT one_child_prevention FROM public.city_region_policy WHERE city_id = ?",
                Boolean.class, bangaloreCityId);

        assertThat(maxDirectChildren).isEqualTo(8);
        assertThat(partitionMethod).isEqualTo("GEOMETRIC_BISECTION");
        assertThat(oneChildPrevention).isTrue();
    }

    // ── Entity round-trip ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("CLUSTER -> AREA round trip via NavigationNodeRepository, including ancestor/"
            + "representative TEXT[] columns")
    void clusterAreaRoundTrip() {
        String areaKey = "nn-test|area-1";
        seedArea(bangaloreCityId, areaKey);

        NavigationNode cluster = navigationNodeRepository.save(new NavigationNode(
                bangaloreCityId, "north", "CLUSTER", null, "nn-test-cluster-root", null,
                List.of(areaKey), "North Cluster", 1, 0, List.of(), 1,
                BigDecimal.valueOf(13.05), BigDecimal.valueOf(77.59),
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(77.5),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(77.7),
                "fp-cluster", Instant.parse("2026-01-01T00:00:00Z")));

        navigationNodeRepository.save(new NavigationNode(
                bangaloreCityId, "north", "AREA", cluster.getId(), "nn-test-area-1", areaKey,
                List.of(areaKey), "Area One", 1, 1, List.of("nn-test-cluster-root"), 1,
                BigDecimal.valueOf(13.05), BigDecimal.valueOf(77.59),
                BigDecimal.valueOf(13.04), BigDecimal.valueOf(77.49),
                BigDecimal.valueOf(13.06), BigDecimal.valueOf(77.51),
                "fp-area", Instant.parse("2026-01-01T00:00:00Z")));

        NavigationNode reloadedCluster = navigationNodeRepository
                .findByCityIdAndNodeKey(bangaloreCityId, "nn-test-cluster-root")
                .orElseThrow();
        assertThat(reloadedCluster.getNodeType()).isEqualTo("CLUSTER");
        assertThat(reloadedCluster.getAreaKey()).isNull();

        List<NavigationNode> children = navigationNodeRepository
                .findByCityIdAndParentNodeIdOrderByDisplayOrderAsc(bangaloreCityId, cluster.getId());
        assertThat(children).extracting(NavigationNode::getNodeKey).containsExactly("nn-test-area-1");

        NavigationNode reloadedArea = navigationNodeRepository
                .findByCityIdAndAreaKey(bangaloreCityId, areaKey)
                .orElseThrow();
        assertThat(reloadedArea.getNodeType()).isEqualTo("AREA");
        assertThat(reloadedArea.getAncestorKeys()).containsExactly("nn-test-cluster-root");
        assertThat(reloadedArea.getRepresentativeAreaKeys()).containsExactly(areaKey);
        assertThat(reloadedArea.getParentNodeId()).isEqualTo(cluster.getId());
    }

    @Test
    @DisplayName("sandbox_navigation_nodes round-trips via SandboxNavigationNodeRepository, "
            + "revision-scoped, area_key NOT a foreign key")
    void sandboxRoundTrip() {
        Long revisionId = jdbcTemplate.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number) VALUES (?, 1) RETURNING id",
                Long.class, bangaloreCityId);

        SandboxNavigationNode saved = sandboxNavigationNodeRepository.save(new SandboxNavigationNode(
                revisionId, "north", "AREA", null, "nn-sandbox-area-1", "nn-sandbox|not-yet-promoted",
                List.of("nn-sandbox|not-yet-promoted"), "Sandbox Area", 1, 0, List.of(), 1,
                BigDecimal.valueOf(13.05), BigDecimal.valueOf(77.59),
                BigDecimal.valueOf(13.04), BigDecimal.valueOf(77.49),
                BigDecimal.valueOf(13.06), BigDecimal.valueOf(77.51),
                "fp-sandbox", Instant.parse("2026-01-01T00:00:00Z")));

        List<SandboxNavigationNode> forRevision = sandboxNavigationNodeRepository.findByRevisionId(revisionId);
        assertThat(forRevision).extracting(SandboxNavigationNode::getId).containsExactly(saved.getId());

        SandboxNavigationNode reloaded = sandboxNavigationNodeRepository
                .findByRevisionIdAndAreaKey(revisionId, "nn-sandbox|not-yet-promoted")
                .orElseThrow();
        assertThat(reloaded.getRepresentativeAreaKeys()).containsExactly("nn-sandbox|not-yet-promoted");
    }

    // ── Constraint enforcement ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("partial-unique (city_id, area_key) WHERE node_type='AREA' rejects a 2nd AREA "
            + "leaf for the same area")
    void partialUniqueAreaLeafEnforced() {
        String areaKey = "nn-test|area-dup";
        seedArea(bangaloreCityId, areaKey);

        insertAreaNode(bangaloreCityId, null, "nn-test-dup-1", areaKey);

        assertThatThrownBy(() -> insertAreaNode(bangaloreCityId, null, "nn-test-dup-2", areaKey))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("AREA-is-leaf trigger rejects a new node whose parent_node_id points at an "
            + "AREA node")
    void areaNodeCannotBeParentTriggerFires() {
        String areaKey = "nn-test|area-leaf";
        seedArea(bangaloreCityId, areaKey);
        Long areaNodeId = insertAreaNode(bangaloreCityId, null, "nn-test-leaf", areaKey);

        assertThatThrownBy(() -> insertClusterNode(bangaloreCityId, areaNodeId, "nn-test-child-of-leaf"))
                .isInstanceOf(DataAccessException.class)
                .hasMessageContaining("AREA node");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────

    private void seedArea(Integer cityId, String areaKey) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, ?, 13.05, 77.59)",
                areaKey, cityId, areaKey);
    }

    private Long insertAreaNode(Integer cityId, Long parentNodeId, String nodeKey, String areaKey) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, node_key, "
                        + "area_key, representative_area_keys, display_label, display_order, depth, ancestor_keys, "
                        + "descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon, "
                        + "policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'AREA', ?, ?, ?, ARRAY[?]::text[], ?, 1, 1, ARRAY[]::text[], 1, "
                        + "13.05, 77.59, 13.04, 77.49, 13.06, 77.51, 'fp', now()) RETURNING id",
                Long.class, cityId, parentNodeId, nodeKey, areaKey, areaKey, nodeKey);
    }

    private Long insertClusterNode(Integer cityId, Long parentNodeId, String nodeKey) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.navigation_nodes (city_id, region_key, node_type, parent_node_id, node_key, "
                        + "area_key, representative_area_keys, display_label, display_order, depth, ancestor_keys, "
                        + "descendant_area_count, centre_lat, centre_lon, min_lat, min_lon, max_lat, max_lon, "
                        + "policy_fingerprint, generated_at) "
                        + "VALUES (?, 'north', 'CLUSTER', ?, ?, NULL, ARRAY[]::text[], ?, 1, 0, ARRAY[]::text[], 1, "
                        + "13.05, 77.59, 13.0, 77.5, 13.1, 77.7, 'fp', now()) RETURNING id",
                Long.class, cityId, parentNodeId, nodeKey, nodeKey);
    }
}
