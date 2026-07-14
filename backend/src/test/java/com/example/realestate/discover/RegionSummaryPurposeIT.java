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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test proving {@code listingPurpose} region-count scoping (#1882
 * rework, ADVISORY-1) against REAL onboarded Udupi data.
 *
 * <p>Fixes a data-accuracy regression PR2's own cutover to {@code GET
 * /api/discover/cities/{citySlug}/regions} introduced: region {@code listingCount} silently
 * blended buy(sale)/rent listings with no way to scope it, unlike every other Discover
 * summary/listing endpoint. {@code city_region_memberships}/{@code city_regions} are populated
 * exclusively via the real onboarding path ({@link RegionalClassificationBackfillService#runBackfill()}
 * then {@link CityRegionOnboardingService#apply(int)}) — never fabricated. Only {@code
 * property_listings} rows (real listings, not membership/geometry rows) are seeded with a given
 * {@code listing_purpose} to exercise the count filter.
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
class RegionSummaryPurposeIT {

    private static final String MANIPAL = "IN|KA|Udupi|Manipal";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private RegionSummaryController controller;
    private CityRegionOnboardingService onboardingService;
    private RegionalClassificationBackfillService backfillService;
    private Integer udupiCityId;
    private String manipalRegion;

    @BeforeEach
    void setUp() {
        RegionSummaryService regionSummaryService = new RegionSummaryService(jdbcTemplate);
        controller = new RegionSummaryController(regionSummaryService);
        onboardingService = new CityRegionOnboardingService(jdbcTemplate);
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);

        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);

        jdbcTemplate.update("DELETE FROM property_listings");
        jdbcTemplate.update("DELETE FROM city_region_memberships WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM city_regions WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_overrides WHERE city_id = ?", udupiCityId);
        jdbcTemplate.update("DELETE FROM regional_area_classifications WHERE city_key = 'udupi'");
        jdbcTemplate.update(
                "UPDATE city_region_policy SET central_radius_km = 4, policy_fingerprint = NULL WHERE city_id = ?",
                udupiCityId);

        int upserted = backfillService.runBackfill();
        assertThat(upserted).isGreaterThan(0);

        resolveNonUnifiedGroups(udupiCityId);
        onboardingService.apply(udupiCityId);

        manipalRegion = jdbcTemplate.queryForObject(
                "SELECT region_key FROM city_region_memberships WHERE city_id = ? AND area_key = ?",
                String.class, udupiCityId, MANIPAL);
    }

    private void resolveNonUnifiedGroups(int cityId) {
        CityRegionOnboardingReport report = onboardingService.dryRun(cityId);
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
                                + "VALUES (?, ?, ?, 'qa-it-resolve', 'qa') "
                                + "ON CONFLICT (city_id, area_key) DO UPDATE SET forced_region_key = EXCLUDED.forced_region_key",
                        cityId, areaKey, targetRegion);
            }
        }
    }

    private void insertLiveListing(String areaKey, String listingPurpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'house', ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, listingPurpose, now, now);
    }

    private RegionSummaryResponse.Region findManipalRegion(RegionSummaryResponse response) {
        return response.regions().stream()
                .filter(r -> manipalRegion.equals(r.key()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("region " + manipalRegion + " not found"));
    }

    // ── (a) no purpose = combined totals unchanged ────────────────────────────

    @Test
    @DisplayName("no purpose param: listingCount is the combined sale+rent total (unchanged behaviour)")
    void noPurpose_combinedTotalsUnchanged() {
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "rent");

        RegionSummaryResponse.Region blended = findManipalRegion(controller.getRegions("udupi", null));
        assertThat(blended.listingCount()).isEqualTo(2L);

        // The service's 1-arg overload (existing pre-rework callers, e.g.
        // CityRegionOnboardingRegenerationIT) must behave identically to the controller's
        // explicit null-purpose call.
        RegionSummaryService regionSummaryService = new RegionSummaryService(jdbcTemplate);
        RegionSummaryResponse.Region viaServiceOverload =
                regionSummaryService.getRegions("udupi").regions().stream()
                        .filter(r -> manipalRegion.equals(r.key()))
                        .findFirst()
                        .orElseThrow(() -> new AssertionError("region " + manipalRegion + " not found"));
        assertThat(viaServiceOverload.listingCount()).isEqualTo(2L);
    }

    // ── (b) purpose=sale → sale-only ──────────────────────────────────────────

    @Test
    @DisplayName("listingPurpose=sale: region listingCount includes sale listings only")
    void purposeSale_returnsSaleOnlyTotals() {
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "rent");

        RegionSummaryResponse.Region region = findManipalRegion(controller.getRegions("udupi", "sale"));
        assertThat(region.listingCount()).isEqualTo(2L);
    }

    // ── (c) purpose=rent → rent-only ──────────────────────────────────────────

    @Test
    @DisplayName("listingPurpose=rent: region listingCount includes rent listings only")
    void purposeRent_returnsRentOnlyTotals() {
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "rent");
        insertLiveListing(MANIPAL, "rent");
        insertLiveListing(MANIPAL, "rent");

        RegionSummaryResponse.Region region = findManipalRegion(controller.getRegions("udupi", "rent"));
        assertThat(region.listingCount()).isEqualTo(3L);
    }

    // ── (d) zero listings for selected purpose → 0, not the combined total ───

    @Test
    @DisplayName("a region with zero listings for the selected purpose returns 0, not the combined total")
    void zeroListingsForSelectedPurpose_returnsZeroNotCombined() {
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "sale");
        // No rent listings inserted anywhere in this region.

        RegionSummaryResponse.Region rentView = findManipalRegion(controller.getRegions("udupi", "rent"));
        assertThat(rentView.listingCount())
                .as("rent count must be 0, not silently fall back to the combined sale+rent total")
                .isEqualTo(0L);

        RegionSummaryResponse.Region blendedView = findManipalRegion(controller.getRegions("udupi", null));
        assertThat(blendedView.listingCount()).as("sanity: combined total is non-zero").isEqualTo(2L);
    }

    // ── (e) geometry/membership/ordering/boundsStatus unchanged by purpose ───

    @Test
    @DisplayName("geometry, membership, ordering, and boundsStatus are identical across purpose "
            + "values — only listingCount changes")
    void geometryMembershipOrderingBoundsStatus_unchangedByPurpose() {
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "rent");

        RegionSummaryResponse blended = controller.getRegions("udupi", null);
        RegionSummaryResponse saleOnly = controller.getRegions("udupi", "sale");
        RegionSummaryResponse rentOnly = controller.getRegions("udupi", "rent");

        assertThat(saleOnly.regions()).hasSameSizeAs(blended.regions());
        assertThat(rentOnly.regions()).hasSameSizeAs(blended.regions());

        for (int i = 0; i < blended.regions().size(); i++) {
            RegionSummaryResponse.Region b = blended.regions().get(i);
            RegionSummaryResponse.Region s = saleOnly.regions().get(i);
            RegionSummaryResponse.Region r = rentOnly.regions().get(i);

            assertThat(s.key()).as("ordering/key unchanged").isEqualTo(b.key());
            assertThat(r.key()).isEqualTo(b.key());
            assertThat(s.label()).isEqualTo(b.label());
            assertThat(s.displayOrder()).isEqualTo(b.displayOrder());
            assertThat(s.bounds()).as("geometry unchanged by purpose").isEqualTo(b.bounds());
            assertThat(r.bounds()).isEqualTo(b.bounds());
            assertThat(s.centre()).isEqualTo(b.centre());
            assertThat(s.areaCount()).as("membership/area_count unchanged by purpose").isEqualTo(b.areaCount());
            assertThat(r.areaCount()).isEqualTo(b.areaCount());
            assertThat(s.boundsStatus()).as("boundsStatus unchanged by purpose").isEqualTo(b.boundsStatus());
            assertThat(r.boundsStatus()).isEqualTo(b.boundsStatus());
            assertThat(s.missingBoundsAreaCount()).isEqualTo(b.missingBoundsAreaCount());
        }
    }

    // ── (f) invalid purpose → established validation behaviour (blended fallback) ─

    @Test
    @DisplayName("an invalid listingPurpose value falls back to blended totals, matching "
            + "DiscoverSummaryService's established invalid-purpose handling (not a 400)")
    void invalidPurpose_fallsBackToBlendedTotals() {
        insertLiveListing(MANIPAL, "sale");
        insertLiveListing(MANIPAL, "rent");

        RegionSummaryResponse.Region invalidView =
                findManipalRegion(controller.getRegions("udupi", "not-a-real-purpose"));
        RegionSummaryResponse.Region blendedView = findManipalRegion(controller.getRegions("udupi", null));

        assertThat(invalidView.listingCount())
                .as("invalid purpose silently falls back to blended (all-purposes), matching "
                        + "DiscoverSummaryService's normalizeListingPurpose behaviour")
                .isEqualTo(blendedView.listingCount())
                .isEqualTo(2L);
    }
}
