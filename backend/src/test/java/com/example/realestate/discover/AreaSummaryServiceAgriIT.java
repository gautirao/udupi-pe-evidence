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

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Repository-level integration test for {@link AreaSummaryService} agri-only counts + acreage (#1371).
 *
 * <p>Drives the service directly against a REAL PostGIS database (Flyway through V86). Areas and
 * cities come from the V71 seed; only {@code property_listings} rows are inserted per-test. The
 * service is instantiated with the autowired {@link JdbcTemplate} (a {@code JdbcOperations}).
 *
 * <p>Harness copied from {@code AreaOverviewRollupJobIntegrationTest}: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4}, no DB replacement, {@code concurrently_keyword} emptied so V73's
 * CONCURRENTLY index runs inside Flyway's transaction.
 *
 * <p>Acreage normalization fact: 5 acres → 5.00 acres (AreaNormalizer round-trips acre→sqm→acre at
 * scale 2). 100 cents → ~1.00 acres (1 acre = 100 cents to ~2 dp). Unparseable unit ("plots") /
 * null unit → skipped (empty()).
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
class AreaSummaryServiceAgriIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "udupi";

    // Four 4-segment Udupi localities seeded by V71.
    private static final String MANIPAL = "IN|KA|Udupi|Manipal";       // 1 clean agri + bad agri + apartment
    private static final String KUNJIBETTU = "IN|KA|Udupi|Kunjibettu"; // only unparseable/null-unit agri
    private static final String AMOGHAPURA = "IN|KA|Udupi|Amoghapura"; // mixed parseable + unparseable
    private static final String MALPE = "IN|KA|Udupi|Malpe";           // no listings at all

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AreaSummaryService service;

    @BeforeEach
    void setUp() {
        service = new AreaSummaryService(jdbcTemplate);
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    // ── AC1 / AC3: agri count is approved-only (excludes draft/archived/duplicate + apartment) ──

    @Test
    @DisplayName("agri filter counts only the 1 clean LIVE agri; excludes draft/archived/dup agri + apartment")
    void agriFilter_approvedOnlyCount() {
        // Manipal: 1 clean LIVE agri (5 acre) + 1 DRAFT agri + 1 archived agri + 1 duplicate agri + 1 LIVE apartment.
        insertListing(MANIPAL, "agricultural_land", "LIVE", false, false, new BigDecimal("5"), "acre");
        insertListing(MANIPAL, "agricultural_land", "DRAFT", false, false, new BigDecimal("9"), "acre");
        insertArchivedListing(MANIPAL, "agricultural_land", new BigDecimal("9"), "acre");
        insertListing(MANIPAL, "agricultural_land", "LIVE", false, /* duplicate */ true, new BigDecimal("9"), "acre");
        insertListing(MANIPAL, "apartment", "LIVE", false, false, null, null);

        AreaSummary manipal = areaOf(service.getAreasByCity(CITY, "agricultural_land"), MANIPAL);

        assertThat(manipal.listingCount()).as("only the 1 clean LIVE agri is counted").isEqualTo(1L);
        // AC4: acreage == normalized acres of the 1 clean agri (5 acre → 5.00).
        assertThat(manipal.agriAcreage()).isNotNull();
        assertThat(manipal.agriAcreage()).isEqualTo(5.0);
    }

    // ── AC2 (post-#1463): blended (no filter) area-first count EXCLUDES agricultural_land ──
    //    #1463 added `LOWER(property_type) != LOWER('agricultural_land')` to AREAS_BY_CITY_SQL so the
    //    area-first journey no longer counts agri toward locality cards. Only non-agri approved
    //    listings (here: the apartment) are counted; the draft is excluded by the LIVE guard.

    @Test
    @DisplayName("blended count excludes agri (#1463) + draft; counts only the apartment; acreage omitted")
    void blendedCount_excludesAgri_noAcreage() {
        insertListing(MANIPAL, "agricultural_land", "LIVE", false, false, new BigDecimal("5"), "acre"); // excluded by #1463
        insertListing(MANIPAL, "apartment", "LIVE", false, false, null, null);                          // counted
        // not-counted noise (draft) to prove the blended LIVE guard still holds:
        insertListing(MANIPAL, "house", "DRAFT", false, false, null, null);

        AreaSummary blended = areaOf(service.getAreasByCity(CITY, null), MANIPAL);

        assertThat(blended.listingCount()).as("agri excluded (#1463), draft excluded → only apartment").isEqualTo(1L);
        assertThat(blended.agriAcreage()).as("acreage not computed on blended path").isNull();

        // Single-arg overload is byte-identical to the null-filter path.
        AreaSummary legacy = areaOf(service.getAreasByCity(CITY), MANIPAL);
        assertThat(legacy.listingCount()).isEqualTo(1L);
        assertThat(legacy.agriAcreage()).isNull();
    }

    // ── AC4: area with only unparseable/null-unit agri → acreage null/omitted, count still counts ──

    @Test
    @DisplayName("area with only unparseable/null-unit agri → acreage omitted (null), count = rows")
    void unparseableOnly_acreageNull() {
        insertListing(KUNJIBETTU, "agricultural_land", "LIVE", false, false, new BigDecimal("3"), "plots"); // bad unit
        insertListing(KUNJIBETTU, "agricultural_land", "LIVE", false, false, new BigDecimal("4"), null);    // null unit

        AreaSummary kunjibettu = areaOf(service.getAreasByCity(CITY, "agricultural_land"), KUNJIBETTU);

        assertThat(kunjibettu.listingCount()).as("both LIVE agri rows are counted").isEqualTo(2L);
        assertThat(kunjibettu.agriAcreage()).as("zero parseable rows → null acreage").isNull();
    }

    // ── per-row-skip: mixed parseable + unparseable → sum only the parseable rows ──

    @Test
    @DisplayName("mixed parseable + unparseable agri → per-row-skip sums only parseable rows")
    void mixedRows_perRowSkipSum() {
        insertListing(AMOGHAPURA, "agricultural_land", "LIVE", false, false, new BigDecimal("2"), "acre");   // parseable
        insertListing(AMOGHAPURA, "agricultural_land", "LIVE", false, false, new BigDecimal("3"), "acre");   // parseable
        insertListing(AMOGHAPURA, "agricultural_land", "LIVE", false, false, new BigDecimal("9"), "plots");  // unparseable
        insertListing(AMOGHAPURA, "agricultural_land", "LIVE", false, false, new BigDecimal("9"), null);     // unparseable

        AreaSummary amoghapura = areaOf(service.getAreasByCity(CITY, "agricultural_land"), AMOGHAPURA);

        assertThat(amoghapura.listingCount()).as("all 4 LIVE agri counted").isEqualTo(4L);
        // PER-ROW-SKIP: 2 + 3 = 5 acres (the two "plots"/null rows are skipped, NOT nulling the area).
        assertThat(amoghapura.agriAcreage()).isNotNull();
        assertThat(amoghapura.agriAcreage()).isEqualTo(5.0);
    }

    // ── area with zero agri → count 0, acreage omitted, row retained ──

    @Test
    @DisplayName("area with zero agri retained with count 0 and acreage omitted")
    void zeroAgriArea_retainedCountZeroAcreageOmitted() {
        // No listings anywhere. Malpe (and all seeded Udupi localities) must still appear.
        List<AreaSummary> areas = service.getAreasByCity(CITY, "agricultural_land").areas();

        AreaSummary malpe = areaOf(areas, MALPE);
        assertThat(malpe.listingCount()).isEqualTo(0L);
        assertThat(malpe.agriAcreage()).isNull();
    }

    // ── cent-unit normalization sanity (AreaNormalizer cross-unit) ──

    @Test
    @DisplayName("cent-unit agri normalizes to acres (100 cent ≈ 1 acre)")
    void centUnit_normalizesToAcres() {
        insertListing(MANIPAL, "agricultural_land", "LIVE", false, false, new BigDecimal("100"), "cent");

        AreaSummary manipal = areaOf(service.getAreasByCity(CITY, "agricultural_land"), MANIPAL);

        assertThat(manipal.listingCount()).isEqualTo(1L);
        assertThat(manipal.agriAcreage()).isNotNull();
        // 100 cents → ~1 acre; allow rounding tolerance from the scale-2 sqm→acre conversion.
        assertThat(manipal.agriAcreage()).isCloseTo(1.0, org.assertj.core.data.Offset.offset(0.01));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static AreaSummary areaOf(AreaSummaryResponse response, String areaKey) {
        return areaOf(response.areas(), areaKey);
    }

    private static AreaSummary areaOf(List<AreaSummary> areas, String areaKey) {
        Optional<AreaSummary> match = areas.stream()
                .filter(a -> areaKey.equals(a.areaKey()))
                .findFirst();
        assertThat(match).as("area %s must be present in the response", areaKey).isPresent();
        return match.get();
    }

    private void insertListing(String areaKey, String propertyType, String status,
                               boolean ignoredArchived, boolean isDuplicate,
                               BigDecimal landArea, String landAreaUnit) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, ?, NULL, ?, true, ?, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, status, isDuplicate,
                propertyType, landArea, landAreaUnit, now, now);
    }

    /** A LIVE listing that is soft-deleted (archived_at set) — must be excluded by the count guard. */
    private void insertArchivedListing(String areaKey, String propertyType,
                                       BigDecimal landArea, String landAreaUnit) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', ?, false, true, ?, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, now, propertyType, landArea, landAreaUnit, now, now);
    }
}
