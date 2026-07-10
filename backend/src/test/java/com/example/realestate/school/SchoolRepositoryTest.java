package com.example.realestate.school;

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
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link SchoolRepository#findNearbySchools} — verifies that the
 * stored {@code s.geog} geography column is used (issue #1063 fix) rather than a
 * recomputed {@code ST_Point(lon, lat)::geography} expression that defeated
 * {@code idx_schools_geog}.
 *
 * <p>Container image: {@code postgis/postgis:15-3.4-alpine} — required because V73 runs
 * {@code CREATE EXTENSION postgis} which is unavailable on plain {@code postgres:15-alpine}.
 *
 * <p>Runs under default {@code mvn test} (surefire) via {@code @DataJpaTest} +
 * {@code @Testcontainers}. Not tagged {@code integration} — surefire's
 * {@code excludedGroups=integration} does not apply. Requires Docker for the PostGIS container.
 *
 * <p>Coordinate reference (Udupi / Manipal area, Karnataka, India):
 * <ul>
 *   <li>Manipal centre:     lat=13.3511, lon=74.7871
 *   <li>Udupi town centre:  lat=13.3409, lon=74.7421  (~5.4 km from Manipal)
 *   <li>Brahmavar:          lat=13.4287, lon=74.7614  (~9.3 km from Manipal)
 *   <li>Kundapura:          lat=13.6237, lon=74.6901  (~31 km from Manipal — out of 10 km)
 * </ul>
 *
 * <p>Haversine reference distances from Manipal centre (13.3511, 74.7871):
 * <ul>
 *   <li>Manipal school (same point): ~0 km
 *   <li>Udupi school:                ~5.4 km
 *   <li>Brahmavar school:            ~9.3 km
 *   <li>Kundapura school:            ~31.0 km  (outside any 10 km radius test)
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
        // V73 contains `-- flyway:no-transaction` + a transactional CREATE EXTENSION + a
        // non-transactional CREATE INDEX CONCURRENTLY. Spring Boot Flyway requires
        // `mixed=true` to honour this. Production sets it via sidecar conf; tests opt in here.
        "spring.flyway.mixed=true",
        // Override the concurrently_keyword placeholder to empty string so V73 runs
        // synchronous CREATE INDEX (no CONCURRENTLY) inside Testcontainers on arm64/Rosetta,
        // where CONCURRENTLY deadlocks due to Flyway's persistent VID. Production uses
        // "CONCURRENTLY " (default set in application.yml).
        "spring.flyway.placeholders.concurrently_keyword="
})
class SchoolRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private SchoolRepository schoolRepository;

    @Autowired
    private JdbcTemplate jdbc;

    // Fixed UUIDs so ON CONFLICT checks are deterministic across BeforeEach re-runs.
    private static final String ID_MANIPAL   = "10000000-0000-0000-0000-000000000001";
    private static final String ID_UDUPI     = "10000000-0000-0000-0000-000000000002";
    private static final String ID_BRAHMAVAR = "10000000-0000-0000-0000-000000000003";
    private static final String ID_KUNDAPURA = "10000000-0000-0000-0000-000000000004";

    @BeforeEach
    void seedFixtureSchools() {
        // Insert test schools at known Udupi-area coordinates.
        // Use INSERT ... ON CONFLICT DO NOTHING to keep BeforeEach idempotent.
        insertSchool(ID_MANIPAL,   "Test School Manipal",   "CBSE",  13.3511, 74.7871);
        insertSchool(ID_UDUPI,     "Test School Udupi",     "STATE", 13.3409, 74.7421);
        insertSchool(ID_BRAHMAVAR, "Test School Brahmavar", "ICSE",  13.4287, 74.7614);
        insertSchool(ID_KUNDAPURA, "Test School Kundapura", "STATE", 13.6237, 74.6901);
    }

    private void insertSchool(String id, String name, String board, double lat, double lon) {
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address)
                VALUES (?::uuid, ?, ?, ?, ?, 'Test fixture')
                ON CONFLICT (id) DO NOTHING
                """, id, name, board, lat, lon);
    }

    /**
     * Inserts a fixture school with an explicit {@code district}, used by the city-scoped
     * search tests to seed schools in different districts (e.g. "Bengaluru" vs "Udupi") so the
     * {@code findByNameContainingIgnoreCaseAndCity} JOIN filter can be exercised.
     */
    private void insertSchoolWithDistrict(String id, String name, double lat, double lon, String district) {
        jdbc.update("""
                INSERT INTO schools (id, name, board_type, latitude, longitude, address, district)
                VALUES (?::uuid, ?, 'STATE', ?, ?, 'Test fixture', ?)
                ON CONFLICT (id) DO NOTHING
                """, id, name, lat, lon, district);
    }

    /**
     * Inserts a fixture school with an explicit {@code district} AND {@code area_key}, used by
     * the group-scoped search tests (issue #1812) to exercise in-scope-first ranking.
     *
     * <p>The V80 {@code trg_school_area_key} trigger fires unconditionally on INSERT and
     * overwrites any {@code area_key} supplied there with its own geography-based computation
     * (see {@link SchoolAreaKeyTriggerTest} AC1). Per AC3, the trigger is scoped to
     * {@code lat/lon/district} changes only — a standalone {@code UPDATE ... SET area_key} is
     * NOT recomputed. So this inserts without {@code area_key}, then issues a separate UPDATE to
     * pin the exact value the test needs, deterministically bypassing the trigger's real-geography
     * nearest-area computation.
     */
    private void insertSchoolWithDistrictAndAreaKey(
            String id, String name, double lat, double lon, String district, String areaKey) {
        insertSchoolWithDistrict(id, name, lat, lon, district);
        jdbc.update("UPDATE schools SET area_key = ? WHERE id = ?::uuid", areaKey, id);
    }

    /**
     * Inserts a property listing at the given coordinates with the given status.
     * {@code isValid}, {@code isDuplicate} default to their AC2 requirements.
     *
     * @param lat       latitude (may be null to produce a NULL geog — excluded from counts)
     * @param lon       longitude (may be null)
     * @param status    listing_status string (e.g. 'SCRAPED', 'LIVE', 'DRAFT')
     * @param isDuplicate true to set is_duplicate=true
     * @param isValid     true to set is_valid=true
     */
    private void insertListing(Double lat, Double lon, String status,
                               boolean isDuplicate, boolean isValid) {
        // The listing_status enum requires a literal cast in the SQL — JDBC cannot bind a
        // String parameter to a PostgreSQL enum column even with stringtype=unspecified.
        // Since the status values are a controlled, internal test-only enum set (SCRAPED/LIVE/DRAFT),
        // we embed the status directly in the SQL via String.format rather than as a bind parameter.
        // lat/lon/isDuplicate/isValid remain bound parameters.
        String sql = String.format("""
                INSERT INTO property_listings
                    (status, latitude, longitude, is_duplicate, is_valid)
                VALUES
                    ('%s', ?, ?, ?, ?)
                """, status);
        jdbc.update(sql, lat, lon, isDuplicate, isValid);
    }

    // ── Test #1: ordered by ascending distance ────────────────────────────────────────────────

    @Test
    @DisplayName("Test #1: findNearbySchools returns schools ordered by ascending distanceKm")
    void findNearbySchools_returnsResultsOrderedByAscendingDistance() {
        // Query from Manipal centre (13.3511, 74.7871), radius 20 km — should include
        // Manipal (~0 km), Udupi (~5.4 km), Brahmavar (~9.3 km); Kundapura (~31 km) excluded.
        List<SchoolRepository.NearbySchoolProjection> results =
                schoolRepository.findNearbySchools(13.3511, 74.7871, 20_000);

        // Filter to our fixture schools only (the V58 seed may contribute additional rows).
        List<SchoolRepository.NearbySchoolProjection> fixture = results.stream()
                .filter(s -> s.getName() != null && s.getName().startsWith("Test School "))
                .toList();

        assertThat(fixture)
                .as("should return exactly Manipal, Udupi, and Brahmavar within 20 km")
                .hasSizeGreaterThanOrEqualTo(3);

        // Verify ascending distance ordering across the fixture rows.
        List<Double> distances = fixture.stream()
                .map(SchoolRepository.NearbySchoolProjection::getDistanceKm)
                .toList();
        for (int i = 1; i < distances.size(); i++) {
            assertThat(distances.get(i))
                    .as("distanceKm at index %d (%.3f) must be >= index %d (%.3f)", i, distances.get(i), i - 1, distances.get(i - 1))
                    .isGreaterThanOrEqualTo(distances.get(i - 1));
        }

        // Sanity-check distance magnitudes against Haversine reference values (±0.3 km tolerance).
        SchoolRepository.NearbySchoolProjection manipal = fixture.stream()
                .filter(s -> "Test School Manipal".equals(s.getName())).findFirst().orElseThrow();
        SchoolRepository.NearbySchoolProjection udupi = fixture.stream()
                .filter(s -> "Test School Udupi".equals(s.getName())).findFirst().orElseThrow();
        SchoolRepository.NearbySchoolProjection brahmavar = fixture.stream()
                .filter(s -> "Test School Brahmavar".equals(s.getName())).findFirst().orElseThrow();

        assertThat(manipal.getDistanceKm())
                .as("Manipal school is at the query point — distanceKm must be < 0.01 km")
                .isLessThan(0.01);
        assertThat(udupi.getDistanceKm())
                .as("Udupi school geodesic ~5.0 km (PostGIS WGS84), Haversine ref ~5.4 km, tolerance ±0.5 km")
                .isBetween(4.7, 5.7);
        assertThat(brahmavar.getDistanceKm())
                .as("Brahmavar school Haversine reference ~9.3 km, tolerance ±0.3 km")
                .isBetween(9.0, 9.6);
    }

    // ── Test #2: tiny radius returns only the nearest school ─────────────────────────────────

    @Test
    @DisplayName("Test #2: 100 m radius around Manipal returns only the Manipal school")
    void findNearbySchools_tinyRadius_returnsOnlyNearestSchool() {
        // 100 m radius around Manipal centre. Only "Test School Manipal" is within 100 m;
        // Udupi school is ~5.4 km away.
        List<SchoolRepository.NearbySchoolProjection> results =
                schoolRepository.findNearbySchools(13.3511, 74.7871, 100);

        List<String> fixtureNames = results.stream()
                .map(SchoolRepository.NearbySchoolProjection::getName)
                .filter(n -> n != null && n.startsWith("Test School "))
                .toList();

        assertThat(fixtureNames)
                .as("Only Manipal school sits within 100 m of the Manipal query point")
                .containsExactly("Test School Manipal");
    }

    // ── Test #3: Kundapura (31 km away) excluded from 10 km radius ───────────────────────────

    @Test
    @DisplayName("Test #3: Kundapura school (~31 km) is excluded from a 10 km radius query")
    void findNearbySchools_kundapuraExcludedOutsideRadius() {
        List<SchoolRepository.NearbySchoolProjection> results =
                schoolRepository.findNearbySchools(13.3511, 74.7871, 10_000);

        List<String> fixtureNames = results.stream()
                .map(SchoolRepository.NearbySchoolProjection::getName)
                .filter(n -> n != null && n.startsWith("Test School "))
                .toList();

        assertThat(fixtureNames)
                .as("Kundapura (~31 km) must be excluded from 10 km radius")
                .doesNotContain("Test School Kundapura");
        assertThat(fixtureNames)
                .as("Manipal, Udupi, Brahmavar must all be within 10 km")
                .contains("Test School Manipal", "Test School Udupi", "Test School Brahmavar");
    }

    // ── Test #4: geog NOT NULL invariant ─────────────────────────────────────────────────────

    @Test
    @DisplayName("Test #4: schools.geog IS NOT NULL for all rows (V75 GENERATED ALWAYS assumption)")
    void schools_geogIsNeverNull() {
        // This locks in the assumption the fix depends on:
        // V75 declares geog GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)::geography) STORED
        // from NOT NULL lat/lon columns (V58), so the count of NULL geog rows must be zero.
        Integer nullGeogCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM schools WHERE geog IS NULL", Integer.class);

        assertThat(nullGeogCount)
                .as("schools.geog must never be NULL — V75 GENERATED ALWAYS STORED from NOT NULL lat/lon (V58)")
                .isEqualTo(0);
    }

    // ── countNearbyListings tests ─────────────────────────────────────────────────────────────

    /**
     * Scenario A (AC4): a school with no nearby property_listings returns count=0.
     * LEFT JOIN must ensure schools with zero matches are still included in the result.
     */
    @Test
    @DisplayName("Scenario A: school with 0 nearby listings returns count=0 (LEFT JOIN)")
    void countNearbyListings_noListings_returnsZero() {
        UUID manipalId = UUID.fromString(ID_MANIPAL);

        List<SchoolRepository.SchoolListingCountProjection> results =
                schoolRepository.countNearbyListings(Set.of(manipalId), 1000);

        Map<UUID, Integer> counts = results.stream().collect(
                Collectors.toMap(
                        SchoolRepository.SchoolListingCountProjection::getSchoolId,
                        SchoolRepository.SchoolListingCountProjection::getListingCount));

        assertThat(counts).containsKey(manipalId);
        assertThat(counts.get(manipalId))
                .as("School with no nearby listings must return count=0")
                .isEqualTo(0);
    }

    /**
     * Scenario B (AC2): one SCRAPED listing at 999 m from the school — must be counted.
     * Confirms the ST_DWithin 1 km threshold includes listings just under the boundary.
     */
    @Test
    @DisplayName("Scenario B: 1 SCRAPED listing at 999m is counted")
    void countNearbyListings_oneListingJustInside_returnsOne() {
        UUID manipalId = UUID.fromString(ID_MANIPAL);

        // Manipal school: lat=13.3511, lon=74.7871
        // Offset ~999 m north: lat += 0.009 ≈ 1 km but land within threshold
        insertListing(13.3511 + 0.0089, 74.7871, "SCRAPED", false, true);

        List<SchoolRepository.SchoolListingCountProjection> results =
                schoolRepository.countNearbyListings(Set.of(manipalId), 1000);

        Map<UUID, Integer> counts = results.stream().collect(
                Collectors.toMap(
                        SchoolRepository.SchoolListingCountProjection::getSchoolId,
                        SchoolRepository.SchoolListingCountProjection::getListingCount));

        assertThat(counts.get(manipalId))
                .as("One SCRAPED listing within 1 km must produce count=1")
                .isEqualTo(1);
    }

    /**
     * Scenario C (AC2): 3 SCRAPED/LIVE listings within 1 km + 1 DRAFT listing + 1 duplicate
     * + 1 invalid listing. Only the 3 qualifying listings must be counted.
     */
    @Test
    @DisplayName("Scenario C: DRAFT/duplicate/invalid listings not counted; SCRAPED+LIVE are")
    void countNearbyListings_mixedListings_countsOnlyQualifying() {
        UUID manipalId = UUID.fromString(ID_MANIPAL);

        // Manipal school at 13.3511, 74.7871 — insert all listings at same point (0m away)
        insertListing(13.3511, 74.7871, "SCRAPED", false, true);  // counted
        insertListing(13.3511, 74.7871, "LIVE",    false, true);  // counted
        insertListing(13.3511, 74.7871, "SCRAPED", false, true);  // counted (3rd)
        insertListing(13.3511, 74.7871, "DRAFT",   false, true);  // NOT counted (wrong status)
        insertListing(13.3511, 74.7871, "SCRAPED", true,  true);  // NOT counted (duplicate)
        insertListing(13.3511, 74.7871, "SCRAPED", false, false); // NOT counted (invalid)

        List<SchoolRepository.SchoolListingCountProjection> results =
                schoolRepository.countNearbyListings(Set.of(manipalId), 1000);

        Map<UUID, Integer> counts = results.stream().collect(
                Collectors.toMap(
                        SchoolRepository.SchoolListingCountProjection::getSchoolId,
                        SchoolRepository.SchoolListingCountProjection::getListingCount));

        assertThat(counts.get(manipalId))
                .as("Only SCRAPED/LIVE non-duplicate valid listings within 1 km must be counted")
                .isEqualTo(3);
    }

    // ── findByNameContainingIgnoreCaseAndCity — issue #1798 region-scoping regression ────────

    /**
     * Reproduces the reported bug: a "heb" search matches "Hebbal Public School" (Bengaluru
     * district, seeded by V71) and a same-substring "Hebri" school placed in the Udupi
     * district. The unscoped query returns both; the city-scoped query for "bangalore" must
     * return only the Bengaluru-district school.
     */
    @Test
    @DisplayName("#1798: findByNameContainingIgnoreCaseAndCity('heb','bangalore') excludes Udupi-district matches")
    void findByNameContainingIgnoreCaseAndCity_scopesToRequestedCity_excludesOtherCityMatches() {
        String bangaloreSchoolId = "10000000-0000-0000-0000-000000000010";
        String udupiSchoolId = "10000000-0000-0000-0000-000000000011";

        // V71 seeds area 'IN|KA|Bengaluru|Hebbal' with district='Bengaluru' under city slug 'bangalore',
        // and 'IN|KA|Udupi|Udupi' with district='Udupi' under city slug 'udupi'.
        insertSchoolWithDistrict(bangaloreSchoolId, "Hebbal Public School", 13.0451, 77.5977, "Bengaluru");
        insertSchoolWithDistrict(udupiSchoolId, "Hebri Government School", 13.3409, 74.7421, "Udupi");

        List<School> bangaloreResults =
                schoolRepository.findByNameContainingIgnoreCaseAndCity("heb", "bangalore", 10);
        List<String> bangaloreNames = bangaloreResults.stream().map(School::getName).toList();

        assertThat(bangaloreNames)
                .as("city='bangalore' scope must include the Bengaluru-district match")
                .contains("Hebbal Public School");
        assertThat(bangaloreNames)
                .as("city='bangalore' scope must exclude the Udupi-district match (issue #1798 regression)")
                .doesNotContain("Hebri Government School");

        List<School> udupiResults =
                schoolRepository.findByNameContainingIgnoreCaseAndCity("heb", "udupi", 10);
        List<String> udupiNames = udupiResults.stream().map(School::getName).toList();

        assertThat(udupiNames)
                .as("city='udupi' scope must include the Udupi-district match")
                .contains("Hebri Government School");
        assertThat(udupiNames)
                .as("city='udupi' scope must exclude the Bengaluru-district match")
                .doesNotContain("Hebbal Public School");
    }

    /**
     * Confirms the pre-existing unscoped path ({@code findByNameContainingIgnoreCase}, used
     * when the caller supplies no city) still returns matches across all districts —
     * i.e. backward compatibility is preserved for callers that omit the scope.
     */
    @Test
    @DisplayName("#1798: unscoped findByNameContainingIgnoreCase still matches across all districts")
    void findByNameContainingIgnoreCase_unscoped_stillMatchesAcrossDistricts() {
        String bangaloreSchoolId = "10000000-0000-0000-0000-000000000012";
        String udupiSchoolId = "10000000-0000-0000-0000-000000000013";

        insertSchoolWithDistrict(bangaloreSchoolId, "Hebbal Cross School", 13.0451, 77.5977, "Bengaluru");
        insertSchoolWithDistrict(udupiSchoolId, "Hebri Cross School", 13.3409, 74.7421, "Udupi");

        List<School> results = schoolRepository.findByNameContainingIgnoreCase(
                "Cross School", org.springframework.data.domain.PageRequest.of(0, 10));
        List<String> names = results.stream().map(School::getName).toList();

        assertThat(names)
                .as("unscoped search (no city param) must preserve today's cross-district behaviour")
                .contains("Hebbal Cross School", "Hebri Cross School");
    }

    // ── findByNameContainingIgnoreCaseAndCityAndAreaKeys — issue #1812 group-scoped search ──

    /**
     * AC2 / RISK1 (the core trap): seeds 11 city matches (limit=10) where the in-scope school
     * would rank 11th (last) by name ASC alone — past the limit. The scoped query must rank
     * in-scope FIRST, then apply LIMIT, so the deep-ranked in-scope school still survives and
     * a normally-in-range out-of-scope school (rank 10, "Zone1 School J") is bumped out instead.
     */
    @Test
    @DisplayName("#1812 AC2: in-scope school ranked deep city-wide survives the limit (in-scope-first, then LIMIT)")
    void findByNameContainingIgnoreCaseAndCityAndAreaKeys_inScopeRankedDeep_survivesLimit() {
        // Real V71-seeded Bengaluru area_keys — schools.area_key has an FK to areas.area_key, so
        // fabricated values would fail the direct UPDATE in insertSchoolWithDistrictAndAreaKey.
        // Every fixture's area_key is pinned explicitly (not left to the V80 trigger's
        // nearest-area auto-assignment) so exactly one school ("K") is in-scope — otherwise the
        // trigger could coincidentally assign "Hebbal" to another fixture by real geography and
        // contaminate the single-in-scope assumption this test relies on.
        String groupAreaKey = "IN|KA|Bengaluru|Hebbal";
        String otherAreaKey = "IN|KA|Bengaluru|Koramangala";
        String[] suffixes = {"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"};
        for (int i = 0; i < suffixes.length; i++) {
            String id = String.format("10000000-0000-0000-0000-0000000020%02d", i);
            String areaKey = suffixes[i].equals("K") ? groupAreaKey : otherAreaKey;
            insertSchoolWithDistrictAndAreaKey(
                    id, "Zone1 School " + suffixes[i], 13.0 + i * 0.01, 77.5, "Bengaluru", areaKey);
        }

        List<SchoolRepository.ScopedSchoolProjection> results =
                schoolRepository.findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                        "Zone1 School", "bangalore", List.of(groupAreaKey), 10);

        assertThat(results).hasSize(10);
        assertThat(results.get(0).getName())
                .as("the in-scope school (rank-11 by name alone) must be ranked FIRST")
                .isEqualTo("Zone1 School K");
        assertThat(results.get(0).getInScope()).isTrue();

        List<String> names = results.stream().map(SchoolRepository.ScopedSchoolProjection::getName).toList();
        assertThat(names)
                .as("in-scope 'K' displaces the next-lowest-ranked out-of-scope school ('J') from the limit")
                .doesNotContain("Zone1 School J");
        assertThat(names)
                .as("the other 9 out-of-scope matches (A-I) still fill the remaining slots")
                .contains("Zone1 School A", "Zone1 School B", "Zone1 School C", "Zone1 School D",
                        "Zone1 School E", "Zone1 School F", "Zone1 School G", "Zone1 School H", "Zone1 School I");
    }

    /**
     * AC4 / RISK3: strict city boundary is preserved regardless of areaKeys — an out-of-city
     * school matching the name substring must never appear, even if its area_key were
     * (impossibly) passed in areaKeys. Proves the new query reuses the district-IN-(areas of
     * city) JOIN unchanged.
     */
    @Test
    @DisplayName("#1812 AC4: out-of-city school never appears even when its area_key is passed in areaKeys")
    void findByNameContainingIgnoreCaseAndCityAndAreaKeys_crossCityLeakage_neverOccurs() {
        // Real V71-seeded Udupi area_key (also used by SchoolAreaKeyTriggerTest) — required by
        // the schools.area_key FK constraint.
        String udupiAreaKey = "IN|KA|Udupi|Manipal";
        insertSchoolWithDistrictAndAreaKey(
                "10000000-0000-0000-0000-000000003001", "CrossCity Match School",
                13.3409, 74.7421, "Udupi", udupiAreaKey);

        List<SchoolRepository.ScopedSchoolProjection> results =
                schoolRepository.findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                        "CrossCity Match", "bangalore", List.of(udupiAreaKey), 10);

        assertThat(results)
                .as("Udupi-district school must never leak into a Bangalore-scoped search, "
                        + "even when its own area_key is (impossibly) supplied as an areaKeys member")
                .isEmpty();
    }

    /**
     * Edge case: a school with a NULL area_key must be ranked out-of-scope (in_scope=false),
     * never true and never NULL — SQL {@code NULL IN (...)} evaluates to NULL, not TRUE, and the
     * CASE expression's ELSE branch converts that to false.
     */
    @Test
    @DisplayName("#1812: school with NULL area_key is ranked out-of-scope (in_scope=false)")
    void findByNameContainingIgnoreCaseAndCityAndAreaKeys_nullAreaKey_isOutOfScope() {
        String id = "10000000-0000-0000-0000-000000004001";
        // The V80 trigger auto-assigns a real nearest-area area_key on INSERT (see
        // SchoolAreaKeyTriggerTest AC1), so a genuinely NULL area_key must be forced via a
        // standalone UPDATE — which the trigger's lat/lon/district-scoped OF clause does not
        // recompute (AC3) — rather than relying on the insert leaving it unset.
        insertSchoolWithDistrict(id, "NullAreaKey Match School", 13.0, 77.5, "Bengaluru");
        jdbc.update("UPDATE schools SET area_key = NULL WHERE id = ?::uuid", id);

        List<SchoolRepository.ScopedSchoolProjection> results =
                schoolRepository.findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                        "NullAreaKey Match", "bangalore", List.of("IN|KA|Bengaluru|SomeOtherGroup"), 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).getInScope())
                .as("a school with a NULL area_key must never be in_scope=true")
                .isFalse();
    }
}
