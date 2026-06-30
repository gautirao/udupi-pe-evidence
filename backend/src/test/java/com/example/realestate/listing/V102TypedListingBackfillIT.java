package com.example.realestate.listing;

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
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for V102 — typed listing schema expand + backfill.
 *
 * <p>Harness mirrors {@code RegionalClassificationBackfillIT} /
 * {@code ListingQualityMigrationIT}: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4} real container, no DB replacement,
 * Flyway applies ALL migrations (including V102) automatically on context
 * startup before any test method runs.
 *
 * <p>Because V102 backfill runs against an empty database at startup,
 * the backfill DML produces zero rows. The IT proves correctness by:
 * (a) seeding representative {@code property_listings} rows via
 *     {@code jdbcTemplate} within each test, then (b) re-executing the
 *     same idempotent backfill statements (ON CONFLICT DO NOTHING) and
 *     asserting routing and counts, then (c) running the backfill a second
 *     time and asserting identical counts (idempotency proof).
 *
 * <p>Covers AC1–AC7 from the approved execution handoff.
 *
 * <p>Issue: #1688 (M38-10A).
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
class V102TypedListingBackfillIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // =========================================================================
    // AC1: Schema — all 7 detail + 2 shared + 4 child tables exist;
    //      listing_nearby_pois does NOT exist; listing_pois DOES exist.
    // =========================================================================

    @Test
    @DisplayName("AC1: all 7 detail + 2 shared + 4 child tables exist; listing_pois present; listing_nearby_pois absent")
    void schemaShape_allTablesExist() {
        List<String> expectedTables = List.of(
                // 7 detail tables
                "listing_residential_unit_details",
                "listing_residential_plot_details",
                "listing_commercial_space_details",
                "listing_commercial_building_details",
                "listing_warehouse_details",
                "listing_commercial_land_details",
                "listing_agricultural_land_details",
                // 2 shared tables
                "listing_rental_terms",
                "listing_ownership_details",
                // 4 child tables
                "listing_amenities",
                "listing_suitable_uses",
                "listing_location_features",
                "listing_agri_crops"
        );

        for (String table : expectedTables) {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT table_name FROM information_schema.tables "
                            + "WHERE table_schema = 'public' AND table_name = ?",
                    table);
            assertThat(rows).as(table + " must exist").hasSize(1);
        }

        // listing_nearby_pois must NOT exist (listing_pois from V25 is reused)
        List<Map<String, Object>> nearbyPois = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_schema = 'public' AND table_name = 'listing_nearby_pois'");
        assertThat(nearbyPois).as("listing_nearby_pois must NOT exist (listing_pois reused)").isEmpty();

        // listing_pois (V25) must still exist and be unmodified
        List<Map<String, Object>> listingPois = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_schema = 'public' AND table_name = 'listing_pois'");
        assertThat(listingPois).as("listing_pois (V25) must still exist").hasSize(1);
    }

    @Test
    @DisplayName("AC1: listing_family column exists on property_listings with correct nullable CHECK")
    void listingFamilyColumn_existsAndNullable() {
        List<Map<String, Object>> cols = jdbcTemplate.queryForList(
                "SELECT column_name, is_nullable, data_type "
                        + "FROM information_schema.columns "
                        + "WHERE table_schema = 'public' "
                        + "  AND table_name = 'property_listings' "
                        + "  AND column_name = 'listing_family'");
        assertThat(cols).as("listing_family column must exist").hasSize(1);
        assertThat(cols.get(0).get("is_nullable")).as("listing_family must be nullable").isEqualTo("YES");
        assertThat(cols.get(0).get("data_type")).as("listing_family must be text").isEqualTo("text");
    }

    // =========================================================================
    // AC2 / AC3 / AC4 / AC5 / AC6 / AC7: Seed matrix + backfill routing
    // =========================================================================

    /**
     * Seeds a representative matrix of property_listings rows and re-runs the
     * idempotent V102 backfill DML. Returns the seeded listing IDs keyed by
     * a descriptive label for assertions.
     */
    private java.util.Map<String, UUID> seedAndBackfill() {
        OffsetDateTime now = OffsetDateTime.now();
        java.util.Map<String, UUID> ids = new java.util.LinkedHashMap<>();

        // Helper — inserts a property_listing with only the columns needed
        // for backfill routing. Returns the generated UUID.

        // Row 1: house (RESIDENTIAL, sale)
        UUID houseId = UUID.randomUUID();
        ids.put("house", houseId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, bedrooms, bathrooms, "
                        + " floor_number, total_floors, furnishing_status, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                houseId, "house", "sale", "LIVE",
                3, 2, 0, 2, "Semi-furnished", now, now);

        // Row 2: apartment (RESIDENTIAL, rent — with all rent fields)
        UUID aptId = UUID.randomUUID();
        ids.put("apartment_rent", aptId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, bedrooms, bathrooms, "
                        + " floor_number, total_floors, furnishing_status, "
                        + " monthly_rent, security_deposit_months, lock_in_months, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                aptId, "apartment", "rent", "LIVE",
                2, 1, 3, 10, "Unfurnished",
                5000000L, 2, 11, now, now);

        // Row 3: commercial (COMMERCIAL — subtype ambiguous; sale listing WITH monthly_rent
        //         stale value — must NOT produce a rental_terms row)
        UUID commercialId = UUID.randomUUID();
        ids.put("commercial_sale_with_stale_rent", commercialId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " floor_number, total_floors, furnishing_status, washrooms, parking_count, "
                        + " road_frontage_ft, commercial_usage, monthly_rent, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                commercialId, "commercial", "sale", "LIVE",
                1, 5, "Unfurnished", 2, 1,
                new BigDecimal("20.5"), "Retail", 100000L,
                now, now);

        // Row 4: commercial_building (COMMERCIAL, sale)
        UUID buildingId = UUID.randomUUID();
        ids.put("commercial_building", buildingId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " number_of_units, total_floors, road_frontage_ft, commercial_usage, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?)",
                buildingId, "commercial_building", "sale", "LIVE",
                4, 3, new BigDecimal("30.0"), "Office",
                now, now);

        // Row 5: warehouse (COMMERCIAL, sale)
        UUID warehouseId = UUID.randomUUID();
        ids.put("warehouse", warehouseId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " total_floors, road_frontage_ft, commercial_usage, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?)",
                warehouseId, "warehouse", "sale", "LIVE",
                1, new BigDecimal("40.0"), "Storage",
                now, now);

        // Row 6: commercial_land (COMMERCIAL, rent — with rent fields)
        // Note: 'lease' is a future expansion (chk_listing_purpose currently allows only 'sale'|'rent').
        // The V102 backfill DML references IN ('rent','lease') proactively; 'lease' rows will be
        // handled once the constraint is expanded in a later migration.
        UUID commLandId = UUID.randomUUID();
        ids.put("commercial_land_rent", commLandId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " road_frontage_ft, monthly_rent, lock_in_months, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?)",
                commLandId, "commercial_land", "rent", "LIVE",
                new BigDecimal("50.0"), 200000L, 12,
                now, now);

        // Row 7: agricultural_land (AGRICULTURAL) — with boundary geometry + ownership fields
        UUID agriId = UUID.randomUUID();
        ids.put("agri_with_ownership", agriId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " water_source, soil_type, road_access, cultivation_status, "
                        + " land_category, farmhouse_available, fencing_done, "
                        + " ownership_type, survey_number, "
                        + " land_area, land_area_unit, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                agriId, "agricultural_land", "sale", "LIVE",
                "Borewell", "Red soil", "Direct road", "Paddy cultivation",
                "Agricultural", true, false,
                "Single owner", "SRV-001",
                new BigDecimal("5"), "acre",
                now, now);

        // Row 8: land (AMBIGUOUS generic land — listing_family must stay NULL)
        UUID landId = UUID.randomUUID();
        ids.put("land_ambiguous", landId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " land_area, land_area_unit, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?)",
                landId, "land", "sale", "LIVE",
                new BigDecimal("2"), "acre",
                now, now);

        // Row 9: other (AMBIGUOUS — listing_family must stay NULL)
        UUID otherId = UUID.randomUUID();
        ids.put("other", otherId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?)",
                otherId, "other", "sale", "LIVE",
                now, now);

        // Row 10: other with SCRAPED status — listing_family must stay NULL
        // (distinct from Row 9 which is LIVE; both share property_type='other' but differ in status)
        UUID otherScrapedId = UUID.randomUUID();
        ids.put("other_scraped", otherScrapedId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?)",
                otherScrapedId, "other", "sale", "SCRAPED",
                now, now);

        // Row 11: rent row with NO rent fields (must NOT produce rental_terms)
        UUID rentNoFieldsId = UUID.randomUUID();
        ids.put("rent_no_fields", rentNoFieldsId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " bedrooms, bathrooms, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?)",
                rentNoFieldsId, "apartment", "rent", "LIVE",
                1, 1, now, now);

        // Row 12: land_area row — land_area + land_area_unit present, area_sqm NULL
        //         (verifies backfill does NOT populate area_sqm)
        UUID landAreaId = UUID.randomUUID();
        ids.put("land_area_no_sqm", landAreaId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, "
                        + " land_area, land_area_unit, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?)",
                landAreaId, "house", "sale", "LIVE",
                new BigDecimal("120"), "sqft",
                now, now);

        // Row 13: villa — a genuinely unmapped property_type (absent from every backfill
        // UPDATE IN-list). 'villa' is not in the current chk_listing_property_type CHECK
        // (V86), so we temporarily expand the constraint within this test's transaction.
        // PostgreSQL DDL is transactional; the expansion rolls back with the test transaction,
        // leaving the schema unchanged for subsequent tests.
        jdbcTemplate.execute("ALTER TABLE public.property_listings "
                + "DROP CONSTRAINT IF EXISTS chk_listing_property_type");
        jdbcTemplate.execute("ALTER TABLE public.property_listings "
                + "ADD CONSTRAINT chk_listing_property_type CHECK (property_type IN ("
                + "'house','apartment','land','commercial','commercial_building',"
                + "'warehouse','commercial_land','other','agricultural_land','villa'))");

        UUID villaId = UUID.randomUUID();
        ids.put("villa_unmapped", villaId);
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, property_type, listing_purpose, status, bedrooms, bathrooms, "
                        + " created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?)",
                villaId, "villa", "sale", "LIVE", 4, 3, now, now);

        // ── Re-execute idempotent backfill DML (same SQL as V102) ────────────
        runBackfillDml();

        return ids;
    }

    /**
     * Exact copy of V102 step-5 DML (idempotent backfill statements). Must NOT be edited
     * independently of the migration — any drift here invalidates the idempotency proof.
     * If V102 step-5 DML changes, update this method to match exactly.
     */
    private void runBackfillDml() {
        // listing_family stamps
        jdbcTemplate.update(
                "UPDATE public.property_listings SET listing_family='RESIDENTIAL' "
                        + "WHERE property_type IN ('house','apartment') AND listing_family IS NULL");
        jdbcTemplate.update(
                "UPDATE public.property_listings SET listing_family='COMMERCIAL' "
                        + "WHERE property_type IN ('commercial','commercial_building','warehouse','commercial_land') "
                        + "AND listing_family IS NULL");
        jdbcTemplate.update(
                "UPDATE public.property_listings SET listing_family='AGRICULTURAL' "
                        + "WHERE property_type='agricultural_land' AND listing_family IS NULL");

        // Detail table inserts
        jdbcTemplate.update(
                "INSERT INTO public.listing_residential_unit_details "
                        + "(listing_id, bedrooms, bathrooms, floor_number, total_floors, furnishing_status) "
                        + "SELECT id, bedrooms, bathrooms, floor_number, total_floors, furnishing_status "
                        + "FROM public.property_listings WHERE property_type IN ('house','apartment') "
                        + "ON CONFLICT (listing_id) DO NOTHING");
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_space_details "
                        + "(listing_id, commercial_subtype, floor_number, total_floors, furnishing_status, "
                        + " washrooms, parking_count, road_frontage_ft, commercial_usage) "
                        + "SELECT id, NULL, floor_number, total_floors, furnishing_status, "
                        + "       washrooms, parking_count, road_frontage_ft, commercial_usage "
                        + "FROM public.property_listings WHERE property_type='commercial' "
                        + "ON CONFLICT (listing_id) DO NOTHING");
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_building_details "
                        + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage) "
                        + "SELECT id, number_of_units, total_floors, road_frontage_ft, commercial_usage "
                        + "FROM public.property_listings WHERE property_type='commercial_building' "
                        + "ON CONFLICT (listing_id) DO NOTHING");
        jdbcTemplate.update(
                "INSERT INTO public.listing_warehouse_details "
                        + "(listing_id, total_floors, road_frontage_ft, commercial_usage) "
                        + "SELECT id, total_floors, road_frontage_ft, commercial_usage "
                        + "FROM public.property_listings WHERE property_type='warehouse' "
                        + "ON CONFLICT (listing_id) DO NOTHING");
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_land_details "
                        + "(listing_id, road_frontage_ft) "
                        + "SELECT id, road_frontage_ft "
                        + "FROM public.property_listings WHERE property_type='commercial_land' "
                        + "ON CONFLICT (listing_id) DO NOTHING");
        jdbcTemplate.update(
                "INSERT INTO public.listing_agricultural_land_details "
                        + "(listing_id, water_source, soil_type, road_access, cultivation_status, "
                        + " land_category, farmhouse_available, fencing_done) "
                        + "SELECT id, water_source, soil_type, road_access, cultivation_status, "
                        + "       land_category, farmhouse_available, fencing_done "
                        + "FROM public.property_listings WHERE property_type='agricultural_land' "
                        + "ON CONFLICT (listing_id) DO NOTHING");

        // Shared tables
        jdbcTemplate.update(
                "INSERT INTO public.listing_rental_terms "
                        + "(listing_id, monthly_rent, security_deposit_months, lock_in_months) "
                        + "SELECT id, monthly_rent, security_deposit_months, lock_in_months "
                        + "FROM public.property_listings "
                        + "WHERE listing_purpose IN ('rent','lease') "
                        + "  AND (monthly_rent IS NOT NULL "
                        + "       OR security_deposit_months IS NOT NULL "
                        + "       OR lock_in_months IS NOT NULL) "
                        + "ON CONFLICT (listing_id) DO NOTHING");
        jdbcTemplate.update(
                "INSERT INTO public.listing_ownership_details "
                        + "(listing_id, ownership_type, survey_number, rera_number, "
                        + " possession_status, expected_possession_date) "
                        + "SELECT id, ownership_type, survey_number, rera_number, "
                        + "       possession_status, expected_possession_date "
                        + "FROM public.property_listings "
                        + "WHERE ownership_type IS NOT NULL "
                        + "   OR survey_number IS NOT NULL "
                        + "   OR rera_number IS NOT NULL "
                        + "   OR possession_status IS NOT NULL "
                        + "   OR expected_possession_date IS NOT NULL "
                        + "ON CONFLICT (listing_id) DO NOTHING");
    }

    // ── AC2: Correct family / detail routing per property_type ───────────────

    @Test
    @DisplayName("AC2: house/apartment → RESIDENTIAL + residential_unit_details; land/other → NULL family; commercial → NULL commercial_subtype")
    void backfill_routesCorrectly() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        // house → RESIDENTIAL
        String houseFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("house").toString());
        assertThat(houseFam).isEqualTo("RESIDENTIAL");

        // apartment_rent → RESIDENTIAL
        String aptFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("apartment_rent").toString());
        assertThat(aptFam).isEqualTo("RESIDENTIAL");

        // commercial → COMMERCIAL
        String commFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("commercial_sale_with_stale_rent").toString());
        assertThat(commFam).isEqualTo("COMMERCIAL");

        // commercial_building → COMMERCIAL
        String bldFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("commercial_building").toString());
        assertThat(bldFam).isEqualTo("COMMERCIAL");

        // warehouse → COMMERCIAL
        String whFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("warehouse").toString());
        assertThat(whFam).isEqualTo("COMMERCIAL");

        // commercial_land → COMMERCIAL
        String clFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("commercial_land_rent").toString());
        assertThat(clFam).isEqualTo("COMMERCIAL");

        // agricultural_land → AGRICULTURAL
        String agriFam = jdbcTemplate.queryForObject(
                "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                String.class, ids.get("agri_with_ownership").toString());
        assertThat(agriFam).isEqualTo("AGRICULTURAL");
    }

    @Test
    @DisplayName("AC3: land, other, other_scraped, villa (unmapped) → listing_family NULL, zero detail rows")
    void ambiguousTypes_noFamilyNoDetailRow() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        // 'land', 'other', 'other_scraped' are in chk_listing_property_type but absent from
        // all backfill IN-lists. 'villa_unmapped' is a genuinely unmapped type (not in any
        // backfill UPDATE IN-list; temporarily inserted via expanded CHECK within this test).
        for (String key : List.of("land_ambiguous", "other", "other_scraped", "villa_unmapped")) {
            String fam = jdbcTemplate.queryForObject(
                    "SELECT listing_family FROM public.property_listings WHERE id=?::uuid",
                    String.class, ids.get(key).toString());
            assertThat(fam).as(key + " must have NULL listing_family").isNull();
        }

        // No detail rows for any of these in ANY detail table
        for (String key : List.of("land_ambiguous", "other", "other_scraped", "villa_unmapped")) {
            String listingIdStr = ids.get(key).toString();
            assertDetailRowAbsent(listingIdStr, "listing_residential_unit_details");
            assertDetailRowAbsent(listingIdStr, "listing_commercial_space_details");
            assertDetailRowAbsent(listingIdStr, "listing_commercial_building_details");
            assertDetailRowAbsent(listingIdStr, "listing_warehouse_details");
            assertDetailRowAbsent(listingIdStr, "listing_commercial_land_details");
            assertDetailRowAbsent(listingIdStr, "listing_agricultural_land_details");
        }
    }

    private void assertDetailRowAbsent(String listingIdStr, String table) {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public." + table + " WHERE listing_id=?::uuid",
                Integer.class, listingIdStr);
        assertThat(cnt).as(table + " must have no row for " + listingIdStr).isZero();
    }

    @Test
    @DisplayName("AC4: commercial → commercial_subtype IS NULL (cannot disambiguate legacy 'commercial')")
    void commercial_hasNullSubtype() {
        java.util.Map<String, UUID> ids = seedAndBackfill();
        Object subtype = jdbcTemplate.queryForObject(
                "SELECT commercial_subtype FROM public.listing_commercial_space_details "
                        + "WHERE listing_id=?::uuid",
                Object.class, ids.get("commercial_sale_with_stale_rent").toString());
        assertThat(subtype).as("commercial_subtype must be NULL for legacy 'commercial'").isNull();
    }

    @Test
    @DisplayName("AC5: rental_terms only for purpose IN (rent,lease) with rent fields; sale+monthly_rent → NO rental_terms; rent+no-fields → NO rental_terms")
    void rentalTerms_gatedByPurposeAndPresence() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        // apartment_rent with monthly_rent → HAS rental_terms
        Integer aptRentCnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_rental_terms WHERE listing_id=?::uuid",
                Integer.class, ids.get("apartment_rent").toString());
        assertThat(aptRentCnt).as("apartment on rent with rent fields must have rental_terms row").isOne();

        // commercial_land_rent → HAS rental_terms
        Integer clRentCnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_rental_terms WHERE listing_id=?::uuid",
                Integer.class, ids.get("commercial_land_rent").toString());
        assertThat(clRentCnt).as("commercial_land on rent with rent fields must have rental_terms row").isOne();

        // commercial SALE with stale monthly_rent → NO rental_terms (purpose gate)
        Integer saleStaleCnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_rental_terms WHERE listing_id=?::uuid",
                Integer.class, ids.get("commercial_sale_with_stale_rent").toString());
        assertThat(saleStaleCnt).as("sale listing with stale monthly_rent must NOT have rental_terms row").isZero();

        // rent row with no rent fields → NO rental_terms
        Integer rentNoFieldsCnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_rental_terms WHERE listing_id=?::uuid",
                Integer.class, ids.get("rent_no_fields").toString());
        assertThat(rentNoFieldsCnt).as("rent listing with no rent fields must NOT have rental_terms row").isZero();
    }

    @Test
    @DisplayName("AC6: ownership_details for agri row with ownership fields; house/sale with no ownership → no ownership row")
    void ownershipDetails_gatedByPresence() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        // agri with ownership_type + survey_number → HAS ownership_details
        Integer agriCnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_ownership_details WHERE listing_id=?::uuid",
                Integer.class, ids.get("agri_with_ownership").toString());
        assertThat(agriCnt).as("agri row with ownership fields must have ownership_details row").isOne();

        // house (sale, no ownership fields) → NO ownership_details
        Integer houseCnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_ownership_details WHERE listing_id=?::uuid",
                Integer.class, ids.get("house").toString());
        assertThat(houseCnt).as("house sale with no ownership fields must NOT have ownership_details row").isZero();
    }

    @Test
    @DisplayName("AC7a: land_area byte-identical before/after backfill (backfill does NOT touch land_area)")
    void backfill_doesNotTouchLandArea() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        // agri_with_ownership had land_area=5 (acre); house had no explicit land_area;
        // land_area_no_sqm had land_area=120 (sqft)
        BigDecimal agriArea = jdbcTemplate.queryForObject(
                "SELECT land_area FROM public.property_listings WHERE id=?::uuid",
                BigDecimal.class, ids.get("agri_with_ownership").toString());
        assertThat(agriArea).as("agri land_area must be unchanged after backfill")
                .isEqualByComparingTo(new BigDecimal("5"));

        BigDecimal houseArea = jdbcTemplate.queryForObject(
                "SELECT land_area FROM public.property_listings WHERE id=?::uuid",
                BigDecimal.class, ids.get("land_area_no_sqm").toString());
        assertThat(houseArea).as("house land_area=120 must be unchanged after backfill")
                .isEqualByComparingTo(new BigDecimal("120"));
    }

    @Test
    @DisplayName("AC7b: area_sqm / area_sqft / area_cent / price_per_cent_paise NOT populated by backfill")
    void backfill_doesNotPopulateComputedAreaColumns() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        // All four computed area/price columns must remain NULL after backfill.
        // land_area_no_sqm: land_area=120sqft set but no normalizer invoked.
        // agri_with_ownership: land_area=5acre set but no normalizer invoked.
        for (String key : List.of("agri_with_ownership", "land_area_no_sqm")) {
            String idStr = ids.get(key).toString();

            Integer areaSqmNull = jdbcTemplate.queryForObject(
                    "SELECT CASE WHEN area_sqm IS NULL THEN 1 ELSE 0 END "
                            + "FROM public.property_listings WHERE id=?::uuid",
                    Integer.class, idStr);
            assertThat(areaSqmNull).as(key + ": area_sqm must remain NULL (not computed by backfill)").isOne();

            Integer areaSqftNull = jdbcTemplate.queryForObject(
                    "SELECT CASE WHEN area_sqft IS NULL THEN 1 ELSE 0 END "
                            + "FROM public.property_listings WHERE id=?::uuid",
                    Integer.class, idStr);
            assertThat(areaSqftNull).as(key + ": area_sqft must remain NULL (not computed by backfill)").isOne();

            Integer areaCentNull = jdbcTemplate.queryForObject(
                    "SELECT CASE WHEN area_cent IS NULL THEN 1 ELSE 0 END "
                            + "FROM public.property_listings WHERE id=?::uuid",
                    Integer.class, idStr);
            assertThat(areaCentNull).as(key + ": area_cent must remain NULL (not computed by backfill)").isOne();

            Integer pricePerCentNull = jdbcTemplate.queryForObject(
                    "SELECT CASE WHEN price_per_cent_paise IS NULL THEN 1 ELSE 0 END "
                            + "FROM public.property_listings WHERE id=?::uuid",
                    Integer.class, idStr);
            assertThat(pricePerCentNull)
                    .as(key + ": price_per_cent_paise must remain NULL (not computed by backfill)").isOne();
        }
    }

    @Test
    @DisplayName("AC7c: idempotency — running backfill twice yields identical row counts")
    void backfill_isIdempotent() {
        seedAndBackfill(); // first pass inside seedAndBackfill()

        // Capture counts after first pass
        long residentialUnitCount1 = countTable("listing_residential_unit_details");
        long rentalTermsCount1     = countTable("listing_rental_terms");
        long ownershipCount1       = countTable("listing_ownership_details");
        long commSpaceCount1       = countTable("listing_commercial_space_details");
        long agriCount1            = countTable("listing_agricultural_land_details");

        // Second pass — ON CONFLICT DO NOTHING guarantees counts unchanged
        runBackfillDml();

        assertThat(countTable("listing_residential_unit_details"))
                .as("residential_unit_details count after second pass").isEqualTo(residentialUnitCount1);
        assertThat(countTable("listing_rental_terms"))
                .as("rental_terms count after second pass").isEqualTo(rentalTermsCount1);
        assertThat(countTable("listing_ownership_details"))
                .as("ownership_details count after second pass").isEqualTo(ownershipCount1);
        assertThat(countTable("listing_commercial_space_details"))
                .as("commercial_space_details count after second pass").isEqualTo(commSpaceCount1);
        assertThat(countTable("listing_agricultural_land_details"))
                .as("agri_land_details count after second pass").isEqualTo(agriCount1);
    }

    @Test
    @DisplayName("AC7d: ON DELETE CASCADE — deleting a listing removes its detail row")
    void cascade_deleteListingRemovesDetailRow() {
        java.util.Map<String, UUID> ids = seedAndBackfill();

        UUID houseId = ids.get("house");
        // Verify it has a detail row
        Integer before = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_residential_unit_details WHERE listing_id=?::uuid",
                Integer.class, houseId.toString());
        assertThat(before).as("house must have a residential_unit_details row before delete").isOne();

        // Delete the listing — cascade must remove detail row
        jdbcTemplate.update("DELETE FROM public.property_listings WHERE id=?::uuid", houseId.toString());

        Integer after = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_residential_unit_details WHERE listing_id=?::uuid",
                Integer.class, houseId.toString());
        assertThat(after).as("residential_unit_details row must be removed by ON DELETE CASCADE").isZero();
    }

    @Test
    @DisplayName("AC7e: child tables exist and are EMPTY after migration (no legacy data)")
    void childTables_existAndEmpty() {
        // Child tables are created EMPTY by V102; no backfill DML populates them.
        // We verify schema existence (already done in AC1) and zero rows here.
        assertThat(countTable("listing_amenities")).as("listing_amenities must be empty").isZero();
        assertThat(countTable("listing_suitable_uses")).as("listing_suitable_uses must be empty").isZero();
        assertThat(countTable("listing_location_features")).as("listing_location_features must be empty").isZero();
        assertThat(countTable("listing_agri_crops")).as("listing_agri_crops must be empty").isZero();
    }

    @Test
    @DisplayName("AC7f: zero orphaned detail rows — every detail row's listing_id exists in property_listings")
    void noOrphanedDetailRows() {
        seedAndBackfill();

        for (String table : List.of(
                "listing_residential_unit_details",
                "listing_commercial_space_details",
                "listing_commercial_building_details",
                "listing_warehouse_details",
                "listing_commercial_land_details",
                "listing_agricultural_land_details",
                "listing_rental_terms",
                "listing_ownership_details")) {
            Integer orphans = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM public." + table + " d "
                            + "WHERE NOT EXISTS "
                            + "(SELECT 1 FROM public.property_listings p WHERE p.id = d.listing_id)",
                    Integer.class);
            assertThat(orphans).as(table + " must have zero orphaned rows").isZero();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private long countTable(String tableName) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public." + tableName,
                Long.class);
        return count == null ? 0 : count;
    }
}
