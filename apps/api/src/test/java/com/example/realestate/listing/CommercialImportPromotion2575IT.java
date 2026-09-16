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
        jdbc.update("""
                INSERT INTO public.commercial_import_candidate (
                    batch_id, source_platform, source_listing_id, source_url,
                    source_property_type, source_transaction_type,
                    city, locality, area_key, area_label, latitude, longitude,
                    property_family, property_type, commercial_subtype, listing_purpose,
                    price, price_paise, monthly_rent, total_floors,
                    title, outcome, reject_reason)
                VALUES (?, '99acres', ?, 'https://example.invalid/l/' || ?,
                    'synthetic', ?, 'Udupi', 'Manipal', 'IN|KA|Udupi|Manipal', 'Manipal',
                    13.35, 74.79, 'COMMERCIAL', ?, ?, ?, ?, ?, ?, 3,
                    'IT fixture ' || ?, ?, ?)
                """,
                batchId, sourceId, sourceId,
                "sale".equals(purpose) ? "Sale" : "Rent",
                propertyType, subtype, purpose,
                price, price == null ? null : price * 100, rent,
                sourceId, outcome, rejectReason);
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
}
