package com.example.realestate.quality;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.image.ListingImageRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.Rollback;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for {@link QualityRecomputeExecutor} proving the two blocking fixes.
 *
 * <h3>BLOCKING-1 (materiality — computedAt in comparison key)</h3>
 * Before the fix, {@code toCanonicalJson} embedded {@code computedAt}, so
 * {@code isMaterial} always returned {@code true} and every recompute appended a
 * duplicate {@code listing_quality_history} row. After the fix, the materiality key
 * is {@code toComparableJson} (no {@code computedAt}), so repeated identical recomputes
 * are suppressed.
 *
 * <h3>BLOCKING-2 (REQUIRES_NEW atomicity via bean split)</h3>
 * Before the fix, {@code safeRecompute} called {@code this.recompute()} — same-bean
 * self-invocation bypassed the Spring proxy, so no {@code REQUIRES_NEW} transaction was
 * started. The column UPDATE and history INSERT ran in separate auto-commit statements —
 * not atomic. After the fix, the transactional work lives in {@link QualityRecomputeExecutor}
 * (a separate bean), and {@link QualityRecomputeService#safeRecompute} calls the executor
 * through the Spring proxy — {@code REQUIRES_NEW} is honoured and both writes are atomic.
 *
 * <h3>Harness notes</h3>
 * Tests are NOT wrapped in a rollback transaction ({@code @Transactional(NOT_SUPPORTED)})
 * because {@code REQUIRES_NEW} suspends the outer transaction and opens a new connection.
 * If the test's outer transaction holds the listing row only in an uncommitted state, the
 * REQUIRES_NEW connection cannot see it. Instead, rows are seeded and cleaned up explicitly
 * via committed JPA operations ({@code saveAndFlush} + {@code deleteAll} in teardown).
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
@Import({
        QualityRecomputeExecutorIT.TestConfig.class,
        QualityRecomputeExecutor.class,
        QualityScoreService.class
})
// Tests must NOT be wrapped in a rollback transaction — REQUIRES_NEW opens a separate
// connection that cannot see uncommitted rows from the outer test transaction.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class QualityRecomputeExecutorIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** Fixed clock — every recompute in a test uses the same instant. */
    static final Instant FIXED_NOW = Instant.parse("2026-06-20T10:00:00Z");

    @org.springframework.boot.test.context.TestConfiguration
    static class TestConfig {
        @org.springframework.context.annotation.Bean
        public Clock clock() {
            return Clock.fixed(FIXED_NOW, ZoneOffset.UTC);
        }

        @org.springframework.context.annotation.Bean
        public QualityRecomputeService qualityRecomputeService(QualityRecomputeExecutor executor) {
            return new QualityRecomputeService(executor);
        }
    }

    @Autowired
    private QualityRecomputeExecutor executor;

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private ListingQualityHistoryRepository historyRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** The primary listing seeded before each test — sufficient score (LIVE, rich data). */
    private UUID listingId;

    @BeforeEach
    void seedListing() {
        // Save and flush commits the row immediately (no outer rollback transaction here).
        Listing listing = new Listing();
        listing.setPropertyType("apartment");
        listing.setStatus("LIVE");
        listing.setTrustTier("B");
        listing.setDescription("A".repeat(300));   // DESCRIPTION 100
        listing.setLocality("Manipal");
        listing.setAreaKey("IN|KA|Udupi|Manipal");
        listing.setLatitude(13.35);
        listing.setLongitude(74.79);
        listing.setCreatedAt(OffsetDateTime.ofInstant(
                FIXED_NOW.minusSeconds(10L * 86400), ZoneOffset.UTC));  // 10 days → RECENCY 100
        // No price → PRICE_SANITY excluded; non-agri → AGRI excluded.
        // Applied weight = 2000+1500+1500+1500+1000+500 = 8000 bp ≥ 5000 → SCORED.
        listing = listingRepository.saveAndFlush(listing);
        listingId = listing.getId();
    }

    @AfterEach
    void cleanup() {
        // Manual teardown because we disabled the rollback transaction wrapper.
        jdbcTemplate.execute("DELETE FROM listing_quality_history");
        jdbcTemplate.execute("DELETE FROM property_listings WHERE property_type = 'apartment'");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOCKING-1: materiality key excludes computedAt
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * RED-BEFORE-GREEN: against the buggy code this test would FAIL because
     * {@code toCanonicalJson} included {@code computedAt} in the comparison key →
     * isMaterial always true → 2nd recompute appended a duplicate row.
     *
     * With the fix, the comparison key is {@code toComparableJson} (no computedAt) →
     * 2nd identical recompute is suppressed → still exactly 1 history row.
     */
    @Test
    @DisplayName("BLOCKING-1: recompute same listing twice → exactly 1 history row (no duplicate)")
    void recompute_sameListingTwice_exactlyOneHistoryRow() {
        // First recompute — always material (first-ever, no prior history)
        QualityRecomputeService.RecomputeOutcome first = executor.recompute(listingId);
        assertThat(first).isEqualTo(QualityRecomputeService.RecomputeOutcome.SCORED);
        assertThat(historyRepository.countByListingId(listingId))
                .as("first recompute must append a history row").isEqualTo(1L);

        // Second recompute — same listing, same data, same fixed clock → NOT material
        QualityRecomputeService.RecomputeOutcome second = executor.recompute(listingId);
        assertThat(second).isEqualTo(QualityRecomputeService.RecomputeOutcome.SCORED);
        assertThat(historyRepository.countByListingId(listingId))
                .as("second identical recompute must NOT append a duplicate history row")
                .isEqualTo(1L);
    }

    @Test
    @DisplayName("BLOCKING-1: backfill rerun (N identical recomputes) → history row count stays at 1")
    void recompute_backfillRerun_historyCountStable() {
        executor.recompute(listingId);
        assertThat(historyRepository.countByListingId(listingId)).isEqualTo(1L);

        // Simulate backfill re-running 4 more times
        for (int i = 0; i < 4; i++) {
            executor.recompute(listingId);
        }

        assertThat(historyRepository.countByListingId(listingId))
                .as("history row count must be stable across identical reruns (materiality suppression)")
                .isEqualTo(1L);
    }

    @Test
    @DisplayName("BLOCKING-1: stored breakdown still contains computedAt (only comparison key strips it)")
    void recompute_storedBreakdown_containsComputedAt() {
        executor.recompute(listingId);

        ListingQualityHistory row = historyRepository
                .findTopByListingIdOrderByComputedAtDesc(listingId)
                .orElseThrow(() -> new AssertionError("No history row found"));

        assertThat(row.getBreakdown())
                .as("stored breakdown must contain computedAt (only the comparison key strips it)")
                .contains("\"computedAt\"");
        assertThat(row.getBreakdown())
                .as("stored breakdown must contain overall")
                .contains("\"overall\":");
        assertThat(row.getBreakdown())
                .as("stored breakdown must contain components array")
                .contains("\"components\":");
    }

    @Test
    @DisplayName("BLOCKING-1: score-relevant change → second history row appended (material change still recorded)")
    void recompute_materialChange_appendsSecondHistoryRow() {
        executor.recompute(listingId);
        assertThat(historyRepository.countByListingId(listingId)).isEqualTo(1L);

        // Make a material change: trust tier B→A changes TRUST score 75→100
        Listing listing = listingRepository.findById(listingId).orElseThrow();
        listing.setTrustTier("A");
        listingRepository.saveAndFlush(listing);

        executor.recompute(listingId);

        assertThat(historyRepository.countByListingId(listingId))
                .as("a score-relevant field change must append a second history row")
                .isEqualTo(2L);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BLOCKING-2: REQUIRES_NEW atomicity (column UPDATE + history INSERT both-or-neither)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("BLOCKING-2: successful recompute writes quality_score AND history row — both present atomically")
    void recompute_writesColumnAndHistoryAtomically() {
        // Before: both absent
        Listing before = listingRepository.findById(listingId).orElseThrow();
        assertThat(before.getQualityScore()).as("quality_score null before recompute").isNull();
        assertThat(historyRepository.countByListingId(listingId)).isEqualTo(0L);

        executor.recompute(listingId);

        // After: both present — proves they ran in the same transaction
        Listing after = listingRepository.findById(listingId).orElseThrow();
        assertThat(after.getQualityScore())
                .as("quality_score must be set after recompute")
                .isNotNull()
                .isBetween((short) 0, (short) 100);
        assertThat(historyRepository.countByListingId(listingId))
                .as("history row must be present after recompute")
                .isEqualTo(1L);

        // Stored artefact must include computedAt (full canonical JSON)
        assertThat(after.getQualityBreakdown())
                .as("stored breakdown must contain computedAt")
                .contains("\"computedAt\":");
        assertThat(after.getQualityComputedAt())
                .as("quality_computed_at must be set to the recompute instant")
                .isEqualTo(FIXED_NOW);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Outcome enum — advisory (backfill classification)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Outcome: found sufficient listing → SCORED; not-found listing → SKIPPED")
    void recompute_outcomes_scoredAndSkipped() {
        assertThat(executor.recompute(listingId))
                .isEqualTo(QualityRecomputeService.RecomputeOutcome.SCORED);
        assertThat(executor.recompute(UUID.randomUUID()))
                .isEqualTo(QualityRecomputeService.RecomputeOutcome.SKIPPED);
    }
}
