package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationNode;
import com.example.realestate.discover.navigation.NavigationNodeRepository;
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
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres) proving {@link CityLaunchPromotionService}'s
 * guarded launch — the ONLY production-geography write path in #1911 (PR5). Drives the REAL
 * prepare -&gt; graph-write -&gt; validate flow (via {@link CityLaunchPreparationService}, {@link
 * CityLaunchGraphWriter}, {@link CityLaunchValidationService}) so {@code
 * persisted_revision_checksum} is populated by production code, never hand-seeded — proving the
 * {@link CityLaunchGraphWriter} grant (computing + persisting the checksum at PREPARED) actually
 * works end to end.
 *
 * <p>Mirrors {@link CityLaunchPreparationServiceIT}'s Testcontainers base (full {@code
 * @SpringBootTest}, real commits — required for the async graph-write's {@code afterCommit} kick to
 * fire) and {@code pollUntil} helper.
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
class CityLaunchPromotionServiceIT {

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
    @Autowired private CityLaunchValidationService validationService;
    @Autowired private CityLaunchPromotionService promotionService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxMembershipRepository;
    @Autowired private SandboxAreaGroupMemberRepository sandboxGroupMemberRepository;
    @Autowired private SandboxAreaAliasRepository sandboxAliasRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxAreaGroupRepository sandboxAreaGroupRepository;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private SandboxAgriDestinationClassificationRepository sandboxAgriDestinationClassificationRepository;
    @Autowired private NavigationNodeRepository navigationNodeRepository;
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
            Integer cityId = jdbc.queryForObject(
                    "SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            // #2151 PR A: agri_destination_classification.area_key FKs public.areas — must be
            // cleared before the areas DELETE below, mirroring the navigation_nodes precedent above.
            jdbc.update("DELETE FROM public.agri_destination_classification WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                    + "(SELECT id FROM public.area_groups WHERE city_id = ?)", cityId);
            jdbc.update("DELETE FROM public.area_groups WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            // #2163: seedRegionPolicy()/seedClassification() insert rows that FK-reference (policy)
            // or otherwise scope to (classifications) this city/slug and must be cleared first.
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.regional_area_classifications WHERE city_key = ?", slug);
            jdbc.update("DELETE FROM public.regional_area_overrides WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.area_alias WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

    /** Polls {@code assertion} every 100ms for up to 15s, re-throwing its last failure on timeout. */
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

    // ── Fixture helpers ─────────────────────────────────────────────────────────────────────

    private int seedCity(String slug, boolean active) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, ?) RETURNING id",
                Integer.class, slug, slug + "-test-city", active);
    }

    private void seedArea(int cityId, String areaKey, double lat, double lon, String district) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                areaKey, cityId, areaKey, district, lat, lon);
    }

    private void seedRegion(int cityId, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, ?, 1)",
                cityId, regionKey, regionKey);
    }

    /**
     * #2163: this file's fixtures hand-seed {@code city_regions}/{@code city_region_memberships}
     * directly (rather than deriving them from real classification data) to control EXACTLY which
     * areas share a region for its assignment-tamper tests. {@code assignment_source='OVERRIDE'}
     * (not {@code 'AUTO'}) is load-bearing here: {@code CityRegionOnboardingService.apply()} — now
     * invoked by every {@code prepare()} call (#2163) — deletes stale {@code 'AUTO'} memberships
     * for any area_key outside its own computed effective set (see {@code
     * deleteStaleAutoMemberships}); these fixtures' areas are deliberately NOT real-classified (see
     * {@link #seedDecoyClassifiedArea}), so an {@code 'AUTO'} row here would be wiped out by that
     * exact cleanup on the very same {@code prepare()} call that seeded it.
     */
    private void seedMembership(int cityId, String areaKey, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source) "
                        + "VALUES (?, ?, ?, 'OVERRIDE')",
                cityId, areaKey, regionKey);
    }

    /**
     * #2163: {@code prepare()} now self-materializes canonical geography prerequisites via
     * {@code CityRegionOnboardingService.apply()}, which requires a {@code city_region_policy}
     * row (else {@code MISSING_POLICY}) and >=1 real classified area (else {@code
     * MISSING_CLASSIFICATIONS}). Seed a policy row plus one separate INACTIVE "decoy" area that is
     * the file's ONLY area carrying a real {@code regional_area_classifications} row — the real
     * fixture areas are deliberately left unclassified so this file keeps full control over which
     * areas share a region (see {@link #seedMembership}) — purely so {@code
     * classificationsPresent()=true} and {@code apply()} has >=1 real region to materialize. Being
     * INACTIVE, the decoy is excluded from {@code CityLaunchGraphWriter}'s area capture, so it
     * never appears in any sandbox_areas/row-count assertion in this file.
     */
    private void seedRegionPolicy(int cityId, String regionModel, double centralRadiusKm) {
        jdbc.update(
                "INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km) "
                        + "VALUES (?, ?, ?)",
                cityId, regionModel, centralRadiusKm);
    }

    /**
     * #2163: a fixture that has an {@code area_groups} member area which is NOT itself
     * real-classified (see {@link #seedDecoyClassifiedArea}) trips {@code
     * CityRegionOnboardingService.apply()}'s DEGENERATE_GROUP guard — a group is degenerate when
     * NONE of its members has a classification-projected region. A {@code regional_area_overrides}
     * row resolves this exactly the way a real operator would (see {@code
     * CityRegionOnboardingNamespaceCollisionIT}'s {@code resolveNonUnifiedGroups} for the same
     * pattern), independent of this file's OWN manually-seeded {@code city_region_memberships}.
     */
    private void seedRegionOverride(int cityId, String areaKey, String regionKey) {
        jdbc.update(
                "INSERT INTO public.regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                        + "VALUES (?, ?, ?, 'test-fixture-2163', 'test')",
                cityId, areaKey, regionKey);
    }

    private void seedDecoyClassifiedArea(int cityId, String citySlug) {
        String decoyAreaKey = citySlug + "|d|g|decoy-2163";
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                        + "lifecycle_status) VALUES (?, ?, ?, ?, ?, ?, 'INACTIVE')",
                decoyAreaKey, cityId, decoyAreaKey, citySlug + "-district", 13.0, 74.7);
        jdbc.update(
                "INSERT INTO public.regional_area_classifications "
                        + "(city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, computed_at) "
                        + "VALUES (?, ?, 'N', '0_10', 0.0, 5.0, now())",
                citySlug, decoyAreaKey);
    }

    private int seedGroup(int cityId, String slug, String subtitle) {
        return jdbc.queryForObject(
                "INSERT INTO public.area_groups (city_id, slug, name, subtitle) VALUES (?, ?, ?, ?) RETURNING id",
                Integer.class, cityId, slug, slug, subtitle);
    }

    private void seedGroupMember(int groupId, String areaKey) {
        jdbc.update(
                "INSERT INTO public.area_group_members (area_group_id, area_key) VALUES (?, ?)",
                groupId, areaKey);
    }

    private void seedAlias(int cityId, String areaKey, String alias, String aliasNormalised) {
        jdbc.update(
                "INSERT INTO public.area_alias (city_id, area_key, alias, alias_normalised) VALUES (?, ?, ?, ?)",
                cityId, areaKey, alias, aliasNormalised);
    }

    /** Postgres {@code text[]} literal for an inline-embedded array (test data only — no untrusted
     *  input, so double-quoting each element is sufficient escaping). */
    private static String pgTextArray(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "'{}'::text[]";
        }
        StringBuilder sb = new StringBuilder("'{");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(values.get(i).replace("\"", "\\\"")).append('"');
        }
        return sb.append("}'::text[]").toString();
    }

    /** Seeds one {@code sandbox_navigation_nodes} row directly (#1955 Areas PR A, SLICE 2c tests) —
     *  navigation-tree generation is not wired into the real prepare pipeline yet, so this mirrors
     *  the other sandbox_* seed helpers' direct-insert pattern rather than driving the (unwired)
     *  generator service. Returns the generated sandbox row id, for use as a later row's parentId. */
    private long seedSandboxNavigationNode(
            long revisionId, String regionKey, String nodeType, Long parentId, String nodeKey, String areaKey,
            List<String> representativeAreaKeys, String displayLabel, int displayOrder, int depth,
            List<String> ancestorKeys, int descendantAreaCount, double centreLat, double centreLon,
            double minLat, double minLon, double maxLat, double maxLon, String policyFingerprint) {
        return jdbc.queryForObject(
                "INSERT INTO public.sandbox_navigation_nodes (revision_id, region_key, node_type, "
                        + "parent_node_id, node_key, area_key, representative_area_keys, display_label, "
                        + "display_order, depth, ancestor_keys, descendant_area_count, centre_lat, centre_lon, "
                        + "min_lat, min_lon, max_lat, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, " + pgTextArray(representativeAreaKeys) + ", ?, ?, ?, "
                        + pgTextArray(ancestorKeys) + ", ?, ?, ?, ?, ?, ?, ?, ?, now()) RETURNING id",
                Long.class, revisionId, regionKey, nodeType, parentId, nodeKey, areaKey, displayLabel,
                displayOrder, depth, descendantAreaCount, centreLat, centreLon, minLat, minLon, maxLat, maxLon,
                policyFingerprint);
    }

    /**
     * Recomputes {@code persisted_revision_checksum} over the revision's CURRENT six geography
     * lists PLUS its (just-seeded) sandbox_navigation_nodes list, and overwrites the column
     * directly. Mirrors {@code AdminCityLaunchLaunchControllerIT}'s same pattern: this file's
     * fixtures never seed a {@code city_region_policy} row, so a real prepare run's generation is
     * always skipped (SLICE 2e's precondition gate) — these helper-seeded rows let the tests below
     * exercise the PROMOTION layer's seventh-table handling directly, independent of generation
     * itself (see {@code CityLaunchPrepareNavigationWiringIT} for the generation-wiring proof).
     */
    private void recomputeAndPersistChecksumWithNavigationNodes(long revisionId) {
        // #2151 PR A: prepareAndValidate's REAL prepare run already generated (and persisted)
        // sandbox_agri_destination_classification rows for this revision — unlike navigation-tree
        // generation, Agri generation has NO city_region_policy precondition gate, so it always
        // runs. This helper must fold those CURRENT rows into the recompute (via the nine-arg
        // overload) or the checksum it writes silently stops matching what
        // CityLaunchPromotionService recomputes at launch time.
        String checksum = RevisionChecksum.compute(
                sandboxAreaRepository.findByRevisionId(revisionId),
                sandboxAliasRepository.findByRevisionId(revisionId),
                sandboxCityRegionRepository.findByRevisionId(revisionId),
                sandboxMembershipRepository.findByRevisionId(revisionId),
                sandboxAreaGroupRepository.findByRevisionId(revisionId),
                sandboxGroupMemberRepository.findByRevisionId(revisionId),
                sandboxNavigationNodeRepository.findByRevisionId(revisionId),
                List.of(),
                sandboxAgriDestinationClassificationRepository.findByRevisionId(revisionId));
        jdbc.update("UPDATE public.city_launch_revision SET persisted_revision_checksum = ? WHERE id = ?",
                checksum, revisionId);
    }

    /**
     * 3 areas; area-1 and area-2 are BOTH members of the same region with the same
     * assignment_source; area-3 is left UNASSIGNED to any region. Used by the membership
     * assignment-tamper test: repointing a membership row's {@code sandbox_area_id} from area-1 to
     * area-3 leaves the row's OWN value fields (region_key, assignment_source) untouched, so it is
     * invisible to a checksum that hashes only those fields — the exact AC5 gap RevisionChecksum's
     * fix closes.
     *
     * <p>#2163 review fix: area-3 is deliberately marked INACTIVE (unlike area-1/area-2) so
     * {@code CityRegionOnboardingService}'s canonical-geometry classification source — which,
     * unlike the legacy table, auto-classifies every ACTIVE/4-segment/geo-centered area — does NOT
     * give it its own AUTO membership row. Being captured into {@code sandbox_areas} is unaffected
     * by lifecycle_status, so area-3 remains available as the tamper test's repoint target while
     * staying genuinely UNASSIGNED to any region beforehand.
     */
    private int seedGeographyForMembershipAssignmentTamper(String citySlug) {
        int cityId = seedCity(citySlug, false);
        seedArea(cityId, citySlug + "|d|g|area-1", 13.01, 74.71, citySlug + "-district");
        seedArea(cityId, citySlug + "|d|g|area-2", 13.02, 74.72, null);
        seedArea(cityId, citySlug + "|d|g|area-3", 13.03, 74.73, null);
        jdbc.update("UPDATE public.areas SET lifecycle_status = 'INACTIVE' WHERE area_key = ?",
                citySlug + "|d|g|area-3");
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, citySlug);
        seedRegion(cityId, citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-1", citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-2", citySlug + "-north");
        return cityId;
    }

    /**
     * 3 areas; area-1 and area-2 are group members of the same group; area-3 is left OUT of any
     * group. Used by the group-member assignment-tamper test: repointing a group-member row's
     * {@code sandbox_area_id} from area-2 to area-3 (display_order untouched on both areas — the
     * seeded INSERT never sets it, so it stays {@code NULL} either way) leaves the row's own value
     * field (display_order) untouched, invisible to a checksum that hashes only that field. Also
     * seeds a region covering area-1/area-2 -- {@link CityLaunchGraphWriter#validate} rejects a city
     * with zero {@code city_regions} rows, independent of the group-member tamper under test.
     */
    private int seedGeographyForGroupMemberAssignmentTamper(String citySlug) {
        int cityId = seedCity(citySlug, false);
        seedArea(cityId, citySlug + "|d|g|area-1", 13.01, 74.71, citySlug + "-district");
        seedArea(cityId, citySlug + "|d|g|area-2", 13.02, 74.72, null);
        seedArea(cityId, citySlug + "|d|g|area-3", 13.03, 74.73, null);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, citySlug);
        seedRegion(cityId, citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-1", citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-2", citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-3", citySlug + "-north");
        seedRegionOverride(cityId, citySlug + "|d|g|area-1", "N");
        seedRegionOverride(cityId, citySlug + "|d|g|area-2", "N");
        int groupId = seedGroup(cityId, citySlug + "-belt", null);
        seedGroupMember(groupId, citySlug + "|d|g|area-1");
        seedGroupMember(groupId, citySlug + "|d|g|area-2");
        return cityId;
    }

    /**
     * 3 areas; area-1 and area-2 are members of the same region (so the zero-regions validation
     * check passes); an alias is seeded on area-1; area-3 is left unassigned to anything. Used by
     * the alias assignment-tamper test: repointing the alias row's {@code sandbox_area_id} from
     * area-1 to area-3 leaves the row's OWN value fields ({@code alias}/{@code alias_normalised})
     * untouched, so it is invisible to a checksum that hashes only those fields — the exact AC5 gap
     * RevisionChecksum's fix closes for {@code sandbox_area_aliases}.
     */
    private int seedGeographyForAliasAssignmentTamper(String citySlug) {
        int cityId = seedCity(citySlug, false);
        seedArea(cityId, citySlug + "|d|g|area-1", 13.01, 74.71, citySlug + "-district");
        seedArea(cityId, citySlug + "|d|g|area-2", 13.02, 74.72, null);
        seedArea(cityId, citySlug + "|d|g|area-3", 13.03, 74.73, null);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, citySlug);
        seedRegion(cityId, citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-1", citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-2", citySlug + "-north");
        seedAlias(cityId, citySlug + "|d|g|area-1", "Area One", "area one");
        return cityId;
    }

    /** Full valid canonical geography: 2 areas, 1 alias, 1 region (both areas), 1 group (both areas). */
    private int seedFullValidGeography(String citySlug, boolean cityActive) {
        int cityId = seedCity(citySlug, cityActive);
        seedArea(cityId, citySlug + "|d|g|area-1", 13.01, 74.71, citySlug + "-district");
        seedArea(cityId, citySlug + "|d|g|area-2", 13.02, 74.72, null);
        seedAlias(cityId, citySlug + "|d|g|area-1", "Area One", "area one");
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, citySlug);
        seedRegion(cityId, citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-1", citySlug + "-north");
        seedMembership(cityId, citySlug + "|d|g|area-2", citySlug + "-north");
        seedRegionOverride(cityId, citySlug + "|d|g|area-1", "N");
        seedRegionOverride(cityId, citySlug + "|d|g|area-2", "N");
        int groupId = seedGroup(cityId, citySlug + "-belt", null);
        seedGroupMember(groupId, citySlug + "|d|g|area-1");
        seedGroupMember(groupId, citySlug + "|d|g|area-2");
        return cityId;
    }

    /** Drives the REAL prepare -> async graph-write -> validate flow to a VALIDATED revision. */
    private long prepareAndValidate(int cityId) {
        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        pollUntil(() -> assertThat(revisionRepository.findById(prep.revisionId()).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        long revisionId = prep.revisionId();
        // #2151 PR A adds a 6th validation checklist column (agriDestinations); markValidated's
        // WHERE clause now requires all six, so this shared helper must tick all six too.
        for (String key : new String[] {"landing", "regions", "areaGroups", "areas", "listing", "agriDestinations"}) {
            validationService.toggleCheck(cityId, revisionId, key, true);
        }
        validationService.markValidated(cityId, revisionId);
        assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revisionRepository.findById(revisionId).orElseThrow().getPersistedRevisionChecksum())
                .as("CityLaunchGraphWriter must have stamped persisted_revision_checksum at PREPARED")
                .isNotBlank();
        return revisionId;
    }

    // =========================================================================================
    // 1 — happyPathPromotion
    // =========================================================================================

    @Test
    @DisplayName("happyPathPromotion: six prod tables get exact sandbox counts; PROMOTED; promoted_at set; "
            + "applied_revision_checksum written once; is_active flipped true")
    void happyPathPromotion() {
        int cityId = seedFullValidGeography("hp5", false);
        long revisionId = prepareAndValidate(cityId);

        PromotionReport report = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());

        assertThat(report.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(report.idempotentNoop()).isFalse();
        assertThat(report.promotedAt()).isNotNull();
        // #2163: seedFullValidGeography() seeds one INACTIVE "decoy" area (see
        // seedDecoyClassifiedArea) — areasPromoted/regionsPromoted counts include it (all captured
        // areas are promoted regardless of lifecycle_status; apply() also always materializes ALL 5
        // canonical CENTRAL_CARDINAL_4 regions, not just the hand-seeded "-north" one).
        // #2163 review fix: CityRegionOnboardingService's canonical-geometry classification source
        // ignores the (INACTIVE) decoy entirely — it only auto-classifies ACTIVE/4-segment/
        // geo-centered areas, which area-1/area-2 already are. Their regional_area_overrides rows
        // (both forced to "N") still force their effective region regardless, so
        // membershipsPromoted is exactly 2 (area-1, area-2) — the decoy no longer contributes a
        // third AUTO membership the way it did under the legacy classification source.
        assertThat(report.areasPromoted()).isEqualTo(3);
        assertThat(report.aliasesPromoted()).isEqualTo(1);
        assertThat(report.regionsPromoted()).isEqualTo(6);
        assertThat(report.membershipsPromoted()).isEqualTo(2);
        assertThat(report.groupsPromoted()).isEqualTo(1);
        assertThat(report.groupMembersPromoted()).isEqualTo(2);
        // AC10 characterization (#1955 Areas PR A, SLICE 2c): `seedCity()` in this test never seeds a
        // city_region_policy row, so CityLaunchGraphWriter's generation precondition gate (SLICE 2e)
        // skips navigation-tree generation for this fixture — the seventh table is a genuine
        // zero-row no-op here and the six-table happy path is otherwise UNCHANGED. A city that DOES
        // have a policy row generates a real tree at prepare — see
        // CityLaunchPrepareNavigationWiringIT for that end-to-end proof.
        assertThat(report.navigationNodesPromoted()).isZero();
        assertThat(report.cityActivated()).isTrue();

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);
        assertThat(revision.getPromotedAt()).isNotNull();
        assertThat(revision.getAppliedRevisionChecksum()).isNotBlank();
        assertThat(revision.getAppliedRevisionChecksum()).isEqualTo(revision.getPersistedRevisionChecksum());

        Boolean isActive = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActive).isTrue();

        Integer promotedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.city_launch_revision WHERE city_id = ? AND lifecycle_status = 'PROMOTED'", Integer.class, cityId);
        assertThat(promotedCount).isEqualTo(1);
    }

    // =========================================================================================
    // 1b — relaunchSupersedesOldPromoted
    // =========================================================================================

    @Test
    @DisplayName("relaunchSupersedesOldPromoted: launching a second revision for an ALREADY live city "
            + "supersedes the old PROMOTED revision atomically, back-links superseded_by, and leaves "
            + "exactly ONE PROMOTED revision")
    void relaunchSupersedesOldPromoted() {
        int cityId = seedFullValidGeography("rl5", false);
        long oldRevisionId = prepareAndValidate(cityId);

        // First launch -> PROMOTED
        promotionService.launch(cityId, oldRevisionId, ADMIN_ID.toString());

        // Prepare a new candidate
        long candidateRevisionId = prepareAndValidate(cityId);

        // Second launch -> supersedes old, promotes candidate
        PromotionReport report = promotionService.launch(cityId, candidateRevisionId, ADMIN_ID.toString());
        assertThat(report.lifecycleStatus()).isEqualTo("PROMOTED");

        CityLaunchRevision oldRevision = revisionRepository.findById(oldRevisionId).orElseThrow();
        assertThat(oldRevision.getLifecycleStatus()).isEqualTo(LifecycleStatus.SUPERSEDED);
        assertThat(oldRevision.getSupersededBy()).isEqualTo(candidateRevisionId);

        CityLaunchRevision newRevision = revisionRepository.findById(candidateRevisionId).orElseThrow();
        assertThat(newRevision.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);
        assertThat(newRevision.getSupersededBy()).isNull();

        Integer promotedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.city_launch_revision WHERE city_id = ? AND lifecycle_status = 'PROMOTED'", Integer.class, cityId);
        assertThat(promotedCount).isEqualTo(1);
    }

    // =========================================================================================
    // 2 — sequentialDoubleLaunch
    // =========================================================================================

    @Test
    @DisplayName("sequentialDoubleLaunch: first noop=false, second noop=true; applied_revision_checksum unchanged")
    void sequentialDoubleLaunch() {
        int cityId = seedFullValidGeography("dl5", false);
        long revisionId = prepareAndValidate(cityId);

        PromotionReport first = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(first.idempotentNoop()).isFalse();
        String checksumAfterFirst = revisionRepository.findById(revisionId).orElseThrow().getAppliedRevisionChecksum();

        PromotionReport second = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(second.idempotentNoop()).isTrue();
        assertThat(second.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(second.promotedAt()).isEqualTo(first.promotedAt());
        assertThat(second.areasPromoted()).isZero();
        assertThat(second.cityActivated()).isFalse();

        String checksumAfterSecond = revisionRepository.findById(revisionId).orElseThrow().getAppliedRevisionChecksum();
        assertThat(checksumAfterSecond).isEqualTo(checksumAfterFirst);
    }

    // =========================================================================================
    // 3 — concurrent2ThreadLaunch
    // =========================================================================================

    @Test
    @DisplayName("concurrent2ThreadLaunch: two REAL threads launch the SAME VALIDATED revision "
            + "concurrently -> exactly one genuine PROMOTED + one idempotent-noop (the loser blocks on the "
            + "winner's row lock and, once unblocked, observes the ALREADY-committed PROMOTED state -- "
            + "AC9's single-transaction design means a concurrent caller never observes a bare PROMOTING "
            + "window); geography written exactly once")
    void concurrent2ThreadLaunch() throws Exception {
        int cityId = seedFullValidGeography("cc5", false);
        long revisionId = prepareAndValidate(cityId);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch startGate = new CountDownLatch(1);
        try {
            List<Future<PromotionReport>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(pool.submit(() -> {
                    startGate.await();
                    return promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
                }));
            }
            startGate.countDown();

            AtomicInteger genuine = new AtomicInteger();
            AtomicInteger noop = new AtomicInteger();
            for (Future<PromotionReport> future : futures) {
                PromotionReport report = future.get(15, TimeUnit.SECONDS);
                if (report.idempotentNoop()) {
                    noop.incrementAndGet();
                } else {
                    genuine.incrementAndGet();
                }
            }
            assertThat(genuine.get()).isEqualTo(1);
            assertThat(noop.get()).isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        Integer areaCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.areas WHERE city_id = ?", Integer.class, cityId);
        // #2163: 3, not 2 — includes seedFullValidGeography()'s decoy area (see seedDecoyClassifiedArea).
        assertThat(areaCount).isEqualTo(3);
        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);
    }

    // =========================================================================================
    // 4 — checksumMismatchRejectZeroWrites
    // =========================================================================================

    @Test
    @DisplayName("checksumMismatchRejectZeroWrites: a sandbox row tampered after prep -> 422, zero prod "
            + "rows, revision stays VALIDATED")
    void checksumMismatchRejectZeroWrites() {
        int cityId = seedFullValidGeography("cm5", false);
        long revisionId = prepareAndValidate(cityId);

        SandboxArea tampered = sandboxAreaRepository.findByRevisionId(revisionId).get(0);
        jdbc.update("UPDATE public.sandbox_areas SET name = ? WHERE id = ?", "TAMPERED", tampered.getId());

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();
        Boolean isActiveAfterReject = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActiveAfterReject).isFalse();
    }

    // =========================================================================================
    // 4a — membershipAssignmentTamperRejectZeroWrites
    // =========================================================================================

    @Test
    @DisplayName("membershipAssignmentTamperRejectZeroWrites: a membership row repointed to a "
            + "DIFFERENT sandbox area (region_key/assignment_source, i.e. the value multiset, left "
            + "UNCHANGED) after prep -> 422, zero prod rows, revision stays VALIDATED (AC5: the "
            + "checksum must hash owning-area identity, not just membership value fields)")
    void membershipAssignmentTamperRejectZeroWrites() {
        int cityId = seedGeographyForMembershipAssignmentTamper("amt5");
        long revisionId = prepareAndValidate(cityId);

        Long area1SandboxId = sandboxAreaRepository.findByRevisionIdAndAreaKey(revisionId, "amt5|d|g|area-1")
                .orElseThrow().getId();
        Long area3SandboxId = sandboxAreaRepository.findByRevisionIdAndAreaKey(revisionId, "amt5|d|g|area-3")
                .orElseThrow().getId();
        SandboxCityRegionMembership tamperedMembership =
                sandboxMembershipRepository.findByRevisionIdAndSandboxAreaId(revisionId, area1SandboxId).orElseThrow();

        // Repoint the membership FK only -- region_key and assignment_source (the row's only
        // hashed value fields before the fix) are left completely untouched, so the OLD checksum
        // algorithm would see this as a no-op.
        jdbc.update("UPDATE public.sandbox_city_region_memberships SET sandbox_area_id = ? WHERE id = ?",
                area3SandboxId, tamperedMembership.getId());

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();
        Boolean isActiveAfterReject = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActiveAfterReject).isFalse();
    }

    // =========================================================================================
    // 4b — groupMemberAssignmentTamperRejectZeroWrites
    // =========================================================================================

    @Test
    @DisplayName("groupMemberAssignmentTamperRejectZeroWrites: a group-member row repointed to a "
            + "DIFFERENT sandbox area (display_order, i.e. the value multiset, left UNCHANGED) after "
            + "prep -> 422, zero prod rows, revision stays VALIDATED (AC5: the checksum must hash "
            + "owning-group + owning-area identity, not just display_order)")
    void groupMemberAssignmentTamperRejectZeroWrites() {
        int cityId = seedGeographyForGroupMemberAssignmentTamper("gmt5");
        long revisionId = prepareAndValidate(cityId);

        Long area2SandboxId = sandboxAreaRepository.findByRevisionIdAndAreaKey(revisionId, "gmt5|d|g|area-2")
                .orElseThrow().getId();
        Long area3SandboxId = sandboxAreaRepository.findByRevisionIdAndAreaKey(revisionId, "gmt5|d|g|area-3")
                .orElseThrow().getId();
        SandboxAreaGroupMember tamperedMember = sandboxGroupMemberRepository.findByRevisionId(revisionId).stream()
                .filter(gm -> gm.getSandboxAreaId().equals(area2SandboxId))
                .findFirst()
                .orElseThrow();

        // Repoint the group-member FK only -- display_order (the row's only hashed value field
        // before the fix, and NULL on both area-2's and area-3's row here) is left untouched, so
        // the OLD checksum algorithm would see this as a no-op.
        jdbc.update("UPDATE public.sandbox_area_group_members SET sandbox_area_id = ? WHERE id = ?",
                area3SandboxId, tamperedMember.getId());

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();
        Boolean isActiveAfterReject = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActiveAfterReject).isFalse();
    }

    // =========================================================================================
    // 4c — aliasAssignmentTamperRejectZeroWrites
    // =========================================================================================

    @Test
    @DisplayName("aliasAssignmentTamperRejectZeroWrites: an alias row repointed to a DIFFERENT "
            + "sandbox area (alias/alias_normalised, i.e. the value multiset, left UNCHANGED) after "
            + "prep -> 422, zero prod rows, revision stays VALIDATED (AC5: the checksum must hash "
            + "owning-area identity, not just alias value fields)")
    void aliasAssignmentTamperRejectZeroWrites() {
        int cityId = seedGeographyForAliasAssignmentTamper("aat5");
        long revisionId = prepareAndValidate(cityId);

        Long area1SandboxId = sandboxAreaRepository.findByRevisionIdAndAreaKey(revisionId, "aat5|d|g|area-1")
                .orElseThrow().getId();
        Long area3SandboxId = sandboxAreaRepository.findByRevisionIdAndAreaKey(revisionId, "aat5|d|g|area-3")
                .orElseThrow().getId();
        SandboxAreaAlias tamperedAlias = sandboxAliasRepository.findByRevisionId(revisionId).stream()
                .filter(al -> al.getSandboxAreaId().equals(area1SandboxId))
                .findFirst()
                .orElseThrow();

        // Repoint the alias FK only -- alias/aliasNormalised (the row's only hashed value fields
        // before the fix) are left completely untouched, so the OLD checksum algorithm would see
        // this as a no-op.
        jdbc.update("UPDATE public.sandbox_area_aliases SET sandbox_area_id = ? WHERE id = ?",
                area3SandboxId, tamperedAlias.getId());

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();
        Boolean isActiveAfterReject = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActiveAfterReject).isFalse();
    }

    // =========================================================================================
    // 5 — throwMidWriteRollbackToValidated
    // =========================================================================================

    @Test
    @DisplayName("throwMidWriteRollbackToValidated: canonical drift on the SECOND area triggers a "
            + "mid-write exception -> the WHOLE transaction (including the FIRST area's already-executed "
            + "INSERT) rolls back; VALIDATED, zero rows across all six tables, is_active untouched; a "
            + "later launch (after clearing the conflict) then succeeds")
    void throwMidWriteRollbackToValidated() {
        int cityId = seedFullValidGeography("rb5", false);
        long revisionId = prepareAndValidate(cityId);

        // Checksum verification is purely over the FROZEN sandbox snapshot, never production -- so
        // clearing production geography AFTER prep (simulating a since-cleaned/never-yet-promoted
        // canonical state) does not affect the checksum gate, and forces promoteAreas() to genuinely
        // INSERT rather than merely verify-equal, so this test can prove a real INSERT rolls back.
        jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                + "(SELECT id FROM public.area_groups WHERE city_id = ?)", cityId);
        jdbc.update("DELETE FROM public.area_groups WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.area_alias WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);

        // Force a mid-write canonical-drift failure on area-2 (alphabetically AFTER area-1, so
        // area-1's INSERT genuinely executes first, within the same transaction, before the throw).
        // A DIFFERENT city owns this area_key now, so promoteAreas' existing-row read finds content
        // that disagrees with the sandbox snapshot.
        int otherCityId = seedCity("rb5-other", false);
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, ?, ?, ?)",
                "rb5|d|g|area-2", otherCityId, "CONFLICTING-NAME", 99.0, 99.0);

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();

        // area-1's INSERT was rolled back too -- the WHOLE transaction, not just the failing statement.
        Integer area1Count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.areas WHERE area_key = ?", Integer.class, "rb5|d|g|area-1");
        assertThat(area1Count).isZero();
        Integer regionCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        assertThat(regionCount).isZero();
        Boolean isActiveAfterFailure = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActiveAfterFailure).isFalse();

        // Clear the conflicting row and retry -- a later launch succeeds.
        jdbc.update("DELETE FROM public.areas WHERE area_key = ?", "rb5|d|g|area-2");
        PromotionReport retry = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(retry.lifecycleStatus()).isEqualTo("PROMOTED");
        assertThat(retry.idempotentNoop()).isFalse();
    }

    // =========================================================================================
    // 5b — throwMidWriteRollbackLeavesOldPromotedUntouched
    // =========================================================================================

    @Test
    @DisplayName("throwMidWriteRollbackLeavesOldPromotedUntouched: if replacing an ALREADY live city fails "
            + "mid-write, the WHOLE transaction rolls back; the old revision stays PROMOTED, the candidate "
            + "stays VALIDATED, and geography is untouched")
    void throwMidWriteRollbackLeavesOldPromotedUntouched() {
        int cityId = seedFullValidGeography("rbo5", false);
        long oldRevisionId = prepareAndValidate(cityId);

        // First launch -> PROMOTED
        promotionService.launch(cityId, oldRevisionId, ADMIN_ID.toString());

        // Prepare candidate
        long candidateRevisionId = prepareAndValidate(cityId);

        // Force canonical drift failure
        jdbc.update("UPDATE public.areas SET district = ? WHERE area_key = ?", "DRIFTED-DISTRICT-ROLLBACK", "rbo5|d|g|area-2");

        assertThatThrownBy(() -> promotionService.launch(cityId, candidateRevisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision oldRevision = revisionRepository.findById(oldRevisionId).orElseThrow();
        assertThat(oldRevision.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);
        assertThat(oldRevision.getSupersededBy()).isNull();

        CityLaunchRevision candidateRevision = revisionRepository.findById(candidateRevisionId).orElseThrow();
        assertThat(candidateRevision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(candidateRevision.getSupersededBy()).isNull();

        Integer promotedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.city_launch_revision WHERE city_id = ? AND lifecycle_status = 'PROMOTED'", Integer.class, cityId);
        assertThat(promotedCount).isEqualTo(1);
    }

    // =========================================================================================
    // 6 — activationFalseToTrueOnly + existingActiveUntouched
    // =========================================================================================

    @Test
    @DisplayName("activationFalseToTrueOnly + existingActiveUntouched: is_active flips false->true for the "
            + "launched city; a separately-seeded already-active city is left untouched")
    void activationFalseToTrueOnly_existingActiveUntouched() {
        int cityId = seedFullValidGeography("ac5b", false);
        int alreadyActiveCityId = seedCity("aa5b", true);

        long revisionId = prepareAndValidate(cityId);
        promotionService.launch(cityId, revisionId, ADMIN_ID.toString());

        Boolean launchedCityActive = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(launchedCityActive).isTrue();

        Boolean untouchedCityActive = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, alreadyActiveCityId);
        assertThat(untouchedCityActive).isTrue();
    }

    // =========================================================================================
    // 7 — nonValidatedStateConflict
    // =========================================================================================

    @Test
    @DisplayName("nonValidatedStateConflict: PREPARING/PREPARED/FAILED/SUPERSEDED each -> 409, zero writes")
    void nonValidatedStateConflict() {
        for (String status : new String[] {"PREPARING", "PREPARED", "FAILED", "SUPERSEDED"}) {
            int cityId = seedCity("nv5-" + status.toLowerCase(), false);
            long revisionId = jdbc.queryForObject(
                    "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                            + "prep_state, prep_stage, persisted_revision_checksum) "
                            + "VALUES (?, 1, ?, 'DONE', 6, 'irrelevant') RETURNING id",
                    Long.class, cityId, status);

            assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                    .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                    .extracting(ex -> ex.getStatusCode().value())
                    .isEqualTo(409);

            String lifecycleAfter = jdbc.queryForObject(
                    "SELECT lifecycle_status FROM public.city_launch_revision WHERE id = ?", String.class, revisionId);
            assertThat(lifecycleAfter).isEqualTo(status);
            Boolean isActive = jdbc.queryForObject(
                    "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
            assertThat(isActive).isFalse();
        }
    }

    // =========================================================================================
    // 8 — canonicalDrift
    // =========================================================================================

    @Test
    @DisplayName("canonicalDrift: a pre-existing prod area with the same area_key but different content "
            + "-> 422 zero-writes, stays VALIDATED")
    void canonicalDrift() {
        int cityId = seedCity("cd5", false);
        seedArea(cityId, "cd5|d|g|area-1", 13.01, 74.71, "seed-district");
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        seedDecoyClassifiedArea(cityId, "cd5");
        seedRegion(cityId, "cd5-north");
        seedMembership(cityId, "cd5|d|g|area-1", "cd5-north");
        long revisionId = prepareAndValidate(cityId);

        // Mutate the canonical (production) row AFTER prep, so promotion's re-read finds a row that
        // disagrees with the frozen sandbox snapshot's content.
        jdbc.update("UPDATE public.areas SET district = ? WHERE area_key = ?", "DRIFTED-DISTRICT", "cd5|d|g|area-1");

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(422);

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
    }

    // =========================================================================================
    // 9 — cityIdRevisionIdScopingBypass
    // =========================================================================================

    @Test
    @DisplayName("cityIdRevisionIdScopingBypass: launch(cityId=A, revisionId of city B) -> 404, zero writes")
    void cityIdRevisionIdScopingBypass() {
        int cityAId = seedCity("sc5-a", false);
        int cityBId = seedFullValidGeography("sc5-b", false);
        long revisionOfCityB = prepareAndValidate(cityBId);

        assertThatThrownBy(() -> promotionService.launch(cityAId, revisionOfCityB, ADMIN_ID.toString()))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.type(ResponseStatusException.class))
                .extracting(ex -> ex.getStatusCode().value())
                .isEqualTo(404);

        CityLaunchRevision revision = revisionRepository.findById(revisionOfCityB).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        Boolean cityAActive = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityAId);
        assertThat(cityAActive).isFalse();
    }

    // =========================================================================================
    // 10 — nonNullSandboxFieldsWritten
    // =========================================================================================

    @Test
    @DisplayName("nonNullSandboxFieldsWritten: sandbox rows with NULLs in nullable columns -> prod rows "
            + "written with matching NULLs (district, group subtitle)")
    void nonNullSandboxFieldsWritten() {
        int cityId = seedFullValidGeography("nn5", false);
        long revisionId = prepareAndValidate(cityId);

        // Clear canonical geography AFTER prep (checksum is over the frozen sandbox snapshot only)
        // so promotion genuinely INSERTs fresh rows rather than verifying pre-existing ones --
        // proving the INSERT path itself preserves NULLs, not just that the seed data already had them.
        jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                + "(SELECT id FROM public.area_groups WHERE city_id = ?)", cityId);
        jdbc.update("DELETE FROM public.area_groups WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.area_alias WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);

        PromotionReport report = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(report.idempotentNoop()).isFalse();
        // #2163: 3, not 2 — includes seedFullValidGeography()'s decoy area (see seedDecoyClassifiedArea).
        assertThat(report.areasPromoted()).isEqualTo(3);

        String district = jdbc.queryForObject(
                "SELECT district FROM public.areas WHERE area_key = ?", String.class, "nn5|d|g|area-2");
        assertThat(district).isNull();

        String subtitle = jdbc.queryForObject(
                "SELECT subtitle FROM public.area_groups WHERE city_id = ? AND slug = ?",
                String.class, cityId, "nn5-belt");
        assertThat(subtitle).isNull();
    }

    // =========================================================================================
    // 11 — seventhTablePromotion: verbatim copy + parent remap (#1955 Areas PR A, SLICE 2c)
    // =========================================================================================

    @Test
    @DisplayName("seventhTablePromotion: a sandbox nav tree (1 DIRECTION root + 2 AREA leaves — was a "
            + "1 CLUSTER root pre-#1956, fixed per the D6(d) ruling so this fixture stays "
            + "contract-shaped) promotes verbatim, with parent_node_id remapped from sandbox "
            + "surrogate ids to production ids; ancestor_keys copied unchanged")
    void seventhTablePromotion_verbatimWithParentRemap() {
        int cityId = seedFullValidGeography("nv7", false);
        long revisionId = prepareAndValidate(cityId);

        long rootSandboxId = seedSandboxNavigationNode(
                revisionId, "nv7-north", "DIRECTION", null, "d:nv7-north", null,
                List.of("nv7|d|g|area-1", "nv7|d|g|area-2"), "Nv7 North", 1, 0, List.of(), 2,
                13.015, 74.715, 13.01, 74.71, 13.02, 74.72, "fp-nv7-root");
        seedSandboxNavigationNode(
                revisionId, "nv7-north", "AREA", rootSandboxId, "a:nv7|d|g|area-1", "nv7|d|g|area-1",
                List.of("nv7|d|g|area-1"), "Area One", 1, 1, List.of("d:nv7-north"), 1,
                13.01, 74.71, 13.01, 74.71, 13.01, 74.71, "fp-nv7-leaf");
        seedSandboxNavigationNode(
                revisionId, "nv7-north", "AREA", rootSandboxId, "a:nv7|d|g|area-2", "nv7|d|g|area-2",
                List.of("nv7|d|g|area-2"), "Area Two", 2, 1, List.of("d:nv7-north"), 1,
                13.02, 74.72, 13.02, 74.72, 13.02, 74.72, "fp-nv7-leaf");
        recomputeAndPersistChecksumWithNavigationNodes(revisionId);

        PromotionReport report = promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(report.idempotentNoop()).isFalse();
        assertThat(report.navigationNodesPromoted()).isEqualTo(3);

        List<NavigationNode> prodNodes = navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(cityId);
        assertThat(prodNodes).hasSize(3);

        NavigationNode root = navigationNodeRepository
                .findByCityIdAndNodeKey(cityId, "d:nv7-north").orElseThrow();
        assertThat(root.getParentNodeId()).isNull();
        assertThat(root.getNodeType()).isEqualTo("DIRECTION");
        assertThat(root.getAreaKey()).isNull();
        assertThat(root.getRepresentativeAreaKeys()).containsExactly("nv7|d|g|area-1", "nv7|d|g|area-2");
        assertThat(root.getDisplayLabel()).isEqualTo("Nv7 North");
        assertThat(root.getDescendantAreaCount()).isEqualTo(2);
        assertThat(root.getPolicyFingerprint()).isEqualTo("fp-nv7-root");
        assertThat(root.getAncestorKeys()).isEmpty();

        NavigationNode leaf1 = navigationNodeRepository.findByCityIdAndNodeKey(cityId, "a:nv7|d|g|area-1").orElseThrow();
        assertThat(leaf1.getNodeType()).isEqualTo("AREA");
        assertThat(leaf1.getAreaKey()).isEqualTo("nv7|d|g|area-1");
        // Parent remapped from the sandbox surrogate id to the PRODUCTION surrogate id of the root.
        assertThat(leaf1.getParentNodeId()).isEqualTo(root.getId());
        // ancestor_keys are node_keys, copied VERBATIM — never remapped.
        assertThat(leaf1.getAncestorKeys()).containsExactly("d:nv7-north");
        assertThat(leaf1.getDisplayOrder()).isEqualTo(1);
        assertThat(leaf1.getDepth()).isEqualTo(1);

        NavigationNode leaf2 = navigationNodeRepository.findByCityIdAndNodeKey(cityId, "a:nv7|d|g|area-2").orElseThrow();
        assertThat(leaf2.getParentNodeId()).isEqualTo(root.getId());
        assertThat(leaf2.getAreaKey()).isEqualTo("nv7|d|g|area-2");
    }

    // =========================================================================================
    // 12 — seventhTableFailureRollsBackAllSeven
    // =========================================================================================

    @Test
    @DisplayName("seventhTableFailureRollsBackAllSeven: an FK-violating nav row (area_key referencing "
            + "no production area anywhere) fails the LAST table's insert -> the WHOLE transaction "
            + "(all six already-executed geography inserts included) rolls back; revision stays "
            + "VALIDATED, zero rows across all seven tables, is_active untouched")
    void seventhTableFailureRollsBackAllSeven() {
        int cityId = seedFullValidGeography("rb7", false);
        long revisionId = prepareAndValidate(cityId);

        // Force genuine INSERTs (not compare-equal no-ops) on all six geography tables, exactly as
        // throwMidWriteRollbackToValidated does above, so this test proves those six ALSO roll back,
        // not merely that the seventh table's own row count stays zero.
        jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                + "(SELECT id FROM public.area_groups WHERE city_id = ?)", cityId);
        jdbc.update("DELETE FROM public.area_groups WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.area_alias WHERE city_id = ?", cityId);
        jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);

        // A valid root (DIRECTION — was CLUSTER pre-#1956, fixed per the D6(d) ruling), then an
        // AREA leaf whose area_key references NO area anywhere in production (not even under
        // another city) -> navigation_nodes.area_key's FK violates on INSERT.
        long rootSandboxId = seedSandboxNavigationNode(
                revisionId, "rb7-north", "DIRECTION", null, "d:rb7-north", null,
                List.of("rb7|d|g|area-1"), "Rb7 North", 1, 0, List.of(), 1,
                13.01, 74.71, 13.01, 74.71, 13.01, 74.71, "fp-rb7-root");
        seedSandboxNavigationNode(
                revisionId, "rb7-north", "AREA", rootSandboxId, "a:rb7|d|g|area-does-not-exist",
                "rb7|d|g|area-does-not-exist", List.of("rb7|d|g|area-does-not-exist"), "Ghost Area", 1, 1,
                List.of("d:rb7-north"), 1,
                13.05, 74.75, 13.05, 74.75, 13.05, 74.75, "fp-rb7-leaf");
        recomputeAndPersistChecksumWithNavigationNodes(revisionId);

        assertThatThrownBy(() -> promotionService.launch(cityId, revisionId, ADMIN_ID.toString()))
                .isNotNull();

        CityLaunchRevision revision = revisionRepository.findById(revisionId).orElseThrow();
        assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.VALIDATED);
        assertThat(revision.getAppliedRevisionChecksum()).isNull();

        Integer areaCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.areas WHERE city_id = ?", Integer.class, cityId);
        assertThat(areaCount).isZero();
        Integer navNodeCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM public.navigation_nodes WHERE city_id = ?", Integer.class, cityId);
        assertThat(navNodeCount).isZero();
        Boolean isActiveAfterFailure = jdbc.queryForObject(
                "SELECT is_active FROM public.cities WHERE id = ?", Boolean.class, cityId);
        assertThat(isActiveAfterFailure).isFalse();
    }

    // =========================================================================================
    // 13 — relaunchReplacesPriorNavigationTree (replace-discipline)
    // =========================================================================================

    @Test
    @DisplayName("relaunchReplacesPriorNavigationTree: a second VALIDATED revision for the SAME city, "
            + "with a DIFFERENTLY-SHAPED nav tree, clears the first revision's promoted nav rows before "
            + "inserting its own -- no partial-unique (city_id, area_key) violation, and the prior "
            + "revision's rows are genuinely gone afterward")
    void relaunchReplacesPriorNavigationTree() {
        int cityId = seedFullValidGeography("rp7", false);

        // [#1956 D3/D6, fixed] v1 = DIRECTION -> CLUSTER (a "Local Destination") -> 2 AREA leaves
        // (was a bare CLUSTER root pre-#1956 — fixed per the D6(d) ruling so this fixture stays
        // contract-shaped).
        long revision1 = prepareAndValidate(cityId);
        long direction1 = seedSandboxNavigationNode(
                revision1, "rp7-north", "DIRECTION", null, "d:rp7-north", null,
                List.of("rp7|d|g|area-1", "rp7|d|g|area-2"), "Rp7 North v1", 1, 0, List.of(), 2,
                13.015, 74.715, 13.01, 74.71, 13.02, 74.72, "fp-rp7-v1-direction");
        long root1 = seedSandboxNavigationNode(
                revision1, "rp7-north", "CLUSTER", direction1, "c:rp7-north:rp7|d|g|area-1-rp7|d|g|area-2", null,
                List.of("rp7|d|g|area-1", "rp7|d|g|area-2"), "Rp7 North v1", 1, 1, List.of("d:rp7-north"), 2,
                13.015, 74.715, 13.01, 74.71, 13.02, 74.72, "fp-rp7-v1-root");
        seedSandboxNavigationNode(
                revision1, "rp7-north", "AREA", root1, "a:rp7|d|g|area-1", "rp7|d|g|area-1",
                List.of("rp7|d|g|area-1"), "Area One", 1, 2, List.of("d:rp7-north", "c:rp7-north:rp7|d|g|area-1-rp7|d|g|area-2"), 1,
                13.01, 74.71, 13.01, 74.71, 13.01, 74.71, "fp-rp7-v1-leaf");
        seedSandboxNavigationNode(
                revision1, "rp7-north", "AREA", root1, "a:rp7|d|g|area-2", "rp7|d|g|area-2",
                List.of("rp7|d|g|area-2"), "Area Two", 2, 2, List.of("d:rp7-north", "c:rp7-north:rp7|d|g|area-1-rp7|d|g|area-2"), 1,
                13.02, 74.72, 13.02, 74.72, 13.02, 74.72, "fp-rp7-v1-leaf");
        recomputeAndPersistChecksumWithNavigationNodes(revision1);

        PromotionReport firstReport = promotionService.launch(cityId, revision1, ADMIN_ID.toString());
        assertThat(firstReport.navigationNodesPromoted()).isEqualTo(4);
        assertThat(navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(cityId)).hasSize(4);

        // Second revision, same city, SAME canonical geography (unchanged) but a DIFFERENT nav-tree
        // shape: no CLUSTER this time -- the 2 AREA leaves sit directly beneath the DIRECTION root
        // (still contract-shaped: City -> Direction -> AREA, just without a Local Destination level).
        long revision2 = prepareAndValidate(cityId);
        // uq_clr_current_promoted allows only ONE non-superseded PROMOTED row per city; supersede
        // revision1 (out of this test's scope to exercise the real rerunSuperseding flow, which is
        // for PREPARED/VALIDATED revisions, not an already-PROMOTED one) so revision2 can promote.
        jdbc.update("UPDATE public.city_launch_revision SET superseded_by = ? WHERE id = ?", revision2, revision1);
        long direction2 = seedSandboxNavigationNode(
                revision2, "rp7-north", "DIRECTION", null, "d:rp7-north", null,
                List.of("rp7|d|g|area-1", "rp7|d|g|area-2"), "Rp7 North v2", 1, 0, List.of(), 2,
                13.015, 74.715, 13.01, 74.71, 13.02, 74.72, "fp-rp7-v2-direction");
        seedSandboxNavigationNode(
                revision2, "rp7-north", "AREA", direction2, "a:rp7|d|g|area-1", "rp7|d|g|area-1",
                List.of("rp7|d|g|area-1"), "Area One (flat)", 1, 1, List.of("d:rp7-north"), 1,
                13.01, 74.71, 13.01, 74.71, 13.01, 74.71, "fp-rp7-v2-leaf");
        seedSandboxNavigationNode(
                revision2, "rp7-north", "AREA", direction2, "a:rp7|d|g|area-2", "rp7|d|g|area-2",
                List.of("rp7|d|g|area-2"), "Area Two (flat)", 2, 1, List.of("d:rp7-north"), 1,
                13.02, 74.72, 13.02, 74.72, 13.02, 74.72, "fp-rp7-v2-leaf");
        recomputeAndPersistChecksumWithNavigationNodes(revision2);

        PromotionReport secondReport = promotionService.launch(cityId, revision2, ADMIN_ID.toString());
        assertThat(secondReport.idempotentNoop()).isFalse();
        assertThat(secondReport.navigationNodesPromoted()).isEqualTo(3);

        List<NavigationNode> prodNodesAfterRelaunch =
                navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(cityId);
        assertThat(prodNodesAfterRelaunch).hasSize(3);
        assertThat(prodNodesAfterRelaunch).filteredOn(n -> "AREA".equals(n.getNodeType())).hasSize(2)
                .allSatisfy(n -> assertThat(n.getParentNodeId()).isNotNull());
        assertThat(prodNodesAfterRelaunch).filteredOn(n -> "DIRECTION".equals(n.getNodeType())).hasSize(1)
                .allSatisfy(n -> assertThat(n.getParentNodeId()).isNull());
        // The first revision's CLUSTER root is genuinely gone -- not just superseded/orphaned.
        assertThat(navigationNodeRepository.findByCityIdAndNodeKey(
                cityId, "c:rp7-north:rp7|d|g|area-1-rp7|d|g|area-2")).isEmpty();
    }
}
