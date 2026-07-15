package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Testcontainers integration test proving {@link AreaRegionReclassOutboxPoller} correctly drains
 * {@code area_region_reclass_outbox} (enqueued in PR2 by {@link AreaRegionReclassOutbox}) and
 * calls {@link CityRegionOnboardingService#apply(int)} — the DECOUPLED consumer half of #1887
 * PR3. Mirrors {@code CityRegionOnboardingRegenerationIT}'s fixture setup (backfill + resolve
 * non-UNIFIED groups via overrides) so {@code apply()} can succeed against the real seed geometry.
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
class AreaRegionReclassOutboxPollerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityRegionOnboardingService realOnboardingService;
    private RegionalClassificationBackfillService backfillService;
    private AreaRegionReclassOutbox outbox;
    private AreaRegionReclassProperties props;
    private int udupiCityId;
    private int mangaloreCityId;

    @BeforeEach
    void setUp() {
        realOnboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        outbox = new AreaRegionReclassOutbox(jdbcTemplate, new ObjectMapper());
        props = new AreaRegionReclassProperties();
        props.setBatchSize(50);
        props.setMaxRetryAttempts(3);
        props.setRetryDelaySeconds(60);
        props.setMaxBackoffSeconds(3600);

        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        mangaloreCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'mangalore'", Integer.class);

        for (int cityId : List.of(udupiCityId, mangaloreCityId)) {
            jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ?", cityId);
            jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ?", cityId);
            jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id = ?", cityId);
            jdbcTemplate.update("UPDATE city_region_policy SET policy_fingerprint = NULL WHERE city_id = ?", cityId);
        }
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key IN ('udupi', 'mangalore')");
        jdbcTemplate.update("DELETE FROM area_region_reclass_outbox");

        int upserted = backfillService.runBackfill();
        assertThat(upserted).isGreaterThan(0);
    }

    /** Mirrors CityRegionOnboardingRegenerationIT's helper — resolves SPLIT/DEGENERATE groups generically. */
    private void resolveNonUnifiedGroups(int cityId) {
        CityRegionOnboardingReport report = realOnboardingService.dryRun(cityId);
        for (CityRegionOnboardingReport.GroupCategorization g : report.groupCategorizations()) {
            if (g.category() == CityRegionOnboardingReport.GroupCategory.UNIFIED) {
                continue;
            }
            String targetRegion = !g.distinctRegionKeys().isEmpty()
                    ? g.distinctRegionKeys().get(0)
                    : CityRegionProjection.canonicalRegionOrder(report.regionModel()).get(0);
            for (String areaKey : g.memberAreaKeys()) {
                jdbcTemplate.update(
                        "INSERT INTO regional_area_overrides (city_id, area_key, forced_region_key, reason, author) "
                                + "VALUES (?, ?, ?, 'it-resolve', 'qa') "
                                + "ON CONFLICT (city_id, area_key) DO UPDATE SET forced_region_key = EXCLUDED.forced_region_key",
                        cityId, areaKey, targetRegion);
            }
        }
    }

    private int insertBatch(int cityId) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO area_onboarding_batch (city_id, source_label, apply_allowed)
                VALUES (?, 'it-fixture-poller', true)
                RETURNING id
                """, Integer.class, cityId);
    }

    private Map<String, Object> loadOutboxRow(int cityId, int batchId) {
        return jdbcTemplate.queryForMap(
                "SELECT * FROM area_region_reclass_outbox WHERE city_id = ? AND batch_id = ?", cityId, batchId);
    }

    @Test
    @DisplayName("polling an enqueued event calls apply() and publishes; region tables are "
            + "unchanged until the poll runs (decoupling); a second poll no-ops (already published)")
    void enqueueThenPoll_appliesAndPublishes_decoupledAndIdempotentOnRerun() {
        resolveNonUnifiedGroups(udupiCityId);
        int batchId = insertBatch(udupiCityId);
        boolean inserted = outbox.enqueue(udupiCityId, batchId, Set.of("IN|KA|Udupi|Manipal"), "test-enqueue");
        assertThat(inserted).isTrue();

        // Decoupling: enqueue alone must NOT have touched city_regions/city_region_memberships.
        Long membershipsBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Long.class, udupiCityId);
        assertThat(membershipsBefore).isEqualTo(0L);

        CityRegionOnboardingService spyService = spy(realOnboardingService);
        AreaRegionReclassOutboxPoller poller =
                new AreaRegionReclassOutboxPoller(jdbcTemplate, spyService, props, new SimpleMeterRegistry());

        poller.pollAndPublish();

        verify(spyService, times(1)).apply(udupiCityId);
        Long membershipsAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM city_region_memberships WHERE city_id = ?", Long.class, udupiCityId);
        assertThat(membershipsAfter).as("apply() actually materialised memberships").isGreaterThan(0L);

        Map<String, Object> row = loadOutboxRow(udupiCityId, batchId);
        assertThat(row.get("published_at")).isNotNull();
        assertThat(row.get("status")).isEqualTo("PUBLISHED");

        // Second poll: the published event must be skipped entirely — apply() not called again.
        poller.pollAndPublish();
        verify(spyService, times(1)).apply(udupiCityId);
    }

    @Test
    @DisplayName("poison isolation: a BLOCKED sibling (missing policy) never aborts a healthy "
            + "sibling in the same poll batch")
    void poisonIsolation_blockedSiblingDoesNotAbortHealthySibling() {
        resolveNonUnifiedGroups(udupiCityId);
        int healthyBatchId = insertBatch(udupiCityId);
        outbox.enqueue(udupiCityId, healthyBatchId, Set.of("IN|KA|Udupi|Manipal"), "healthy");

        // Mangalore has no resolved SPLIT/DEGENERATE overrides AND (below) no policy — force
        // MISSING_POLICY by deleting its policy row entirely.
        jdbcTemplate.update("DELETE FROM city_region_policy WHERE city_id = ?", mangaloreCityId);
        int blockedBatchId = insertBatch(mangaloreCityId);
        outbox.enqueue(mangaloreCityId, blockedBatchId, Set.of("IN|KA|Mangalore|Kadri"), "blocked");

        AreaRegionReclassOutboxPoller poller = new AreaRegionReclassOutboxPoller(
                jdbcTemplate, realOnboardingService, props, new SimpleMeterRegistry());

        poller.pollAndPublish();

        Map<String, Object> healthyRow = loadOutboxRow(udupiCityId, healthyBatchId);
        assertThat(healthyRow.get("published_at")).as("healthy sibling still published despite the other's failure")
                .isNotNull();
        assertThat(healthyRow.get("status")).isEqualTo("PUBLISHED");

        Map<String, Object> blockedRow = loadOutboxRow(mangaloreCityId, blockedBatchId);
        assertThat(blockedRow.get("published_at")).isNull();
        assertThat(blockedRow.get("status")).as("blocked event is NEVER marked DEAD").isNotEqualTo("DEAD");
        assertThat(((Number) blockedRow.get("retry_count")).intValue()).isEqualTo(1);
        assertThat(blockedRow.get("next_attempt_at")).isNotNull();
    }

    @Test
    @DisplayName("MISSING_POLICY keeps an event pending (never DEAD) with retry_count incremented; "
            + "after adding the policy, the next poll self-heals and publishes")
    void missingPolicy_selfHealsAfterPolicyAdded() {
        jdbcTemplate.update("DELETE FROM city_region_policy WHERE city_id = ?", mangaloreCityId);
        int batchId = insertBatch(mangaloreCityId);
        outbox.enqueue(mangaloreCityId, batchId, Set.of("IN|KA|Mangalore|Kadri"), "missing-policy");

        AreaRegionReclassOutboxPoller poller = new AreaRegionReclassOutboxPoller(
                jdbcTemplate, realOnboardingService, props, new SimpleMeterRegistry());

        poller.pollAndPublish();

        Map<String, Object> afterFirstPoll = loadOutboxRow(mangaloreCityId, batchId);
        assertThat(afterFirstPoll.get("published_at")).isNull();
        assertThat(afterFirstPoll.get("status")).isNotEqualTo("DEAD");
        assertThat(((Number) afterFirstPoll.get("retry_count")).intValue()).isEqualTo(1);
        Object firstNextAttempt = afterFirstPoll.get("next_attempt_at");
        assertThat(firstNextAttempt).isNotNull();

        // Self-heal: assign a policy, backfill classifications, resolve overrides so apply() can
        // succeed, and force the event to be immediately re-pollable (next_attempt_at in the past).
        jdbcTemplate.update("""
                INSERT INTO city_region_policy (city_id, region_model, central_radius_km)
                VALUES (?, 'CENTRAL_CARDINAL_4', 5)
                ON CONFLICT (city_id) DO UPDATE SET region_model = EXCLUDED.region_model,
                    central_radius_km = EXCLUDED.central_radius_km, policy_fingerprint = NULL
                """, mangaloreCityId);
        backfillService.runBackfill();
        resolveNonUnifiedGroups(mangaloreCityId);
        jdbcTemplate.update(
                "UPDATE area_region_reclass_outbox SET next_attempt_at = now() - interval '1 second' "
                        + "WHERE city_id = ? AND batch_id = ?",
                mangaloreCityId, batchId);

        poller.pollAndPublish();

        Map<String, Object> afterSecondPoll = loadOutboxRow(mangaloreCityId, batchId);
        assertThat(afterSecondPoll.get("published_at")).as("self-healed once the policy exists").isNotNull();
        assertThat(afterSecondPoll.get("status")).isEqualTo("PUBLISHED");
    }
}
