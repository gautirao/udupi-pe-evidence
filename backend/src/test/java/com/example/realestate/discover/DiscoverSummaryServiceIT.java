package com.example.realestate.discover;

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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link DiscoverSummaryService} (#1745 P5) driving a REAL Postgres/PostGIS
 * database (Flyway through the latest migration). Areas, cities, and area_groups come from the
 * V71 / V77 / V78 / V101 seeds; {@code property_listings} rows are inserted per-test.
 *
 * <p>Value-distinct fixture: multiple areas/regions, mixed status/duplicate/archived noise, a
 * malformed (non-4-part) area_key, and mixed-case property types — so a count-match alone
 * cannot pass by accident; the aggregation itself is proven.
 *
 * <p>Harness mirrors {@code DiscoverMarkersIT} / {@code AreaSummaryServiceAgriIT}.
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
class DiscoverSummaryServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "udupi";

    // Four-segment Udupi localities seeded by V71, grouped by V101 area_groups:
    //   university-belt: Manipal, Katapadi
    //   coastal-strip:   Malpe
    //   north-udupi:     Brahmavar
    private static final String MANIPAL   = "IN|KA|Udupi|Manipal";
    private static final String KATAPADI  = "IN|KA|Udupi|Katapadi";
    private static final String MALPE     = "IN|KA|Udupi|Malpe";
    private static final String BRAHMAVAR = "IN|KA|Udupi|Brahmavar";

    // Malformed (non-4-segment) area_key — must be excluded by the 4-part guard.
    private static final String MALFORMED_AREA_KEY = "IN|KA|Udupi";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverSummaryService service;
    private AreaSummaryService areaSummaryService;
    private RegionalClassificationBackfillService backfillService;

    @BeforeEach
    void setUp() {
        service = new DiscoverSummaryService(jdbcTemplate);
        areaSummaryService = new AreaSummaryService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    /**
     * Seeds the value-distinct fixture used by most tests:
     * <ul>
     *   <li>L1, L1b: two LIVE 'house' rows @ Manipal (university-belt) — gives Manipal a distinct
     *       top count of 2 for ordering assertions. Property type is stored lowercase (a DB CHECK
     *       constraint enforces the canonical lowercase enum); case-insensitivity is instead
     *       proven by querying with a mixed-case {@code propertyType} param below.</li>
     *   <li>L3: LIVE 'apartment' @ Katapadi (university-belt) — different type</li>
     *   <li>L4: LIVE 'house' @ Malpe (coastal-strip)</li>
     *   <li>L5: DRAFT 'house' @ Manipal — excluded (status)</li>
     *   <li>L6: LIVE 'house' @ Manipal, archived — excluded (archived_at)</li>
     *   <li>L7: LIVE 'house' @ Manipal, duplicate — excluded (is_duplicate)</li>
     *   <li>L8: LIVE 'house' @ malformed 3-segment area_key — excluded (4-part guard)</li>
     *   <li>L9: LIVE 'agricultural_land' @ Brahmavar (north-udupi)</li>
     * </ul>
     */
    private void seedFixture() {
        insertListing(MANIPAL, "house", "LIVE", false, false);               // L1
        insertListing(MANIPAL, "house", "LIVE", false, false);               // L1b
        insertListing(KATAPADI, "apartment", "LIVE", false, false);          // L3
        insertListing(MALPE, "house", "LIVE", false, false);                 // L4
        insertListing(MANIPAL, "house", "DRAFT", false, false);              // L5
        insertArchivedListing(MANIPAL, "house");                            // L6
        insertListing(MANIPAL, "house", "LIVE", true, false);                // L7 (duplicate)
        insertListing(MALFORMED_AREA_KEY, "house", "LIVE", false, false);    // L8 (malformed key)
        insertListing(BRAHMAVAR, "agricultural_land", "LIVE", false, false); // L9
    }

    // ── Total: blended (no propertyType filter) ───────────────────────────────

    @Test
    @DisplayName("blended total counts LIVE, non-archived, non-duplicate, 4-part listings only (5)")
    void blendedTotal_excludesNoiseAndMalformedKey() {
        seedFixture();

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));

        // L1 + L2 + L3 + L4 + L9 = 5. L5(draft)/L6(archived)/L7(dup)/L8(malformed) excluded.
        assertThat(response.totalActiveListings()).isEqualTo(5L);
        assertThat(response.propertyType()).isNull();
        assertThat(response.city()).isEqualTo(CITY);
        assertThat(response.groupBy()).isEqualTo("area_group");
        assertThat(response.generatedAt()).isNotNull();
    }

    // ── Total: propertyType filter, case-insensitive ──────────────────────────

    @Test
    @DisplayName("propertyType=house (any case) counts L1+L2+L4 = 3; apartment/agri excluded")
    void propertyTypeFilter_caseInsensitive_countsThree() {
        seedFixture();

        DiscoverSummaryResponse lower = service.getSummary(
                new SummaryQuery(CITY, "house", "area_group", 8));
        DiscoverSummaryResponse upper = service.getSummary(
                new SummaryQuery(CITY, "HOUSE", "area_group", 8));

        assertThat(lower.totalActiveListings()).isEqualTo(3L);
        assertThat(upper.totalActiveListings()).isEqualTo(3L);
        assertThat(lower.propertyType()).isEqualTo("house");
        assertThat(upper.propertyType()).isEqualTo("HOUSE");
    }

    // ── Blank/whitespace propertyType normalises to blended (null) ────────────

    @Test
    @DisplayName("whitespace propertyType normalises to null (blended) — same total as no filter")
    void whitespacePropertyType_normalisesToBlended() {
        seedFixture();

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY, "   ", "area_group", 8));

        assertThat(response.propertyType()).isNull();
        assertThat(response.totalActiveListings()).isEqualTo(5L);
    }

    // ── Regions: groupBy=area_group ────────────────────────────────────────────

    @Test
    @DisplayName("area_group regions: university-belt=3, coastal-strip=1, north-udupi=1; sums to total")
    void areaGroupRegions_blended_matchExpectedCountsAndSumToTotal() {
        seedFixture();

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));

        assertThat(regionCount(response, "university-belt")).isEqualTo(3L); // L1+L2+L3
        assertThat(regionCount(response, "coastal-strip")).isEqualTo(1L);   // L4
        assertThat(regionCount(response, "north-udupi")).isEqualTo(1L);     // L9

        long regionSum = response.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(regionSum).isEqualTo(response.totalActiveListings());

        // Deterministic ordering: count DESC, then label ASC.
        assertThat(response.regions().get(0).regionKey()).isEqualTo("university-belt");
    }

    @Test
    @DisplayName("area_group regions scoped to propertyType=house: university-belt=2, coastal-strip=1")
    void areaGroupRegions_houseFilter_excludesApartmentAndAgri() {
        seedFixture();

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY, "house", "area_group", 8));

        assertThat(regionCount(response, "university-belt")).isEqualTo(2L); // L1+L2 only
        assertThat(regionCount(response, "coastal-strip")).isEqualTo(1L);   // L4
        // north-udupi has zero house listings (L9 is agri) — region still present if group has members.
        assertThat(regionCount(response, "north-udupi")).isEqualTo(0L);

        long regionSum = response.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(regionSum).isEqualTo(3L);
        assertThat(regionSum).isEqualTo(response.totalActiveListings());
    }

    // ── Hotspots: ordering + LIMIT ──────────────────────────────────────────────

    @Test
    @DisplayName("hotspots ordered count DESC, name ASC, areaKey ASC; LIMIT applied")
    void hotspots_orderingAndLimit() {
        seedFixture();

        DiscoverSummaryResponse full = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));

        // Manipal=2 (L1+L2), then count=1 tier alphabetically: Brahmavar, Katapadi, Malpe.
        List<String> orderedAreaKeys = full.hotspots().stream()
                .map(DiscoverSummaryResponse.Hotspot::areaKey)
                .toList();
        assertThat(orderedAreaKeys).containsExactly(MANIPAL, BRAHMAVAR, KATAPADI, MALPE);

        DiscoverSummaryResponse.Hotspot top = full.hotspots().get(0);
        assertThat(top.name()).isEqualTo("Manipal");
        assertThat(top.listingCount()).isEqualTo(2L);
        assertThat(top.geoCenterLat()).isNotNull();
        assertThat(top.geoCenterLon()).isNotNull();

        // LIMIT=1 → only the top hotspot returned.
        DiscoverSummaryResponse limited = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 1));
        assertThat(limited.hotspots()).hasSize(1);
        assertThat(limited.hotspots().get(0).areaKey()).isEqualTo(MANIPAL);
    }

    // ── Unknown city → empty response, NOT an error ────────────────────────────

    @Test
    @DisplayName("unknown city → totalActiveListings=0, empty regions/hotspots")
    void unknownCity_returnsEmpty() {
        seedFixture();

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery("nowhere-city", null, "area_group", 8));

        assertThat(response.totalActiveListings()).isEqualTo(0L);
        assertThat(response.regions()).isEmpty();
        assertThat(response.hotspots()).isEmpty();
    }

    // ── Reconciliation: propertyType-scoped count must match /api/discover/areas ──

    @Test
    @DisplayName("reconciliation: per-area house count matches AreaSummaryService's type-filtered count")
    void reconciliation_perAreaCountMatchesAreaSummaryService() {
        seedFixture();

        DiscoverSummaryResponse summary = service.getSummary(
                new SummaryQuery(CITY, "house", "area_group", 20));
        AreaSummaryResponse areas = areaSummaryService.getAreasByCity(CITY, "house");

        long summaryManipalCount = summary.hotspots().stream()
                .filter(h -> MANIPAL.equals(h.areaKey()))
                .mapToLong(DiscoverSummaryResponse.Hotspot::listingCount)
                .findFirst().orElseThrow();
        long areasManipalCount = areas.areas().stream()
                .filter(a -> MANIPAL.equals(a.areaKey()))
                .mapToLong(AreaSummary::listingCount)
                .findFirst().orElseThrow();

        assertThat(summaryManipalCount).isEqualTo(areasManipalCount);
        assertThat(summaryManipalCount).isEqualTo(2L);
    }

    // ── groupBy=corridor ─────────────────────────────────────────────────────

    @Test
    @DisplayName("corridor regions: after backfill, north-direction group carries Brahmavar's agri listing")
    void corridorRegions_afterBackfill_northDirectionHasBrahmavarCount() {
        seedFixture();

        int upserted = backfillService.runBackfill();
        assertThat(upserted).as("classifications computed for seeded Udupi areas").isGreaterThan(0);

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY, "agricultural_land", "corridor", 8));

        assertThat(response.groupBy()).isEqualTo("corridor");
        assertThat(response.totalActiveListings()).isEqualTo(1L); // only L9

        Optional<DiscoverSummaryResponse.RegionCount> north = response.regions().stream()
                .filter(r -> "N".equals(r.regionKey()))
                .findFirst();
        assertThat(north).as("N direction region must be present").isPresent();
        assertThat(north.get().listingCount()).isEqualTo(1L);
        assertThat(north.get().regionLabel()).isEqualTo("N towards Brahmavar");

        long regionSum = response.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(regionSum).isEqualTo(response.totalActiveListings());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static long regionCount(DiscoverSummaryResponse response, String regionKey) {
        return response.regions().stream()
                .filter(r -> regionKey.equals(r.regionKey()))
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount)
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + regionKey + " not found in response"));
    }

    private void insertListing(String areaKey, String propertyType, String status,
                                boolean isDuplicate, boolean ignoredArchived) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, ?, NULL, ?, true, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, status, isDuplicate, propertyType, now, now);
    }

    /** A LIVE listing that is soft-deleted (archived_at set) — must be excluded by the count guard. */
    private void insertArchivedListing(String areaKey, String propertyType) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', ?, false, true, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, now, propertyType, now, now);
    }
}
