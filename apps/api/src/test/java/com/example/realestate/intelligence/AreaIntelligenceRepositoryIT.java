package com.example.realestate.intelligence;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link AreaIntelligenceRepository} native queries running against a
 * real Postgres instance (postgis/postgis:15-3.4 via Testcontainers).
 *
 * <h3>Why this test exists</h3>
 * The existing unit tests mock the repository, so the native SQL with quoted-alias projection
 * binding ({@code AS areaKey}, {@code AS areaLabel}, etc.) is not exercised at all in the
 * surefire suite. This IT proves:
 * <ol>
 *   <li>Projection binding: all five getter aliases are populated correctly end-to-end.</li>
 *   <li>LIVE predicate filtering: rows excluded by each predicate clause do not appear.</li>
 *   <li>Backfill-incomplete invariant: an area with all-null quality scores yields
 *       {@code avgQuality = null} (not 0) and {@code scoredCount = 0}.</li>
 *   <li>Mixed area: partial quality scores yield the correct AVG over non-null rows only.</li>
 *   <li>City/district filter: the SPLIT_PART predicate routes correctly.</li>
 *   <li>Confidence classification: {@link AdminIntelligenceService} maps boundary counts
 *       (9, 10, 30) to the expected {@link AreaConfidence} names.</li>
 * </ol>
 *
 * <h3>Transaction strategy</h3>
 * Tests are NOT wrapped in a rollback transaction ({@code NOT_SUPPORTED}) because the repo
 * itself is {@code @Transactional(readOnly = true)} and a native COUNT/AVG aggregate must see
 * committed rows. Rows are seeded via {@code saveAndFlush} and cleaned up in teardown.
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
@Import({AdminIntelligenceService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class AreaIntelligenceRepositoryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** A fixed "recent" timestamp — within the 90-day LIVE window. */
    private static final OffsetDateTime RECENT = OffsetDateTime.now(ZoneOffset.UTC).minusDays(10);

    /** A fixed "old" timestamp — outside the 90-day LIVE window. */
    private static final OffsetDateTime OLD    = OffsetDateTime.now(ZoneOffset.UTC).minusDays(100);

    @Autowired
    private AreaIntelligenceRepository repo;

    @Autowired
    private AdminIntelligenceService service;

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /**
     * Sentinel value placed in the {@code locality} column so teardown can target only rows
     * seeded by this IT class without affecting other data.
     * The {@code property_type} column has a CHECK constraint; {@code locality} is free-text.
     */
    private static final String SENTINEL_LOCALITY_PREFIX = "_intel_it_";

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("DELETE FROM property_listings WHERE locality LIKE '_intel\\_it\\_%' ESCAPE '\\'");
    }

    // ── 1a: Projection binding ─────────────────────────────────────────────────

    @Test
    @DisplayName("1a — projection binding: all five aliases (areaKey, areaLabel, live90dCount, scoredCount, avgQuality) resolve correctly")
    void projectionBinding_allAliasesPopulated() {
        // Seed one LIVE listing with a quality score so every field is non-null.
        Listing l = liveListingIn("IN|KA|Udupi|Manipal", "Manipal");
        l.setAreaLabel("Manipal");
        l.setQualityScore((short) 80);
        listingRepository.saveAndFlush(l);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();

        AreaIntelligenceRow row = rows.stream()
                .filter(r -> "IN|KA|Udupi|Manipal".equals(r.getAreaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Expected row for IN|KA|Udupi|Manipal not found"));

        assertThat(row.getAreaKey())
                .as("areaKey alias must bind to getAreaKey()")
                .isEqualTo("IN|KA|Udupi|Manipal");

        assertThat(row.getAreaLabel())
                .as("areaLabel alias must bind to getAreaLabel()")
                .isEqualTo("Manipal");

        assertThat(row.getLive90dCount())
                .as("live90dCount alias must bind to getLive90dCount()")
                .isEqualTo(1L);

        assertThat(row.getScoredCount())
                .as("scoredCount alias must bind to getScoredCount()")
                .isEqualTo(1L);

        assertThat(row.getAvgQuality())
                .as("avgQuality alias must bind to getAvgQuality() as a Double")
                .isEqualTo(80.0);
    }

    // ── 1b: LIVE predicate filtering ───────────────────────────────────────────

    @Test
    @DisplayName("1b — LIVE predicate: non-LIVE status excluded")
    void liveFilter_nonLiveStatusExcluded() {
        Listing pending = liveListingIn("IN|KA|Udupi|Karkala", "Karkala");
        pending.setStatus("PENDING_REVIEW");  // valid status per chk_listing_status; not LIVE
        listingRepository.saveAndFlush(pending);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();
        assertThat(rows.stream().anyMatch(r -> "IN|KA|Udupi|Karkala".equals(r.getAreaKey())))
                .as("PENDING listing must not appear in LIVE aggregate")
                .isFalse();
    }

    @Test
    @DisplayName("1b — LIVE predicate: archived (archived_at IS NOT NULL) excluded")
    void liveFilter_archivedListingExcluded() {
        Listing archived = liveListingIn("IN|KA|Udupi|Hebri", "Hebri");
        archived.setArchivedAt(java.time.Instant.now().minusSeconds(3600));
        listingRepository.saveAndFlush(archived);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();
        assertThat(rows.stream().anyMatch(r -> "IN|KA|Udupi|Hebri".equals(r.getAreaKey())))
                .as("Archived listing must not appear in LIVE aggregate")
                .isFalse();
    }

    @Test
    @DisplayName("1b — LIVE predicate: is_duplicate=true excluded")
    void liveFilter_duplicateListingExcluded() {
        Listing dup = liveListingIn("IN|KA|Udupi|Kundapura", "Kundapura");
        dup.setDuplicate(true);
        listingRepository.saveAndFlush(dup);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();
        assertThat(rows.stream().anyMatch(r -> "IN|KA|Udupi|Kundapura".equals(r.getAreaKey())))
                .as("Duplicate listing must not appear in LIVE aggregate")
                .isFalse();
    }

    @Test
    @DisplayName("1b — LIVE predicate: created_at older than 90 days excluded")
    void liveFilter_oldListingExcluded() {
        Listing old = liveListingIn("IN|KA|Udupi|Siddapura", "Siddapura");
        old.setCreatedAt(OLD);
        listingRepository.saveAndFlush(old);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();
        assertThat(rows.stream().anyMatch(r -> "IN|KA|Udupi|Siddapura".equals(r.getAreaKey())))
                .as("Listing older than 90 days must not appear in LIVE aggregate")
                .isFalse();
    }

    @Test
    @DisplayName("1b — LIVE predicate: area_key NULL excluded")
    void liveFilter_nullAreaKeyExcluded() {
        Listing noArea = liveListingIn(null, "NoArea");
        listingRepository.saveAndFlush(noArea);

        // Count rows with null area_key — should be zero regardless of other data
        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();
        assertThat(rows.stream().anyMatch(r -> r.getAreaKey() == null))
                .as("Listing with null area_key must not appear in aggregate")
                .isFalse();
    }

    // ── 1c: Backfill-incomplete invariant ─────────────────────────────────────

    @Test
    @DisplayName("1c — backfill-incomplete: area with all-null quality_score yields avgQuality=null, scoredCount=0, row still present")
    void backfillIncomplete_allNullQuality_yieldsNullAvgAndZeroScoredCount() {
        Listing l1 = liveListingIn("IN|KA|DK|Surathkal", "Surathkal");
        Listing l2 = liveListingIn("IN|KA|DK|Surathkal", "Surathkal");
        // quality_score left null on both — simulates backfill-incomplete area
        listingRepository.saveAndFlush(l1);
        listingRepository.saveAndFlush(l2);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();

        AreaIntelligenceRow row = rows.stream()
                .filter(r -> "IN|KA|DK|Surathkal".equals(r.getAreaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Row for Surathkal must still be present even when all quality_scores are null"));

        assertThat(row.getAvgQuality())
                .as("avgQuality must be null (NOT 0) when all quality_scores are null — SQL AVG over no rows returns NULL")
                .isNull();

        assertThat(row.getScoredCount())
                .as("scoredCount must be 0 when no listings have quality_score set")
                .isEqualTo(0L);

        assertThat(row.getLive90dCount())
                .as("live90dCount must still reflect the 2 LIVE listings")
                .isEqualTo(2L);
    }

    // ── 1d: Mixed area — AVG over non-null rows only ───────────────────────────

    @Test
    @DisplayName("1d — mixed area: AVG computed over only non-null quality_score rows")
    void mixedArea_avgQualityOverNonNullRowsOnly() {
        // 3 listings: scores 60, 80, null
        // Expected AVG = (60 + 80) / 2 = 70.0; scoredCount = 2; live90dCount = 3
        Listing scored1 = liveListingIn("IN|KA|Udupi|Brahmavar", "Brahmavar");
        scored1.setQualityScore((short) 60);
        Listing scored2 = liveListingIn("IN|KA|Udupi|Brahmavar", "Brahmavar");
        scored2.setQualityScore((short) 80);
        Listing unscored = liveListingIn("IN|KA|Udupi|Brahmavar", "Brahmavar");
        // quality_score left null

        listingRepository.saveAndFlush(scored1);
        listingRepository.saveAndFlush(scored2);
        listingRepository.saveAndFlush(unscored);

        List<AreaIntelligenceRow> rows = repo.findLive90dAggregates();

        AreaIntelligenceRow row = rows.stream()
                .filter(r -> "IN|KA|Udupi|Brahmavar".equals(r.getAreaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Row for Brahmavar not found"));

        assertThat(row.getLive90dCount()).as("live90dCount must be 3").isEqualTo(3L);
        assertThat(row.getScoredCount()).as("scoredCount must be 2 (only non-null rows)").isEqualTo(2L);
        assertThat(row.getAvgQuality())
                .as("avgQuality must be 70.0 — AVG(60,80) over non-null rows only")
                .isEqualTo(70.0);
    }

    // ── 1e: City/district filter ───────────────────────────────────────────────

    @Test
    @DisplayName("1e — district filter: SPLIT_PART(area_key,'|',3)=:district returns only matching area; no match returns empty")
    void districtFilter_returnsOnlyMatchingDistrict() {
        // Seed two areas in different districts
        Listing udupi = liveListingIn("IN|KA|Udupi|Padubidri", "Padubidri");
        Listing dk = liveListingIn("IN|KA|DK|Puttur", "Puttur");
        listingRepository.saveAndFlush(udupi);
        listingRepository.saveAndFlush(dk);

        List<AreaIntelligenceRow> udupiRows = repo.findLive90dAggregatesByDistrict("Udupi");
        assertThat(udupiRows.stream().allMatch(r -> r.getAreaKey().contains("|Udupi|")))
                .as("district filter 'Udupi' must return only rows whose area_key has Udupi as segment 3")
                .isTrue();
        assertThat(udupiRows.stream().anyMatch(r -> "IN|KA|Udupi|Padubidri".equals(r.getAreaKey())))
                .as("Padubidri (Udupi district) must appear in filtered results")
                .isTrue();
        assertThat(udupiRows.stream().anyMatch(r -> "IN|KA|DK|Puttur".equals(r.getAreaKey())))
                .as("Puttur (DK district) must NOT appear when filtering by Udupi")
                .isFalse();

        // No-match case
        List<AreaIntelligenceRow> noMatch = repo.findLive90dAggregatesByDistrict("NonExistentDistrict");
        assertThat(noMatch)
                .as("Unknown district must return empty list, not null or error")
                .isEmpty();
    }

    // ── 1f: Confidence label via service ──────────────────────────────────────

    @Test
    @DisplayName("1f — confidence classification: boundary counts (9→insufficient, 10→limited, 30→full) map correctly through service")
    void confidenceClassification_boundaryCountsMapCorrectly() {
        // Seed areas at the three boundary counts.
        // Area A: 9 listings → INSUFFICIENT
        seedNListingsForArea("IN|KA|Udupi|BoundaryA", "BoundaryA", 9);
        // Area B: 10 listings → LIMITED
        seedNListingsForArea("IN|KA|Udupi|BoundaryB", "BoundaryB", 10);
        // Area C: 30 listings → FULL
        seedNListingsForArea("IN|KA|Udupi|BoundaryC", "BoundaryC", 30);

        List<AreaIntelligenceResponse> responses = service.getAreaIntelligence(null);

        AreaIntelligenceResponse areaA = responses.stream()
                .filter(r -> "IN|KA|Udupi|BoundaryA".equals(r.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("BoundaryA area not found"));
        assertThat(areaA.confidence())
                .as("9 live listings → INSUFFICIENT confidence")
                .isEqualTo("insufficient");

        AreaIntelligenceResponse areaB = responses.stream()
                .filter(r -> "IN|KA|Udupi|BoundaryB".equals(r.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("BoundaryB area not found"));
        assertThat(areaB.confidence())
                .as("10 live listings → LIMITED confidence (boundary: >=10)")
                .isEqualTo("limited");

        AreaIntelligenceResponse areaC = responses.stream()
                .filter(r -> "IN|KA|Udupi|BoundaryC".equals(r.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("BoundaryC area not found"));
        assertThat(areaC.confidence())
                .as("30 live listings → FULL confidence (boundary: >=30)")
                .isEqualTo("full");
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Construct a minimal LIVE, non-archived, non-duplicate listing for the given area_key.
     * Uses {@code SENTINEL_LOCALITY_PREFIX} in the locality so teardown can target exactly
     * these rows. {@code property_type} must be one of the values allowed by
     * {@code chk_listing_property_type}; 'house' is used as the simplest valid value.
     * Does NOT call saveAndFlush — caller must do that.
     */
    private Listing liveListingIn(String areaKey, String locality) {
        Listing l = new Listing();
        l.setPropertyType("house");
        l.setStatus("LIVE");
        l.setDuplicate(false);
        // Prefix locality with sentinel so AfterEach cleanup targets only IT rows.
        l.setLocality(SENTINEL_LOCALITY_PREFIX + (locality != null ? locality : "Test"));
        l.setAreaKey(areaKey);
        l.setCreatedAt(RECENT);
        return l;
    }

    private void seedNListingsForArea(String areaKey, String locality, int n) {
        for (int i = 0; i < n; i++) {
            listingRepository.saveAndFlush(liveListingIn(areaKey, locality));
        }
    }
}
