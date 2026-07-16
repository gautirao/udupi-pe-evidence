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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    private void seedRegion(int cityId, String regionKey) {
        jdbc.update(
                "INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                        + "VALUES (?, ?, ?, 1)",
                cityId, regionKey, regionKey);
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

    /** Full valid canonical geography: 2 areas, 1 region (both areas members), 1 group (both areas members). */
    private int seedFullValidGeography(String citySlug) {
        int cityId = seedCity(citySlug);
        seedArea(cityId, citySlug + "|area-1", 13.01, 74.71);
        seedArea(cityId, citySlug + "|area-2", 13.02, 74.72);
        seedRegion(cityId, citySlug + "-north");
        seedMembership(cityId, citySlug + "|area-1", citySlug + "-north");
        seedMembership(cityId, citySlug + "|area-2", citySlug + "-north");
        int groupId = seedGroup(cityId, citySlug + "-belt");
        seedGroupMember(groupId, citySlug + "|area-1");
        seedGroupMember(groupId, citySlug + "|area-2");
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
        assertThat(sandboxCityRegionRepository.findByRevisionId(revisionId)).hasSize(1);
        assertThat(sandboxCityRegionMembershipRepository.findByRevisionId(revisionId)).hasSize(2);
        assertThat(sandboxAreaGroupRepository.findByRevisionId(revisionId)).hasSize(1);
        assertThat(sandboxAreaGroupMemberRepository.findByRevisionId(revisionId)).hasSize(2);

        // CityLaunchProgressDto's prepStageLabel for a fully-completed run must read "ready".
        CityLaunchProgressDto progress = readService.getProgress(cityId);
        assertThat(progress.prepStage()).isEqualTo((short) 6);
        assertThat(progress.prepStageLabel()).isEqualTo("ready");
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
    @DisplayName("AC4: a city with zero city_regions rows fails validation UP FRONT — revision ends "
            + "FAILED with zero sandbox rows written (not even the areas stage)")
    void ac4_invalidGeography_zeroRegions_failsValidation_zeroSandboxRows() {
        int cityId = seedCity("ac4");
        seedArea(cityId, "ac4|area-1", 13.01, 74.71);
        // No city_regions seeded at all -> geography.regions() is empty -> GeographyValidationException.

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() -> {
            CityLaunchRevision reloaded = revisionRepository.findById(response.revisionId()).orElseThrow();
            assertThat(reloaded.getLifecycleStatus()).isEqualTo(LifecycleStatus.FAILED);
            assertThat(reloaded.getPrepState()).isEqualTo(PrepState.FAILED);
            assertThat(reloaded.getFailureReason()).contains("Geography validation failed");
            assertThat(reloaded.getPrepStage()).isEqualTo((short) 0);
        });
        assertThat(sandboxAreaRepository.findByRevisionId(response.revisionId())).isEmpty();
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
        seedArea(cityId, "lc1|area-active", 13.01, 74.71, "ACTIVE");
        seedArea(cityId, "lc1|area-merged", 13.02, 74.72, "MERGED");
        seedRegion(cityId, "lc1-north");
        seedMembership(cityId, "lc1|area-active", "lc1-north");
        seedMembership(cityId, "lc1|area-merged", "lc1-north");

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() ->
                assertThat(revisionRepository.findById(response.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        List<SandboxArea> areas = sandboxAreaRepository.findByRevisionId(response.revisionId());
        assertThat(areas).hasSize(2);
        assertThat(areas)
                .filteredOn(a -> a.getAreaKey().equals("lc1|area-active"))
                .singleElement()
                .satisfies(a -> assertThat(a.getLifecycleStatus()).isEqualTo("ACTIVE"));
        assertThat(areas)
                .filteredOn(a -> a.getAreaKey().equals("lc1|area-merged"))
                .singleElement()
                .satisfies(a -> assertThat(a.getLifecycleStatus()).isEqualTo("MERGED"));
    }

    @Test
    @DisplayName("lifecycle-2: a city whose ONLY areas are non-ACTIVE (all MERGED/INACTIVE) fails AC4 "
            + "validation -> revision FAILED + failure_reason, zero sandbox rows (must NOT silently "
            + "succeed by defaulting them to ACTIVE)")
    void lifecycleStatus_allAreasNonActive_failsAc4Validation_zeroSandboxRows() {
        int cityId = seedCity("lc2");
        seedArea(cityId, "lc2|area-merged", 13.01, 74.71, "MERGED");
        seedArea(cityId, "lc2|area-inactive", 13.02, 74.72, "INACTIVE");
        seedRegion(cityId, "lc2-north");
        seedMembership(cityId, "lc2|area-merged", "lc2-north");
        seedMembership(cityId, "lc2|area-inactive", "lc2-north");

        PrepareResponse response = preparationService.prepare(cityId, ADMIN_ID);

        pollUntil(() -> {
            CityLaunchRevision reloaded = revisionRepository.findById(response.revisionId()).orElseThrow();
            assertThat(reloaded.getLifecycleStatus()).isEqualTo(LifecycleStatus.FAILED);
            assertThat(reloaded.getPrepState()).isEqualTo(PrepState.FAILED);
            assertThat(reloaded.getFailureReason()).contains("Geography validation failed");
            assertThat(reloaded.getPrepStage()).isEqualTo((short) 0);
        });
        assertThat(sandboxAreaRepository.findByRevisionId(response.revisionId())).isEmpty();
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
                + "VALUES (?, ?, ?, ?)", cityId, "ac5|area-1", "Area One Alias", "area one alias");

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
        seedArea(cityId, "ac7|area-1", 13.01, 74.71);
        // Zero city_regions -> first prepare() fails validation.

        PrepareResponse first = preparationService.prepare(cityId, ADMIN_ID);
        pollUntil(() ->
                assertThat(revisionRepository.findById(first.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.FAILED));
        CityLaunchRevision failedSnapshot = revisionRepository.findById(first.revisionId()).orElseThrow();

        // Fix the geography so the re-run succeeds.
        seedRegion(cityId, "ac7-north");
        seedMembership(cityId, "ac7|area-1", "ac7-north");

        PrepareResponse second = preparationService.prepare(cityId, ADMIN_ID);
        assertThat(second.revisionId()).isNotEqualTo(first.revisionId());

        CityLaunchRevision secondRevision = revisionRepository.findById(second.revisionId()).orElseThrow();
        assertThat(secondRevision.getRevisionNumber()).isEqualTo(failedSnapshot.getRevisionNumber() + 1);

        pollUntil(() ->
                assertThat(revisionRepository.findById(second.revisionId()).orElseThrow().getLifecycleStatus())
                        .isEqualTo(LifecycleStatus.PREPARED));

        CityLaunchRevision oldRowAfter = revisionRepository.findById(first.revisionId()).orElseThrow();
        assertThat(oldRowAfter.getLifecycleStatus()).isEqualTo(failedSnapshot.getLifecycleStatus());
        assertThat(oldRowAfter.getFailureReason()).isEqualTo(failedSnapshot.getFailureReason());
        assertThat(oldRowAfter.getRevisionNumber()).isEqualTo(failedSnapshot.getRevisionNumber());
    }
}
