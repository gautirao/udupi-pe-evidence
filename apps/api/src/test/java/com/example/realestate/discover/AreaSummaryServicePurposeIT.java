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
 * Testcontainers integration test proving {@code purpose} (#2083 RC_C) scoping on {@code GET
 * /api/discover/areas}'s per-area {@code listingCount} against a REAL PostGIS database.
 *
 * <p>PROVEN DEFECT this closes: {@code cityTotal} on the Discover map badge is a client-side sum
 * over {@code useDiscoverAreas(city)} → {@code GET /api/discover/areas}, which previously accepted
 * only {@code city}/{@code propertyType} — so switching Buy→Rent left the badge reading the
 * BLENDED sale+rent total even on an empty Rent result. {@code purpose} threads an optional {@code
 * AND listing_purpose = ?} into the SAME count subquery {@code propertyType} already scopes,
 * ORTHOGONALLY (either filter may be supplied alone or together).
 *
 * <p>Harness copied from {@link AreaSummaryServiceAgriIT}: Flyway through the full migration set,
 * areas/cities from the V71 seed, only {@code property_listings} rows inserted per test.
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
class AreaSummaryServicePurposeIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "udupi";
    private static final String MANIPAL = "IN|KA|Udupi|Manipal";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AreaSummaryService service;

    @BeforeEach
    void setUp() {
        service = new AreaSummaryService(jdbcTemplate);
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    // ── AC11: absent purpose is byte-identical to today's blended behaviour ──────────────────

    @Test
    @DisplayName("no purpose param: listingCount is the combined sale+rent total (unchanged behaviour, AC11)")
    void noPurpose_combinedTotalUnchanged() {
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "rent");

        AreaSummary blended = areaOf(service.getAreasByCity(CITY, null, null), MANIPAL);
        assertThat(blended.listingCount()).isEqualTo(2L);

        // The 2-arg overload (existing #1371 callers) must behave identically to an explicit null
        // purpose — proving the new 3rd parameter didn't silently change any existing call site.
        AreaSummary viaTwoArgOverload = areaOf(service.getAreasByCity(CITY, null), MANIPAL);
        assertThat(viaTwoArgOverload.listingCount()).isEqualTo(2L);

        // And the 1-arg overload too.
        AreaSummary viaOneArgOverload = areaOf(service.getAreasByCity(CITY), MANIPAL);
        assertThat(viaOneArgOverload.listingCount()).isEqualTo(2L);
    }

    // ── purpose=sale / purpose=rent → different counts on seeded data ────────────────────────

    @Test
    @DisplayName("purpose=sale and purpose=rent return DIFFERENT counts on the same seeded data")
    void purposeSaleAndRent_returnDifferentCounts() {
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "rent");

        AreaSummary saleOnly = areaOf(service.getAreasByCity(CITY, null, "sale"), MANIPAL);
        AreaSummary rentOnly = areaOf(service.getAreasByCity(CITY, null, "rent"), MANIPAL);
        AreaSummary blended = areaOf(service.getAreasByCity(CITY, null, null), MANIPAL);

        assertThat(saleOnly.listingCount()).isEqualTo(2L);
        assertThat(rentOnly.listingCount()).isEqualTo(1L);
        assertThat(blended.listingCount()).isEqualTo(3L);
        assertThat(saleOnly.listingCount()).isNotEqualTo(rentOnly.listingCount());
    }

    @Test
    @DisplayName("a purpose with zero matching listings returns 0, not the blended total")
    void purposeWithZeroMatches_returnsZeroNotBlended() {
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "sale");
        // No rent listings inserted anywhere.

        AreaSummary rentView = areaOf(service.getAreasByCity(CITY, null, "rent"), MANIPAL);
        assertThat(rentView.listingCount())
                .as("rent count must be 0, not silently fall back to the combined total")
                .isEqualTo(0L);
    }

    // ── unrecognised/blank purpose → blended fallback, never a thrown error ──────────────────

    @Test
    @DisplayName("an unrecognised purpose value falls back to blended, matching "
            + "DiscoverFilterNormalizer#normalizePurpose's established convention")
    void invalidPurpose_fallsBackToBlended() {
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "rent");

        AreaSummary invalidView = areaOf(service.getAreasByCity(CITY, null, "not-a-real-purpose"), MANIPAL);
        AreaSummary blendedView = areaOf(service.getAreasByCity(CITY, null, null), MANIPAL);

        assertThat(invalidView.listingCount()).isEqualTo(blendedView.listingCount()).isEqualTo(2L);
    }

    @Test
    @DisplayName("blank/whitespace purpose falls back to blended")
    void blankPurpose_fallsBackToBlended() {
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "rent");

        AreaSummary blankView = areaOf(service.getAreasByCity(CITY, null, "   "), MANIPAL);
        assertThat(blankView.listingCount()).isEqualTo(2L);
    }

    @Test
    @DisplayName("purpose=SALE (upper-case) is scoped to sale, case-insensitively — not blended")
    void upperCasedPurpose_isScopedNotBlended() {
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "sale");
        insertListing(MANIPAL, "house", "rent");

        AreaSummary upper = areaOf(service.getAreasByCity(CITY, null, "SALE"), MANIPAL);
        AreaSummary lower = areaOf(service.getAreasByCity(CITY, null, "sale"), MANIPAL);

        assertThat(upper.listingCount()).isEqualTo(lower.listingCount()).isEqualTo(2L);
    }

    // ── purpose combined with propertyType (orthogonal, both bound) ──────────────────────────

    @Test
    @DisplayName("purpose combined with propertyType=agricultural_land narrows on BOTH dimensions, "
            + "and the acreage set matches the narrower counted set")
    void purposeCombinedWithAgriPropertyType_narrowsOnBothDimensions() {
        insertAgriListing(MANIPAL, "sale", new BigDecimal("5"), "acre");
        insertAgriListing(MANIPAL, "rent", new BigDecimal("9"), "acre"); // agri land for lease
        insertListing(MANIPAL, "apartment", "sale"); // wrong property type, excluded either way

        AreaSummary agriSaleOnly = areaOf(
                service.getAreasByCity(CITY, "agricultural_land", "sale"), MANIPAL);
        AreaSummary agriBlended = areaOf(
                service.getAreasByCity(CITY, "agricultural_land", null), MANIPAL);

        assertThat(agriSaleOnly.listingCount()).isEqualTo(1L);
        assertThat(agriSaleOnly.agriAcreage()).isEqualTo(5.0);
        assertThat(agriBlended.listingCount()).isEqualTo(2L);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static AreaSummary areaOf(AreaSummaryResponse response, String areaKey) {
        Optional<AreaSummary> match = response.areas().stream()
                .filter(a -> areaKey.equals(a.areaKey()))
                .findFirst();
        assertThat(match).as("area %s must be present in the response", areaKey).isPresent();
        return match.get();
    }

    private void insertListing(String areaKey, String propertyType, String listingPurpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, propertyType, listingPurpose, now, now);
    }

    private void insertAgriListing(String areaKey, String listingPurpose, BigDecimal landArea, String landAreaUnit) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, land_area, land_area_unit, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', ?, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, listingPurpose, landArea, landAreaUnit, now, now);
    }
}
