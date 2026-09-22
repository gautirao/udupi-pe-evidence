package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Issue #2575 — integration coverage for the Commercial acquisition promotion path
 * (V136 staging tables -> {@code promote.sql} -> {@code property_listings}).
 *
 * <p><b>DELIBERATELY UNTAGGED.</b> This class carries no {@code @Tag("integration")}. The pom's
 * surefire config includes {@code **&#47;*IT.java} and excludes the {@code integration} group, so
 * an untagged IT runs under a plain {@code mvn test} while a tagged one is skipped. Each of the
 * four {@code -P} profiles additionally sets surefire {@code <skip>true</skip>} and narrows
 * failsafe to one named file — so a new IT run under any profile would execute NOWHERE and the
 * build would still report success. Run this with no {@code -P}.
 *
 * <p><b>{@code Propagation.NOT_SUPPORTED} is load-bearing, not tidiness.</b> V135's guard is a
 * DEFERRABLE INITIALLY DEFERRED constraint trigger: it fires at COMMIT. {@code @DataJpaTest}
 * rolls back by default and therefore never commits, so under the default propagation the guard
 * would never fire and every negative case here would pass <i>vacuously</i>. These tests commit
 * for real and clean up explicitly instead.
 *
 * <p>The suite asserts the promotion contract in both directions. The convergence test is paired
 * with a guard-has-teeth control: if V135's trigger were dropped or mis-scoped, the convergence
 * assertion alone would still pass over an unguarded database, so the control proves the schema
 * is actually rejecting the state the pipeline is claiming to avoid.
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
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CommercialImportPromotion2575IT {

    // postgis/postgis, not plain postgres: several migrations are PostGIS-dependent. This mirrors
    // ZeroListingAreaVisibilityIT, which is itself untagged and therefore actually runs.
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String OWNER = "e7b61f70-d087-44d8-a81d-7f8a057d2775";

    /** Repo-relative: surefire's working directory is the apps/api module root. */
    private static final Path IMPORT_DIR =
            Path.of("..", "..", "data", "imports", "commercial-inventory-2575");

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Runs a repo SQL file inside ONE explicit transaction with the owner GUC set.
     *
     * <p>The single transaction is part of what is under test: V135's deferred trigger asks its
     * question at COMMIT, so {@code promote.sql} is only correct if the write model and the read
     * model land in the same transaction. Statement-autocommitting the identical SQL would raise.
     */
    private void runSqlFileInOneTransaction(String fileName) throws Exception {
        String sql = Files.readString(IMPORT_DIR.resolve(fileName));
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute("SET LOCAL app.import_owner = '" + OWNER + "'");
                st.execute(sql);
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    private void stageCandidate(int batchId, String sourceId, String propertyType,
                                String subtype, String purpose, Long price, Long rent,
                                String outcome, String rejectReason) {
        stageCandidate(batchId, sourceId, propertyType, subtype, purpose, price, rent,
                outcome, rejectReason, "NUMERIC");
    }

    /**
     * #2606 — same fixture shape, plus an explicit {@code price_status}. Used both for a
     * {@code NUMERIC} row with an overridden status (unused today, kept symmetric with the
     * POR helper below) and, via {@link #stageOnRequestCandidate}, for Price-on-Request rows.
     */
    private void stageCandidate(int batchId, String sourceId, String propertyType,
                                String subtype, String purpose, Long price, Long rent,
                                String outcome, String rejectReason, String priceStatus) {
        jdbc.update("""
                INSERT INTO public.commercial_import_candidate (
                    batch_id, source_platform, source_listing_id, source_url,
                    source_property_type, source_transaction_type,
                    city, locality, area_key, area_label, latitude, longitude,
                    property_family, property_type, commercial_subtype, listing_purpose,
                    price, price_paise, monthly_rent, price_status, total_floors,
                    title, outcome, reject_reason)
                VALUES (?, '99acres', ?, 'https://example.invalid/l/' || ?,
                    'synthetic', ?, 'Udupi', 'Manipal', 'IN|KA|Udupi|Manipal', 'Manipal',
                    13.35, 74.79, 'COMMERCIAL', ?, ?, ?, ?, ?, ?, ?, 3,
                    'IT fixture ' || ?, ?, ?)
                """,
                batchId, sourceId, sourceId,
                "sale".equals(purpose) ? "Sale" : "Rent",
                propertyType, subtype, purpose,
                price, price == null ? null : price * 100, rent, priceStatus,
                sourceId, outcome, rejectReason);
    }

    /**
     * #2606 — a housing.com-shaped Price-on-Request candidate: no price on any axis, staged
     * with {@code price_status='ON_REQUEST'}. Mirrors the real 11 reprocessed #2575/#2606 rows
     * (COMMERCIAL_BUILDING, SALE, price=None, displayPrice='Price on Request') at the field
     * granularity this table stores.
     */
    private void stageOnRequestCandidate(int batchId, String sourceId, String propertyType, String subtype) {
        stageCandidate(batchId, sourceId, propertyType, subtype, "sale", null, null,
                "STAGED", null, "ON_REQUEST");
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0L : n;
    }

    // ── fixture ──────────────────────────────────────────────────────────────

    @BeforeEach
    void seed() throws Exception {
        // NOT_SUPPORTED means nothing rolls back for us; clean explicitly and in FK order.
        jdbc.update("DELETE FROM public.commercial_import_candidate");
        jdbc.update("DELETE FROM public.commercial_import_batch");
        jdbc.update("DELETE FROM public.property_listings WHERE parsed_data->>'importIssue' = '2575'");

        jdbc.update("""
                INSERT INTO public.commercial_import_batch
                    (import_issue, source_platform, city, actor, capture_file, fetched_count)
                VALUES (2575, '99acres', 'Udupi', 'memo23/99acres-property-scraper', 'it-fixture', 6)
                """);
        Integer batchId = jdbc.queryForObject(
                "SELECT id FROM public.commercial_import_batch ORDER BY id DESC LIMIT 1", Integer.class);

        // All five canonical subtypes across all four property_type values. The real Udupi capture
        // only populates three of the five, so a partition test against it alone could not tell a
        // working axis from an empty one.
        stageCandidate(batchId, "IT-SHOP-1", "commercial", "SHOP", "sale", 5_000_000L, null, "STAGED", null);
        stageCandidate(batchId, "IT-OFFICE-1", "commercial", "OFFICE", "sale", 7_000_000L, null, "STAGED", null);
        stageCandidate(batchId, "IT-BUILDING-1", "commercial_building", "BUILDING", "sale", 9_000_000L, null, "STAGED", null);
        stageCandidate(batchId, "IT-WAREHOUSE-1", "warehouse", "WAREHOUSE", "sale", 4_000_000L, null, "STAGED", null);
        stageCandidate(batchId, "IT-LAND-1", "commercial_land", "LAND", "sale", 3_000_000L, null, "STAGED", null);
        // A Rent row — the real capture has none, so without this the rent money contract is untestable.
        stageCandidate(batchId, "IT-RENT-1", "commercial", "SHOP", "rent", null, 45_000L, "STAGED", null);
        // A rejected row that must never reach property_listings.
        stageCandidate(batchId, "IT-REJECT-1", "commercial", null, "sale", 1_000_000L, null,
                "REJECTED", "ambiguous_or_missing_type");
    }

    // ── tests ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("promotion writes DRAFT, never LIVE — scraping alone cannot publish a listing")
    void promotionWritesDraftNeverLive() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        assertThat(count("SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'"))
                .as("six STAGED candidates promote; the REJECTED one must not")
                .isEqualTo(6);
        assertThat(count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND status <> 'DRAFT'
                """))
                .as("no promoted row may carry any status other than DRAFT")
                .isZero();
    }

    @Test
    @DisplayName("a REJECTED candidate is never promoted")
    void rejectedCandidateIsNeverPromoted() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        assertThat(count("""
                SELECT count(*) FROM property_listings
                WHERE id = (md5('99acres:IT-REJECT-1'))::uuid
                """))
                .as("the rejected candidate must have no listing row")
                .isZero();
        assertThat(jdbc.queryForObject(
                "SELECT outcome FROM commercial_import_candidate WHERE source_listing_id='IT-REJECT-1'",
                String.class))
                .as("and must still be REJECTED, not swept to PROMOTED")
                .isEqualTo("REJECTED");
    }

    @Test
    @DisplayName("V135 convergence: every promoted 'commercial' row's V102 projection matches V104")
    void v135ProjectionConverges() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN listing_commercial_space_details d ON d.listing_id = pl.id
                WHERE pl.parsed_data->>'importIssue'='2575'
                  AND (d.commercial_subtype IS DISTINCT FROM pl.commercial_subtype)
                """))
                .as("write model (V104) and read model (V102) must agree for every commercial row")
                .isZero();

        // The self-describing types project into their OWN tables, which carry no subtype column.
        assertThat(count("""
                SELECT count(*) FROM listing_commercial_building_details d
                JOIN property_listings pl ON pl.id = d.listing_id
                WHERE pl.parsed_data->>'importIssue'='2575'
                """)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM listing_warehouse_details d
                JOIN property_listings pl ON pl.id = d.listing_id
                WHERE pl.parsed_data->>'importIssue'='2575'
                """)).isEqualTo(1);
        assertThat(count("""
                SELECT count(*) FROM listing_commercial_land_details d
                JOIN property_listings pl ON pl.id = d.listing_id
                WHERE pl.parsed_data->>'importIssue'='2575'
                """)).isEqualTo(1);
    }

    @Test
    @DisplayName("CONTROL: V135's guard actually rejects an unconverged write (so convergence is not vacuous)")
    void v135GuardHasTeeth() {
        // Without this control, v135ProjectionConverges would pass identically against a database
        // where the trigger had been dropped or mis-scoped — it would only be asserting that
        // promote.sql wrote two matching values, not that the schema forbids the alternative.
        //
        // SET CONSTRAINTS ... IMMEDIATE forces the DEFERRED trigger to fire at statement time.
        assertThatThrownBy(() -> {
            try (Connection c = dataSource.getConnection()) {
                c.setAutoCommit(false);
                try (Statement st = c.createStatement()) {
                    st.execute("SET CONSTRAINTS ALL IMMEDIATE");
                    st.execute("""
                            INSERT INTO public.property_listings
                                (id, created_by, property_type, listing_family, status,
                                 commercial_subtype, parsed_data)
                            VALUES ((md5('99acres:IT-UNCONVERGED'))::uuid,
                                    '%s', 'commercial', 'COMMERCIAL', 'DRAFT', 'SHOP',
                                    '{"importIssue":"2575"}'::jsonb)
                            """.formatted(OWNER));
                    c.commit();
                } catch (SQLException e) {
                    c.rollback();
                    throw e;
                }
            }
        })
                .as("a commercial row with a subtype but no V102 projection row must be rejected")
                .hasMessageContaining("commercial_subtype projection missing");
    }

    @Test
    @DisplayName("re-promotion is idempotent — a rerun updates in place, never duplicates")
    void promotionIsIdempotent() throws Exception {
        runSqlFileInOneTransaction("promote.sql");
        long afterFirst = count(
                "SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'");

        // Re-arm: promote.sql consumes STAGED rows, so a second run needs them staged again. That
        // is the realistic shape of a re-import — the same source rows presented a second time.
        jdbc.update("UPDATE commercial_import_candidate SET outcome='STAGED' WHERE outcome='PROMOTED'");
        runSqlFileInOneTransaction("promote.sql");

        assertThat(count("SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'"))
                .as("second promotion must add zero rows")
                .isEqualTo(afterFirst);
    }

    @Test
    @DisplayName("a corrected source value UPDATES the listing rather than silently no-opping")
    void sourceCorrectionUpdatesRatherThanNoOp() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        // This is the failure mode #2575 names and the existing #2304 import.sql exhibits: it uses
        // ON CONFLICT DO NOTHING throughout, so a re-run after a source correction reports success
        // while changing nothing.
        jdbc.update("""
                UPDATE commercial_import_candidate
                SET title = 'IT fixture CORRECTED', outcome = 'STAGED'
                WHERE source_listing_id = 'IT-SHOP-1'
                """);
        runSqlFileInOneTransaction("promote.sql");

        assertThat(jdbc.queryForObject(
                "SELECT title FROM property_listings WHERE id = (md5('99acres:IT-SHOP-1'))::uuid",
                String.class))
                .as("the corrected title must reach the listing")
                .isEqualTo("IT fixture CORRECTED");
    }

    @Test
    @DisplayName("zero non-Commercial leakage, and the subtype axis partitions the family exactly")
    void subtypeAxisPartitionsCommercialFamily() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        assertThat(count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND listing_family <> 'COMMERCIAL'
                """))
                .as("no non-Commercial row may be promoted by this pipeline")
                .isZero();

        long broad = count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND listing_family = 'COMMERCIAL'
                """);
        List<Map<String, Object>> bySubtype = jdbc.queryForList("""
                SELECT commercial_subtype AS s, count(*) AS n FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' GROUP BY 1
                """);
        long summed = bySubtype.stream().mapToLong(r -> ((Number) r.get("n")).longValue()).sum();

        assertThat(summed)
                .as("subtype counts must sum to broad Commercial — a leftover means a mis-typed "
                    + "row or an inert filter")
                .isEqualTo(broad);
        assertThat(bySubtype).as("all five canonical subtypes are represented").hasSize(5);
    }

    @Test
    @DisplayName("Sale and Rent money stay separate — no sale-price band on a Rent row")
    void saleAndRentMoneySemanticsStaySeparate() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        Map<String, Object> rent = jdbc.queryForMap("""
                SELECT price, price_paise, monthly_rent, listing_purpose
                FROM property_listings WHERE id = (md5('99acres:IT-RENT-1'))::uuid
                """);
        assertThat(rent.get("listing_purpose")).isEqualTo("rent");
        assertThat(rent.get("monthly_rent")).as("a rent row carries monthly rent").isNotNull();
        assertThat(rent.get("price")).as("and NO sale price").isNull();
        assertThat(rent.get("price_paise")).as("and no sale price band").isNull();

        Map<String, Object> sale = jdbc.queryForMap("""
                SELECT price, price_paise, monthly_rent FROM property_listings
                WHERE id = (md5('99acres:IT-SHOP-1'))::uuid
                """);
        assertThat(sale.get("price")).isNotNull();
        assertThat(sale.get("monthly_rent")).as("a sale row carries no monthly rent").isNull();
    }

    // ── #2606: Price on Request ─────────────────────────────────────────────────

    @Test
    @DisplayName("#2606: a Price-on-Request candidate promotes with price_status=ON_REQUEST and "
            + "price/price_paise/monthly_rent all NULL — never a sentinel")
    void priceOnRequestPromotesWithNullPriceAndOnRequestStatus() throws Exception {
        Integer batchId = jdbc.queryForObject(
                "SELECT id FROM public.commercial_import_batch ORDER BY id DESC LIMIT 1", Integer.class);
        stageOnRequestCandidate(batchId, "IT-POR-1", "commercial_building", null);

        runSqlFileInOneTransaction("promote.sql");

        Map<String, Object> row = jdbc.queryForMap("""
                SELECT price, price_paise, monthly_rent, price_status
                FROM property_listings WHERE id = (md5('99acres:IT-POR-1'))::uuid
                """);
        assertThat(row.get("price_status")).isEqualTo("ON_REQUEST");
        assertThat(row.get("price")).as("no sentinel sale price").isNull();
        assertThat(row.get("price_paise")).as("no sentinel paise band").isNull();
        assertThat(row.get("monthly_rent")).as("no sentinel rent either").isNull();
    }

    @Test
    @DisplayName("#2606: a NUMERIC candidate keeps price_status=NUMERIC through promotion")
    void numericCandidateKeepsNumericPriceStatus() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        assertThat(jdbc.queryForObject("""
                SELECT price_status FROM property_listings WHERE id = (md5('99acres:IT-SHOP-1'))::uuid
                """, String.class)).isEqualTo("NUMERIC");
    }

    @Test
    @DisplayName("#2606: priceMin/priceMax numeric filtering excludes ON_REQUEST listings by "
            + "ordinary SQL NULL semantics — never misclassified as a ₹0 listing")
    void priceFilterExcludesOnRequestListings() throws Exception {
        Integer batchId = jdbc.queryForObject(
                "SELECT id FROM public.commercial_import_batch ORDER BY id DESC LIMIT 1", Integer.class);
        stageOnRequestCandidate(batchId, "IT-POR-FILTER-1", "commercial_building", null);
        runSqlFileInOneTransaction("promote.sql");

        // Mirrors DiscoverListingPredicateBuilder's price-range clause exactly:
        // "AND pl.price_paise >= ?" / "AND pl.price_paise <= ?".
        long inZeroToHugeRange = count("""
                SELECT count(*) FROM property_listings
                WHERE id = (md5('99acres:IT-POR-FILTER-1'))::uuid
                  AND price_paise >= 0 AND price_paise <= 999999999999
                """);
        assertThat(inZeroToHugeRange)
                .as("an ON_REQUEST listing's NULL price_paise fails every numeric range predicate, "
                    + "including a [0, huge] range that would wrongly include a fabricated ₹0")
                .isZero();

        // Un-filtered, the same row IS visible — proving the exclusion above comes from the price
        // predicate, not from the row being absent for some unrelated reason.
        long unfiltered = count("""
                SELECT count(*) FROM property_listings WHERE id = (md5('99acres:IT-POR-FILTER-1'))::uuid
                """);
        assertThat(unfiltered).as("CONTROL: the row exists and is promoted").isEqualTo(1);
    }

    @Test
    @DisplayName("#2606: reprocessing the 11 deferred Price-on-Request rows is idempotent — "
            + "pre-existing NUMERIC listings are untouched, exactly 11 ON_REQUEST listings are "
            + "added once, and a second run adds zero duplicates")
    void elevenPriceOnRequestRowsReprocessIdempotently() throws Exception {
        Integer batchId = jdbc.queryForObject(
                "SELECT id FROM public.commercial_import_batch ORDER BY id DESC LIMIT 1", Integer.class);

        // Baseline: promote the @BeforeEach fixture first, exactly as a prior import run would
        // have already happened before #2606 reprocessing.
        runSqlFileInOneTransaction("promote.sql");
        long baselineCount = count(
                "SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'");
        assertThat(baselineCount).as("six STAGED fixture rows promote first, as the pre-existing state")
                .isEqualTo(6);

        // The 11 deferred housing.com Price-on-Request rows, reprocessed under #2606. Real source
        // ids from the #2575/#2606 reject report (all Bengaluru COMMERCIAL_BUILDING SALE rows).
        List<String> porSourceIds = List.of(
                "226048", "306386", "307211", "308173", "313368",
                "311158", "320144", "320131", "322822", "326643", "311080");
        for (String sourceId : porSourceIds) {
            stageOnRequestCandidate(batchId, sourceId, "commercial_building", null);
        }

        // ── Run 1: promote the 11 new ON_REQUEST rows alongside the untouched baseline. ────────
        runSqlFileInOneTransaction("promote.sql");

        long afterFirstRun = count(
                "SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'");
        assertThat(afterFirstRun)
                .as("existing %d + 11 new Price-on-Request rows = %d", baselineCount, baselineCount + 11)
                .isEqualTo(baselineCount + 11);

        long newOnRequestCount = count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND price_status = 'ON_REQUEST'
                """);
        assertThat(newOnRequestCount).as("exactly 11 new Price-on-Request listings").isEqualTo(11);

        long baselineStillNumeric = count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND price_status = 'NUMERIC'
                """);
        assertThat(baselineStillNumeric)
                .as("the pre-existing baseline rows are untouched and remain NUMERIC")
                .isEqualTo(baselineCount);

        // Every ON_REQUEST row genuinely carries no price — the count above is not hiding a
        // sentinel value that happened to also be counted as ON_REQUEST.
        long onRequestWithAnyPrice = count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND price_status = 'ON_REQUEST'
                  AND (price IS NOT NULL OR price_paise IS NOT NULL OR monthly_rent IS NOT NULL)
                """);
        assertThat(onRequestWithAnyPrice).as("no ON_REQUEST row carries a stray price value").isZero();

        // ── Run 2: re-arm the 11 rows as STAGED (the realistic shape of a re-import presenting the
        // same 11 source rows again) and promote again — this exercises the
        // (source_platform, source_listing_id) identity constraint for real, not merely asserts it.
        jdbc.update("""
                UPDATE commercial_import_candidate SET outcome='STAGED'
                WHERE source_listing_id = ANY(?) AND outcome='PROMOTED'
                """, (Object) porSourceIds.toArray(new String[0]));
        runSqlFileInOneTransaction("promote.sql");

        long afterSecondRun = count(
                "SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'");
        assertThat(afterSecondRun)
                .as("second promotion of the same 11 rows must add ZERO new rows — an UPDATE of the "
                    + "same identity, never a duplicate")
                .isEqualTo(afterFirstRun);

        long distinctPorIds = count("""
                SELECT count(DISTINCT id) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND price_status = 'ON_REQUEST'
                """);
        assertThat(distinctPorIds)
                .as("still exactly 11 DISTINCT Price-on-Request listing ids — zero duplicates of the "
                    + "old (or the new) records")
                .isEqualTo(11);
    }

    @Test
    @DisplayName("rollback removes the listings and returns candidates to STAGED")
    void rollbackRestoresCleanState() throws Exception {
        runSqlFileInOneTransaction("promote.sql");
        assertThat(count("SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'"))
                .isEqualTo(6);

        runSqlFileInOneTransaction("promote-rollback.sql");

        assertThat(count("SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'"))
                .as("every promoted listing is removed")
                .isZero();
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='PROMOTED'"))
                .as("no candidate is left claiming to be promoted")
                .isZero();
        assertThat(count("SELECT count(*) FROM commercial_import_candidate"))
                .as("rollback undoes the PROMOTION, not the acquisition — staging rows survive")
                .isEqualTo(7);
        assertThat(count("SELECT count(*) FROM listing_commercial_space_details d "
                + "JOIN property_listings pl ON pl.id=d.listing_id"))
                .as("detail rows cascade with their listing")
                .isZero();
    }

    @Test
    @DisplayName("materializes commercial source images into listing_images with position, limit, deduplication and idempotency (#2624)")
    void promoteMaterializesListingImages() throws Exception {
        // Set up custom raw_payload for candidates
        // 1. IT-SHOP-1: 2 valid HTTPS images
        jdbc.update("""
                UPDATE public.commercial_import_candidate
                SET raw_payload = jsonb_build_object('images', jsonb_build_array(
                    'https://imagecdn.99acres.com/a.jpg',
                    'https://imagecdn.99acres.com/b.jpg'
                ))
                WHERE source_listing_id = 'IT-SHOP-1'
                """);

        // 2. IT-OFFICE-1: zero images
        jdbc.update("""
                UPDATE public.commercial_import_candidate
                SET raw_payload = jsonb_build_object('images', jsonb_build_array())
                WHERE source_listing_id = 'IT-OFFICE-1'
                """);

        // 3. IT-BUILDING-1: 12 images (should cap at 10)
        jdbc.update("""
                UPDATE public.commercial_import_candidate
                SET raw_payload = jsonb_build_object('images', jsonb_build_array(
                    'https://imagecdn.99acres.com/img0.jpg',
                    'https://imagecdn.99acres.com/img1.jpg',
                    'https://imagecdn.99acres.com/img2.jpg',
                    'https://imagecdn.99acres.com/img3.jpg',
                    'https://imagecdn.99acres.com/img4.jpg',
                    'https://imagecdn.99acres.com/img5.jpg',
                    'https://imagecdn.99acres.com/img6.jpg',
                    'https://imagecdn.99acres.com/img7.jpg',
                    'https://imagecdn.99acres.com/img8.jpg',
                    'https://imagecdn.99acres.com/img9.jpg',
                    'https://imagecdn.99acres.com/img10.jpg',
                    'https://imagecdn.99acres.com/img11.jpg'
                ))
                WHERE source_listing_id = 'IT-BUILDING-1'
                """);

        // 4. IT-WAREHOUSE-1: duplicates (a.jpg, a.jpg, b.jpg)
        jdbc.update("""
                UPDATE public.commercial_import_candidate
                SET raw_payload = jsonb_build_object('images', jsonb_build_array(
                    'https://imagecdn.99acres.com/dup-a.jpg',
                    'https://imagecdn.99acres.com/dup-a.jpg',
                    'https://imagecdn.99acres.com/dup-b.jpg'
                ))
                WHERE source_listing_id = 'IT-WAREHOUSE-1'
                """);

        // Run promote.sql
        runSqlFileInOneTransaction("promote.sql");

        // Assert IT-SHOP-1 images
        List<Map<String, Object>> shopImages = jdbc.queryForList("""
                SELECT storage_path, url, position
                FROM public.listing_images
                WHERE listing_id = (md5('99acres:IT-SHOP-1'))::uuid
                ORDER BY position ASC
                """);
        assertThat(shopImages).hasSize(2);
        assertThat(shopImages.get(0).get("position")).isEqualTo(0);
        assertThat(shopImages.get(0).get("storage_path")).isEqualTo("external:https://imagecdn.99acres.com/a.jpg");
        assertThat(shopImages.get(0).get("url")).isEqualTo("https://imagecdn.99acres.com/a.jpg");
        assertThat(shopImages.get(1).get("position")).isEqualTo(1);
        assertThat(shopImages.get(1).get("storage_path")).isEqualTo("external:https://imagecdn.99acres.com/b.jpg");

        // Assert IT-OFFICE-1 images
        assertThat(count("SELECT count(*) FROM public.listing_images WHERE listing_id = (md5('99acres:IT-OFFICE-1'))::uuid"))
                .isZero();

        // Assert IT-BUILDING-1 images (capped at 10)
        List<Map<String, Object>> buildingImages = jdbc.queryForList("""
                SELECT storage_path, url, position
                FROM public.listing_images
                WHERE listing_id = (md5('99acres:IT-BUILDING-1'))::uuid
                ORDER BY position ASC
                """);
        assertThat(buildingImages).hasSize(10);
        assertThat(buildingImages.get(9).get("position")).isEqualTo(9);

        // Assert IT-WAREHOUSE-1 images (deduplicated: dup-a.jpg @ 0, dup-b.jpg @ 1)
        List<Map<String, Object>> warehouseImages = jdbc.queryForList("""
                SELECT storage_path, url, position
                FROM public.listing_images
                WHERE listing_id = (md5('99acres:IT-WAREHOUSE-1'))::uuid
                ORDER BY position ASC
                """);
        assertThat(warehouseImages).hasSize(2);
        assertThat(warehouseImages.get(0).get("storage_path")).isEqualTo("external:https://imagecdn.99acres.com/dup-a.jpg");
        assertThat(warehouseImages.get(0).get("position")).isEqualTo(0);
        assertThat(warehouseImages.get(1).get("storage_path")).isEqualTo("external:https://imagecdn.99acres.com/dup-b.jpg");
        assertThat(warehouseImages.get(1).get("position")).isEqualTo(1);

        // Re-run promotion / backfill: idempotency check (second run inserts 0 new rows)
        long countBefore = count("SELECT count(*) FROM public.listing_images");
        runSqlFileInOneTransaction("backfill-listing-images.sql");
        long countAfter = count("SELECT count(*) FROM public.listing_images");
        assertThat(countAfter).isEqualTo(countBefore);
    }

    @Test
    @DisplayName("preserves pre-existing dealer uploaded images without deletion or clobbering (#2624)")
    void existingUploadedImagesArePreserved() throws Exception {
        runSqlFileInOneTransaction("promote.sql");

        // Insert a pre-existing dealer uploaded image row for a promoted listing
        String dealerPath = "listings/dealer-101/shop-hero-photo.jpg";
        jdbc.update("""
                INSERT INTO public.listing_images (id, listing_id, storage_path, url, position)
                VALUES (gen_random_uuid(), (md5('99acres:IT-SHOP-1'))::uuid, ?, ?, 99)
                """,
                dealerPath, "https://storage.supabase.co/" + dealerPath);

        // Run backfill again
        runSqlFileInOneTransaction("backfill-listing-images.sql");

        // Assert pre-existing dealer row exists untouched
        long dealerRowCount = count("SELECT count(*) FROM public.listing_images WHERE storage_path = '" + dealerPath + "'");
        assertThat(dealerRowCount).as("pre-existing dealer uploaded image row must be preserved").isEqualTo(1);
    }
}
