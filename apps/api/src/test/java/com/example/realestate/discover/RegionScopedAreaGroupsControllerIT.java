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
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test for
 * {@code GET /api/discover/cities/{citySlug}/regions/{regionKey}/groups} (#1910 PR1) —
 * {@link AreaGroupsService#getRegionScopedGroupsByCity} via {@link RegionSummaryController}.
 *
 * <p>Exercises the controller method directly against a real Postgres/PostGIS database — the
 * same "least context that proves the contract" approach as {@code RegionSummaryControllerIT}.
 * {@link RegionScopedAreaGroupsSecurityIT} separately proves the HTTP-layer {@code permitAll}
 * wiring and matcher isolation.
 *
 * <p>All fixtures here are hand-inserted directly (not via the real onboarding pipeline) under a
 * fully synthetic region_key namespace ({@code IT1910_*}) that the real backfill/onboarding path
 * never touches — this isolates every assertion from Udupi's real seeded area_groups/regions
 * without needing to delete/restore them.
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
class RegionScopedAreaGroupsControllerIT {

    private static final String CITY_SLUG = "udupi";
    private static final String AREA_PREFIX = "IT1910|";
    private static final String REGION_PREFIX = "IT1910_REGION_";
    private static final String GROUP_PREFIX = "it1910-";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private RegionSummaryController controller;
    private AreaGroupsService areaGroupsService;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        RegionSummaryService regionSummaryService = new RegionSummaryService(jdbcTemplate);
        areaGroupsService = new AreaGroupsService(jdbcTemplate);
        controller = new RegionSummaryController(regionSummaryService, areaGroupsService);

        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);

        // Defensive reset in FK-safe order — @DataJpaTest's rollback does not reliably cover
        // JdbcTemplate writes across test runs in this codebase's convention (see
        // AreaGroupsRegionKeyIT), so tear down explicitly before every test.
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE ?", AREA_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM area_groups WHERE city_id = ? AND slug LIKE ?", udupiCityId, GROUP_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ? AND area_key LIKE ?", udupiCityId, AREA_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ? AND region_key LIKE ?", udupiCityId, REGION_PREFIX + "%");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE ?", AREA_PREFIX + "%");
    }

    // ── fixture helpers ────────────────────────────────────────────────────────

    private void insertArea(String areaKey, Double minLat, Double minLon, Double maxLat, Double maxLon) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, 13.35, 74.79, ?, ?, ?, ?)",
                areaKey, udupiCityId, areaKey, minLat, minLon, maxLat, maxLon);
    }

    private void insertRegion(String regionKey, int displayOrder) {
        jdbcTemplate.update(
                "INSERT INTO city_regions (city_id, region_key, display_label, display_order, "
                        + "centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon, policy_fingerprint, generated_at) "
                        + "VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'it1910-fingerprint', now())",
                udupiCityId, regionKey, regionKey, displayOrder);
    }

    private void insertMembership(String areaKey, String regionKey) {
        jdbcTemplate.update(
                "INSERT INTO city_region_memberships (city_id, area_key, region_key, assignment_source, generated_at) "
                        + "VALUES (?, ?, ?, 'AUTO', now())",
                udupiCityId, areaKey, regionKey);
    }

    private int insertAreaGroup(String slugSuffix, int displayOrder) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO area_groups (city_id, slug, name, display_order, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, udupiCityId, GROUP_PREFIX + slugSuffix, "IT1910 " + slugSuffix, displayOrder);
    }

    private void insertGroupMember(int groupId, String areaKey, int displayOrder) {
        jdbcTemplate.update(
                "INSERT INTO area_group_members (area_group_id, area_key, display_order) VALUES (?, ?, ?)",
                groupId, areaKey, displayOrder);
    }

    private void insertListing(String areaKey, String listingPurpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, listingPurpose, now, now);
    }

    private void insertListing(String areaKey) {
        insertListing(areaKey, "sale");
    }

    private RegionScopedAreaGroup fetchGroup(RegionScopedAreaGroup.Response response, String slugSuffix) {
        return response.groups().stream()
                .filter(g -> g.groupSlug().equals(GROUP_PREFIX + slugSuffix))
                .findFirst()
                .orElseThrow(() -> new AssertionError("group not found: " + slugSuffix));
    }

    // ── AC1/2/3/9: partition, no duplicates, no cross-region leakage, zero-member exclusion ────

    @Test
    @DisplayName("region-scoped areaKeys are a strict subset per region; their union across all "
            + "regions a group appears under equals the full unscoped member list minus members "
            + "with no city_region_memberships row; no duplicates; no cross-region leakage")
    void regionScopedSubset_partitionsFullMemberList_noDuplicates_noLeakage() {
        String regionA = REGION_PREFIX + "A";
        String regionB = REGION_PREFIX + "B";
        insertRegion(regionA, 0);
        insertRegion(regionB, 1);

        String a1 = AREA_PREFIX + "a1";
        String a2 = AREA_PREFIX + "a2";
        String a3 = AREA_PREFIX + "a3-unclassified";
        insertArea(a1, 13.30, 74.70, 13.31, 74.71);
        insertArea(a2, 13.32, 74.72, 13.33, 74.73);
        insertArea(a3, 13.34, 74.74, 13.35, 74.75);
        insertMembership(a1, regionA);
        insertMembership(a2, regionB);
        // a3 intentionally gets NO city_region_memberships row.

        int groupId = insertAreaGroup("partition", 0);
        insertGroupMember(groupId, a1, 0);
        insertGroupMember(groupId, a2, 1);
        insertGroupMember(groupId, a3, 2);

        AreaGroupsResponse fullResponse = areaGroupsService.getGroupsByCity(CITY_SLUG);
        AreaGroupResponse fullGroup = fullResponse.groups().stream()
                .filter(g -> g.slug().equals(GROUP_PREFIX + "partition"))
                .findFirst()
                .orElseThrow();
        assertThat(fullGroup.areaKeys()).containsExactlyInAnyOrder(a1, a2, a3);

        RegionScopedAreaGroup.Response regionAResponse = controller.getRegionScopedGroups(CITY_SLUG, regionA, null);
        RegionScopedAreaGroup.Response regionBResponse = controller.getRegionScopedGroups(CITY_SLUG, regionB, null);

        RegionScopedAreaGroup groupInA = fetchGroup(regionAResponse, "partition");
        RegionScopedAreaGroup groupInB = fetchGroup(regionBResponse, "partition");

        assertThat(groupInA.areaKeys()).as("region A projection is a strict subset").containsExactly(a1);
        assertThat(groupInB.areaKeys()).as("region B projection is a strict subset").containsExactly(a2);
        assertThat(groupInA.areaKeys()).as("no cross-region leakage into A").doesNotContain(a2, a3);
        assertThat(groupInB.areaKeys()).as("no cross-region leakage into B").doesNotContain(a1, a3);

        Set<String> union = new HashSet<>(groupInA.areaKeys());
        union.addAll(groupInB.areaKeys());
        assertThat(union).as("union across all regions the group appears under equals the full "
                        + "member list MINUS the unclassified member a3")
                .isEqualTo(Set.of(a1, a2));

        assertThat(groupInA.areaKeys()).as("no duplicate area_keys within one projection")
                .doesNotHaveDuplicates();
        assertThat(groupInB.areaKeys()).doesNotHaveDuplicates();
    }

    // ── AC9 (explicit): a group with zero members in the requested region never appears ────────

    @Test
    @DisplayName("a group whose members are all classified into a DIFFERENT region never appears "
            + "in this region's response — not even with an empty areaKeys list")
    void groupWithZeroMembersInRegion_isExcludedEntirely() {
        String regionA = REGION_PREFIX + "ZERO_A";
        String regionB = REGION_PREFIX + "ZERO_B";
        insertRegion(regionA, 0);
        insertRegion(regionB, 1);

        String areaInB = AREA_PREFIX + "zero-b1";
        insertArea(areaInB, 13.30, 74.70, 13.31, 74.71);
        insertMembership(areaInB, regionB);

        int groupId = insertAreaGroup("zero-member", 0);
        insertGroupMember(groupId, areaInB, 0);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, regionA, null);

        assertThat(response.groups().stream().map(RegionScopedAreaGroup::groupSlug))
                .as("group with zero region-A members must be absent entirely, not present with empty areaKeys")
                .doesNotContain(GROUP_PREFIX + "zero-member");
    }

    // ── AC4 (explicit worked scenario): DISTINCT listing-count reconciliation, shared area ─────

    @Test
    @DisplayName("worked scenario: Group A=[areaX,areaY], Group B=[areaX,areaZ] (areaX shared); "
            + "areaX=5, areaY=3, areaZ=2 distinct listings => Group A.listingCount=8, "
            + "Group B.listingCount=7 (each independently reconciled, NOT the union total of 10)")
    void distinctListingCount_reconciles_perGroup_withSharedArea() {
        String region = REGION_PREFIX + "COUNT";
        insertRegion(region, 0);

        String areaX = AREA_PREFIX + "areaX";
        String areaY = AREA_PREFIX + "areaY";
        String areaZ = AREA_PREFIX + "areaZ";
        insertArea(areaX, 13.30, 74.70, 13.31, 74.71);
        insertArea(areaY, 13.32, 74.72, 13.33, 74.73);
        insertArea(areaZ, 13.34, 74.74, 13.35, 74.75);
        insertMembership(areaX, region);
        insertMembership(areaY, region);
        insertMembership(areaZ, region);

        for (int i = 0; i < 5; i++) insertListing(areaX);
        for (int i = 0; i < 3; i++) insertListing(areaY);
        for (int i = 0; i < 2; i++) insertListing(areaZ);

        int groupAId = insertAreaGroup("count-a", 0);
        insertGroupMember(groupAId, areaX, 0);
        insertGroupMember(groupAId, areaY, 1);

        int groupBId = insertAreaGroup("count-b", 1);
        insertGroupMember(groupBId, areaX, 0);
        insertGroupMember(groupBId, areaZ, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup groupA = fetchGroup(response, "count-a");
        RegionScopedAreaGroup groupB = fetchGroup(response, "count-b");

        assertThat(groupA.listingCount()).isEqualTo(8L);
        assertThat(groupB.listingCount()).isEqualTo(7L);

        Long groupAOracle = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT id) FROM property_listings WHERE area_key IN (?, ?) "
                        + "AND status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false",
                Long.class, areaX, areaY);
        Long groupBOracle = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT id) FROM property_listings WHERE area_key IN (?, ?) "
                        + "AND status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false",
                Long.class, areaX, areaZ);
        assertThat(groupA.listingCount()).isEqualTo(groupAOracle);
        assertThat(groupB.listingCount()).isEqualTo(groupBOracle);

        // The naive cross-group sum (15) double-counts areaX's 5 listings once — it is NOT the
        // true union total (10) and must NOT be asserted as the reconciliation target, since each
        // group legitimately double-includes areaX's listings by design (V77: area_group_members
        // only guarantees UNIQUE(area_group_id, area_key), not exclusivity across groups).
        Long unionOracle = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT id) FROM property_listings WHERE area_key IN (?, ?, ?) "
                        + "AND status = 'LIVE' AND archived_at IS NULL AND is_duplicate = false",
                Long.class, areaX, areaY, areaZ);
        assertThat(unionOracle).isEqualTo(10L);
        long naiveSum = groupA.listingCount() + groupB.listingCount();
        assertThat(naiveSum).as("naive per-group sum double-counts the shared area's listings; "
                        + "it must NOT equal the true union count")
                .isEqualTo(15L)
                .isNotEqualTo(unionOracle);
    }

    // ── AC3 (boundsStatus tri-state): COMPLETE ──────────────────────────────────

    @Test
    @DisplayName("boundsStatus COMPLETE: every subset member has a full bbox; bounds/centroid are "
            + "the exact union/midpoint of the valid subset")
    void boundsStatus_complete_whenAllMembersHaveFullBbox() {
        String region = REGION_PREFIX + "BC";
        insertRegion(region, 0);

        String a1 = AREA_PREFIX + "bc-a1";
        String a2 = AREA_PREFIX + "bc-a2";
        insertArea(a1, 13.00, 74.00, 13.10, 74.10);
        insertArea(a2, 13.20, 74.20, 13.30, 74.30);
        insertMembership(a1, region);
        insertMembership(a2, region);

        int groupId = insertAreaGroup("bounds-complete", 0);
        insertGroupMember(groupId, a1, 0);
        insertGroupMember(groupId, a2, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-complete");

        assertThat(group.boundsStatus()).isEqualTo("COMPLETE");
        assertThat(group.minLat()).isEqualTo(13.00);
        assertThat(group.maxLat()).isEqualTo(13.30);
        assertThat(group.minLon()).isEqualTo(74.00);
        assertThat(group.maxLon()).isEqualTo(74.30);
        assertThat(group.focusLat()).isEqualTo((13.00 + 13.30) / 2.0);
        assertThat(group.focusLon()).isEqualTo((74.00 + 74.30) / 2.0);
    }

    // ── AC3: APPROXIMATE ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("boundsStatus APPROXIMATE: one of two members lacks a complete bbox; bounds are "
            + "computed from ONLY the valid member (never falling back to the invalid member's "
            + "centroid, unlike RegionSummaryService's region-level bounds)")
    void boundsStatus_approximate_computedFromValidSubsetOnly() {
        String region = REGION_PREFIX + "BA";
        insertRegion(region, 0);

        String valid = AREA_PREFIX + "ba-valid";
        String invalid = AREA_PREFIX + "ba-invalid";
        insertArea(valid, 13.00, 74.00, 13.10, 74.10);
        insertArea(invalid, null, 74.20, 13.30, 74.30); // min_lat missing => incomplete bbox
        insertMembership(valid, region);
        insertMembership(invalid, region);

        int groupId = insertAreaGroup("bounds-approx", 0);
        insertGroupMember(groupId, valid, 0);
        insertGroupMember(groupId, invalid, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-approx");

        assertThat(group.boundsStatus()).isEqualTo("APPROXIMATE");
        assertThat(group.minLat()).isEqualTo(13.00);
        assertThat(group.maxLat()).isEqualTo(13.10);
        assertThat(group.minLon()).isEqualTo(74.00);
        assertThat(group.maxLon()).isEqualTo(74.10);
    }

    // ── AC3: UNAVAILABLE ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("boundsStatus UNAVAILABLE: zero subset members have a complete bbox => ALL SIX "
            + "coordinate fields are null, never a fabricated (0,0) or degenerate point")
    void boundsStatus_unavailable_allSixFieldsNull() {
        String region = REGION_PREFIX + "BU";
        insertRegion(region, 0);

        String noBbox1 = AREA_PREFIX + "bu-1";
        String noBbox2 = AREA_PREFIX + "bu-2";
        insertArea(noBbox1, null, null, null, null);
        insertArea(noBbox2, 13.00, null, null, 74.30);
        insertMembership(noBbox1, region);
        insertMembership(noBbox2, region);

        int groupId = insertAreaGroup("bounds-unavailable", 0);
        insertGroupMember(groupId, noBbox1, 0);
        insertGroupMember(groupId, noBbox2, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-unavailable");

        assertThat(group.boundsStatus()).isEqualTo("UNAVAILABLE");
        assertThat(group.minLat()).isNull();
        assertThat(group.minLon()).isNull();
        assertThat(group.maxLat()).isNull();
        assertThat(group.maxLon()).isNull();
        assertThat(group.focusLat()).isNull();
        assertThat(group.focusLon()).isNull();
    }

    // ── AC3 (#1910 PR1 review finding): corrupt/malformed bbox data must never yield COMPLETE ──
    // hasCompleteValidBbox (CityRegionProjection) was null-completeness-only; it now also rejects
    // non-finite, out-of-geographic-range, and degenerate/swapped coordinates. Each test below
    // pairs one corrupt member with one genuinely valid member so a false "all members valid"
    // COMPLETE would be the (wrong) naive result — the correct result is APPROXIMATE, computed
    // from the valid member alone.

    @Test
    @DisplayName("boundsStatus never COMPLETE when a member has swapped/corrupt coordinates "
            + "(minLat > maxLat) — degrades to APPROXIMATE, bounds computed from the valid member only")
    void boundsStatus_degradesToApproximate_whenMemberHasSwappedLatCoordinates() {
        String region = REGION_PREFIX + "CORRUPT_SWAP";
        insertRegion(region, 0);

        String valid = AREA_PREFIX + "corrupt-swap-valid";
        String swapped = AREA_PREFIX + "corrupt-swap-bad";
        insertArea(valid, 13.00, 74.00, 13.10, 74.10);
        // minLat (13.50) > maxLat (13.20): a bad seed row with lat/lon swapped.
        insertArea(swapped, 13.50, 74.20, 13.20, 74.30);
        insertMembership(valid, region);
        insertMembership(swapped, region);

        int groupId = insertAreaGroup("bounds-corrupt-swap", 0);
        insertGroupMember(groupId, valid, 0);
        insertGroupMember(groupId, swapped, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-corrupt-swap");

        assertThat(group.boundsStatus())
                .as("a swapped-coordinate member must never allow the group to be reported COMPLETE")
                .isEqualTo("APPROXIMATE");
        assertThat(group.minLat()).isEqualTo(13.00);
        assertThat(group.maxLat()).isEqualTo(13.10);
        assertThat(group.minLon()).isEqualTo(74.00);
        assertThat(group.maxLon()).isEqualTo(74.10);
    }

    @Test
    @DisplayName("boundsStatus never COMPLETE when a member has an out-of-range coordinate "
            + "(lat=95) — degrades to APPROXIMATE, bounds computed from the valid member only")
    void boundsStatus_degradesToApproximate_whenMemberHasOutOfRangeCoordinate() {
        String region = REGION_PREFIX + "CORRUPT_RANGE";
        insertRegion(region, 0);

        String valid = AREA_PREFIX + "corrupt-range-valid";
        String outOfRange = AREA_PREFIX + "corrupt-range-bad";
        insertArea(valid, 13.00, 74.00, 13.10, 74.10);
        // lat=95 / 96 are outside the valid [-90, 90] geographic range.
        insertArea(outOfRange, 95.0, 74.20, 96.0, 74.30);
        insertMembership(valid, region);
        insertMembership(outOfRange, region);

        int groupId = insertAreaGroup("bounds-corrupt-range", 0);
        insertGroupMember(groupId, valid, 0);
        insertGroupMember(groupId, outOfRange, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-corrupt-range");

        assertThat(group.boundsStatus())
                .as("an out-of-geographic-range member must never allow the group to be reported COMPLETE")
                .isEqualTo("APPROXIMATE");
        assertThat(group.minLat()).isEqualTo(13.00);
        assertThat(group.maxLat()).isEqualTo(13.10);
        assertThat(group.minLon()).isEqualTo(74.00);
        assertThat(group.maxLon()).isEqualTo(74.10);
    }

    @Test
    @DisplayName("boundsStatus never COMPLETE when a member has a degenerate zero-area bbox "
            + "(minLat == maxLat) — degrades to APPROXIMATE, bounds computed from the valid member only")
    void boundsStatus_degradesToApproximate_whenMemberHasDegenerateZeroAreaBbox() {
        String region = REGION_PREFIX + "CORRUPT_DEGEN";
        insertRegion(region, 0);

        String valid = AREA_PREFIX + "corrupt-degen-valid";
        String degenerate = AREA_PREFIX + "corrupt-degen-bad";
        insertArea(valid, 13.00, 74.00, 13.10, 74.10);
        // minLat == maxLat: a zero-area (degenerate) box.
        insertArea(degenerate, 13.20, 74.20, 13.20, 74.30);
        insertMembership(valid, region);
        insertMembership(degenerate, region);

        int groupId = insertAreaGroup("bounds-corrupt-degen", 0);
        insertGroupMember(groupId, valid, 0);
        insertGroupMember(groupId, degenerate, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-corrupt-degen");

        assertThat(group.boundsStatus())
                .as("a degenerate zero-area member must never allow the group to be reported COMPLETE")
                .isEqualTo("APPROXIMATE");
        assertThat(group.minLat()).isEqualTo(13.00);
        assertThat(group.maxLat()).isEqualTo(13.10);
        assertThat(group.minLon()).isEqualTo(74.00);
        assertThat(group.maxLon()).isEqualTo(74.10);
    }

    @Test
    @DisplayName("boundsStatus UNAVAILABLE (not COMPLETE) when EVERY member has corrupt/degenerate "
            + "coordinates — zero valid geometry means no fabricated bounds are ever returned")
    void boundsStatus_unavailable_whenAllMembersHaveCorruptCoordinates() {
        String region = REGION_PREFIX + "CORRUPT_ALL";
        insertRegion(region, 0);

        String swapped = AREA_PREFIX + "corrupt-all-swap";
        String degenerate = AREA_PREFIX + "corrupt-all-degen";
        insertArea(swapped, 13.50, 74.00, 13.20, 74.10); // minLat > maxLat
        insertArea(degenerate, 13.00, 74.20, 13.00, 74.30); // minLat == maxLat
        insertMembership(swapped, region);
        insertMembership(degenerate, region);

        int groupId = insertAreaGroup("bounds-corrupt-all", 0);
        insertGroupMember(groupId, swapped, 0);
        insertGroupMember(groupId, degenerate, 1);

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup group = fetchGroup(response, "bounds-corrupt-all");

        assertThat(group.boundsStatus()).isEqualTo("UNAVAILABLE");
        assertThat(group.minLat()).isNull();
        assertThat(group.maxLat()).isNull();
        assertThat(group.minLon()).isNull();
        assertThat(group.maxLon()).isNull();
        assertThat(group.focusLat()).isNull();
        assertThat(group.focusLon()).isNull();
    }

    // ── AC8: deterministic ordering ───────────────────────────────────────────────

    @Test
    @DisplayName("repeat the same request twice: group order and areaKey order within each group "
            + "are byte-identical both times")
    void ordering_isDeterministic_acrossRepeatedRequests() {
        String region = REGION_PREFIX + "ORDER";
        insertRegion(region, 0);

        String a1 = AREA_PREFIX + "ord-1";
        String a2 = AREA_PREFIX + "ord-2";
        String a3 = AREA_PREFIX + "ord-3";
        insertArea(a1, 13.00, 74.00, 13.10, 74.10);
        insertArea(a2, 13.20, 74.20, 13.30, 74.30);
        insertArea(a3, 13.40, 74.40, 13.50, 74.50);
        insertMembership(a1, region);
        insertMembership(a2, region);
        insertMembership(a3, region);

        int groupZId = insertAreaGroup("order-z", 1);
        insertGroupMember(groupZId, a3, 0);
        insertGroupMember(groupZId, a1, 1);
        insertGroupMember(groupZId, a2, 2);

        int groupAId = insertAreaGroup("order-a", 0);
        insertGroupMember(groupAId, a2, 0);
        insertGroupMember(groupAId, a1, 1);

        RegionScopedAreaGroup.Response first = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup.Response second = controller.getRegionScopedGroups(CITY_SLUG, region, null);

        assertThat(first).isEqualTo(second);

        List<String> groupOrder = first.groups().stream().map(RegionScopedAreaGroup::groupSlug).toList();
        assertThat(groupOrder).containsExactly(GROUP_PREFIX + "order-a", GROUP_PREFIX + "order-z");

        RegionScopedAreaGroup groupZ = fetchGroup(first, "order-z");
        assertThat(groupZ.areaKeys()).containsExactly(a3, a1, a2);
    }

    // ── AC8 (PR #1912 review finding): tie-break when display_order columns are NOT unique ────
    // The test above (ordering_isDeterministic_acrossRepeatedRequests) only exercises distinct
    // display_order values, so it cannot detect a missing tie-breaker. This test forces two
    // groups to share ag.display_order, and two members within one group to share
    // agm.display_order, so the assertions below only pass when REGION_SCOPED_GROUPS_SQL's
    // ORDER BY falls through to ag.slug / agm.area_key ASC — without those tie-breakers, Postgres
    // is expected (in practice, for these freshly-inserted unindexed rows) to return insertion
    // order instead, which is the reverse of what is asserted here.

    @Test
    @DisplayName("AC8 tie-break: groups tying on ag.display_order are ordered by ag.slug ASC; "
            + "members tying on agm.display_order within a group are ordered by agm.area_key ASC")
    void ordering_isDeterministic_whenDisplayOrdersTie_tieBrokenBySlugAndAreaKey() {
        String region = REGION_PREFIX + "TIE";
        insertRegion(region, 0);

        String aHigh = AREA_PREFIX + "tie-zzz";
        String aLow = AREA_PREFIX + "tie-aaa";
        insertArea(aHigh, 13.00, 74.00, 13.10, 74.10);
        insertArea(aLow, 13.20, 74.20, 13.30, 74.30);
        insertMembership(aHigh, region);
        insertMembership(aLow, region);

        // Two groups tie on display_order=0; inserted in slug-descending order (tie-b before
        // tie-a) so insertion order and expected (slug-ascending) order disagree.
        int groupBId = insertAreaGroup("tie-b", 0);
        insertGroupMember(groupBId, aHigh, 0);
        insertGroupMember(groupBId, aLow, 0); // both members also tie on display_order=0

        int groupAId = insertAreaGroup("tie-a", 0);
        insertGroupMember(groupAId, aHigh, 0);

        RegionScopedAreaGroup.Response first = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup.Response second = controller.getRegionScopedGroups(CITY_SLUG, region, null);

        assertThat(first).isEqualTo(second);

        List<String> groupOrder = first.groups().stream().map(RegionScopedAreaGroup::groupSlug).toList();
        assertThat(groupOrder)
                .as("groups tying on display_order=0 are tie-broken by ag.slug ascending, not insertion order")
                .containsExactly(GROUP_PREFIX + "tie-a", GROUP_PREFIX + "tie-b");

        RegionScopedAreaGroup groupB = fetchGroup(first, "tie-b");
        assertThat(groupB.areaKeys())
                .as("members tying on display_order=0 within a group are tie-broken by agm.area_key "
                        + "ascending, not insertion order")
                .containsExactly(aLow, aHigh);
    }

    // ── AC8 (PR #1912 remaining review finding): group-level tie-break is independent of, and
    // unaffected by, member-level display_order values ─────────────────────────────────────
    // The two tests above either tie member display_order too (…tieBrokenBySlugAndAreaKey) or
    // use distinct-but-untested-for-independence group display_orders (…acrossRepeatedRequests).
    // Neither proves that ag.slug — now the SECOND sort key, ahead of agm.display_order — cannot
    // be accidentally coupled to a group's member ordering. This test ties two groups on
    // ag.display_order while giving each group members with genuinely DISTINCT (non-tied)
    // agm.display_order values chosen to disagree with area_key alphabetical order, so it would
    // catch both: (a) a regression to member-order-before-slug, and (b) a bug where a group's
    // slug tie-break gets applied per-member instead of per-group.

    @Test
    @DisplayName("AC8: groups tying on ag.display_order are ordered by ag.slug regardless of their "
            + "members' display_order values; each group's own members still follow agm.display_order "
            + "(not agm.area_key, since member display_orders here are NOT tied)")
    void ordering_isDeterministic_groupsTieOnDisplayOrder_membersHaveDistinctDisplayOrder() {
        String region = REGION_PREFIX + "TIE2";
        insertRegion(region, 0);

        // Group A's members: area_key alphabetical order (alpha < yankee) is the OPPOSITE of
        // display_order order (yankee=1 before alpha=5) — proves member ordering follows
        // agm.display_order, not agm.area_key or insertion order.
        String gAAlpha = AREA_PREFIX + "tie2a-alpha";
        String gAYankee = AREA_PREFIX + "tie2a-yankee";
        insertArea(gAAlpha, 13.00, 74.00, 13.01, 74.01);
        insertArea(gAYankee, 13.02, 74.02, 13.03, 74.03);
        insertMembership(gAAlpha, region);
        insertMembership(gAYankee, region);

        // Group B's members: same inverted-alphabetical-vs-display_order setup, with different
        // display_order values than group A's members, to prove the two groups' member orderings
        // are independently derived (not coupled to each other or to group-level display_order).
        String gBBravo = AREA_PREFIX + "tie2b-bravo";
        String gBCharlie = AREA_PREFIX + "tie2b-charlie";
        insertArea(gBBravo, 13.04, 74.04, 13.05, 74.05);
        insertArea(gBCharlie, 13.06, 74.06, 13.07, 74.07);
        insertMembership(gBBravo, region);
        insertMembership(gBCharlie, region);

        // Both groups tie on display_order=0; inserted slug-descending (tie2-b before tie2-a) so
        // insertion order and expected (slug-ascending) order disagree.
        int groupBId = insertAreaGroup("tie2-b", 0);
        insertGroupMember(groupBId, gBBravo, 3);
        insertGroupMember(groupBId, gBCharlie, 2);

        int groupAId = insertAreaGroup("tie2-a", 0);
        insertGroupMember(groupAId, gAAlpha, 5);
        insertGroupMember(groupAId, gAYankee, 1);

        RegionScopedAreaGroup.Response first = controller.getRegionScopedGroups(CITY_SLUG, region, null);
        RegionScopedAreaGroup.Response second = controller.getRegionScopedGroups(CITY_SLUG, region, null);

        assertThat(first).isEqualTo(second);

        List<String> groupOrder = first.groups().stream().map(RegionScopedAreaGroup::groupSlug).toList();
        assertThat(groupOrder)
                .as("groups tying on display_order=0 are tie-broken by ag.slug ascending, "
                        + "regardless of what display_order values their own members carry")
                .containsExactly(GROUP_PREFIX + "tie2-a", GROUP_PREFIX + "tie2-b");

        RegionScopedAreaGroup groupA = fetchGroup(first, "tie2-a");
        assertThat(groupA.areaKeys())
                .as("group A's members follow agm.display_order ascending (yankee=1 before alpha=5), "
                        + "the opposite of area_key alphabetical order — proves display_order, not "
                        + "area_key, drives member ordering here")
                .containsExactly(gAYankee, gAAlpha);

        RegionScopedAreaGroup groupB = fetchGroup(first, "tie2-b");
        assertThat(groupB.areaKeys())
                .as("group B's members independently follow their own agm.display_order ascending "
                        + "(charlie=2 before bravo=3), unaffected by group A's member ordering or "
                        + "either group's ag.slug tie-break")
                .containsExactly(gBCharlie, gBBravo);
    }

    // ── AC10: unknown city / unknown region / region with no groups ────────────────

    @Test
    @DisplayName("unknown citySlug returns 200 with empty groups, never 404/500")
    void unknownCity_returns200EmptyGroups() {
        RegionScopedAreaGroup.Response response =
                controller.getRegionScopedGroups("nonexistent-city-xyz", REGION_PREFIX + "ANY", null);

        assertThat(response.citySlug()).isEqualTo("nonexistent-city-xyz");
        assertThat(response.regionKey()).isEqualTo(REGION_PREFIX + "ANY");
        assertThat(response.groups()).isEmpty();
    }

    @Test
    @DisplayName("unknown regionKey returns 200 with empty groups, never 404/500")
    void unknownRegion_returns200EmptyGroups() {
        RegionScopedAreaGroup.Response response =
                controller.getRegionScopedGroups(CITY_SLUG, "NO_SUCH_REGION_XYZ", null);

        assertThat(response.groups()).isEmpty();
    }

    @Test
    @DisplayName("a real, materialized region with zero area_groups pointed at it returns 200 with empty groups")
    void regionWithNoGroups_returns200EmptyGroups() {
        String emptyRegion = REGION_PREFIX + "EMPTY";
        insertRegion(emptyRegion, 0);
        // No area_group / area_group_members / city_region_memberships reference this region.

        RegionScopedAreaGroup.Response response = controller.getRegionScopedGroups(CITY_SLUG, emptyRegion, null);

        assertThat(response.groups()).isEmpty();
    }

    // ── AC11: listingPurpose normalization parity with RegionSummaryService ────────

    @Test
    @DisplayName("listingPurpose=sale/rent filters listingCount; blank/invalid falls back to blended "
            + "(all-purposes) — same normalization as RegionSummaryService.normalizeListingPurpose")
    void listingPurpose_normalization_parity() {
        String region = REGION_PREFIX + "PURPOSE";
        insertRegion(region, 0);

        String area = AREA_PREFIX + "purpose-1";
        insertArea(area, 13.00, 74.00, 13.10, 74.10);
        insertMembership(area, region);

        int groupId = insertAreaGroup("purpose", 0);
        insertGroupMember(groupId, area, 0);

        insertListing(area, "sale");
        insertListing(area, "sale");
        insertListing(area, "rent");

        RegionScopedAreaGroup saleOnly = fetchGroup(controller.getRegionScopedGroups(CITY_SLUG, region, "sale"), "purpose");
        RegionScopedAreaGroup rentOnly = fetchGroup(controller.getRegionScopedGroups(CITY_SLUG, region, "rent"), "purpose");
        RegionScopedAreaGroup blank = fetchGroup(controller.getRegionScopedGroups(CITY_SLUG, region, ""), "purpose");
        RegionScopedAreaGroup blended = fetchGroup(controller.getRegionScopedGroups(CITY_SLUG, region, null), "purpose");
        RegionScopedAreaGroup invalid = fetchGroup(controller.getRegionScopedGroups(CITY_SLUG, region, "lease"), "purpose");

        assertThat(saleOnly.listingCount()).isEqualTo(2L);
        assertThat(rentOnly.listingCount()).isEqualTo(1L);
        assertThat(blank.listingCount()).as("blank falls back to blended").isEqualTo(3L);
        assertThat(blended.listingCount()).as("null falls back to blended").isEqualTo(3L);
        assertThat(invalid.listingCount()).as("invalid value falls back to blended, not zero-match").isEqualTo(3L);
    }

    // ── DTO wiring: scopingRegionKey / regionDisplayOrder are echoed correctly ─────

    @Test
    @DisplayName("scopingRegionKey and regionDisplayOrder are the requested region's own key and "
            + "city_regions.display_order")
    void scopingRegionKeyAndDisplayOrder_areCorrectlyPopulated() {
        String region = REGION_PREFIX + "META";
        insertRegion(region, 7);

        String area = AREA_PREFIX + "meta-1";
        insertArea(area, 13.00, 74.00, 13.10, 74.10);
        insertMembership(area, region);

        int groupId = insertAreaGroup("meta", 0);
        insertGroupMember(groupId, area, 0);

        RegionScopedAreaGroup group = fetchGroup(controller.getRegionScopedGroups(CITY_SLUG, region, null), "meta");

        assertThat(group.scopingRegionKey()).isEqualTo(region);
        assertThat(group.regionDisplayOrder()).isEqualTo(7);
    }
}
