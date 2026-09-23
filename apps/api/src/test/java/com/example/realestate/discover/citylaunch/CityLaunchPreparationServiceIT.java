package com.example.realestate.discover.citylaunch;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import org.springframework.boot.test.mock.mockito.SpyBean;

/**
 * Testcontainers integration test (real Postgres) proving {@link CityLaunchPreparationService} +
 * {@link CityLaunchGraphWriter}'s async admission/graph-write/failure-isolation contract (#1911
 * PR2) — [async_fault_injection_tests] cases 1-4, plus AC1/AC4/AC5/AC7 and the happy path.
 *
 * <p>Deliberately NOT {@code @DataJpaTest}: that annotation wraps every test method in a
 * transaction that rolls back at teardown, which would prevent
 * {@code TransactionSynchronizationManager#registerSynchronization(...).afterCommit(...)} from
 * EVER firing — the exact mechanism {@link CityLaunchPreparationService#prepare} depends on to
 * kick the background writer. This class uses a full {@code @SpringBootTest} (real commits) and
 * cleans up its own fixtures in {@link #cleanup()}, mirroring {@code RbacSmokeIT}'s pattern for
 * the same reason.
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
class CityLaunchPreparationServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    // JwtConfig's securityFilterChain bean requires a JwtDecoder even under webEnvironment=NONE
    // (the full application context still instantiates every bean; only the embedded server is
    // skipped) — a no-op decoder mirrors RbacSmokeIT's, though no test here actually issues HTTP.
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
    @Autowired private CityLaunchGraphWriter graphWriter;
    @Autowired private CityLaunchReadService readService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxAreaAliasRepository sandboxAreaAliasRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    @Autowired private SandboxAreaGroupRepository sandboxAreaGroupRepository;
    @Autowired private SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired
    @Qualifier("cityLaunchGraphWriterExecutor")
    private java.util.concurrent.Executor graphWriterExecutor;
    @Autowired private com.example.realestate.discover.CityRegionOnboardingService cityRegionOnboardingService;
    @Autowired private com.example.realestate.discover.RegionalClassificationBackfillService backfillService;
    
    @SpyBean
    private CityLaunchSseService sseService;

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
            // Cascades to all six sandbox_* tables via city_launch_revision's ON DELETE CASCADE.
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.area_group_members WHERE area_group_id IN "
                    + "(SELECT id FROM public.area_groups WHERE city_id = ?)", cityId);
            jdbc.update("DELETE FROM public.area_groups WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            // #2163: seedRegionPolicy() inserts city_region_policy rows that FK-reference cities.id
            // and must be cleared before the city itself can be deleted.
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.regional_area_classifications WHERE city_key = ?", slug);
            jdbc.update("DELETE FROM public.area_alias WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

    /**
     * Polls {@code assertion} every 100ms for up to 15s, re-throwing its last {@link AssertionError}
     * on timeout. Hand-rolled rather than pulling in Awaitility (not an existing project
     * dependency and out of PR2's allowed-files scope to add to {@code pom.xml}).
     */
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

    // =========================================================================================
    // #2675 — the REAL migration-seeded Kundapur, not a synthetic fixture city.
    // =========================================================================================

    @Test
    @DisplayName("#2675: the real V71-seeded Kundapur advances past the MISSING_POLICY prerequisite "
            + "gate and materializes city_regions — and removing its V142 policy row restores the "
            + "exact production failure, proving the policy row is what unblocks it")
    void issue2675_realKundapur_advancesPastMissingPolicy_andRegressesWithoutTheV142Row() {
        Integer kundapurId = jdbc.queryForObject(
                "SELECT id FROM public.cities WHERE slug = 'kundapur'", Integer.class);
        assertThat(kundapurId).as("V71 seeds kundapur").isNotNull();

        Map<String, Object> policy = jdbc.queryForMap(
                "SELECT region_model, central_radius_km FROM public.city_region_policy WHERE city_id = ?",
                kundapurId);
        assertThat(policy.get("region_model")).isEqualTo("CENTRAL_CARDINAL_4");

        try {
            // ── BEFORE arm: delete the V142 row and reproduce the production failure exactly ──
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", kundapurId);

            assertThatThrownBy(() -> preparationService.prepare(kundapurId, ADMIN_ID))
                    .as("without a policy row, prepare() fails at the prerequisite gate — the state "
                            + "Retry/Rerun cannot repair, because retrying re-runs this same check")
                    .isInstanceOf(CityPrerequisiteGenerationException.class)
                    .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                            .isEqualTo("MISSING_POLICY"));

            assertThat(revisionRepository.findByCityId(kundapurId))
                    .as("the failure is up front: no revision is created at all")
                    .isEmpty();

            // ── AFTER arm: restore exactly what V142 seeds, and re-run the same call ──────────
            jdbc.update("INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km) "
                    + "VALUES (?, 'CENTRAL_CARDINAL_4', 4)", kundapurId);

            PrepareResponse response = preparationService.prepare(kundapurId, ADMIN_ID);
            assertThat(response.revisionId())
                    .as("prepare() now gets past the policy gate and admits a revision")
                    .isNotNull();

            // The policy row's actual purpose: canonical-geometry region materialization.
            List<Map<String, Object>> regions = jdbc.queryForList(
                    "SELECT region_key FROM public.city_regions WHERE city_id = ? ORDER BY display_order",
                    kundapurId);
            assertThat(regions)
                    .as("city_regions materialized for Kundapur — the 'City has zero city_regions rows' "
                            + "geography failure recorded against every prior Kundapur revision is gone")
                    .isNotEmpty();
        } finally {
            // Restore the migration-seeded state for any later test in this class.
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", kundapurId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", kundapurId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", kundapurId);
            jdbc.update("DELETE FROM public.regional_area_classifications WHERE city_key = 'kundapur'");
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", kundapurId);
            jdbc.update("INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km) "
                    + "VALUES (?, ?, ?)", kundapurId, policy.get("region_model"), policy.get("central_radius_km"));
        }
    }

    // ── Fixture helpers ─────────────────────────────────────────────────────────────────────

    private int seedCity(String slug) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, true) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    private void seedArea(int cityId, String areaKey, double lat, double lon) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                        + "VALUES (?, ?, ?, ?, ?)",
                areaKey, cityId, areaKey, lat, lon);
    }

    /** Same as {@link #seedArea(int, String, double, double)} but with an explicit source
     * lifecycle_status (V116: 'ACTIVE' / 'INACTIVE' / 'MERGED') instead of relying on the
     * column's ACTIVE default — used to prove sandbox_areas preserves the true source status. */
    private void seedArea(int cityId, String areaKey, double lat, double lon, String lifecycleStatus) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                areaKey, cityId, areaKey, lat, lon, lifecycleStatus);
    }

    /** Same as {@link #seedArea(int, String, double, double, String)} but with a NULL geo-centre —
     * relies on the Testcontainers-only V116.9 relaxation of areas.geo_center_lat/lon to nullable
     * (production V71 keeps them NOT NULL) to prove the {@code geoCenterLat/Lon != null} arm of
     * {@code ensureCanonicalGeography}'s NO_ACTIVE_AREAS guard. */
    private void seedAreaWithNullGeo(int cityId, String areaKey, String lifecycleStatus) {
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, NULL, NULL, ?)",
                areaKey, cityId, areaKey, lifecycleStatus);
    }

    private void seedRegion(int cityId, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, ?, 1)",
                cityId, regionKey, regionKey);
    }

    /**
     * #2163: {@code prepare()} now self-materializes canonical geography prerequisites via
     * {@code CityRegionOnboardingService.apply()}, which requires a {@code city_region_policy}
     * row (else it throws {@code MISSING_POLICY}). Mirrors Udupi's real production policy
     * (CENTRAL_CARDINAL_4, {@code central_radius_km=4} — see V113) so fixtures using this helper
     * exercise the same code path prepare() now takes for a never-before-onboarded city.
     */
    private void seedRegionPolicy(int cityId, String regionModel, double centralRadiusKm) {
        jdbc.update(
                "INSERT INTO public.city_region_policy (city_id, region_model, central_radius_km) "
                        + "VALUES (?, ?, ?)",
                cityId, regionModel, centralRadiusKm);
    }

    private void seedMembership(int cityId, String areaKey, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_region_memberships (city_id, area_key, region_key, assignment_source) "
                        + "VALUES (?, ?, ?, 'AUTO')",
                cityId, areaKey, regionKey);
    }

    private int seedGroup(int cityId, String slug) {
        return jdbc.queryForObject(
                "INSERT INTO public.area_groups (city_id, slug, name) VALUES (?, ?, ?) RETURNING id",
                Integer.class, cityId, slug, slug);
    }

    private void seedGroupMember(int groupId, String areaKey) {
        jdbc.update(
                "INSERT INTO public.area_group_members (area_group_id, area_key) VALUES (?, ?)",
                groupId, areaKey);
    }

    /**
     * Full valid canonical geography: 2 areas (#2163: 4-segment area_key — required by
     * {@code RegionalClassificationBackfillService}'s {@code array_length(...) = 4} filter, else
     * {@code prepare()}'s self-backfill upserts zero classification rows for these areas), a
     * {@code city_region_policy} row (CENTRAL_CARDINAL_4, so {@code prepare()}'s
     * {@code CityRegionOnboardingService.apply()} call materializes real city_regions/memberships
     * instead of throwing {@code MISSING_POLICY}), and 1 group (both areas members).
     */
    private int seedFullValidGeography(String citySlug) {
        int cityId = seedCity(citySlug);
        seedArea(cityId, citySlug + "|d|g|area-1", 13.01, 74.71);
        seedArea(cityId, citySlug + "|d|g|area-2", 13.02, 74.72);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        int groupId = seedGroup(cityId, citySlug + "-belt");
        seedGroupMember(groupId, citySlug + "|d|g|area-1");
        seedGroupMember(groupId, citySlug + "|d|g|area-2");
        return cityId;
    }

    // =========================================================================================
    // Happy path
    // =========================================================================================

    @Test
    @DisplayName("Happy path: prepare() on a valid city -> PREPARED/DONE, sandbox graph matches canonical source")
    void happyPath_prepareValidCity_endsUpPreparedDone() {
        int cityId = seedFullValidGeography("hp");

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);
        assertThat(response.status()).isEqualTo("preparing");

        pollUntil(() -> {
            CityLaunchRevision revision = revisionRepository.findById(response.revisionId()).orElseThrow();
            assertThat(revision.getLifecycleStatus()).isEqualTo(LifecycleStatus.PREPARED);
            assertThat(revision.getPrepState()).isEqualTo(PrepState.DONE);
            assertThat(revision.getPrepStage()).isEqualTo((short) 6);
            assertThat(revision.getPreparedAt()).isNotNull();
        });

        Long revisionId = response.revisionId();
        assertThat(sandboxAreaRepository.findByRevisionId(revisionId)).hasSize(2);
        // #2163: prepare() now self-materializes city_regions via CityRegionOnboardingService.apply()
        // using the CENTRAL_CARDINAL_4 policy seeded by seedFullValidGeography() — apply() always
        // materializes ALL 5 canonical regions (CENTRAL, N, E, S, W) regardless of occupancy, not
        // just the ones with members.
        assertThat(sandboxCityRegionRepository.findByRevisionId(revisionId)).hasSize(5);
        assertThat(sandboxCityRegionMembershipRepository.findByRevisionId(revisionId)).hasSize(2);
        assertThat(sandboxAreaGroupRepository.findByRevisionId(revisionId)).hasSize(1);
        assertThat(sandboxAreaGroupMemberRepository.findByRevisionId(revisionId)).hasSize(2);

        // CityLaunchProgressDto's prepStageLabel for a fully-completed run must read "ready".
        CityLaunchProgressDto progress = readService.getProgress(cityId);
        assertThat(progress.prepStage()).isEqualTo((short) 6);
        assertThat(progress.prepStageLabel()).isEqualTo("ready");
    }

    @Test
    @DisplayName("sse-1: terminal notification is only emitted after the transaction commits")
    void sse1_terminalNotification_isEmittedAfterCommit() throws Exception {
        int cityId = seedFullValidGeography("sse1");

        java.util.concurrent.atomic.AtomicBoolean checked = new java.util.concurrent.atomic.AtomicBoolean(false);
        java.util.concurrent.atomic.AtomicReference<String> committedState = new java.util.concurrent.atomic.AtomicReference<>();
        
        doAnswer(inv -> {
            CityLaunchRevision rev = inv.getArgument(0);
            if (rev.getPrepState() == PrepState.DONE || rev.getPrepState() == PrepState.FAILED) {
                // Prove transaction is committed by spawning a separate thread to read from DB,
                // completely bypassing any thread-local uncommitted transaction state.
                Thread checker = new Thread(() -> {
                    String state = jdbc.queryForObject(
                        "SELECT prep_state FROM public.city_launch_revision WHERE id = ?",
                        String.class, rev.getId());
                    committedState.set(state);
                    checked.set(true);
                });
                checker.start();
                checker.join();
            }
            return inv.callRealMethod();
        }).when(sseService).emitProgress(any());

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() -> assertThat(checked.get()).isTrue());

        assertThat(committedState.get()).isEqualTo("DONE");
    }

    // =========================================================================================
    // async_fault_injection case 1 — genuine async, not disguised-sync
    // =========================================================================================

    @Test
    @DisplayName("async-1: admission returns while background write is still in flight — revision is still "
            + "PREPARING immediately after prepare() returns, before it later transitions to PREPARED")
    void async1_admissionReturns_whileBackgroundWriteStillInFlight() {
        int cityId = seedFullValidGeography("a1");

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        // Immediately after prepare() returns (admission tx has committed, 202 would already be
        // on the wire), read the row via a fresh raw-JDBC query — the async write has not yet had
        // time to acquire its pessimistic lock and complete a full geography read + 6-table write.
        CityLaunchRevision immediatelyAfter = revisionRepository.findById(response.revisionId()).orElseThrow();
        assertThat(immediatelyAfter.getLifecycleStatus()).isEqualTo(LifecycleStatus.PREPARING);

        // ...and it DOES eventually reach PREPARED — proving the async work genuinely happened,
        // this isn't a synchronous call dressed up as "preparing".
        pollUntil(() ->
                assertThat(revisionRepository.findById(response.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));
    }

    // =========================================================================================
    // async_fault_injection case 2 — mid-write failure -> zero sandbox rows + FAILED (REQUIRES_NEW)
    // =========================================================================================

    @Test
    @DisplayName("async-2: a mid-write DB constraint failure rolls the WHOLE graph tx back to zero sandbox "
            + "rows AND a separate REQUIRES_NEW transaction still records FAILED + failure_reason")
    void async2_midWriteFailure_rollsBackToZeroRows_andRecordsFailedInSeparateTx() {
        int cityId = seedFullValidGeography("a2");
        // This test drives CityLaunchGraphWriter directly (bypassing preparationService.prepare(),
        // and therefore its #2163 self-materialization of city_regions) — seed a canonical region
        // by hand so the writer has something to copy into sandbox_city_regions and collide on.
        seedRegion(cityId, "a2-north");
        seedMembership(cityId, "a2|d|g|area-1", "a2-north");

        CityLaunchRevision revision = revisionRepository.saveAndFlush(
                new CityLaunchRevision(cityId, 1, ADMIN_ID));

        // Force a mid-write DB constraint failure: pre-insert a sandbox_city_regions row for this
        // exact revision so the writer's OWN region insert (stage 3, AFTER areas/aliases already
        // succeeded within the same transaction) collides on UNIQUE(revision_id, region_key).
        jdbc.update(
                "INSERT INTO public.sandbox_city_regions (revision_id, region_key) VALUES (?, ?)",
                revision.getId(), "a2-north");

        graphWriter.writeGraphAsync(revision.getId(), cityId);

        pollUntil(() -> {
            CityLaunchRevision reloaded = revisionRepository.findById(revision.getId()).orElseThrow();
            assertThat(reloaded.getLifecycleStatus()).isEqualTo(LifecycleStatus.FAILED);
            assertThat(reloaded.getPrepState()).isEqualTo(PrepState.FAILED);
            assertThat(reloaded.getFailureReason()).isNotBlank();
            // AC12 item 5 regression guard: the persisted failure_reason for a raw mid-write
            // exception (here, a UNIQUE constraint violation surfaced as
            // DataIntegrityViolationException) must be the fully generic message, with NO leaked
            // exception class name or package.
            assertThat(reloaded.getFailureReason()).isEqualTo("City launch graph write failed");
            assertThat(reloaded.getFailureReason()).doesNotContainIgnoringCase("exception");
            assertThat(reloaded.getFailureReason()).doesNotContain("com.example");
            // Areas/aliases (stages 1-2) were inserted successfully WITHIN the failing
            // transaction, before the stage-3 region collision — proving the whole transaction,
            // not just the failing statement, rolled back.
            assertThat(sandboxAreaRepository.findByRevisionId(revision.getId())).isEmpty();
            assertThat(sandboxAreaAliasRepository.findByRevisionId(revision.getId())).isEmpty();

            // CityLaunchStatusDto (GET /cities list item) must carry this FAILED revision's
            // failure_reason through to the admin dashboard's "See failure" affordance.
            CityLaunchStatusDto listDto = statusFor(cityId);
            assertThat(listDto.status()).isEqualTo("failed");
            assertThat(listDto.failureReason()).isEqualTo(reloaded.getFailureReason());
            assertThat(listDto.failureReason()).isNotBlank();
            assertThat(listDto.failureReason()).doesNotContainIgnoringCase("exception");

            // CityLaunchProgressDto (GET /cities/{id}/prepare) must carry a human-readable
            // prepStageLabel for the stage the writer actually reached (stage 2 = "canonical":
            // areas + aliases succeeded before the stage-3 region collision).
            CityLaunchProgressDto progress = readService.getProgress(cityId);
            assertThat(progress.prepStage()).isEqualTo((short) 2);
            assertThat(progress.prepStageLabel()).isEqualTo("canonical");
        });
    }

    // =========================================================================================
    // async_fault_injection case 3 — two concurrent prepare() calls for the SAME city
    // =========================================================================================

    @Test
    @DisplayName("async-3: two concurrent prepare() calls for the SAME city -> exactly one succeeds, "
            + "one throws CityPreparationConflictException (real concurrency, not sequential)")
    void async3_concurrentPrepareForSameCity_exactlyOneSucceedsOneConflicts() throws Exception {
        int cityId = seedFullValidGeography("a3");

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch startGate = new CountDownLatch(1);
        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(pool.submit(() -> {
                    startGate.await();
                    return preparationService.prepare(cityId, ADMIN_ID);
                }));
            }
            startGate.countDown();

            AtomicInteger successes = new AtomicInteger();
            AtomicInteger conflicts = new AtomicInteger();
            for (Future<Object> future : futures) {
                try {
                    future.get(15, TimeUnit.SECONDS);
                    successes.incrementAndGet();
                } catch (java.util.concurrent.ExecutionException e) {
                    if (e.getCause() instanceof CityPreparationConflictException) {
                        conflicts.incrementAndGet();
                    } else {
                        throw e;
                    }
                }
            }
            assertThat(successes.get()).isEqualTo(1);
            assertThat(conflicts.get()).isEqualTo(1);

            // The loser must not have raced its own apply() call into materializing a duplicate
            // set of city_regions/city_region_memberships rows before losing the conflict check.
            Integer regionRows = jdbc.queryForObject(
                    "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
            Integer membershipRows = jdbc.queryForObject(
                    "SELECT count(*) FROM public.city_region_memberships WHERE city_id = ?",
                    Integer.class, cityId);
            assertThat(membershipRows).as("both seeded areas must be materialized exactly once each "
                    + "— a duplicate racing apply() would double this to 4").isEqualTo(2);
            assertThat(regionRows).as("the CENTRAL_CARDINAL_4 policy materializes exactly 5 region rows "
                    + "(4 cardinal directions + central) for a single apply() — a duplicate racing "
                    + "apply() would double this to 10").isEqualTo(5);
        } finally {
            pool.shutdownNow();
        }
    }

    // =========================================================================================
    // async_fault_injection case 4 — executor saturation/rejection -> sane state
    // =========================================================================================

    @Test
    @DisplayName("async-4: cityLaunchGraphWriterExecutor's DEFAULT rejection policy (AbortPolicy) "
            + "throws RejectedExecutionException synchronously on saturation — the exact exception "
            + "CityLaunchPreparationService#prepare's afterCommit callback catches to mark FAILED "
            + "rather than leave a 202-returned revision stuck in PREPARING")
    void async4_executorSaturation_rejectsRatherThanSilentlyStalling() throws Exception {
        // core=2, max=8, queue=50 -> 58 slots before rejection (config: CityLaunchAsyncConfig).
        CountDownLatch block = new CountDownLatch(1);
        int capacity = 58;
        try {
            for (int i = 0; i < capacity; i++) {
                graphWriterExecutor.execute(() -> {
                    try {
                        block.await();
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }
                });
            }

            assertThatThrownBy(() -> graphWriterExecutor.execute(() -> { }))
                    .isInstanceOf(RejectedExecutionException.class);
        } finally {
            block.countDown();
        }
    }

    // =========================================================================================
    // AC1 — status derivation across LifecycleStatus values + no-revision case
    // =========================================================================================

    @Test
    @DisplayName("AC1: CityLaunchReadService derives status from the MAX revision, across every "
            + "LifecycleStatus value, and 'not-started' when a city has no revision at all")
    void ac1_statusDerivation_acrossLifecycleValues_andNoRevisionCase() {
        int cityId = seedCity("ac1");

        // No revision yet -> not-started, geographyPercent 0.
        CityLaunchStatusDto notStarted = statusFor(cityId);
        assertThat(notStarted.status()).isEqualTo("not-started");
        assertThat(notStarted.revisionId()).isNull();
        assertThat(notStarted.geographyPercent()).isZero();
        assertThat(notStarted.prepState()).isNull();
        assertThat(notStarted.failureReason()).isNull();
        assertThat(notStarted.preparedAt()).isNull();

        insertRevisionRow(cityId, 1, "PREPARING", "RUNNING", (short) 2);
        assertThat(statusFor(cityId).status()).isEqualTo("preparing");
        assertThat(statusFor(cityId).geographyPercent()).isEqualTo(Math.round(2 / 6f * 100));

        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
        insertRevisionRow(cityId, 2, "PREPARED", "DONE", (short) 6);
        assertThat(statusFor(cityId).status()).isEqualTo("ready-preview");
        assertThat(statusFor(cityId).geographyPercent()).isEqualTo(100);

        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
        insertRevisionRow(cityId, 3, "VALIDATED", "DONE", (short) 6);
        assertThat(statusFor(cityId).status()).isEqualTo("ready-launch");

        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
        insertRevisionRow(cityId, 4, "PROMOTED", "DONE", (short) 6);
        assertThat(statusFor(cityId).status()).isEqualTo("live");

        jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
        insertRevisionRow(cityId, 5, "FAILED", "FAILED", (short) 3);
        assertThat(statusFor(cityId).status()).isEqualTo("failed");
    }

    private CityLaunchStatusDto statusFor(int cityId) {
        return readService.listCities().stream()
                .filter(c -> c.cityId().equals(cityId))
                .findFirst()
                .orElseThrow();
    }

    private void insertRevisionRow(int cityId, int revisionNumber, String lifecycleStatus, String prepState, short prepStage) {
        jdbc.update(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status, prep_state, prep_stage) "
                        + "VALUES (?, ?, ?, ?, ?)",
                cityId, revisionNumber, lifecycleStatus, prepState, prepStage);
    }

    // =========================================================================================
    // AC4 — invalid geography -> revision FAILED + ZERO sandbox rows
    // =========================================================================================

    @Test
    @DisplayName("AC4 (#2163 update): a city with an ACTIVE area but no city_region_policy row fails "
            + "prerequisite self-generation UP FRONT with CityPrerequisiteGenerationException/MISSING_POLICY "
            + "— no revision is created. Previously (pre-#2163) this scenario surfaced as a plain "
            + "GeographyValidationException because prepare() never attempted to generate the missing "
            + "city_regions itself; now it tries, and correctly reports WHY generation is blocked.")
    void ac4_invalidGeography_zeroRegions_failsValidation_zeroSandboxRows() {
        int cityId = seedCity("ac4");
        // #2163 review fix: 4-segment area_key so the ACTIVE-area guard (which mirrors the
        // downstream array_length(area_key,'|') = 4 classification-eligibility filter) is
        // satisfied and this test reaches the MISSING_POLICY failure it is actually about.
        seedArea(cityId, "ac4|d|g|area-1", 13.01, 74.71);
        // No city_region_policy row seeded -> CityRegionOnboardingService.apply() throws
        // MISSING_POLICY, surfaced as CityPrerequisiteGenerationException.

        assertThatThrownBy(() -> preparationService.prepare(cityId, ADMIN_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                        .isEqualTo("MISSING_POLICY"));

        assertThat(revisionRepository.findByCityId(cityId)).isEmpty();
    }

    // =========================================================================================
    // lifecycle_status preservation (#1911 PR2 rework) — sandbox_areas must carry each area's
    // TRUE source lifecycle_status, not a hardcoded 'ACTIVE' default.
    // =========================================================================================

    @Test
    @DisplayName("lifecycle-1: an ACTIVE area and a MERGED area in the same city -> prepare() succeeds "
            + "and sandbox_areas preserves each area's true source lifecycle_status (not both defaulted "
            + "to ACTIVE)")
    void lifecycleStatus_activeAndMergedAreas_preservedInSandbox_notDefaultedToActive() {
        int cityId = seedCity("lc1");
        // #2163: 4-segment area_key (required by RegionalClassificationBackfillService's
        // array_length(...) = 4 filter) + a city_region_policy row, so prepare()'s self-generated
        // CityRegionOnboardingService.apply() call succeeds rather than throwing MISSING_POLICY.
        seedArea(cityId, "lc1|d|g|area-active", 13.01, 74.71, "ACTIVE");
        seedArea(cityId, "lc1|d|g|area-merged", 13.02, 74.72, "MERGED");
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() ->
                assertThat(revisionRepository.findById(response.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        List<SandboxArea> areas = sandboxAreaRepository.findByRevisionId(response.revisionId());
        assertThat(areas).hasSize(2);
        assertThat(areas)
                .filteredOn(a -> a.getAreaKey().equals("lc1|d|g|area-active"))
                .singleElement()
                .satisfies(a -> assertThat(a.getLifecycleStatus()).isEqualTo("ACTIVE"));
        assertThat(areas)
                .filteredOn(a -> a.getAreaKey().equals("lc1|d|g|area-merged"))
                .singleElement()
                .satisfies(a -> assertThat(a.getLifecycleStatus()).isEqualTo("MERGED"));
    }

    @Test
    @DisplayName("lifecycle-2 (#2163 update): a city whose ONLY areas are non-ACTIVE (all MERGED/INACTIVE) "
            + "fails prerequisite self-generation UP FRONT with CityPrerequisiteGenerationException/"
            + "NO_ACTIVE_AREAS -> no revision created. Previously (pre-#2163) surfaced as a plain "
            + "GeographyValidationException.")
    void lifecycleStatus_allAreasNonActive_failsAc4Validation_zeroSandboxRows() {
        int cityId = seedCity("lc2");
        seedArea(cityId, "lc2|area-merged", 13.01, 74.71, "MERGED");
        seedArea(cityId, "lc2|area-inactive", 13.02, 74.72, "INACTIVE");
        seedRegion(cityId, "lc2-north");
        seedMembership(cityId, "lc2|area-merged", "lc2-north");
        seedMembership(cityId, "lc2|area-inactive", "lc2-north");

        assertThatThrownBy(() -> preparationService.prepare(cityId, ADMIN_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                        .isEqualTo("NO_ACTIVE_AREAS"));

        assertThat(revisionRepository.findByCityId(cityId)).isEmpty();
    }

    @Test
    @DisplayName("lifecycle-3 (#2163 review fix): a city whose ONLY area is ACTIVE with a 4-segment "
            + "area_key but a NULL geo-centre fails prerequisite self-generation UP FRONT with "
            + "CityPrerequisiteGenerationException/NO_ACTIVE_AREAS, exactly like the non-ACTIVE case — "
            + "proving the geoCenterLat/Lon != null arm of the guard, not just the lifecycleStatus arm.")
    void lifecycleStatus_activeAreaNullGeoCenter_failsAc4Validation_zeroSandboxRows() {
        int cityId = seedCity("lc3");
        seedAreaWithNullGeo(cityId, "lc3|d|g|area-nullgeo", "ACTIVE");

        assertThatThrownBy(() -> preparationService.prepare(cityId, ADMIN_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                        .isEqualTo("NO_ACTIVE_AREAS"));

        assertThat(revisionRepository.findByCityId(cityId)).isEmpty();
    }

    // =========================================================================================
    // AC5 — one revision_id shared by all six sandbox tables; every child FK resolves within it
    // =========================================================================================

    @Test
    @DisplayName("AC5: every sandbox row from one prepare() run shares the same revision_id, and every "
            + "child FK (alias->area, membership->area, group_member->group+area) resolves within it")
    void ac5_oneRevisionId_sharedAcrossAllSixTables_noOrphans() {
        int cityId = seedFullValidGeography("ac5");
        jdbc.update("INSERT INTO public.area_alias (city_id, area_key, alias, alias_normalised) "
                + "VALUES (?, ?, ?, ?)", cityId, "ac5|d|g|area-1", "Area One Alias", "area one alias");

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);
        Long revisionId = response.revisionId();

        pollUntil(() ->
                assertThat(revisionRepository.findById(revisionId).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        List<SandboxArea> areas = sandboxAreaRepository.findByRevisionId(revisionId);
        List<Long> areaIds = areas.stream().map(SandboxArea::getId).toList();
        assertThat(areas).allMatch(a -> a.getRevisionId().equals(revisionId));

        List<SandboxAreaAlias> aliases = sandboxAreaAliasRepository.findByRevisionId(revisionId);
        assertThat(aliases).isNotEmpty();
        assertThat(aliases).allMatch(a -> a.getRevisionId().equals(revisionId) && areaIds.contains(a.getSandboxAreaId()));

        List<SandboxCityRegionMembership> memberships = sandboxCityRegionMembershipRepository.findByRevisionId(revisionId);
        assertThat(memberships).allMatch(m -> m.getRevisionId().equals(revisionId) && areaIds.contains(m.getSandboxAreaId()));

        List<SandboxAreaGroup> groups = sandboxAreaGroupRepository.findByRevisionId(revisionId);
        List<Long> groupIds = groups.stream().map(SandboxAreaGroup::getId).toList();
        List<SandboxAreaGroupMember> groupMembers = sandboxAreaGroupMemberRepository.findByRevisionId(revisionId);
        assertThat(groupMembers).allMatch(gm -> gm.getRevisionId().equals(revisionId)
                && groupIds.contains(gm.getSandboxAreaGroupId())
                && areaIds.contains(gm.getSandboxAreaId()));
    }

    // =========================================================================================
    // AC7 — fail-then-rerun -> new higher revision_number; old FAILED row unchanged
    // =========================================================================================

    @Test
    @DisplayName("AC7: after a FAILED prepare(), a re-run allocates the next higher revision_number "
            + "and the old FAILED row is left completely unchanged")
    void ac7_failThenRerun_newHigherRevisionNumber_oldFailedRowUnchanged() {
        int cityId = seedCity("ac7");
        
        // Manually insert a FAILED revision to simulate a past failure
        insertRevisionRow(cityId, 1, "FAILED", "FAILED", (short) 3);
        CityLaunchRevision failedSnapshot = revisionRepository.findByCityId(cityId).get(0);

        // Fix the geography so the re-run succeeds. #2163: 4-segment area_key + a city_region_policy
        // row, so prepare()'s self-generated CityRegionOnboardingService.apply() call succeeds.
        seedArea(cityId, "ac7|d|g|area-1", 13.01, 74.71);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);

        // Rerun with the new valid geography
        PrepareResponse second = preparationService.prepare(cityId, ADMIN_ID);
        assertThat(second.revisionId()).isNotEqualTo(failedSnapshot.getId());

        CityLaunchRevision secondRevision = revisionRepository.findById(second.revisionId()).orElseThrow();
        assertThat(secondRevision.getRevisionNumber()).isEqualTo(failedSnapshot.getRevisionNumber() + 1);

        pollUntil(() ->
                assertThat(revisionRepository.findById(second.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        CityLaunchRevision oldRowAfter = revisionRepository.findById(failedSnapshot.getId()).orElseThrow();
        assertThat(oldRowAfter.getLifecycleStatus()).isEqualTo(failedSnapshot.getLifecycleStatus());
        assertThat(oldRowAfter.getFailureReason()).isEqualTo(failedSnapshot.getFailureReason());
        assertThat(oldRowAfter.getRevisionNumber()).isEqualTo(failedSnapshot.getRevisionNumber());
    }

    // =========================================================================================
    // AC4 — rerun a PREPARED revision -> new max+1 PREPARING revision, graph write kicked,
    // old revision SUPERSEDED with the back-link set (#1911 PR4)
    // =========================================================================================

    @Test
    @DisplayName("AC4: rerunSuperseding on a PREPARED revision supersedes it and admits a new "
            + "max+1 PREPARING revision that reaches PREPARED via the SAME reused graph-write kick")
    void ac4_rerunSuperseding_supersedesOld_admitsNewRevision_reachesPrepared() {
        int cityId = seedFullValidGeography("r4");

        PrepareResponse first = preparationService.prepare(cityId, ADMIN_ID);
        pollUntil(() ->
                assertThat(revisionRepository.findById(first.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));
        CityLaunchRevision firstRevision = revisionRepository.findById(first.revisionId()).orElseThrow();

        PrepareResponse rerun = preparationService.rerunSuperseding(cityId, first.revisionId(), ADMIN_ID);
        assertThat(rerun.status()).isEqualTo("preparing");
        assertThat(rerun.revisionId()).isNotEqualTo(first.revisionId());

        CityLaunchRevision oldAfter = revisionRepository.findById(first.revisionId()).orElseThrow();
        assertThat(oldAfter.getLifecycleStatus()).isEqualTo(LifecycleStatus.SUPERSEDED);
        assertThat(oldAfter.getSupersededBy()).isEqualTo(rerun.revisionId());

        CityLaunchRevision newRevisionImmediate = revisionRepository.findById(rerun.revisionId()).orElseThrow();
        assertThat(newRevisionImmediate.getRevisionNumber()).isEqualTo(firstRevision.getRevisionNumber() + 1);

        pollUntil(() ->
                assertThat(revisionRepository.findById(rerun.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));
        assertThat(sandboxAreaRepository.findByRevisionId(rerun.revisionId())).hasSize(2);
    }

    // =========================================================================================
    // AC5 (KEY) — two REAL threads rerun the SAME PREPARED revision concurrently: exactly one
    // succeeds, one 409s; exactly one new PREPARING revision; old SUPERSEDED with back-link set;
    // no uq_clr_inflight 500; no orphaned SUPERSEDED-without-backlink (#1911 PR4)
    // =========================================================================================

    @Test
    @DisplayName("AC5: two concurrent rerunSuperseding calls for the SAME PREPARED revision -> exactly "
            + "one 202 + one CityPreparationConflictException; exactly one new PREPARING revision; the "
            + "old revision is SUPERSEDED with superseded_by set to the winner (no orphan, no 500)")
    void ac5_concurrentRerun_sameRevision_exactlyOneSucceedsOneConflicts_noOrphanBacklink() throws Exception {
        int cityId = seedFullValidGeography("r5");

        PrepareResponse first = preparationService.prepare(cityId, ADMIN_ID);
        pollUntil(() ->
                assertThat(revisionRepository.findById(first.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch startGate = new CountDownLatch(1);
        try {
            List<Future<PrepareResponse>> futures = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                futures.add(pool.submit(() -> {
                    startGate.await();
                    return preparationService.rerunSuperseding(cityId, first.revisionId(), ADMIN_ID);
                }));
            }
            startGate.countDown();

            AtomicInteger successes = new AtomicInteger();
            AtomicInteger conflicts = new AtomicInteger();
            PrepareResponse winner = null;
            for (Future<PrepareResponse> future : futures) {
                try {
                    PrepareResponse response = future.get(15, TimeUnit.SECONDS);
                    successes.incrementAndGet();
                    winner = response;
                } catch (java.util.concurrent.ExecutionException e) {
                    if (e.getCause() instanceof CityPreparationConflictException) {
                        conflicts.incrementAndGet();
                    } else {
                        throw e;
                    }
                }
            }
            assertThat(successes.get()).isEqualTo(1);
            assertThat(conflicts.get()).isEqualTo(1);
            assertThat(winner).isNotNull();

            // Exactly one new PREPARING/PREPARED revision descends from the old one.
            List<CityLaunchRevision> allForCity = revisionRepository.findByCityId(cityId);
            assertThat(allForCity).hasSize(2);

            CityLaunchRevision oldAfter = revisionRepository.findById(first.revisionId()).orElseThrow();
            assertThat(oldAfter.getLifecycleStatus()).isEqualTo(LifecycleStatus.SUPERSEDED);
            assertThat(oldAfter.getSupersededBy()).isEqualTo(winner.revisionId());

            CityLaunchRevision newRevision = revisionRepository.findById(winner.revisionId()).orElseThrow();
            assertThat(newRevision.getRevisionNumber()).isGreaterThan(
                    allForCity.stream()
                            .filter(r -> r.getId().equals(first.revisionId()))
                            .findFirst().orElseThrow().getRevisionNumber() - 1);

            PrepareResponse winnerResponse = winner;
            pollUntil(() ->
                    assertThat(revisionRepository.findById(winnerResponse.revisionId()).orElseThrow().getLifecycleStatus())
                            .isEqualTo(LifecycleStatus.PREPARED));
        } finally {
            pool.shutdownNow();
        }
    }

    // =========================================================================================
    // #2163 — prepare() self-materializes canonical geography prerequisites
    // =========================================================================================

    @Test
    @DisplayName("#2163: a never-before-onboarded city (zero regional_area_classifications, zero "
            + "city_regions — the real Udupi 422 scenario) is self-healed by prepare() itself: "
            + "city_regions/memberships get materialized from canonical geometry computed in-memory "
            + "(regional_area_classifications is never written), and a PREPARING revision is "
            + "admitted — no external startup-flag-gated runner required")
    void prepare_udupiWithoutRegions_materializesRegionsAndAdmitsRevision() {
        int cityId = seedFullValidGeography("u2163");

        Integer classificationsBefore = jdbc.queryForObject(
                "SELECT count(*) FROM public.regional_area_classifications WHERE city_key = ?",
                Integer.class, "u2163");
        Integer regionsBefore = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        assertThat(classificationsBefore).isZero();
        assertThat(regionsBefore).isZero();

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);
        assertThat(response.status()).isEqualTo("preparing");

        Integer classificationsAfter = jdbc.queryForObject(
                "SELECT count(*) FROM public.regional_area_classifications WHERE city_key = ?",
                Integer.class, "u2163");
        Integer regionsAfter = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        Integer membershipsAfter = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_region_memberships WHERE city_id = ?", Integer.class, cityId);
        // #2163 fix: prepare() must never write to the legacy regional_area_classifications table.
        assertThat(classificationsAfter).isZero();
        assertThat(regionsAfter).isGreaterThan(0);
        assertThat(membershipsAfter).isEqualTo(2);

        pollUntil(() ->
                assertThat(revisionRepository.findById(response.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));
    }

    @Test
    @DisplayName("#2163: apply() is applied idempotently — calling it a second time after prepare() "
            + "already materialized regions leaves city_regions/memberships row counts unchanged "
            + "(no-op via CityRegionOnboardingService's own fingerprint check)")
    void prepare_twiceSequentially_noDuplicateRegionsOrMemberships() {
        int cityId = seedFullValidGeography("u2163b");
        backfillService.runBackfill("u2163b");
        cityRegionOnboardingService.apply(cityId);

        Integer regionsAfterFirst = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        Integer membershipsAfterFirst = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_region_memberships WHERE city_id = ?", Integer.class, cityId);

        // Second call: same inputs -> CityRegionOnboardingService's fingerprint/no-op check must
        // leave row counts exactly as they were, not duplicate or churn them.
        cityRegionOnboardingService.apply(cityId);

        Integer regionsAfterSecond = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        Integer membershipsAfterSecond = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_region_memberships WHERE city_id = ?", Integer.class, cityId);

        assertThat(regionsAfterSecond).isEqualTo(regionsAfterFirst);
        assertThat(membershipsAfterSecond).isEqualTo(membershipsAfterFirst);
    }

    @Test
    @DisplayName("#2163: prepare() on a city with an active area_group.slug colliding with a canonical "
            + "region key fails with CityPrerequisiteGenerationException/NAMESPACE_COLLISION — zero "
            + "city_regions rows are left behind (whole ensureCanonicalGeography() transaction rolls back)")
    void prepare_namespaceCollision_returns422WithNAMESPACE_COLLISION() {
        int cityId = seedCity("nsc");
        seedArea(cityId, "nsc|d|g|area-1", 13.01, 74.71);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        // CENTRAL_CARDINAL_4's canonical region keys are CENTRAL/N/E/S/W (short uppercase tokens) —
        // an active area_group whose slug is literally "N" collides.
        seedGroup(cityId, "N");

        assertThatThrownBy(() -> preparationService.prepare(cityId, ADMIN_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                        .isEqualTo("NAMESPACE_COLLISION"));

        Integer regionRows = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        assertThat(regionRows).isZero();
        assertThat(revisionRepository.findByCityId(cityId)).isEmpty();
    }

    @Test
    @DisplayName("#2163: prepare() on a city with a DEGENERATE area_group (sole member has no "
            + "projected region — never classified) fails with "
            + "CityPrerequisiteGenerationException/DEGENERATE_GROUP — zero city_regions rows written")
    void prepare_degenerateGroup_returns422WithDEGENERATE_GROUP_andWritesNoRegions() {
        int cityId = seedCity("dgn");
        seedArea(cityId, "dgn|d|g|area-1", 13.01, 74.71);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);
        // Deliberately a 2-segment area_key: RegionalClassificationBackfillService's
        // array_length(...) = 4 filter skips it, so it never gets a classification row and
        // therefore never projects to any region -> the group it solely belongs to is DEGENERATE.
        seedArea(cityId, "dgn|area-unclassified", 13.02, 74.72);
        int groupId = seedGroup(cityId, "dgn-degenerate-group");
        seedGroupMember(groupId, "dgn|area-unclassified");

        assertThatThrownBy(() -> preparationService.prepare(cityId, ADMIN_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                        .isEqualTo("DEGENERATE_GROUP"));

        Integer regionRows = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        assertThat(regionRows).isZero();
        assertThat(revisionRepository.findByCityId(cityId)).isEmpty();
    }

    @Test
    @DisplayName("#2163/#2151 preservation: starting from a city with NO prior regions, prepare()'s "
            + "self-materialization still lets the existing async graph-write flow generate "
            + "agri_destination_classification rows for the new revision")
    void prepare_afterRegionMaterialization_graphWriteGeneratesAgriDestinations() {
        int cityId = seedFullValidGeography("agri2163");

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() ->
                assertThat(revisionRepository.findById(response.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        // Agri rows land in the per-revision SANDBOX table pre-promotion, not the production
        // table (which only gets populated on a subsequent promote() — out of scope here).
        Integer agriRows = jdbc.queryForObject(
                "SELECT count(*) FROM public.sandbox_agri_destination_classification WHERE revision_id = ?",
                Integer.class, response.revisionId());
        assertThat(agriRows).as("agri destination classification rows must be generated for the new "
                + "revision even though this city had zero prior city_regions").isGreaterThan(0);

        CityLaunchRevision preparedRevision = revisionRepository.findById(response.revisionId()).orElseThrow();
        assertThat(preparedRevision.getPersistedRevisionChecksum())
                .as("the graph-write flow that generated the agri rows must also stamp a persisted "
                        + "revision checksum — proves the async write actually completed, not just "
                        + "that the lifecycle flag flipped")
                .isNotNull();
    }

    @Test
    @DisplayName("#2163/#2151 Bangalore-regression guard: preparing a city that ALREADY has "
            + "regional_area_classifications rows (from a prior legacy backfill) must leave those "
            + "rows byte-for-byte unchanged — prepare()'s canonical-geometry path never reads or "
            + "writes the legacy table at all")
    void prepare_bangalore_classificationRowsUnchanged() {
        Integer bangaloreCityId = jdbc.queryForObject(
                "SELECT id FROM public.cities WHERE slug = 'bangalore'", Integer.class);
        assertThat(bangaloreCityId).as("fixture precondition: bangalore must be seeded").isNotNull();

        // Populate classifications BEFORE prepare() runs, exactly as production Bangalore already
        // has them from a prior legacy backfill — proves prepare() doesn't touch the legacy table
        // either way (unlike the old conditional count==0 backfill gate this fix removed).
        backfillService.runBackfill("bangalore");
        List<java.sql.Timestamp> before = jdbc.query(
                "SELECT computed_at FROM public.regional_area_classifications WHERE city_key = 'bangalore' "
                        + "ORDER BY area_key",
                (rs, rowNum) -> rs.getTimestamp("computed_at"));
        assertThat(before).isNotEmpty();

        Long revisionId = null;
        try {
            PrepareResponse response = preparationService.prepare(bangaloreCityId, ADMIN_ID);
            revisionId = response.revisionId();

            List<java.sql.Timestamp> after = jdbc.query(
                    "SELECT computed_at FROM public.regional_area_classifications WHERE city_key = 'bangalore' "
                            + "ORDER BY area_key",
                    (rs, rowNum) -> rs.getTimestamp("computed_at"));
            assertThat(after).as("backfill must NOT re-run for an already-classified city — "
                    + "computed_at timestamps must be identical, not refreshed").isEqualTo(before);
        } finally {
            if (revisionId != null) {
                jdbc.update("DELETE FROM public.city_launch_revision WHERE id = ?", revisionId);
            }
        }
    }

    // =========================================================================================
    // #2163 review fix — canonical-geometry classification source (regional_area_classifications
    // must no longer be a production read/write dependency of prepare())
    // =========================================================================================

    @Test
    @DisplayName("#2163 review fix: prepare() on a city with ZERO regional_area_classifications rows "
            + "materializes city_regions/city_region_memberships purely from canonical city + area "
            + "geometry, and never writes to the legacy table")
    void prepare_withZeroLegacyClassificationRows_materializesCityRegionsFromCanonicalGeometry() {
        String slug = "canon2163";
        int cityId = seedCity(slug);
        // ~11km north and ~11km south of the city geo_center (13.0, 74.7) — both well outside the
        // 4km CENTRAL radius, and in clearly distinct compass directions, so they must land in
        // different regions under CENTRAL_CARDINAL_4 — giving this test a real, direction-specific
        // assertion rather than "something got created".
        seedArea(cityId, slug + "|d|g|area-north", 13.10, 74.70);
        seedArea(cityId, slug + "|d|g|area-south", 12.90, 74.70);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);

        Integer legacyBefore = jdbc.queryForObject(
                "SELECT count(*) FROM public.regional_area_classifications WHERE city_key = ?",
                Integer.class, slug);
        assertThat(legacyBefore).isZero();

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() ->
                assertThat(revisionRepository.findById(response.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        Map<String, String> membershipByArea = jdbc.query(
                        "SELECT area_key, region_key FROM public.city_region_memberships WHERE city_id = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("area_key"), rs.getString("region_key")),
                        cityId)
                .stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        assertThat(membershipByArea).hasSize(2);
        assertThat(membershipByArea.get(slug + "|d|g|area-north")).isEqualTo("N");
        assertThat(membershipByArea.get(slug + "|d|g|area-south")).isEqualTo("S");

        Integer regionRows = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        assertThat(regionRows).isGreaterThan(0);

        // Load-bearing: the canonical-geometry path must never have written to the legacy table.
        Integer legacyAfter = jdbc.queryForObject(
                "SELECT count(*) FROM public.regional_area_classifications WHERE city_key = ?",
                Integer.class, slug);
        assertThat(legacyAfter).isZero();

        // Idempotency: re-applying CANONICAL_GEOMETRY directly (bypassing prepare()'s in-flight
        // revision uniqueness constraint) must be a no-op — unchanged region/membership counts,
        // and the legacy table still untouched.
        cityRegionOnboardingService.apply(cityId, com.example.realestate.discover.CityRegionOnboardingService.ClassificationSource.CANONICAL_GEOMETRY);

        Integer regionRowsAfterReapply = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_regions WHERE city_id = ?", Integer.class, cityId);
        Integer membershipRowsAfterReapply = jdbc.queryForObject(
                "SELECT count(*) FROM public.city_region_memberships WHERE city_id = ?", Integer.class, cityId);
        assertThat(regionRowsAfterReapply).isEqualTo(regionRows);
        assertThat(membershipRowsAfterReapply).isEqualTo(2);

        Integer legacyAfterReapply = jdbc.queryForObject(
                "SELECT count(*) FROM public.regional_area_classifications WHERE city_key = ?",
                Integer.class, slug);
        assertThat(legacyAfterReapply).isZero();
    }

    @Test
    @DisplayName("#2163 review fix: apply(CANONICAL_GEOMETRY) and apply(LEGACY_TABLE) produce IDENTICAL "
            + "city_regions/city_region_memberships when the legacy table is freshly backfilled and all "
            + "areas are ACTIVE with geo centres — pins the equivalence claim between the two sources")
    void apply_canonicalGeometryAndLegacyTable_produceIdenticalMaterializedGeography() {
        String slug = "equiv2163";
        int cityId = seedCity(slug);
        seedArea(cityId, slug + "|d|g|area-north", 13.10, 74.70);
        seedArea(cityId, slug + "|d|g|area-south", 12.90, 74.70);
        seedRegionPolicy(cityId, "CENTRAL_CARDINAL_4", 4);

        backfillService.runBackfill(slug);
        cityRegionOnboardingService.apply(cityId,
                com.example.realestate.discover.CityRegionOnboardingService.ClassificationSource.LEGACY_TABLE);

        Map<String, String> legacyMemberships = jdbc.query(
                        "SELECT area_key, region_key FROM public.city_region_memberships WHERE city_id = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("area_key"), rs.getString("region_key")),
                        cityId)
                .stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        Map<String, String> legacyRegions = jdbc.query(
                        "SELECT region_key, centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon "
                                + "FROM public.city_regions WHERE city_id = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("region_key"), regionGeometryString(rs)),
                        cityId)
                .stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        cityRegionOnboardingService.apply(cityId,
                com.example.realestate.discover.CityRegionOnboardingService.ClassificationSource.CANONICAL_GEOMETRY);

        Map<String, String> canonicalMemberships = jdbc.query(
                        "SELECT area_key, region_key FROM public.city_region_memberships WHERE city_id = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("area_key"), rs.getString("region_key")),
                        cityId)
                .stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
        Map<String, String> canonicalRegions = jdbc.query(
                        "SELECT region_key, centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon "
                                + "FROM public.city_regions WHERE city_id = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("region_key"), regionGeometryString(rs)),
                        cityId)
                .stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));

        assertThat(canonicalMemberships).isEqualTo(legacyMemberships);
        assertThat(canonicalRegions).isEqualTo(legacyRegions);
    }

    private static String regionGeometryString(java.sql.ResultSet rs) throws java.sql.SQLException {
        return rs.getObject("centre_lat") + "|" + rs.getObject("centre_lon") + "|"
                + rs.getObject("min_lat") + "|" + rs.getObject("max_lat") + "|"
                + rs.getObject("min_lon") + "|" + rs.getObject("max_lon");
    }
}
