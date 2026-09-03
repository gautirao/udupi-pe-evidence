package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PERMANENT REGRESSION TEST (converted from reproduction, issue #2051, AC11).
 *
 * <p>Exercises the REAL controller-service-mapping chain for
 * {@code GET /api/discover/cities/{city}/listings} via {@link CityAreaListingsService}
 * against a real Postgres (Testcontainers) with actual rent + sale fixtures, matching the
 * monthly_rent values cited in issue #2051 (25000 / 32000 / 18000).
 *
 * <p>Proves: (a) monthly_rent IS persisted correctly in property_listings for rent rows,
 * (b) the SQL projection in {@link CityAreaListingsService#getAreaListings} now selects
 * pl.monthly_rent, and (c) {@link AreaListingCard} carries it via monthlyRentRupees
 * (authenticated) / monthlyRentBand (anonymous) — the same reproduction scenario that used to
 * fail (no monthlyRent key at all, priceBand:null) now passes with the correct auth-aware
 * projection.
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
class Issue2051RentPriceReproIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // Real, already-seeded Udupi area (V71 seed) — reused by other Discover ITs in this package.
    private static final String MANIPAL = "IN|KA|Udupi|Manipal";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private CityAreaListingsService service;

    private UUID saleListingId;
    private UUID rentListingId1;
    private UUID rentListingId2;
    private UUID rentListingId3;

    @BeforeEach
    void setUp() {
        service = new CityAreaListingsService(jdbcTemplate);

        // Clean slate for this area to keep assertions deterministic.
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key = ?", MANIPAL);

        saleListingId = UUID.randomUUID();
        rentListingId1 = UUID.randomUUID();
        rentListingId2 = UUID.randomUUID();
        rentListingId3 = UUID.randomUUID();

        // SALE fixture — control case, has price_paise.
        jdbcTemplate.update("""
                INSERT INTO property_listings
                    (id, area_key, property_type, listing_purpose, price_paise, status, is_duplicate, created_at, title)
                VALUES (?, ?, 'apartment', 'sale', 6000000000, 'LIVE', false, NOW() - INTERVAL '1 day', 'Sale Control')
                """, saleListingId, MANIPAL);

        // RENT fixtures — monthly_rent set (issue #2051 cited values), price_paise NULL
        // (rent listings do not carry an asking sale price).
        jdbcTemplate.update("""
                INSERT INTO property_listings
                    (id, area_key, property_type, listing_purpose, price_paise, monthly_rent, status, is_duplicate, created_at, title)
                VALUES (?, ?, 'apartment', 'rent', NULL, 25000, 'LIVE', false, NOW() - INTERVAL '2 day', 'Rent Fixture A')
                """, rentListingId1, MANIPAL);
        jdbcTemplate.update("""
                INSERT INTO property_listings
                    (id, area_key, property_type, listing_purpose, price_paise, monthly_rent, status, is_duplicate, created_at, title)
                VALUES (?, ?, 'house', 'rent', NULL, 32000, 'LIVE', false, NOW() - INTERVAL '3 day', 'Rent Fixture B')
                """, rentListingId2, MANIPAL);
        jdbcTemplate.update("""
                INSERT INTO property_listings
                    (id, area_key, property_type, listing_purpose, price_paise, monthly_rent, status, is_duplicate, created_at, title)
                VALUES (?, ?, 'apartment', 'rent', NULL, 18000, 'LIVE', false, NOW() - INTERVAL '4 day', 'Rent Fixture C')
                """, rentListingId3, MANIPAL);
    }

    @Test
    @DisplayName("DB fixture sanity: monthly_rent IS persisted correctly for all 3 rent rows")
    void dbFixture_monthlyRentPersistedCorrectly() {
        Long rent1 = jdbcTemplate.queryForObject(
                "SELECT monthly_rent FROM property_listings WHERE id = ?", Long.class, rentListingId1);
        Long rent2 = jdbcTemplate.queryForObject(
                "SELECT monthly_rent FROM property_listings WHERE id = ?", Long.class, rentListingId2);
        Long rent3 = jdbcTemplate.queryForObject(
                "SELECT monthly_rent FROM property_listings WHERE id = ?", Long.class, rentListingId3);

        assertThat(rent1).isEqualTo(25000L);
        assertThat(rent2).isEqualTo(32000L);
        assertThat(rent3).isEqualTo(18000L);
    }

    @Test
    @DisplayName("#2051 AC1/AC2/AC11 — anonymous caller: SALE row gets priceBand, RENT rows get "
            + "monthlyRentBand (coarse) derived from the persisted monthly_rent, and NEVER "
            + "monthlyRentRupees (exact) or a sale priceBand")
    void anonymousCaller_rentRowsExposeMonthlyRentBand() throws Exception {
        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of(MANIPAL), 10, null, null, null, null, null, null, null, null, false);

        List<AreaListingCard> cards = resp.areas().get(0).listings();
        assertThat(cards).hasSize(4);

        AreaListingCard saleCard = cards.stream().filter(c -> c.id().equals(saleListingId)).findFirst().orElseThrow();
        AreaListingCard rentCard1 = cards.stream().filter(c -> c.id().equals(rentListingId1)).findFirst().orElseThrow();
        AreaListingCard rentCard2 = cards.stream().filter(c -> c.id().equals(rentListingId2)).findFirst().orElseThrow();
        AreaListingCard rentCard3 = cards.stream().filter(c -> c.id().equals(rentListingId3)).findFirst().orElseThrow();

        // SALE: priceBand populated (control case proves the mechanism works for sale).
        // Sale contract is byte-for-byte unchanged: no rent fields populated.
        assertThat(saleCard.listingPurpose()).isEqualTo("sale");
        assertThat(saleCard.priceBand()).isEqualTo("₹2Cr+");
        assertThat(saleCard.pricePaise()).isNull(); // anon: exact price omitted
        assertThat(saleCard.monthlyRentRupees()).isNull();
        assertThat(saleCard.monthlyRentBand()).isNull();

        // RENT: monthlyRentBand is the coarse band derived from the persisted monthly_rent
        // (25000/32000/18000 rupees), NOT the exact value, and NEVER a sale priceBand/pricePaise.
        assertThat(rentCard1.listingPurpose()).isEqualTo("rent");
        assertThat(rentCard1.monthlyRentBand()).isEqualTo("₹20–35K"); // 25000 rupees
        assertThat(rentCard1.monthlyRentRupees()).isNull(); // anon: exact rent omitted
        assertThat(rentCard1.priceBand()).isNull();
        assertThat(rentCard1.pricePaise()).isNull();

        assertThat(rentCard2.monthlyRentBand()).isEqualTo("₹20–35K"); // 32000 rupees
        assertThat(rentCard2.monthlyRentRupees()).isNull();
        assertThat(rentCard2.priceBand()).isNull();

        assertThat(rentCard3.monthlyRentBand()).isEqualTo("₹10–20K"); // 18000 rupees
        assertThat(rentCard3.monthlyRentRupees()).isNull();
        assertThat(rentCard3.priceBand()).isNull();

        // Serialize to actual JSON and prove the monthlyRentBand key IS present for rent rows,
        // with the coarse band value, and the exact monthlyRentRupees key is ABSENT anywhere
        // (anon leak guard, AC2) — no 100x unit error: 25000 renders as the "₹20–35K" band,
        // not a paise-scaled or divided value (AC8).
        String json = objectMapper.writeValueAsString(resp);
        assertThat(json).contains("\"monthlyRentBand\":\"₹20–35K\"");
        assertThat(json).contains("\"monthlyRentBand\":\"₹10–20K\"");
        assertThat(json).doesNotContain("monthlyRentRupees");

        // Sanity: the JSON DOES contain the sale priceBand and the rent listing ids, proving
        // this is a real serialized payload, not an empty/short-circuited response.
        assertThat(json).contains("₹2Cr+");
        assertThat(json).contains(rentListingId1.toString());
    }

    @Test
    @DisplayName("#2051 AC1/AC8/AC11 — authenticated caller: SALE row gets exact pricePaise, RENT rows get "
            + "the exact monthlyRentRupees verbatim from monthly_rent, with NO 100x conversion error")
    void authenticatedCaller_rentRowsExposeExactMonthlyRentRupees() throws Exception {
        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of(MANIPAL), 10, null, null, null, null, null, null, null, null, true);

        List<AreaListingCard> cards = resp.areas().get(0).listings();
        AreaListingCard saleCard = cards.stream().filter(c -> c.id().equals(saleListingId)).findFirst().orElseThrow();
        AreaListingCard rentCard1 = cards.stream().filter(c -> c.id().equals(rentListingId1)).findFirst().orElseThrow();
        AreaListingCard rentCard2 = cards.stream().filter(c -> c.id().equals(rentListingId2)).findFirst().orElseThrow();
        AreaListingCard rentCard3 = cards.stream().filter(c -> c.id().equals(rentListingId3)).findFirst().orElseThrow();

        // Authenticated: SALE gets exact pricePaise, priceBand null (omitted). Unchanged contract.
        assertThat(saleCard.pricePaise()).isEqualTo(6_000_000_000L);
        assertThat(saleCard.priceBand()).isNull();
        assertThat(saleCard.monthlyRentRupees()).isNull();
        assertThat(saleCard.monthlyRentBand()).isNull();

        // Authenticated: RENT gets the exact monthlyRentRupees, verbatim (RUPEES, no /100 or
        // *100) — a stored 25000 must render as 25000, NOT 250 (÷100 error) or 2,500,000 (×100
        // error). monthlyRentBand is null (omitted) for authed. No sale price/band leaks either.
        assertThat(rentCard1.monthlyRentRupees()).isEqualTo(25000L);
        assertThat(rentCard2.monthlyRentRupees()).isEqualTo(32000L);
        assertThat(rentCard3.monthlyRentRupees()).isEqualTo(18000L);
        assertThat(rentCard1.monthlyRentBand()).isNull();
        assertThat(rentCard1.pricePaise()).isNull();
        assertThat(rentCard1.priceBand()).isNull();

        String json = objectMapper.writeValueAsString(resp);
        assertThat(json).contains("\"monthlyRentRupees\":25000");
        assertThat(json).doesNotContain("monthlyRentBand");
    }

    @Test
    @DisplayName("#2051 AC1/AC11 — area-scoped request (areaKeys param) now surfaces the rent "
            + "band on the same real area used by the city-listings endpoint")
    void areaScopedRequest_rentRowsExposeMonthlyRentBand() {
        // This IS the area-scoped call — getAreaListings takes areaKeys explicitly; the
        // controller-level distinction (single city listings vs area-scoped) collapses to the
        // same service call, which is what we exercise here.
        CityAreaListingsResponse resp = service.getAreaListings(
                "udupi", List.of(MANIPAL), 10, null, null, null, null, null, "rent", null, null, false);

        List<AreaListingCard> cards = resp.areas().get(0).listings();
        assertThat(cards).hasSize(3); // listingPurpose=rent filter applied server-side
        assertThat(cards).allSatisfy(c -> {
            assertThat(c.listingPurpose()).isEqualTo("rent");
            assertThat(c.priceBand()).isNull();
            assertThat(c.pricePaise()).isNull();
            assertThat(c.monthlyRentRupees()).isNull(); // anon: exact rent omitted
            assertThat(c.monthlyRentBand()).isNotNull(); // anon: coarse band present
        });
    }
}
