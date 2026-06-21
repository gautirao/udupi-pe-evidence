package com.example.realestate.listing.crud;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.api.BrokerQualitySummaryResponse;
import org.junit.jupiter.api.AfterEach;
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

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for {@link BrokerDashboardService#getQualitySummary(UUID)}.
 *
 * <p>Runs against a real Postgres (postgis/postgis:15-3.4) container so that the
 * Postgres-specific jsonpath {@code @?} predicates and native SQL aggregates are exercised
 * identically to production. Mocking ListingRepository would not catch jsonpath behaviour.
 *
 * <p>Harness mirrors {@code QualityRecomputeExecutorIT}:
 * <ul>
 *   <li>{@code @DataJpaTest} + {@code @AutoConfigureTestDatabase(NONE)} + Flyway migrations
 *   <li>{@code @Transactional(NOT_SUPPORTED)} — commits are immediate so each test sees its own data
 *   <li>Manual {@code @AfterEach} cleanup via JdbcTemplate DELETE
 * </ul>
 *
 * <p>Coverage AC matrix:
 * <ul>
 *   <li>AC-ZERO: zero listings → state PENDING, nulls, no NPE
 *   <li>AC-NULL: all-NULL quality_score → state PENDING, averageQualityScore null (not 0)
 *   <li>AC-MIX: mixed scored/unscored → state PARTIAL, average over non-null only
 *   <li>AC-COMPLETE: all scored → state COMPLETE, percentageComputed 100
 *   <li>AC-BOUNDARY: scores [59,60,79,80] → needsFixes=1 (59 only), buyerReady=1 (80 only)
 *   <li>AC-LOCATION: LOCATION component 40→counts, 75→excluded, 100→excluded
 *   <li>AC-INCOMPLETE: DRAFT status always counts; low KEY_FIELDS/PHOTOS/DESCRIPTION
 *   <li>AC-BADBREAKDOWN: quality_breakdown with no components array → no throw, no inflate
 *   <li>AC-ARCHIVED: archived_at IS NOT NULL → excluded from every count
 *   <li>AC-OWNERSHIP: two-broker isolation — broker A's call returns only broker A's data
 * </ul>
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
@Import(BrokerDashboardService.class)
// NOT_SUPPORTED: commits are immediate so the native-SQL aggregates can see seeded rows.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class BrokerDashboardServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private BrokerDashboardService service;

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // Broker UUIDs — deterministic, never collide with production data
    private static final UUID BROKER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    private static final UUID BROKER_B = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("DELETE FROM property_listings WHERE created_by IN ('" +
                BROKER_A + "','" + BROKER_B + "')");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-ZERO: no listings at all
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-ZERO: broker with zero listings → PENDING, all counts 0, nulls for avg and percentage")
    void zeroListings_pendingStateAllZeroNullAvgNullPercentage() {
        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.quality().state()).isEqualTo("PENDING");
        assertThat(result.quality().averageQualityScore()).isNull();
        assertThat(result.quality().percentageComputed()).isNull();
        assertThat(result.quality().countComputed()).isZero();
        assertThat(result.quality().countTotal()).isZero();
        assertThat(result.portfolio().totalListings()).isZero();
        assertThat(result.portfolio().activeListings()).isZero();
        assertThat(result.actionSignals().needsFixes().count()).isZero();
        assertThat(result.actionSignals().buyerReady().count()).isZero();
        assertThat(result.actionSignals().missingLocation().count()).isZero();
        assertThat(result.actionSignals().incomplete().count()).isZero();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-NULL: listings exist but quality_score is all NULL
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-NULL: listings with all-null quality_score → PENDING, averageQualityScore null (not 0)")
    void allNullQualityScore_pendingStateNullAvg() {
        seed(BROKER_A, "LIVE", null, null);
        seed(BROKER_A, "LIVE", null, null);

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.quality().state()).isEqualTo("PENDING");
        assertThat(result.quality().averageQualityScore())
                .as("averageQualityScore must be null, never 0, when no scores exist")
                .isNull();
        assertThat(result.quality().countComputed()).isZero();
        assertThat(result.quality().countTotal()).isEqualTo(2);
        // percentageComputed is 0 (not null) here: listings exist but none are scored.
        // null only when countTotal == 0 (no listings at all).
        assertThat(result.quality().percentageComputed()).isZero();
        assertThat(result.actionSignals().needsFixes().count()).isZero();
        assertThat(result.actionSignals().buyerReady().count()).isZero();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-MIX: some scored, some not → PARTIAL
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-MIX: 3 listings — 2 scored (score 60, 80), 1 null → PARTIAL, avg over non-null only")
    void mixedScores_partialStateAverageOverNonNullOnly() {
        seed(BROKER_A, "LIVE", (short) 60, null);
        seed(BROKER_A, "LIVE", (short) 80, null);
        seed(BROKER_A, "LIVE", null, null);   // unscored

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.quality().state()).isEqualTo("PARTIAL");
        assertThat(result.quality().countComputed()).isEqualTo(2);
        assertThat(result.quality().countTotal()).isEqualTo(3);
        // avg(60, 80) = 70 — null listing must NOT contribute to avg
        assertThat(result.quality().averageQualityScore()).isEqualTo(70);
        assertThat(result.quality().percentageComputed()).isEqualTo(66); // round(2/3*100)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-COMPLETE: all listings scored
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-COMPLETE: all listings have a quality_score → COMPLETE, percentageComputed 100")
    void allScored_completeStatePercentage100() {
        seed(BROKER_A, "LIVE", (short) 75, null);
        seed(BROKER_A, "LIVE", (short) 85, null);

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.quality().state()).isEqualTo("COMPLETE");
        assertThat(result.quality().countComputed()).isEqualTo(2);
        assertThat(result.quality().countTotal()).isEqualTo(2);
        assertThat(result.quality().percentageComputed()).isEqualTo(100);
        // avg(75, 85) = 80
        assertThat(result.quality().averageQualityScore()).isEqualTo(80);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-BOUNDARY: exact threshold scores for needsFixes and buyerReady
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-BOUNDARY: scores 59,60,79,80 → needsFixes=1 (score 59 only), buyerReady=1 (score 80 only)")
    void boundaryScores_strictThresholds() {
        seed(BROKER_A, "LIVE", (short) 59, null);  // needsFixes: <60 strict → YES
        seed(BROKER_A, "LIVE", (short) 60, null);  // needsFixes: 60 is NOT needsFixes → NO
        seed(BROKER_A, "LIVE", (short) 79, null);  // buyerReady: <80 → NO
        seed(BROKER_A, "LIVE", (short) 80, null);  // buyerReady: >=80 inclusive → YES

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.actionSignals().needsFixes().count())
                .as("only score 59 is strictly < 60; score 60 must NOT be in needsFixes")
                .isEqualTo(1);
        assertThat(result.actionSignals().buyerReady().count())
                .as("only score 80 is >= 80; score 79 must NOT be in buyerReady")
                .isEqualTo(1);
        // avg(59+60+79+80)/4 = 278/4 = 69.5 → rounds to 70
        assertThat(result.quality().averageQualityScore()).isEqualTo(70);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-LOCATION: LOCATION component score thresholds
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-LOCATION: LOCATION score 40 → missingLocation; score 75 → NOT missingLocation; score 100 → NOT missingLocation")
    void locationComponent_threshold75IsExcluded() {
        // score 40: below 75 → must count in missingLocation
        seed(BROKER_A, "LIVE", (short) 50, locationBreakdown(40));
        // score 75: exactly at threshold → must NOT count (strict <75)
        seed(BROKER_A, "LIVE", (short) 80, locationBreakdown(75));
        // score 100: above threshold → must NOT count
        seed(BROKER_A, "LIVE", (short) 90, locationBreakdown(100));

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.actionSignals().missingLocation().count())
                .as("only LOCATION score 40 is < 75; score 75 must NOT be missingLocation")
                .isEqualTo(1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-INCOMPLETE: DRAFT status and low component scores
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-INCOMPLETE: DRAFT listing always counts as incomplete regardless of breakdown")
    void draftListing_alwaysCountsAsIncomplete() {
        seed(BROKER_A, "DRAFT", null, null);  // DRAFT, no score → incomplete
        seed(BROKER_A, "LIVE", (short) 90, null);  // LIVE, good score → not incomplete

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.actionSignals().incomplete().count())
                .as("DRAFT status must always count as incomplete")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("AC-INCOMPLETE: KEY_FIELDS score < 50 → incomplete; score 50 → NOT incomplete")
    void keyFieldsLowScore_countsAsIncomplete() {
        // KEY_FIELDS score 49 → below threshold → incomplete
        seed(BROKER_A, "LIVE", (short) 70, componentBreakdown("KEY_FIELDS", 49));
        // KEY_FIELDS score 50 → exactly at threshold → NOT incomplete
        seed(BROKER_A, "LIVE", (short) 75, componentBreakdown("KEY_FIELDS", 50));

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.actionSignals().incomplete().count())
                .as("only KEY_FIELDS score 49 is < 50; score 50 must NOT be incomplete")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("AC-INCOMPLETE: PHOTOS or DESCRIPTION score < 50 → incomplete")
    void photosOrDescriptionLowScore_countsAsIncomplete() {
        seed(BROKER_A, "LIVE", (short) 70, componentBreakdown("PHOTOS", 30));
        seed(BROKER_A, "LIVE", (short) 72, componentBreakdown("DESCRIPTION", 45));
        seed(BROKER_A, "LIVE", (short) 80, null);  // no breakdown → not incomplete via components

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.actionSignals().incomplete().count())
                .as("PHOTOS<50 and DESCRIPTION<50 both count as incomplete")
                .isEqualTo(2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-BADBREAKDOWN: malformed / missing components array
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-BADBREAKDOWN: quality_breakdown with no 'components' array (insufficient_data shape) → no throw, no inflate")
    void badBreakdown_noComponentsArray_doesNotThrowAndDoesNotInflateCounts() {
        // This shape has quality_breakdown but no 'components' key of type array
        String insufficientData = "{\"status\":\"insufficient_data\"}";
        seed(BROKER_A, "LIVE", (short) 55, insufficientData);

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        // Must not throw; counts for jsonpath-dependent signals must remain 0
        assertThat(result.actionSignals().missingLocation().count())
                .as("no components array → missingLocation must not be inflated")
                .isZero();
        assertThat(result.actionSignals().incomplete().count())
                .as("no components array → incomplete from breakdown must not be inflated (LIVE, not DRAFT)")
                .isZero();
        // needsFixes applies to score<60 — score is 55 so this should be 1
        assertThat(result.actionSignals().needsFixes().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("AC-BADBREAKDOWN: null quality_breakdown → no throw, no inflate")
    void nullBreakdown_doesNotThrowAndDoesNotInflate() {
        seed(BROKER_A, "LIVE", (short) 85, null);

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.actionSignals().missingLocation().count()).isZero();
        assertThat(result.actionSignals().incomplete().count()).isZero();
        assertThat(result.actionSignals().buyerReady().count()).isEqualTo(1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-ARCHIVED: archived_at IS NOT NULL → excluded
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-ARCHIVED: archived listings are excluded from all counts")
    void archivedListings_excludedFromAllCounts() {
        // One active listing with score
        seed(BROKER_A, "LIVE", (short) 85, null);
        // Two archived listings — must NOT appear in any count
        seedArchived(BROKER_A, "LIVE", (short) 40, null);
        seedArchived(BROKER_A, "DRAFT", null, null);

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.quality().countTotal())
                .as("archived listings must be excluded from countTotal")
                .isEqualTo(1);
        assertThat(result.portfolio().totalListings()).isEqualTo(1);
        assertThat(result.quality().state()).isEqualTo("COMPLETE");
        assertThat(result.actionSignals().needsFixes().count())
                .as("archived needsFixes-eligible listing must not contribute")
                .isZero();
        assertThat(result.actionSignals().incomplete().count())
                .as("archived DRAFT listing must not contribute to incomplete")
                .isZero();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-OWNERSHIP: two-broker isolation (Gate F — proven against real SQL)
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-OWNERSHIP: broker A's call returns only broker A's listings; broker B's data must not appear")
    void ownership_twobrokerIsolation() {
        // Broker A: 2 listings, one needsFixes-eligible
        seed(BROKER_A, "LIVE", (short) 50, null);
        seed(BROKER_A, "LIVE", (short) 90, null);
        // Broker B: 5 listings, all with score<60 (should NOT appear in A's counts)
        seed(BROKER_B, "LIVE", (short) 30, null);
        seed(BROKER_B, "LIVE", (short) 35, null);
        seed(BROKER_B, "LIVE", (short) 40, null);
        seed(BROKER_B, "LIVE", (short) 45, null);
        seed(BROKER_B, "LIVE", (short) 55, null);

        BrokerQualitySummaryResponse resultA = service.getQualitySummary(BROKER_A);
        BrokerQualitySummaryResponse resultB = service.getQualitySummary(BROKER_B);

        // Broker A assertions — must not see broker B's 5 listings
        assertThat(resultA.quality().countTotal())
                .as("broker A must see exactly 2 listings, not broker B's 5")
                .isEqualTo(2);
        assertThat(resultA.actionSignals().needsFixes().count())
                .as("only broker A's score 50 is <60; broker B's listings must not contribute")
                .isEqualTo(1);
        assertThat(resultA.quality().averageQualityScore())
                .as("broker A average must be avg(50,90)=70, not polluted by broker B's scores")
                .isEqualTo(70);

        // Broker B assertions — must not see broker A's listings
        assertThat(resultB.quality().countTotal())
                .as("broker B must see exactly 5 listings, not broker A's 2")
                .isEqualTo(5);
        assertThat(resultB.actionSignals().needsFixes().count())
                .as("all broker B listings are <60 → needsFixes 5")
                .isEqualTo(5);
        assertThat(resultB.actionSignals().buyerReady().count())
                .as("broker B has no listings >=80 → buyerReady 0")
                .isZero();
    }

    @Test
    @DisplayName("AC-OWNERSHIP: broker B's archived listing is excluded even when broker A has live listings")
    void ownership_archivedBrokerBDoesNotPolluteBrokerA() {
        seed(BROKER_A, "LIVE", (short) 85, null);
        // Broker B archived listing — must be invisible to both A's and B's counts
        seedArchived(BROKER_B, "LIVE", (short) 20, null);

        BrokerQualitySummaryResponse resultA = service.getQualitySummary(BROKER_A);

        assertThat(resultA.quality().countTotal()).isEqualTo(1);
        assertThat(resultA.actionSignals().needsFixes().count()).isZero();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC-ACTIVE: activeListings counts only LIVE and PENDING_REVIEW
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC-ACTIVE: activeListings = LIVE + PENDING_REVIEW; DRAFT and REJECTED excluded")
    void activeListings_onlyLiveAndPendingReview() {
        seed(BROKER_A, "LIVE", null, null);
        seed(BROKER_A, "LIVE", null, null);
        seed(BROKER_A, "PENDING_REVIEW", null, null);
        seed(BROKER_A, "DRAFT", null, null);
        seed(BROKER_A, "REJECTED", null, null);

        BrokerQualitySummaryResponse result = service.getQualitySummary(BROKER_A);

        assertThat(result.portfolio().activeListings())
                .as("activeListings must be 3 (2 LIVE + 1 PENDING_REVIEW)")
                .isEqualTo(3);
        assertThat(result.portfolio().totalListings())
                .as("totalListings includes DRAFT and REJECTED too")
                .isEqualTo(5);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Seeds a non-archived listing for the given broker with the given quality_score and
     * quality_breakdown. Uses saveAndFlush so the row is committed before the service call.
     */
    private Listing seed(UUID brokerId, String status, Short qualityScore, String qualityBreakdown) {
        Listing l = minimalListing(brokerId, status);
        l.setQualityScore(qualityScore);
        if (qualityBreakdown != null) {
            l.setQualityBreakdown(qualityBreakdown);
        }
        return listingRepository.saveAndFlush(l);
    }

    /**
     * Seeds an archived listing (archived_at set to a past instant).
     */
    private Listing seedArchived(UUID brokerId, String status, Short qualityScore, String qualityBreakdown) {
        Listing l = minimalListing(brokerId, status);
        l.setQualityScore(qualityScore);
        if (qualityBreakdown != null) {
            l.setQualityBreakdown(qualityBreakdown);
        }
        l.setArchivedAt(Instant.parse("2026-01-01T00:00:00Z"));
        return listingRepository.saveAndFlush(l);
    }

    private Listing minimalListing(UUID brokerId, String status) {
        Listing l = new Listing();
        l.setCreatedBy(brokerId);
        l.setStatus(status);
        l.setPropertyType("land");
        l.setLocality("TestLocality");
        l.setLandAreaUnit("sqft");
        l.setBuiltAreaUnit("sqft");
        l.setCreatedAt(OffsetDateTime.now(ZoneOffset.UTC));
        return l;
    }

    /**
     * Builds a quality_breakdown JSON string with a single LOCATION component at the given score.
     */
    private static String locationBreakdown(int locationScore) {
        return """
                {"components":[{"type":"LOCATION","score":%d,"weight":2000}]}
                """.formatted(locationScore).strip();
    }

    /**
     * Builds a quality_breakdown JSON string with a single named component at the given score.
     * Suitable for KEY_FIELDS, PHOTOS, DESCRIPTION.
     */
    private static String componentBreakdown(String type, int score) {
        return """
                {"components":[{"type":"%s","score":%d,"weight":1500}]}
                """.formatted(type, score).strip();
    }
}
