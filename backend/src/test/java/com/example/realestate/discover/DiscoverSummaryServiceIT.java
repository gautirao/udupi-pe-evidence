package com.example.realestate.discover;

import com.example.realestate.discover.navigation.PostgresAreaCountProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

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

    // ── Bangalore fixtures (#1761 V106 macro-region mapping) ───────────────────
    private static final String CITY_BANGALORE = "bangalore";

    // west-corridor member (V106) — new West Bangalore macro-region.
    private static final String RAJAJINAGAR = "IN|KA|Bengaluru|Rajajinagar";
    // kr-puram-belt member (V106) — East Bangalore.
    private static final String KR_PURAM = "IN|KA|Bengaluru|K R Puram";
    // thanisandra-hennur-belt member (V106) — North Bangalore.
    private static final String THANISANDRA = "IN|KA|Bengaluru|Thanisandra";
    // begur-bannerghatta-belt member (V106) — South Bangalore.
    private static final String BEGUR = "IN|KA|Bengaluru|Begur";
    // V78 overlap-repair fixtures: Yelahanka/Hebbal must be counted only under
    // north-growth (not airport-belt); Marathahalli only under tech-corridor (not outer-ring).
    private static final String YELAHANKA = "IN|KA|Bengaluru|Yelahanka";
    private static final String HEBBAL = "IN|KA|Bengaluru|Hebbal";
    private static final String MARATHAHALLI = "IN|KA|Bengaluru|Marathahalli";
    // airport-belt re-purpose member (V106).
    private static final String DEVANAHALLI = "IN|KA|Bengaluru|Devanahalli";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private DiscoverSummaryService service;
    private AreaSummaryService areaSummaryService;
    private RegionalClassificationBackfillService backfillService;
    private AreaGroupsService areaGroupsService;

    @BeforeEach
    void setUp() {
        service = new DiscoverSummaryService(
                jdbcTemplate, new CityActivationGuard(jdbcTemplate), new PostgresAreaCountProvider(jdbcTemplate));
        areaSummaryService = new AreaSummaryService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        areaGroupsService = new AreaGroupsService(jdbcTemplate);
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

    // ── #1955 Areas PR A, SLICE 2e: migration equivalence (AC13) ──────────────

    /**
     * Runs the PRE-#1955 per-region LEFT-JOIN-aggregate SQL directly (duplicated here, verbatim,
     * from {@code DiscoverSummaryService} as it existed before SLICE 2e's roll-up rewrite) and
     * asserts it produces the IDENTICAL region totals as the current (post-rewrite) {@link
     * DiscoverSummaryService#getSummary}, on the SAME seeded data. Independent proof that the
     * area-level-aggregation-plus-roll-up rewrite is behaviour-preserving, not just "the existing
     * fixture assertions still happen to pass".
     */
    @Test
    @DisplayName("migration equivalence: new roll-up area_group totals == legacy per-region LEFT JOIN totals")
    void migrationEquivalence_areaGroupRegions_matchLegacyPerRegionAggregation() {
        seedFixture();

        DiscoverSummaryResponse actual = service.getSummary(new SummaryQuery(CITY, "house", "area_group", 20));

        String legacySql = """
                SELECT ag.slug AS region_key, ag.name AS region_label, COUNT(pl.id) AS listing_count
                FROM area_groups ag
                JOIN cities c ON c.id = ag.city_id
                JOIN area_group_members agm ON agm.area_group_id = ag.id
                LEFT JOIN property_listings pl
                       ON pl.area_key = agm.area_key
                      AND pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false
                      AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
                      AND LOWER(pl.property_type) = LOWER(?)
                WHERE c.slug = ? AND c.is_active = true AND ag.is_active = true
                GROUP BY ag.slug, ag.name
                ORDER BY listing_count DESC, ag.name ASC
                """;
        List<DiscoverSummaryResponse.RegionCount> legacy = jdbcTemplate.query(legacySql,
                (rs, rowNum) -> new DiscoverSummaryResponse.RegionCount(
                        rs.getString("region_key"), rs.getString("region_label"), rs.getLong("listing_count")),
                "house", CITY);

        assertThat(actual.regions()).hasSameSizeAs(legacy);
        for (int i = 0; i < legacy.size(); i++) {
            assertThat(actual.regions().get(i).regionKey()).isEqualTo(legacy.get(i).regionKey());
            assertThat(actual.regions().get(i).listingCount()).isEqualTo(legacy.get(i).listingCount());
        }

        long legacyTotal = legacy.stream().mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(actual.totalActiveListings()).isEqualTo(legacyTotal);
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

    /**
     * #2151 PR B correction pass (B3): pins that {@code groupBy=corridor} for a NON-Agri
     * {@code propertyType} (here {@code house}) resolves entirely from the legacy {@code
     * regional_area_classifications} table and is genuinely independent of {@code
     * agri_destination_classification} — the table has ZERO rows for this city in this test (no
     * Agri promotion ever ran here), yet the corridor group for a 'house' listing is still
     * correctly populated. This is the regression B3 exists to prevent: a property-type-agnostic
     * consumer must never depend on the Agri-only, promotion-gated table (same boundary the Main
     * Agent already ruled for {@link CityRegionOnboardingService}).
     */
    @Test
    @DisplayName("corridor regions for a NON-Agri propertyType (house) resolve from the legacy table "
            + "and are unaffected by agri_destination_classification having zero rows")
    void corridorRegions_nonAgriPropertyType_resolvesFromLegacyTable_independentOfAgriTable() {
        insertListing(BRAHMAVAR, "house", "LIVE", false, false); // non-Agri listing, North of city

        int upserted = backfillService.runBackfill();
        assertThat(upserted).as("classifications computed for seeded Udupi areas").isGreaterThan(0);

        Integer agriRowCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM agri_destination_classification adc "
                        + "JOIN cities c ON c.id = adc.city_id WHERE c.slug = ?",
                Integer.class, CITY);
        assertThat(agriRowCount)
                .as("no Agri promotion has run for this city — the new table must be empty for "
                        + "this assertion to prove independence, not coincidence")
                .isZero();

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY, "house", "corridor", 8));

        assertThat(response.groupBy()).isEqualTo("corridor");
        assertThat(response.propertyType()).isEqualTo("house");
        assertThat(response.totalActiveListings()).isEqualTo(1L);

        Optional<DiscoverSummaryResponse.RegionCount> north = response.regions().stream()
                .filter(r -> "N".equals(r.regionKey()))
                .findFirst();
        assertThat(north)
                .as("N direction region must be present from the legacy classification, "
                        + "despite zero agri_destination_classification rows")
                .isPresent();
        assertThat(north.get().listingCount()).isEqualTo(1L);
    }

    // ── listingPurpose (#1745 P5-addendum): independent filter, separate from propertyType ────

    /**
     * Value-distinct listingPurpose fixture (separate from {@link #seedFixture()}):
     * <ul>
     *   <li>2 sale 'house' @ Manipal</li>
     *   <li>1 rent 'apartment' @ Manipal</li>
     *   <li>1 sale 'house' @ Malpe</li>
     *   <li>1 rent 'apartment' @ Katapadi</li>
     * </ul>
     * Sale total=3, rent total=2, blended (omitted)=5 — three genuinely different counts so the
     * three cases cannot pass by a pre-computed/faked expectation.
     */
    private void seedListingPurposeFixture() {
        insertListing(MANIPAL, "house", "LIVE", false, false, "sale");
        insertListing(MANIPAL, "house", "LIVE", false, false, "sale");
        insertListing(MANIPAL, "apartment", "LIVE", false, false, "rent");
        insertListing(MALPE, "house", "LIVE", false, false, "sale");
        insertListing(KATAPADI, "apartment", "LIVE", false, false, "rent");
    }

    @Test
    @DisplayName("listingPurpose=sale(3) vs rent(2) vs omitted(5): independently filtered, sale+rent sums to blended")
    void listingPurposeFilter_saleVsRentVsOmitted_countsDifferAndSumToBlended() {
        seedListingPurposeFixture();

        DiscoverSummaryResponse saleOnly = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "sale"));
        DiscoverSummaryResponse rentOnly = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "rent"));
        DiscoverSummaryResponse omitted = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));

        assertThat(saleOnly.totalActiveListings()).isEqualTo(3L);
        assertThat(rentOnly.totalActiveListings()).isEqualTo(2L);
        assertThat(omitted.totalActiveListings()).isEqualTo(5L);
        assertThat(saleOnly.totalActiveListings() + rentOnly.totalActiveListings())
                .as("sale + rent must reconcile to the blended (omitted) total")
                .isEqualTo(omitted.totalActiveListings());
    }

    @Test
    @DisplayName("listingPurpose blank/invalid normalises to blended(5) — same as omitted, not zero/error")
    void listingPurposeFilter_blankOrInvalid_normalisesToBlended() {
        seedListingPurposeFixture();

        DiscoverSummaryResponse blank = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "   "));
        DiscoverSummaryResponse invalid = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "bogus"));
        DiscoverSummaryResponse omitted = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));

        assertThat(blank.totalActiveListings()).isEqualTo(5L);
        assertThat(invalid.totalActiveListings()).isEqualTo(5L);
        assertThat(omitted.totalActiveListings()).isEqualTo(5L);
    }

    /**
     * #1956 PR1 review correction. Before this change {@code normalizeListingPurpose} was an
     * exact-match allowlist, so {@code SALE} fell through to {@code null} and the summary reported
     * the BLENDED whole-city total (5) — beside a listings endpoint that, once it started
     * canonicalising through the shared normaliser, returned sale-only rows (3). Same
     * count-overstates-its-results defect as AC1.16, different pair of surfaces.
     *
     * <p>Every derived value moves together: {@code totalActiveListings}, each region's
     * {@code listingCount}, and each hotspot's {@code listingCount} — all three are asserted here so
     * a partial fix (total scoped but rollups still blended) cannot pass.
     */
    @Test
    @DisplayName("listingPurpose=SALE is scoped to sale(3), NOT blended(5) — total, region counts and "
            + "hotspot counts all match the lower-cased request exactly")
    void listingPurposeFilter_upperCased_isScopedNotBlended() {
        seedListingPurposeFixture();

        DiscoverSummaryResponse upper = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "SALE"));
        DiscoverSummaryResponse lower = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "sale"));
        DiscoverSummaryResponse omitted = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));

        assertThat(upper.totalActiveListings())
                .as("SALE must behave exactly as sale")
                .isEqualTo(lower.totalActiveListings())
                .isEqualTo(3L);
        assertThat(upper.totalActiveListings())
                .as("and must NOT be the blended total it silently returned before this correction")
                .isNotEqualTo(omitted.totalActiveListings());

        assertThat(upper.regions())
                .as("region rollups must be scoped identically, not left blended")
                .isEqualTo(lower.regions());
        assertThat(upper.hotspots())
                .as("hotspot rollups must be scoped identically, not left blended")
                .isEqualTo(lower.hotspots());

        // Whitespace tolerance is unchanged and case-insensitivity composes with it.
        assertThat(service.getSummary(new SummaryQuery(CITY, null, "area_group", 8, " Sale "))
                .totalActiveListings()).isEqualTo(3L);
    }

    // ── propertyType: total and rollups must resolve an unknown value IDENTICALLY ─────────────

    /**
     * #1956 PR1 review fix A — a regression this PR introduced against origin/main, caught in review.
     *
     * <p>{@code propertyType} is a free-form {@code @RequestParam} on a public unauthenticated
     * endpoint, so a typo or a stale bookmark reaches it. Replacing the bespoke
     * {@code LOWER(pl.property_type) = LOWER(?)} fragment with the allowlisted shared predicate on
     * ONE side left {@code totalActiveListings} using the raw value (→ 0) while {@code regions[]}
     * and {@code hotspots[]} went through {@code AreaCountQuery}'s allowlist, which dropped the
     * unknown value and returned whole-city BLENDED counts. On origin/main both sides used the same
     * fragment and agreed at zero.
     *
     * <p>Every case in this class used {@code house}/{@code apartment}/blank, which is exactly why
     * it slipped through. The assertion is the internal-consistency one: the total must equal the
     * sum of the region counts, non-vacuously — the blended control proves the fixture is non-empty
     * and that the sum-of-regions figure is a real, moving number.
     */
    @Test
    @DisplayName("an UNRECOGNISED propertyType resolves identically on every number in one payload: "
            + "totalActiveListings == sum(regions[].listingCount) == 0, never 0 beside blended rollups")
    void unrecognisedPropertyType_totalAndRollupsAgree_withinOneResponse() {
        seedListingPurposeFixture(); // 5 listings: 3 house, 2 apartment — zero 'penthouse'

        DiscoverSummaryResponse unknown = service.getSummary(
                new SummaryQuery(CITY, "penthouse", "area_group", 8));

        long unknownRegionSum = unknown.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        long unknownHotspotSum = unknown.hotspots().stream()
                .mapToLong(DiscoverSummaryResponse.Hotspot::listingCount).sum();

        assertThat(unknown.totalActiveListings())
                .as("total must agree with the region rollups it is displayed beside")
                .isEqualTo(unknownRegionSum)
                .isEqualTo(0L);
        assertThat(unknownHotspotSum)
                .as("hotspots must not carry blended counts either")
                .isZero();
        assertThat(unknown.propertyType())
                .as("the RAW value is still echoed back — that is correct behaviour, not a bug")
                .isEqualTo("penthouse");

        // Non-vacuity control: the same fixture under a blended query yields a real, non-zero
        // total AND a non-zero region sum, so the zeros above are a genuine narrowing result and
        // not an artefact of an empty city or of regions[] always summing to zero.
        DiscoverSummaryResponse blended = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8));
        long blendedRegionSum = blended.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(blended.totalActiveListings()).isEqualTo(5L);
        assertThat(blendedRegionSum).isPositive();

        // And a RECOGNISED type still agrees across both sides, mis-cased or not.
        DiscoverSummaryResponse house = service.getSummary(
                new SummaryQuery(CITY, "HOUSE", "area_group", 8));
        long houseRegionSum = house.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(house.totalActiveListings()).isEqualTo(houseRegionSum).isEqualTo(3L);
    }

    @Test
    @DisplayName("listingPurpose and propertyType combine via AND without being conflated: "
            + "sale+house=3, rent+house=1, sale(any type)=4")
    void listingPurposeAndPropertyType_combineIndependently_viaAnd() {
        // Base fixture: sale-house x2 @ Manipal, rent-apartment @ Manipal, sale-house @ Malpe,
        // rent-apartment @ Katapadi. Plus two more distinguishing rows added here:
        // rent-house @ Malpe (differentiates rentHouse from saleHouse) and sale-apartment @
        // Katapadi (differentiates saleAll, which must NOT be conflated with saleHouse).
        seedListingPurposeFixture();
        insertListing(MALPE, "house", "LIVE", false, false, "rent");
        insertListing(KATAPADI, "apartment", "LIVE", false, false, "sale");

        DiscoverSummaryResponse saleHouse = service.getSummary(
                new SummaryQuery(CITY, "house", "area_group", 8, "sale"));
        DiscoverSummaryResponse rentHouse = service.getSummary(
                new SummaryQuery(CITY, "house", "area_group", 8, "rent"));
        DiscoverSummaryResponse saleAll = service.getSummary(
                new SummaryQuery(CITY, null, "area_group", 8, "sale"));

        // sale+house: 2 @ Manipal + 1 @ Malpe = 3 — excludes rent-house@Malpe and both rent/sale apartments.
        assertThat(saleHouse.totalActiveListings()).isEqualTo(3L);
        assertThat(saleHouse.propertyType()).isEqualTo("house");
        // rent+house: only the newly-added Malpe row.
        assertThat(rentHouse.totalActiveListings()).isEqualTo(1L);
        // sale (propertyType omitted): the 3 sale-house rows PLUS the new sale-apartment@Katapadi = 4 —
        // strictly greater than saleHouse, proving propertyType and listingPurpose are independent,
        // not merged/overloaded onto each other.
        assertThat(saleAll.totalActiveListings()).isEqualTo(4L);
        assertThat(saleAll.propertyType()).isNull();
    }

    // ── #1761 V106: Bangalore macro-region mapping ──────────────────────────────

    @Test
    @DisplayName("IT-1: West Bangalore macro-region exists as an active area_group after Flyway")
    void westBangalore_existsAsActiveAreaGroup() {
        AreaGroupsResponse response = areaGroupsService.getGroupsByCity(CITY_BANGALORE);

        List<AreaGroupResponse> westGroups = response.groups().stream()
                .filter(g -> "West Bangalore".equals(g.regionLabel()))
                .toList();

        assertThat(westGroups).as("at least one active West Bangalore group").isNotEmpty();

        AreaGroupResponse westCorridor = westGroups.stream()
                .filter(g -> "west-corridor".equals(g.slug()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("west-corridor group not found"));
        assertThat(westCorridor.name()).isNotBlank();
        assertThat(westCorridor.displayOrder()).isPositive();
        assertThat(westCorridor.areaKeys()).contains(RAJAJINAGAR);
    }

    @Test
    @DisplayName("IT-2: a LIVE sale listing at a West Bangalore locality is counted exactly once")
    void westBangalore_listingCountedExactlyOnce() {
        insertListing(RAJAJINAGAR, "house", "LIVE", false, false, "sale");

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY_BANGALORE, null, "area_group", 20, "sale"));

        assertThat(response.totalActiveListings()).isEqualTo(1L);
        assertThat(regionCount(response, "west-corridor")).isEqualTo(1L);
    }

    @Test
    @DisplayName("IT-3: area_group summary rows carry regionKey/regionLabel enabling a West rollup card")
    void westBangalore_rollupShape_regionKeyAndLabelPresent() {
        insertListing(RAJAJINAGAR, "house", "LIVE", false, false, "sale");

        DiscoverSummaryResponse summary = service.getSummary(
                new SummaryQuery(CITY_BANGALORE, null, "area_group", 20, "sale"));
        assertThat(summary.regions().stream().map(DiscoverSummaryResponse.RegionCount::regionKey))
                .contains("west-corridor");

        // The true macro-region label ("West Bangalore") is surfaced via /api/discover/area-groups
        // (AreaGroupsService), which the frontend rollup (macroRegionResolver) reads directly —
        // DiscoverSummaryService's regionLabel column is the group's display name, not its
        // macro-region. Both must agree the group belongs to West Bangalore.
        AreaGroupsResponse groups = areaGroupsService.getGroupsByCity(CITY_BANGALORE);
        AreaGroupResponse westCorridor = groups.groups().stream()
                .filter(g -> "west-corridor".equals(g.slug()))
                .findFirst()
                .orElseThrow();
        assertThat(westCorridor.regionLabel()).isEqualTo("West Bangalore");
    }

    @Test
    @DisplayName("IT-4: uniqueness invariant — no bangalore area_key belongs to more than one area_group")
    void uniquenessInvariant_noBangaloreAreaKeyInMultipleGroups() {
        List<String> duplicates = jdbcTemplate.queryForList(
                """
                SELECT agm.area_key
                FROM area_group_members agm
                JOIN area_groups ag ON ag.id = agm.area_group_id
                JOIN cities c ON c.id = ag.city_id
                WHERE c.slug = ?
                GROUP BY agm.area_key
                HAVING COUNT(*) > 1
                """,
                String.class, CITY_BANGALORE);

        assertThat(duplicates).as("bangalore area_keys with >1 area_group_members row").isEmpty();
    }

    @Test
    @DisplayName("IT-5: overlap repair — Yelahanka/Hebbal counted only under north-growth, "
            + "Marathahalli only under tech-corridor; airport-belt holds only re-purposed members")
    void overlapRepair_yelahankaHebbalMarathahalli_countedOnceInCorrectGroup() {
        insertListing(YELAHANKA, "house", "LIVE", false, false, "sale");
        insertListing(HEBBAL, "house", "LIVE", false, false, "sale");
        insertListing(MARATHAHALLI, "house", "LIVE", false, false, "sale");

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY_BANGALORE, null, "area_group", 20, "sale"));

        assertThat(regionCount(response, "north-growth")).isEqualTo(2L); // Yelahanka + Hebbal
        assertThat(regionCount(response, "airport-belt")).isEqualTo(0L);
        assertThat(regionCount(response, "tech-corridor")).isEqualTo(1L); // Marathahalli
        assertThat(regionCount(response, "outer-ring")).isEqualTo(0L);

        long regionSum = response.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(regionSum).isEqualTo(response.totalActiveListings());

        // airport-belt no longer carries Yelahanka/Hebbal but does carry its re-purposed members.
        AreaGroupsResponse groups = areaGroupsService.getGroupsByCity(CITY_BANGALORE);
        AreaGroupResponse airportBelt = groups.groups().stream()
                .filter(g -> "airport-belt".equals(g.slug()))
                .findFirst()
                .orElseThrow();
        assertThat(airportBelt.areaKeys()).doesNotContain(YELAHANKA, HEBBAL);
        assertThat(airportBelt.areaKeys()).contains(DEVANAHALLI);
    }

    @Test
    @DisplayName("IT-6: exactly-once accounting — N seeded listings across newly-mapped localities "
            + "sum to N with no inflation")
    void exactlyOnceAccounting_newlyMappedLocalities_sumEqualsSeededCount() {
        insertListing(KR_PURAM, "house", "LIVE", false, false, "sale");
        insertListing(THANISANDRA, "house", "LIVE", false, false, "sale");
        insertListing(THANISANDRA, "apartment", "LIVE", false, false, "sale");
        insertListing(BEGUR, "house", "LIVE", false, false, "sale");
        insertListing(RAJAJINAGAR, "house", "LIVE", false, false, "sale");
        int seeded = 5;

        DiscoverSummaryResponse response = service.getSummary(
                new SummaryQuery(CITY_BANGALORE, null, "area_group", 20, "sale"));

        assertThat(response.totalActiveListings()).isEqualTo(seeded);

        long regionSum = response.regions().stream()
                .mapToLong(DiscoverSummaryResponse.RegionCount::listingCount).sum();
        assertThat(regionSum)
                .as("per-group counts must sum to the seeded total with no double counting")
                .isEqualTo(seeded);

        assertThat(regionCount(response, "kr-puram-belt")).isEqualTo(1L);
        assertThat(regionCount(response, "thanisandra-hennur-belt")).isEqualTo(2L);
        assertThat(regionCount(response, "begur-bannerghatta-belt")).isEqualTo(1L);
        assertThat(regionCount(response, "west-corridor")).isEqualTo(1L);
    }

    @Test
    @DisplayName("IT-7: full Flyway chain incl. V106 applied cleanly — expected group/member "
            + "counts present on a fresh Testcontainers DB")
    void v106MigrationApplied_expectedGroupAndMemberCounts() {
        Integer groupCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM area_groups ag
                JOIN cities c ON c.id = ag.city_id
                WHERE c.slug = ?
                """,
                Integer.class, CITY_BANGALORE);
        // 5 existing (V78) + 11 new (V106) = 16.
        assertThat(groupCount).isEqualTo(16);

        Integer memberCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM area_group_members agm
                JOIN area_groups ag ON ag.id = agm.area_group_id
                JOIN cities c ON c.id = ag.city_id
                WHERE c.slug = ?
                """,
                Integer.class, CITY_BANGALORE);
        // V78 seeded 13 rows (tech-corridor 4 + north-growth 2 + south-premium 3 + outer-ring 2
        // + airport-belt 2), minus 3 overlap-repair DELETEs, plus 304 new V106 memberships.
        assertThat(memberCount).isEqualTo(13 - 3 + 304);
    }

    @Test
    @DisplayName("V106 is idempotent when re-executed against an already-migrated container")
    void v106Migration_isIdempotentWhenReExecuted() throws Exception {
        Integer groupCountBefore = countBangaloreGroups();
        Integer memberCountBefore = countBangaloreMembers();

        // The migration's own DO $$ ... $$ block is dollar-quoted PL/pgSQL: Spring's ScriptUtils
        // splits naively on ';' and does not understand $$ quoting, so the whole file is instead
        // sent as ONE multi-statement command via the JDBC simple-query protocol (jdbcTemplate's
        // Statement#execute), which Postgres parses server-side — the standard way to safely
        // re-run a script containing PL/pgSQL blocks.
        String script;
        try (var in = new ClassPathResource("db/migration/V106__seed_bangalore_macro_region_mapping.sql")
                .getInputStream()) {
            script = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }

        assertDoesNotThrow(() -> {
            try (Connection conn = jdbcTemplate.getDataSource().getConnection();
                 var stmt = conn.createStatement()) {
                stmt.execute(script);
            }
        });

        assertThat(countBangaloreGroups()).isEqualTo(groupCountBefore);
        assertThat(countBangaloreMembers()).isEqualTo(memberCountBefore);

        List<String> duplicatesAfterRerun = jdbcTemplate.queryForList(
                """
                SELECT agm.area_key
                FROM area_group_members agm
                JOIN area_groups ag ON ag.id = agm.area_group_id
                JOIN cities c ON c.id = ag.city_id
                WHERE c.slug = ?
                GROUP BY agm.area_key
                HAVING COUNT(*) > 1
                """,
                String.class, CITY_BANGALORE);
        assertThat(duplicatesAfterRerun).isEmpty();
    }

    private Integer countBangaloreGroups() {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM area_groups ag JOIN cities c ON c.id = ag.city_id WHERE c.slug = ?",
                Integer.class, CITY_BANGALORE);
    }

    private Integer countBangaloreMembers() {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM area_group_members agm
                JOIN area_groups ag ON ag.id = agm.area_group_id
                JOIN cities c ON c.id = ag.city_id
                WHERE c.slug = ?
                """,
                Integer.class, CITY_BANGALORE);
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
        // Existing (pre-#1745-P5-addendum) callers don't care about listing_purpose — the DB
        // default ('sale', enforced by V32's chk_listing_purpose CHECK) applies, matching every
        // seedFixture()-based assertion written before listingPurpose existed.
        insertListing(areaKey, propertyType, status, isDuplicate, ignoredArchived, "sale");
    }

    private void insertListing(String areaKey, String propertyType, String status,
                                boolean isDuplicate, boolean ignoredArchived, String listingPurpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, ?, NULL, ?, true, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, status, isDuplicate, propertyType, listingPurpose, now, now);
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
