package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.BadSqlGrammarException;
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
import static org.assertj.core.api.Assertions.tuple;

/**
 * Issue #2607 — integration coverage for the Agricultural staging boundary (V141), proving the
 * discrimination guarantee in BOTH directions against a real Postgres.
 *
 * <p><b>Why both directions, not one containment check.</b> A test that only proves
 * {@code agricultural_import_candidate} rejects a Commercial subtype would leave the OTHER half
 * of the guarantee — that {@code commercial_import_candidate} still rejects
 * {@code AGRICULTURAL_LAND} — unpinned and vulnerable to a future, unnoticed widening of
 * {@code chk_cic_subtype}. Both directions are asserted here as an explicit NEGATIVE, with a
 * positive control alongside each so the negative isn't proving something vacuous (a table that
 * rejects everything would trivially "pass" a one-sided containment check).
 *
 * <p><b>Structural prevention, not just a CHECK.</b> {@code agricultural_import_candidate} has no
 * {@code built_area} column and no bedroom/bathroom/BHK column at all (see the V141 migration
 * header). Two tests below prove this at the schema level: referencing either column raises
 * {@link BadSqlGrammarException} (undefined column), which is a stronger guarantee than a CHECK
 * that could in principle be dropped without anyone noticing.
 *
 * <p><b>{@code Propagation.NOT_SUPPORTED} is load-bearing, not tidiness</b> (mirrors
 * {@code CommercialImportPromotion2575IT}). A failed INSERT poisons the enclosing Postgres
 * transaction — any later statement in that same transaction fails with "current transaction is
 * aborted" rather than running at all. Several tests here deliberately trigger a constraint
 * violation and then assert on state afterward (e.g. that nothing was persisted, or that the next
 * distinct subtype is independently rejected); under the default {@code @DataJpaTest} single
 * rolled-back transaction, the SECOND statement in each of those tests would never actually run.
 * {@code NOT_SUPPORTED} makes every statement auto-commit independently, so a rejected insert
 * cannot poison the assertions or attempts that follow it.
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
class AgriculturalStagingDiscrimination2607IT {

    // postgis/postgis, not plain postgres — mirrors CommercialImportPromotion2575IT; several
    // migrations on this classpath are PostGIS-dependent.
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    /** Repo-relative: surefire's working directory is the apps/api module root. */
    private static final Path IMPORT_DIR =
            Path.of("..", "..", "data", "imports", "agricultural-inventory-2607");

    private int batchId;

    // ── helpers ──────────────────────────────────────────────────────────────

    /**
     * Runs a repo SQL file exactly as psql would: on an autocommit connection, so the file's OWN
     * explicit {@code BEGIN}/{@code COMMIT} pairs (one per city batch, emitted by
     * stage_agricultural_2607.py) govern the transaction boundaries — NOT this method. Unlike
     * CommercialImportPromotion2575IT's runSqlFileInOneTransaction (#2575), which wraps a single
     * promote.sql in one Java-managed transaction because V135's deferred trigger fires at
     * COMMIT, this file already commits per city and wrapping it in a second, outer transaction
     * would nest a redundant {@code BEGIN} inside one already open.
     */
    private void runSqlFile(String fileName) throws Exception {
        String sql = Files.readString(IMPORT_DIR.resolve(fileName));
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(true);
            try (Statement st = c.createStatement()) {
                st.execute(sql);
            }
        }
    }

    @FunctionalInterface
    private interface SqlAction {
        void run() throws SQLException;
    }

    /**
     * Runs {@code body} as {@code pgRole} on {@code conn}, then unconditionally
     * {@code RESET ROLE}s — mirrors V128ContactColumnGrantsIT's {@code asRole} (#2280) exactly,
     * minus the {@code auth.uid()} override this test does not need (anon carries no user id).
     * The reset in a {@code finally} matters because {@code conn} came from the pooled
     * {@link #dataSource}: leaving the connection SET ROLE'd before it returns to the pool would
     * silently hand a later test a connection running as {@code anon}.
     */
    private void asRole(Connection conn, String pgRole, SqlAction body) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("SET ROLE " + pgRole);
        }
        try {
            body.run();
        } finally {
            try (Statement st = conn.createStatement()) {
                st.execute("RESET ROLE");
            }
        }
    }

    private void assertFailsWithSqlState(String expectedState, SqlAction action) {
        try {
            action.run();
            org.junit.jupiter.api.Assertions.fail(
                    "expected a SQLException with SQLState " + expectedState + " but the statement succeeded");
        } catch (SQLException e) {
            assertThat(e.getSQLState()).as("SQLState (message: %s)", e.getMessage()).isEqualTo(expectedState);
        }
    }

    // ── fixture ──────────────────────────────────────────────────────────────

    @BeforeEach
    void seed() {
        batchId = jdbc.queryForObject("""
                INSERT INTO public.agricultural_import_batch
                    (import_issue, source_platform, city)
                VALUES (2607, 'housing.com', 'Udupi')
                RETURNING id
                """, Integer.class);
    }

    private void insertAgriculturalCandidate(String sourceId, String agriculturalSubtype,
                                              String outcome, String rejectReason) {
        jdbc.update("""
                INSERT INTO public.agricultural_import_candidate (
                    batch_id, source_platform, source_listing_id, source_url,
                    city, locality, latitude, longitude,
                    property_family, agricultural_subtype, listing_purpose,
                    area_type, plot_area, plot_area_unit,
                    title, outcome, reject_reason)
                VALUES (?, 'housing.com', ?, 'https://example.invalid/l/' || ?,
                    'Udupi', 'Manipal', 13.35, 74.79,
                    'AGRICULTURAL', ?, 'sale',
                    'Plot Area', 2.5, 'acre',
                    'IT fixture ' || ?, ?, ?)
                """,
                batchId, sourceId, sourceId, agriculturalSubtype, sourceId, outcome, rejectReason);
    }

    private void insertCommercialCandidate(String sourceId, String commercialSubtype,
                                            String outcome, String rejectReason) {
        int commercialBatchId = jdbc.queryForObject("""
                INSERT INTO public.commercial_import_batch
                    (import_issue, source_platform, city)
                VALUES (2575, 'housing.com', 'Udupi')
                RETURNING id
                """, Integer.class);
        jdbc.update("""
                INSERT INTO public.commercial_import_candidate (
                    batch_id, source_platform, source_listing_id, source_url,
                    city, locality, latitude, longitude,
                    property_family, property_type, commercial_subtype, listing_purpose,
                    title, outcome, reject_reason)
                VALUES (?, 'housing.com', ?, 'https://example.invalid/l/' || ?,
                    'Udupi', 'Manipal', 13.35, 74.79,
                    'COMMERCIAL', 'commercial', ?, 'sale',
                    'IT fixture ' || ?, ?, ?)
                """,
                commercialBatchId, sourceId, sourceId, commercialSubtype, sourceId, outcome, rejectReason);
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0L : n;
    }

    // ── discrimination: both directions ─────────────────────────────────────

    @Test
    @DisplayName("positive control: AGRICULTURAL_LAND is accepted into agricultural_import_candidate")
    void agriculturalLandIsAcceptedInItsOwnTable() {
        insertAgriculturalCandidate("AGRI-CTRL-1", "AGRICULTURAL_LAND", "STAGED", null);
        assertThat(count(
                "SELECT count(*) FROM agricultural_import_candidate WHERE source_listing_id='AGRI-CTRL-1'"))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("positive control: a canonical Commercial subtype is accepted into commercial_import_candidate")
    void commercialSubtypeIsAcceptedInItsOwnTable() {
        insertCommercialCandidate("COMM-CTRL-1", "SHOP", "STAGED", null);
        assertThat(count(
                "SELECT count(*) FROM commercial_import_candidate WHERE source_listing_id='COMM-CTRL-1'"))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a Commercial subtype value cannot be written into agricultural_import_candidate.agricultural_subtype")
    void commercialSubtypeCannotEnterAgriculturalCandidate() {
        assertThatThrownBy(() ->
                insertAgriculturalCandidate("AGRI-BAD-1", "SHOP", "STAGED", null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("chk_aic_subtype");
        assertThat(count(
                "SELECT count(*) FROM agricultural_import_candidate WHERE source_listing_id='AGRI-BAD-1'"))
                .isZero();
    }

    @Test
    @DisplayName("REGRESSION: AGRICULTURAL_LAND still cannot be written into commercial_import_candidate.commercial_subtype "
            + "(chk_cic_subtype from V136, unmodified by V141)")
    void agriculturalSubtypeCannotEnterCommercialCandidate() {
        assertThatThrownBy(() ->
                insertCommercialCandidate("COMM-BAD-1", "AGRICULTURAL_LAND", "STAGED", null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("chk_cic_subtype");
        assertThat(count(
                "SELECT count(*) FROM commercial_import_candidate WHERE source_listing_id='COMM-BAD-1'"))
                .isZero();
    }

    @Test
    @DisplayName("every canonical Commercial subtype is individually rejected by agricultural_import_candidate")
    void everyCanonicalCommercialSubtypeIsRejectedFromAgriculturalTable() {
        for (String commercialSubtype : new String[] {"SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND"}) {
            assertThatThrownBy(() ->
                    insertAgriculturalCandidate("AGRI-BAD-" + commercialSubtype, commercialSubtype, "STAGED", null))
                    .as("agricultural_subtype=%s must be rejected", commercialSubtype)
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    // ── structural prevention: the columns simply do not exist ──────────────

    @Test
    @DisplayName("STRUCTURAL: agricultural_import_candidate has no built_area column — a Plot Area "
            + "measurement cannot be written as built-up area because there is nowhere to write it")
    void builtAreaColumnDoesNotExistOnAgriculturalTable() {
        assertThatThrownBy(() ->
                jdbc.queryForObject(
                        "SELECT built_area FROM agricultural_import_candidate LIMIT 1", Object.class))
                .isInstanceOf(BadSqlGrammarException.class);
    }

    @Test
    @DisplayName("STRUCTURAL: agricultural_import_candidate has no bedroom/BHK column at all")
    void bedroomColumnsDoNotExistOnAgriculturalTable() {
        for (String column : new String[] {"bedrooms", "bhk", "washrooms"}) {
            assertThatThrownBy(() ->
                    jdbc.queryForObject(
                            "SELECT " + column + " FROM agricultural_import_candidate LIMIT 1", Object.class))
                    .as("column %s must not exist", column)
                    .isInstanceOf(BadSqlGrammarException.class);
        }
    }

    // ── lifecycle constraints, mirroring V136's own teeth ───────────────────

    @Test
    @DisplayName("a REJECTED candidate must carry a reject_reason")
    void rejectReasonIsForcedOnReject() {
        assertThatThrownBy(() ->
                insertAgriculturalCandidate("AGRI-NOREASON-1", "AGRICULTURAL_LAND", "REJECTED", null))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("chk_aic_reject_reason");
    }

    @Test
    @DisplayName("a PROMOTED candidate cannot also carry a reject_reason")
    void promotedCandidateCannotCarryRejectReason() {
        assertThatThrownBy(() ->
                insertAgriculturalCandidate("AGRI-BADPROMO-1", "AGRICULTURAL_LAND", "PROMOTED", "some_reason"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("chk_aic_promoted_not_rejected");
    }

    @Test
    @DisplayName("area_type, if present, must be Plot Area")
    void areaTypeMustBePlotArea() {
        assertThatThrownBy(() ->
                jdbc.update("""
                        INSERT INTO public.agricultural_import_candidate (
                            batch_id, source_platform, source_listing_id,
                            property_family, agricultural_subtype, area_type, outcome)
                        VALUES (?, 'housing.com', 'AGRI-BUILTUP-1',
                            'AGRICULTURAL', 'AGRICULTURAL_LAND', 'Built Up Area', 'STAGED')
                        """, batchId))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("chk_aic_area_type");
    }

    // ── idempotency: proven by an actual rerun, not merely asserted ─────────

    @Test
    @DisplayName("a rerun on the same (source_platform, source_listing_id) UPDATES rather than duplicates")
    void identityUpsertIsIdempotentOnRerun() {
        String upsertSql = """
                INSERT INTO public.agricultural_import_candidate (
                    batch_id, source_platform, source_listing_id,
                    property_family, agricultural_subtype, listing_purpose,
                    plot_area, outcome)
                VALUES (?, 'housing.com', 'AGRI-RERUN-1',
                    'AGRICULTURAL', 'AGRICULTURAL_LAND', 'sale', ?, 'STAGED')
                ON CONFLICT (source_platform, source_listing_id)
                DO UPDATE SET plot_area = EXCLUDED.plot_area, updated_at = now()
                """;

        jdbc.update(upsertSql, batchId, 2.5);
        assertThat(count(
                "SELECT count(*) FROM agricultural_import_candidate WHERE source_listing_id='AGRI-RERUN-1'"))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT plot_area FROM agricultural_import_candidate WHERE source_listing_id='AGRI-RERUN-1'",
                Double.class))
                .isEqualTo(2.5);

        // The rerun: same identity, a corrected value.
        jdbc.update(upsertSql, batchId, 3.1);
        assertThat(count(
                "SELECT count(*) FROM agricultural_import_candidate WHERE source_listing_id='AGRI-RERUN-1'"))
                .as("rerun must UPDATE, never duplicate")
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT plot_area FROM agricultural_import_candidate WHERE source_listing_id='AGRI-RERUN-1'",
                Double.class))
                .as("rerun must actually update the value, not silently no-op")
                .isEqualTo(3.1);
    }

    // ── the real 34 owner-supplied rows (#2607) ─────────────────────────────

    /**
     * Loads the REAL 34 owner-supplied Agricultural rows (staged via
     * stage_agricultural_2607.py from housing_inventory_2026-09-16/agricultural.jsonl.json — a
     * file supplied out-of-band and never committed to this repo) against a real Postgres, and
     * proves the discrimination guarantee holds against genuine data, not only synthetic
     * fixtures. agricultural-load-staging.sql is a committed, PII-sanitized artifact — the raw
     * seller fields never reach this file or this test.
     */
    @Test
    @DisplayName("#2607: the real 34 owner-supplied rows stage cleanly, split by city exactly as "
            + "the #2575 manifest recorded, and none of them land in commercial_import_candidate")
    void realThirtyFourRowsStageCorrectlyAndDiscriminationHolds() throws Exception {
        runSqlFile("agricultural-load-staging.sql");

        // Scoped to THIS load's own batches — @Transactional(NOT_SUPPORTED) means rows from
        // other test methods in this class persist rather than roll back (see the class
        // javadoc), so an unscoped count over the whole table would also pick up every other
        // test's synthetic fixture rows. stage_agricultural_2607.py's default --actor value is
        // the join key that scopes to exactly this run.
        String scopedCandidates = """
                agricultural_import_candidate c
                JOIN agricultural_import_batch b ON b.id = c.batch_id
                WHERE b.import_issue = 2607 AND b.actor = 'owner-supplied-export'
                """;

        assertThat(count("SELECT count(*) FROM " + scopedCandidates))
                .as("all 34 rows staged")
                .isEqualTo(34);
        assertThat(count("SELECT count(*) FROM " + scopedCandidates + " AND c.outcome='STAGED'"))
                .isEqualTo(34);
        assertThat(count(
                "SELECT count(*) FROM " + scopedCandidates + " AND c.agricultural_subtype <> 'AGRICULTURAL_LAND'"))
                .as("every real row's subtype is exactly AGRICULTURAL_LAND")
                .isZero();

        // The discrimination guarantee, against REAL data: not one of these 34 rows is
        // reachable from commercial_import_candidate — this table simply has zero rows from
        // this load, full stop, because nothing in this pipeline ever writes to it.
        assertThat(count(
                "SELECT count(*) FROM commercial_import_candidate WHERE source_platform='housing.com' "
                        + "AND source_listing_id IN ("
                        + "  SELECT c.source_listing_id FROM " + scopedCandidates + ")"))
                .as("none of the 34 real Agricultural source ids exist in commercial_import_candidate")
                .isZero();

        // By-city split matches the #2575 export manifest's own deferred-rows table exactly
        // (Mysore 30, Udupi 1, Mangalore 3) — a positive, specific control, not a vague count.
        List<Map<String, Object>> byCity = jdbc.queryForList(
                "SELECT c.city, count(*) AS n FROM " + scopedCandidates + " GROUP BY c.city ORDER BY c.city");
        assertThat(byCity).hasSize(3);
        assertThat(byCity).extracting(row -> row.get("city"), row -> ((Number) row.get("n")).longValue())
                .containsExactlyInAnyOrder(
                        tuple("Mangalore", 3L),
                        tuple("Mysore", 30L),
                        tuple("Udupi", 1L));

        // Structural guarantee still holds against this real load too — no plot became a
        // "built-up area" row, because the column to hold one does not exist.
        assertThatThrownBy(() ->
                jdbc.queryForObject(
                        "SELECT built_area FROM agricultural_import_candidate LIMIT 1", Object.class))
                .isInstanceOf(BadSqlGrammarException.class);
    }

    // ── RLS default-deny (security hardening) ───────────────────────────────

    /**
     * Neither table is queried by any Discover/API code path, but that is an application-layer
     * fact, not an authorization boundary. V128's own finding
     * (V128__revoke_browser_contact_column_grants.sql's header) is directly on point: the
     * Supabase platform bootstraps {@code GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,
     * authenticated, service_role} for every table in this schema, outside of and invisible to
     * this migration history. Without RLS, that blanket grant alone would let {@code anon} —
     * the PostgREST role every unauthenticated browser request executes as — read or write
     * these staging rows, including raw_payload and its source provenance, by name.
     *
     * <p><b>Why this test simulates that grant rather than relying on Testcontainers' own
     * (grant-less) baseline.</b> Mirrors the #2280/V128 lesson exactly (see
     * {@code V128ContactColumnGrantsIT}'s class javadoc): the Testcontainers test-stub roles
     * (db/test-stubs/beforeMigrate.sql) create {@code anon}/{@code authenticated} but grant them
     * nothing, so a naive "anon is denied" assertion here would pass even WITHOUT V141's RLS —
     * for the wrong reason (an absent GRANT, not a working row-security policy). Granting the
     * baseline table-wide privilege first, then proving {@code anon} still sees zero rows and
     * still cannot INSERT, is what actually exercises RLS as the boundary.
     */
    @Test
    @DisplayName("#2607 security hardening: RLS denies anon even when anon holds the Supabase platform's "
            + "baseline table-wide GRANT — proving RLS itself is the boundary, not an absent GRANT")
    void rlsDeniesAnonEvenWithBaselineTableGrant() throws Exception {
        insertAgriculturalCandidate("AGRI-RLS-1", "AGRICULTURAL_LAND", "STAGED", null);

        try (Connection conn = dataSource.getConnection()) {
            try (Statement owner = conn.createStatement()) {
                // The realistic Supabase platform baseline (mirrors
                // V128ContactColumnGrantsIT.migrateToV127ThenSimulateSupabaseGrantsThenApplyV128) —
                // granted as the table-owning connection, BEFORE switching role below.
                owner.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.agricultural_import_candidate "
                        + "TO anon, authenticated");
            }

            asRole(conn, "anon", () -> {
                try (Statement st = conn.createStatement();
                     var rs = st.executeQuery("SELECT count(*) FROM public.agricultural_import_candidate")) {
                    rs.next();
                    assertThat(rs.getLong(1))
                            .as("anon holds the baseline GRANT but RLS must still show zero rows")
                            .isZero();
                }

                assertFailsWithSqlState("42501", () -> {
                    try (Statement st = conn.createStatement()) {
                        st.execute("INSERT INTO public.agricultural_import_candidate ("
                                + "batch_id, source_platform, source_listing_id, "
                                + "property_family, agricultural_subtype, outcome) VALUES ("
                                + batchId + ", 'housing.com', 'AGRI-RLS-ANON-INSERT', "
                                + "'AGRICULTURAL', 'AGRICULTURAL_LAND', 'STAGED')");
                    }
                });
            });
        }

        // The anon INSERT attempt above must not have landed regardless of which error it hit.
        assertThat(count(
                "SELECT count(*) FROM agricultural_import_candidate WHERE source_listing_id='AGRI-RLS-ANON-INSERT'"))
                .isZero();
        // The owner-inserted row from the top of this test is still there — RLS blocks anon,
        // not the owner's own ordinary write.
        assertThat(count(
                "SELECT count(*) FROM agricultural_import_candidate WHERE source_listing_id='AGRI-RLS-1'"))
                .isEqualTo(1);
    }
}
