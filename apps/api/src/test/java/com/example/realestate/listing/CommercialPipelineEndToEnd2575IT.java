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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Issue #2575 — the WHOLE pipeline in one motion: capture → adapter output → generated load SQL →
 * V136 staging → {@code promote.sql} → {@code property_listings}.
 *
 * <p><b>Why this exists even though each stage is already tested.</b> Every stage had its own
 * green test while the chain had none. This lane has already been bitten twice by exactly that
 * shape — the adapter and V136 each passed while the join between them was broken, and the
 * generated SQL passed its own checker while being unappliable to Postgres. A suite of green
 * stages is not evidence that the pipeline works end to end.
 *
 * <p><b>This is also the only way to demonstrate the V135 safety property the #2594 sync bought.</b>
 * The five office rows now carry {@code property_type='commercial'} and therefore fall INSIDE
 * V135's deferred-trigger scope, where before they sat in {@code listing_commercial_building_details}
 * which has no {@code commercial_subtype} column and lies outside the trigger entirely. Asserting
 * that from staged data shows only the classification; promoting them is what proves the guard
 * accepts the converged write and would have rejected the alternative.
 *
 * <p><b>Runs against a throwaway database, never production.</b> Promotion into a real environment
 * remains owner-gated; what is exercised here is that the artefacts are correct, not that anything
 * may be published. Promotion writes {@code DRAFT} — scraping alone cannot make a listing LIVE.
 *
 * <p>Untagged and no {@code -P}, for the reason recorded throughout: surefire includes
 * {@code **&#47;*IT.java} and excludes the {@code integration} group, while every profile skips
 * surefire and narrows failsafe to one named file.
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
class CommercialPipelineEndToEnd2575IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final Path IMPORTS =
            Path.of("..", "..", "data", "imports", "commercial-inventory-2575");

    private static final String UDUPI_SQL = "udupi-load-staging.sql";
    private static final String BLR_SQL = "bengaluru-load-staging.sql";
    private static final String MLR_SQL = "mangalore-load-staging.sql";

    private static final String OWNER = "e7b61f70-d087-44d8-a81d-7f8a057d2775";

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    /** Applies a generated load file verbatim; it carries its own BEGIN/COMMIT. */
    private void applyLoad(String fileName) throws Exception {
        String sql = Files.readString(IMPORTS.resolve(fileName));
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    /**
     * Runs promote.sql in ONE transaction with the owner GUC set.
     *
     * <p>The single transaction is part of what is under test: V135's trigger is DEFERRED and asks
     * its question at COMMIT, so promote.sql is only correct if the write model and the read model
     * land together. Statement-autocommitting the same SQL would raise.
     */
    private void promote() throws Exception {
        String sql = Files.readString(IMPORTS.resolve("promote.sql"));
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

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0L : n;
    }

    /**
     * Area keys that {@code promotedListingsResolveToSeededAreas} introduces by applying #2304's
     * area-seed.sql mid-method. They are seeded by that artefact, never by a migration — which is
     * the whole point of that test.
     */
    private static final String[] SEED_ONLY_AREA_KEYS = {
            "IN|KA|Udupi|Santhekatte", "IN|KA|Udupi|Brahmagiri", "IN|KA|Udupi|Kinnimulki",
            "IN|KA|Udupi|Kuthpady", "IN|KA|Udupi|Ambagilu", "IN|KA|Udupi|Adi-Udupi"
    };

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM public.property_listings WHERE parsed_data->>'importIssue' = '2575'");
        jdbc.update("DELETE FROM public.commercial_import_candidate");
        jdbc.update("DELETE FROM public.commercial_import_batch");

        // IDEMPOTENCE ACROSS CONTAINER REUSE. promotedListingsResolveToSeededAreas applies
        // area-seed.sql at its end, and nothing above removes what that adds. On a REUSED
        // container the second execution therefore starts with those areas already present, so
        // its `isEqualTo(3)` unresolved-count reads 0 and the test fails.
        //
        // It fails RED, not green — so it could never have masked the fix it guards — but a suite
        // that only passes on a fresh container is one that gets distrusted for the wrong reason,
        // and a real failure later gets waved away as "just the container again". Raised as LOW-4
        // in the exact-head review of f486ffa1.
        //
        // Deliberately keyed to the SIX seed-only keys that area-seed.sql actually inserts, rather
        // than clearing `areas` wholesale: every other area row comes from a migration, and
        // deleting those would silently rewrite the fixture the rest of this class resolves against.
        //
        // This comment said "two" until an exact-head reviewer caught it. The original finding
        // named two keys; the seed file inserts six, and the constant was widened to six while the
        // prose was left behind — a comment that falsified itself within hours of being written,
        // which is the same defect class this lane keeps correcting in other people's code.
        for (String areaKey : SEED_ONLY_AREA_KEYS) {
            jdbc.update("DELETE FROM public.areas WHERE area_key = ?", areaKey);
        }
    }

    @Test
    @DisplayName("capture → staging → promotion carries all 61 rows, as DRAFT, across all three cities")
    void wholeChainCarriesAllThreeCities() throws Exception {
        applyLoad(UDUPI_SQL);
        applyLoad(BLR_SQL);
        applyLoad(MLR_SQL);
        promote();

        assertThat(count("SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'"))
                .as("11 Udupi + 32 Bengaluru + 18 Mangalore staged candidates become listings")
                .isEqualTo(61);
        assertThat(count("""
                SELECT count(*) FROM property_listings
                WHERE parsed_data->>'importIssue'='2575' AND status <> 'DRAFT'
                """))
                .as("scraping alone cannot make a listing LIVE")
                .isZero();
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='PROMOTED'"))
                .isEqualTo(61);
    }

    @Test
    @DisplayName("the 239 rejected candidates are never promoted — a reject is not a slow accept")
    void rejectedCandidatesNeverPromote() throws Exception {
        applyLoad(UDUPI_SQL);
        applyLoad(BLR_SQL);
        applyLoad(MLR_SQL);
        promote();

        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='REJECTED'"))
                .as("89 Udupi + 68 Bengaluru + 82 Mangalore rejects remain rejected")
                .isEqualTo(239);
        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE outcome='REJECTED' AND promoted_listing_id IS NOT NULL
                """))
                .as("no rejected candidate acquires a listing id")
                .isZero();
    }

    @Test
    @DisplayName("Mangalore promotion path — 18 accepted rows become DRAFT, resolve to ACTIVE areas, route to detail tables")
    void mangalorePromotionPathContract() throws Exception {
        applyLoad(MLR_SQL);
        promote();

        // 18 accepted rows become DRAFT listings only; no LIVE publication
        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                WHERE cic.city = 'Mangalore' AND cic.outcome = 'PROMOTED'
                """))
                .as("18 accepted Mangalore rows become listings")
                .isEqualTo(18);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                WHERE cic.city = 'Mangalore' AND pl.status <> 'DRAFT'
                """))
                .as("all 18 Mangalore listings are DRAFT only, no LIVE publication")
                .isZero();

        // 18 accepted rows resolve against ACTIVE canonical Mangalore areas
        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                JOIN areas a ON a.area_key = pl.area_key AND a.lifecycle_status = 'ACTIVE'
                JOIN cities c ON c.id = a.city_id
                WHERE cic.city = 'Mangalore'
                  AND pl.area_resolution_status = 'RESOLVED'
                  AND pl.area_resolution_method = 'CANONICAL_KEY'
                  AND c.slug = 'mangalore'
                """))
                .as("all 18 accepted Mangalore rows resolve against ACTIVE canonical Mangalore areas")
                .isEqualTo(18);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                LEFT JOIN areas a ON a.area_key = pl.area_key AND a.lifecycle_status = 'ACTIVE'
                WHERE cic.city = 'Mangalore' AND (a.area_key IS NULL OR pl.area_resolution_status <> 'RESOLVED')
                """))
                .as("zero Mangalore listings remain unresolved or point to inactive/missing areas")
                .isZero();

        // OFFICE / SHOP / LAND / WAREHOUSE route to correct typed detail tables (OFFICE 11, SHOP 4, LAND 2, WAREHOUSE 1)
        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                JOIN listing_commercial_space_details d ON d.listing_id = pl.id
                WHERE cic.city = 'Mangalore' AND d.commercial_subtype = 'OFFICE'
                """))
                .as("11 Mangalore office rows route to listing_commercial_space_details as OFFICE")
                .isEqualTo(11);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                JOIN listing_commercial_space_details d ON d.listing_id = pl.id
                WHERE cic.city = 'Mangalore' AND d.commercial_subtype = 'SHOP'
                """))
                .as("4 Mangalore shop rows route to listing_commercial_space_details as SHOP")
                .isEqualTo(4);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                JOIN listing_commercial_land_details d ON d.listing_id = pl.id
                WHERE cic.city = 'Mangalore'
                """))
                .as("2 Mangalore land rows route to listing_commercial_land_details")
                .isEqualTo(2);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN commercial_import_candidate cic ON cic.promoted_listing_id = pl.id
                JOIN listing_warehouse_details d ON d.listing_id = pl.id
                WHERE cic.city = 'Mangalore'
                """))
                .as("1 Mangalore warehouse row routes to listing_warehouse_details")
                .isEqualTo(1);

        // None of the 82 rejected Mangalore rows is promoted
        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate cic
                JOIN commercial_import_batch b ON b.id = cic.batch_id
                WHERE b.city = 'Mangalore' AND cic.outcome = 'REJECTED'
                """))
                .as("82 Mangalore rejects remain rejected")
                .isEqualTo(82);

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate cic
                JOIN commercial_import_batch b ON b.id = cic.batch_id
                WHERE b.city = 'Mangalore' AND cic.outcome = 'REJECTED' AND cic.promoted_listing_id IS NOT NULL
                """))
                .as("none of the 82 rejected Mangalore rows is promoted")
                .isZero();
    }

    @Test
    @DisplayName("V135's guard ACCEPTS the newly in-scope OFFICE rows — the property the sync bought")
    void officeRowsPromoteIntoTheGuardedPath() throws Exception {
        applyLoad(UDUPI_SQL);
        promote();

        // Post-#2594 these carry property_type='commercial', so they route to
        // listing_commercial_space_details and fall INSIDE V135's scope. Pre-sync they were
        // 'commercial_building' — a table with no commercial_subtype column, outside the trigger.
        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN listing_commercial_space_details d ON d.listing_id = pl.id
                WHERE pl.parsed_data->>'importIssue'='2575'
                  AND pl.property_type='commercial' AND d.commercial_subtype='OFFICE'
                """))
                .as("all five Udupi office rows land in the guarded projection as OFFICE")
                .isEqualTo(5);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN listing_commercial_space_details d ON d.listing_id = pl.id
                WHERE pl.parsed_data->>'importIssue'='2575'
                  AND d.commercial_subtype IS DISTINCT FROM pl.commercial_subtype
                """))
                .as("V102 read model agrees with V104 write model — the commit would have failed otherwise")
                .isZero();
    }

    @Test
    @DisplayName("Bengaluru's WAREHOUSE rows route to their own detail table — the axis Udupi could not populate")
    void bengaluruWarehouseRowsRouteByPropertyType() throws Exception {
        applyLoad(BLR_SQL);
        promote();

        assertThat(count("""
                SELECT count(*) FROM listing_warehouse_details d
                JOIN property_listings pl ON pl.id = d.listing_id
                WHERE pl.parsed_data->>'importIssue'='2575'
                """))
                .as("the two WAREHOUSE rows project into listing_warehouse_details, not lcsd")
                .isEqualTo(2);
        assertThat(count("""
                SELECT count(*) FROM listing_commercial_land_details d
                JOIN property_listings pl ON pl.id = d.listing_id
                WHERE pl.parsed_data->>'importIssue'='2575'
                """))
                .as("the six LAND rows project into listing_commercial_land_details")
                .isEqualTo(6);
    }

    @Test
    @DisplayName("PREREQUISITE: promotion needs area rows that live in an import artefact, not in any migration")
    void promotedListingsResolveToSeededAreas() throws Exception {
        applyLoad(UDUPI_SQL);
        applyLoad(BLR_SQL);
        applyLoad(MLR_SQL);
        promote();

        // FOUND BY THIS TEST, not anticipated by it. Migrations alone leave promoted rows pointing
        // at areas that do not exist: two distinct Udupi keys — IN|KA|Udupi|Ambagilu and
        // IN|KA|Udupi|Brahmagiri — across three listings.
        //
        // They are NOT fabricated. Measured across both captures, every area_key the adapter emits
        // is real; these two are simply seeded by #2304's area-seed.sql rather than by Flyway. That
        // makes area-seed.sql a genuine PROMOTION PREREQUISITE for any target database — a caveat
        // the PR body had recorded only for Bengaluru's V71/V106 keys, and which is therefore
        // broader than it was described.
        //
        // Asserted in BOTH directions so the prerequisite is load-bearing rather than narrated:
        // simply applying the seed in setup would have made the failure vanish and taught nobody.
        // If someone later folds those areas into a migration, the first assertion fails — which is
        // the correct way for this claim to die, rather than silently becoming untrue.
        String unresolved = """
                SELECT count(*) FROM property_listings pl
                LEFT JOIN areas a ON a.area_key = pl.area_key
                WHERE pl.parsed_data->>'importIssue'='2575' AND a.area_key IS NULL
                """;

        assertThat(count(unresolved))
                .as("migrations alone do NOT cover every emitted area_key — the prerequisite is real")
                .isEqualTo(3);

        // THE RESOLUTION STATUS MUST REFLECT THAT, not merely be stamped.
        //
        // promote.sql previously wrote 'RESOLVED'/'CANONICAL_KEY' unconditionally — including on
        // these three rows, which match no area at all. The defect did not fail; it recorded a
        // falsehood, and V117's partial index on 'UNRESOLVED' could never surface the row.
        //
        // Note what the assertions ABOVE cannot do: they test the `areas` join, which is
        // independent of these columns. With only those, reverting promote.sql to the
        // unconditional stamp would leave every test in this class green — a fix whose regression
        // nothing catches. These two assertions are what give that fix teeth.
        //
        // V117 defines CANONICAL_KEY as an exact match on the ACTIVE areas.area_key and requires
        // area_resolution_method to be NULL whenever status is UNRESOLVED, so both halves are
        // asserted rather than just the status.
        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                LEFT JOIN areas a ON a.area_key = pl.area_key AND a.lifecycle_status = 'ACTIVE'
                WHERE pl.parsed_data->>'importIssue'='2575' AND a.area_key IS NULL
                  AND pl.area_resolution_status = 'UNRESOLVED'
                  AND pl.area_resolution_method IS NULL
                """))
                .as("a row matching no ACTIVE area is recorded UNRESOLVED with a NULL method — "
                    + "reverting to the unconditional stamp reddens here and nowhere else")
                .isEqualTo(3);

        assertThat(count("""
                SELECT count(*) FROM property_listings pl
                JOIN areas a ON a.area_key = pl.area_key AND a.lifecycle_status = 'ACTIVE'
                WHERE pl.parsed_data->>'importIssue'='2575'
                  AND (pl.area_resolution_status <> 'RESOLVED'
                       OR pl.area_resolution_method <> 'CANONICAL_KEY')
                """))
                .as("and every row that DOES match an ACTIVE area is RESOLVED/CANONICAL_KEY — so "
                    + "the fix is not simply marking everything UNRESOLVED")
                .isZero();

        // #2304's area seed. Idempotent (ON CONFLICT DO NOTHING) and transactional in the file.
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(Files.readString(Path.of(
                    "..", "..", "data", "imports", "udupi-properties-2304", "area-seed.sql")));
        }

        assertThat(count(unresolved))
                .as("with #2304's area-seed.sql applied, every promoted listing resolves to a real area")
                .isZero();
    }

    @Test
    @DisplayName("re-running the whole chain is idempotent — 61 listings, not 122")
    void wholeChainIsIdempotent() throws Exception {
        applyLoad(UDUPI_SQL);
        applyLoad(BLR_SQL);
        applyLoad(MLR_SQL);
        promote();

        // Re-arm: promote.sql consumes STAGED rows. A genuine re-import re-presents the same
        // source rows, which the load upsert returns to STAGED.
        //
        // This block previously ended with `UPDATE ... SET outcome='STAGED' WHERE outcome='PROMOTED'`,
        // which matched ZERO rows — the load upsert had already reset `outcome`. The test was
        // therefore blind to `outcome` being dropped from the upsert's DO UPDATE set: the rerun
        // would promote nothing and this test would still read 43. Asserting that the LOAD
        // performed the reset makes that column load-bearing rather than incidental.
        applyLoad(UDUPI_SQL);
        applyLoad(BLR_SQL);
        applyLoad(MLR_SQL);

        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='PROMOTED'"))
                .as("the load upsert itself returns PROMOTED rows to STAGED — non-zero here would "
                    + "mean `outcome` is not carried by the upsert, the rerun would promote "
                    + "nothing, and the 61 below would pass for the wrong reason")
                .isZero();
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='STAGED'"))
                .as("all 61 staged candidates are re-armed by the LOAD, not by a test fixup")
                .isEqualTo(61);

        promote();

        assertThat(count("SELECT count(*) FROM property_listings WHERE parsed_data->>'importIssue'='2575'"))
                .as("the derived listing id makes a rerun an UPDATE, never a duplicate")
                .isEqualTo(61);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate"))
                .as("300 candidates across all three cities, upserted rather than appended")
                .isEqualTo(300);
    }
}
