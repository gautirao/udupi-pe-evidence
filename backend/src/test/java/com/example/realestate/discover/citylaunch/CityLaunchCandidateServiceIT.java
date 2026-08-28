package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.SandboxNavigationNodeRepository;
import com.example.realestate.discover.navigation.SandboxNavigationOverrideRepository;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres, real prepare/validate/promote pipeline) for
 * #2121 "Edit revision": {@link CityLaunchCandidateService#editFromLive}.
 *
 * <p>Drives the REAL prepare -&gt; async graph-write -&gt; validate -&gt; promote pipeline (mirrors
 * {@link CityLaunchPromotionServiceIT}'s fixtures verbatim) to obtain a genuine PROMOTED (LIVE)
 * revision with real rows across all nine {@code sandbox_*} tables — never a hand-seeded fake —
 * then exercises {@code editFromLive}'s cloning, checksum-identity, override-mutation-on-clone,
 * promotion-of-clone, and conflict-rejection contracts per the #2121 approved plan's [tests]
 * section and the qa-fast pre-implementation risk scan (row-drop via defensive {@code continue}
 * branches in the FK-remap loops is the primary risk this file targets).
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
class CityLaunchCandidateServiceIT {

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
    @Autowired private CityLaunchCandidateService candidateService;
    @Autowired private CityLaunchNavigationOverrideService overrideService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxAreaAliasRepository sandboxAreaAliasRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    @Autowired private SandboxAreaGroupRepository sandboxAreaGroupRepository;
    @Autowired private SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    @Autowired private SandboxNavigationNodeRepository sandboxNavigationNodeRepository;
    @Autowired private SandboxNavigationOverrideRepository sandboxNavigationOverrideRepository;
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
            Integer cityId = jdbc.queryForObject(
                    "SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.agri_destination_classification WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                    + "(SELECT id FROM public.area_groups WHERE city_id = ?)", cityId);
            jdbc.update("DELETE FROM public.area_groups WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
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

    // ── Fixture helpers (mirrors CityLaunchPromotionServiceIT's proven fixture set) ────────────

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

    private void seedMembership(int cityId, String areaKey, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source) "
                        + "VALUES (?, ?, ?, 'OVERRIDE')",
                cityId, areaKey, regionKey);
    }

    private void seedRegionPolicy(int cityId, String regionModel, double centralRadiusKm) {
        jdbc.update(
                "INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km) "
                        + "VALUES (?, ?, ?)",
                cityId, regionModel, centralRadiusKm);
    }

    private void seedRegionOverride(int cityId, String areaKey, String regionKey) {
        jdbc.update(
                "INSERT INTO public.regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                        + "VALUES (?, ?, ?, 'test-fixture-2121', 'test')",
                cityId, areaKey, regionKey);
    }

    private void seedDecoyClassifiedArea(int cityId, String citySlug) {
        String decoyAreaKey = citySlug + "|d|g|decoy-2121";
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

    /** Full valid canonical geography: 2 areas, 1 alias, 1 region (both areas), 1 group (both areas). */
    private int seedFullValidGeography(String citySlug) {
        int cityId = seedCity(citySlug, false);
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
        for (String key : new String[] {"landing", "regions", "areaGroups", "areas", "listing", "agriDestinations"}) {
            validationService.toggleCheck(cityId, revisionId, key, true);
        }
        validationService.markValidated(cityId, revisionId);
        return revisionId;
    }

    /** Drives prepare -> validate -> promote to a genuine PROMOTED (LIVE) revision. */
    private long prepareValidateAndPromote(int cityId) {
        long revisionId = prepareAndValidate(cityId);
        promotionService.launch(cityId, revisionId, ADMIN_ID.toString());
        assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PROMOTED);
        return revisionId;
    }

    // ── Tests ────────────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("editFromLive clones all nine sandbox_* row sets row-for-row and stamps provenance")
    void editFromLive_clonesAllNineSandboxTables() {
        int cityId = seedFullValidGeography("ef1");
        long liveId = prepareValidateAndPromote(cityId);

        PrepareResponse response = candidateService.editFromLive(cityId, liveId, ADMIN_ID);
        assertThat(response.status()).isEqualTo("prepared");
        long candidateId = response.revisionId();

        CityLaunchRevision candidate = revisionRepository.findById(candidateId).orElseThrow();
        assertThat(candidate.getLifecycleStatus()).isEqualTo(LifecycleStatus.PREPARED);
        assertThat(candidate.getPrepState()).isEqualTo(PrepState.DONE);
        assertThat(candidate.getClonedFromRevisionId()).isEqualTo(liveId);
        assertThat(candidate.getPersistedRevisionChecksum()).isNotBlank();

        // The LIVE revision itself must be untouched (still PROMOTED, still owns its own rows).
        assertThat(revisionRepository.findById(liveId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PROMOTED);

        // Row-for-row parity across all nine sandbox_* tables — the primary target of the qa-fast
        // HIGH risk (silent row drops via defensive `continue` branches in the FK-remap loops).
        assertThat(sandboxAreaRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxAreaRepository.findByRevisionId(liveId))
                .isNotEmpty();
        assertThat(sandboxAreaAliasRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxAreaAliasRepository.findByRevisionId(liveId))
                .isNotEmpty();
        assertThat(sandboxCityRegionRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxCityRegionRepository.findByRevisionId(liveId))
                .isNotEmpty();
        assertThat(sandboxCityRegionMembershipRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxCityRegionMembershipRepository.findByRevisionId(liveId))
                .isNotEmpty();
        assertThat(sandboxAreaGroupRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxAreaGroupRepository.findByRevisionId(liveId))
                .isNotEmpty();
        assertThat(sandboxAreaGroupMemberRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxAreaGroupMemberRepository.findByRevisionId(liveId))
                .isNotEmpty();
        assertThat(sandboxNavigationNodeRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxNavigationNodeRepository.findByRevisionId(liveId));
        assertThat(sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(candidateId))
                .hasSameSizeAs(sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(liveId));
        assertThat(sandboxAgriDestinationClassificationRepository.findByRevisionId(candidateId))
                .hasSameSizeAs(sandboxAgriDestinationClassificationRepository.findByRevisionId(liveId))
                .isNotEmpty();
    }

    @Test
    @DisplayName("editFromLive's checksum over the cloned rows equals the checksum over the source LIVE rows")
    void editFromLive_checksumIdentity() {
        int cityId = seedFullValidGeography("ef2");
        long liveId = prepareValidateAndPromote(cityId);

        long candidateId = candidateService.editFromLive(cityId, liveId, ADMIN_ID).revisionId();

        // Independently recomputed here (never trusting the service's own stamped value alone) —
        // a row-drop bug could still produce "a valid but wrong" checksum if not compared against
        // an independently-recomputed checksum over the SOURCE revision's own rows (qa-fast MED risk).
        String liveChecksum = RevisionChecksum.compute(
                sandboxAreaRepository.findByRevisionId(liveId),
                sandboxAreaAliasRepository.findByRevisionId(liveId),
                sandboxCityRegionRepository.findByRevisionId(liveId),
                sandboxCityRegionMembershipRepository.findByRevisionId(liveId),
                sandboxAreaGroupRepository.findByRevisionId(liveId),
                sandboxAreaGroupMemberRepository.findByRevisionId(liveId),
                sandboxNavigationNodeRepository.findByRevisionId(liveId),
                sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(liveId),
                sandboxAgriDestinationClassificationRepository.findByRevisionId(liveId));

        String candidateChecksum = RevisionChecksum.compute(
                sandboxAreaRepository.findByRevisionId(candidateId),
                sandboxAreaAliasRepository.findByRevisionId(candidateId),
                sandboxCityRegionRepository.findByRevisionId(candidateId),
                sandboxCityRegionMembershipRepository.findByRevisionId(candidateId),
                sandboxAreaGroupRepository.findByRevisionId(candidateId),
                sandboxAreaGroupMemberRepository.findByRevisionId(candidateId),
                sandboxNavigationNodeRepository.findByRevisionId(candidateId),
                sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(candidateId),
                sandboxAgriDestinationClassificationRepository.findByRevisionId(candidateId));

        assertThat(candidateChecksum).isEqualTo(liveChecksum);

        CityLaunchRevision candidate = revisionRepository.findById(candidateId).orElseThrow();
        assertThat(candidate.getPersistedRevisionChecksum()).isEqualTo(candidateChecksum);
    }

    @Test
    @DisplayName("An override mutation succeeds on the clone, proving it is genuinely PREPARED and usable")
    void editFromLive_overrideMutationSucceedsOnClone() {
        int cityId = seedFullValidGeography("ef3");
        long liveId = prepareValidateAndPromote(cityId);
        long candidateId = candidateService.editFromLive(cityId, liveId, ADMIN_ID).revisionId();

        AdminNavigationOverrideRequest request = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "ef3|d|g|area-2", null, null, null, null, null, "test override on clone");

        NavigationTreeDiffResponse diff = overrideService.createOverride(cityId, candidateId, request, ADMIN_ID);
        assertThat(diff).isNotNull();
        assertThat(sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(candidateId))
                .hasSize(1);

        // The clone stays PREPARED — createOverride only regenerates/re-stamps, never transitions
        // lifecycle.
        assertThat(revisionRepository.findById(candidateId).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED);
        // The source LIVE revision's own rows are untouched by a mutation on the clone.
        assertThat(sandboxNavigationOverrideRepository.findByRevisionIdOrderByApplyOrderAsc(liveId)).isEmpty();
    }

    @Test
    @DisplayName("The cloned candidate can be validated and promoted, superseding the old LIVE revision")
    void editFromLive_promotedClone_supersedesOldLive() {
        int cityId = seedFullValidGeography("ef4");
        long liveId = prepareValidateAndPromote(cityId);
        long candidateId = candidateService.editFromLive(cityId, liveId, ADMIN_ID).revisionId();

        for (String key : new String[] {"landing", "regions", "areaGroups", "areas", "listing", "agriDestinations"}) {
            validationService.toggleCheck(cityId, candidateId, key, true);
        }
        validationService.markValidated(cityId, candidateId);
        promotionService.launch(cityId, candidateId, ADMIN_ID.toString());

        CityLaunchRevision candidate = revisionRepository.findById(candidateId).orElseThrow();
        assertThat(candidate.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);

        CityLaunchRevision oldLive = revisionRepository.findById(liveId).orElseThrow();
        assertThat(oldLive.getLifecycleStatus()).isEqualTo(LifecycleStatus.SUPERSEDED);
        assertThat(oldLive.getSupersededBy()).isEqualTo(candidateId);
    }

    @Test
    @DisplayName("A second concurrent editFromLive for the same city is rejected via uq_clr_inflight")
    void editFromLive_concurrentSecondAttempt_rejected() {
        int cityId = seedFullValidGeography("ef5");
        long liveId = prepareValidateAndPromote(cityId);

        candidateService.editFromLive(cityId, liveId, ADMIN_ID);

        assertThatThrownBy(() -> candidateService.editFromLive(cityId, liveId, ADMIN_ID))
                .isInstanceOf(CityPreparationConflictException.class);
    }

    @Test
    @DisplayName("A legacy LIVE revision with zero sandbox rows is rejected with 409, never silently cloned empty")
    void editFromLive_legacyEmptySandboxLive_rejected() {
        int cityId = seedCity("ef6", true);
        Long legacyLiveId = jdbc.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, "
                        + "prep_state, prep_stage, created_by) VALUES (?, 1, 'PROMOTED', 'DONE', 0, ?) RETURNING id",
                Long.class, cityId, ADMIN_ID);

        assertThatThrownBy(() -> candidateService.editFromLive(cityId, legacyLiveId, ADMIN_ID))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode().value())
                        .isEqualTo(409));
    }

    @Test
    @DisplayName("A stale liveRevisionId (no longer the current LIVE) is rejected with 409")
    void editFromLive_staleLiveRevisionId_rejected() {
        int cityId = seedFullValidGeography("ef7");
        long liveId = prepareValidateAndPromote(cityId);
        long staleId = liveId + 999_999L;

        assertThatThrownBy(() -> candidateService.editFromLive(cityId, staleId, ADMIN_ID))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode().value())
                        .isEqualTo(409));
    }
}
