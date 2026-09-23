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
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Issue #2680 — RLS default-deny on the V136 Commercial staging tables
 * ({@code commercial_import_batch}, {@code commercial_import_candidate}), retrofitted by V143.
 *
 * <p><b>Why this test simulates the Supabase platform GRANT rather than trusting the
 * Testcontainers baseline.</b> This is the #2280/V128 lesson, restated by V141's own RLS test
 * (see {@code AgriculturalStagingDiscrimination2607IT.rlsDeniesAnonEvenWithBaselineTableGrant}):
 * the test-stub roles ({@code db/test-stubs/beforeMigrate.sql}) create {@code anon} and
 * {@code authenticated} but grant them nothing. A naive "anon is denied" assertion here would
 * therefore pass even with V143 deleted — for the wrong reason (an absent GRANT, not a working
 * row-security policy). Every denial below is asserted only AFTER granting the platform's
 * baseline table-wide privileges, so what the denial measures is RLS and nothing else.
 *
 * <p><b>Sequence privileges are granted too, deliberately.</b> Both staging tables have
 * {@code SERIAL} primary keys. Without {@code USAGE} on their sequences an {@code anon} INSERT
 * would fail with SQLSTATE 42501 — the SAME code an RLS row-check violation raises — and the
 * denial assertions would be indistinguishable from the thing they claim to prove. Granting
 * sequence usage removes that confound, so a 42501 on INSERT can only be row security.
 *
 * <p><b>Negative assertions carry a positive control.</b> "anon sees zero rows" is also what a
 * table that denies everyone would produce, so {@link #adminCanReadAndWriteBothStagingTables()}
 * proves the admin policy actually admits, and {@link #ownerBackendPathStillReadsAndWrites()}
 * proves the backend's own service-role/owner path is unaffected. Without those two, a migration
 * that simply broke both tables for everybody would pass every other test in this class.
 *
 * <p><b>MUTATION-TESTED.</b> With V143's four statements commented out, this class fails (see the
 * PR body for the recorded run). The denial tests are therefore load-bearing, not vacuous.
 *
 * <p><b>{@code Propagation.NOT_SUPPORTED} is load-bearing</b> (mirrors
 * {@code AgriculturalStagingDiscrimination2607IT}): several tests deliberately trigger a
 * permission failure and then assert on state afterward. Under the default {@code @DataJpaTest}
 * single rolled-back transaction, the failed statement would poison the transaction and the later
 * assertions would never actually run.
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
class CommercialStagingRls2680IT {

    /** postgis/postgis, not plain postgres — several migrations on this classpath need PostGIS. */
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String INSUFFICIENT_PRIVILEGE = "42501";

    private static final String BATCH = "public.commercial_import_batch";
    private static final String CANDIDATE = "public.commercial_import_candidate";

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    private int batchId;

    // ── helpers ──────────────────────────────────────────────────────────────

    @FunctionalInterface
    private interface SqlAction {
        void run() throws SQLException;
    }

    /** Mirrors {@code V128ContactColumnGrantsIT.authUidFunctionSql} (#2280). */
    private static String authUidFunctionSql(UUID uid) {
        String literal = (uid == null) ? "NULL::UUID" : ("'" + uid + "'::UUID");
        return "CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT "
                + literal + " $$;";
    }

    /**
     * Runs {@code body} as {@code pgRole} with {@code auth.uid()} overridden to {@code authUid} —
     * mirrors {@code V128ContactColumnGrantsIT.asRole} exactly. The override is needed here (unlike
     * in V141's anon-only RLS test) because {@code public.is_admin(auth.uid())} is the whole
     * content of V143's policy: without being able to set {@code auth.uid()}, the admin positive
     * control below could not be written, and "everyone is denied" would be untestable against
     * "admins are admitted".
     *
     * <p>The {@code RESET ROLE} in the {@code finally} matters because {@code conn} came from the
     * pooled {@link #dataSource}: returning a connection still {@code SET ROLE}'d to {@code anon}
     * would silently hand a later test the wrong identity.
     */
    private void asRole(Connection conn, UUID authUid, String pgRole, SqlAction body) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
            st.execute(authUidFunctionSql(authUid));
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

    /**
     * The realistic Supabase platform baseline: {@code GRANT ALL ON ALL TABLES IN SCHEMA public TO
     * anon, authenticated, service_role} is bootstrapped by the platform for every table in this
     * schema, outside of and invisible to this migration history (V128's header records the same
     * finding). Granted here as the table-owning connection, BEFORE any {@code SET ROLE}.
     */
    private void simulateSupabasePlatformGrants(Connection conn) throws SQLException {
        try (Statement owner = conn.createStatement()) {
            owner.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON " + BATCH + " TO anon, authenticated");
            owner.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON " + CANDIDATE + " TO anon, authenticated");
            // Both tables have SERIAL PKs — see the class javadoc for why this is not optional.
            owner.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated");
        }
    }

    private long countOn(Connection conn, String table) throws SQLException {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM " + table)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private void insertCandidateOn(Connection conn, String sourceListingId) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("INSERT INTO " + CANDIDATE + " ("
                    + "batch_id, source_platform, source_listing_id, "
                    + "property_family, property_type, commercial_subtype, listing_purpose, outcome) VALUES ("
                    + batchId + ", 'housing.com', '" + sourceListingId + "', "
                    + "'COMMERCIAL', 'commercial', 'SHOP', 'sale', 'STAGED')");
        }
    }

    private void insertBatchOn(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("INSERT INTO " + BATCH + " (import_issue, source_platform, city) "
                    + "VALUES (2680, 'housing.com', 'RLS-IT')");
        }
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0L : n;
    }

    /**
     * Seeds an {@code auth.users} row and grants it {@code appRole}. Inserting into
     * {@code auth.users} fires {@code public.handle_new_user()} (V0.1), which auto-assigns the
     * 'user' app_role — hence {@code ON CONFLICT DO NOTHING}, mirroring
     * {@code V128ContactColumnGrantsIT.assignAppRole}.
     */
    private UUID seedUserWithRole(String appRole) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                id, "it-2680-" + id + "@test.local");
        jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                + "ON CONFLICT (user_id, role) DO NOTHING", id, appRole);
        return id;
    }

    // ── fixture ──────────────────────────────────────────────────────────────

    @BeforeEach
    void seed() {
        batchId = jdbc.queryForObject("""
                INSERT INTO public.commercial_import_batch (import_issue, source_platform, city)
                VALUES (2680, 'housing.com', 'RLS-IT')
                RETURNING id
                """, Integer.class);
    }

    // ── the migration actually landed ───────────────────────────────────────

    @Test
    @DisplayName("V143: row security is ENABLED on both V136 Commercial staging tables")
    void rlsIsEnabledOnBothStagingTables() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT c.relname, c.relrowsecurity
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relname IN ('commercial_import_batch', 'commercial_import_candidate')
                ORDER BY c.relname
                """);
        assertThat(rows).as("both staging tables must exist").hasSize(2);
        assertThat(rows).allSatisfy(row ->
                assertThat((Boolean) row.get("relrowsecurity"))
                        .as("relrowsecurity on %s", row.get("relname"))
                        .isTrue());
    }

    @Test
    @DisplayName("V143: each staging table carries exactly one admin FOR ALL policy, and NO policy "
            + "is granted to anon or to PUBLIC")
    void onlyTheAdminPolicyExistsOnEachStagingTable() {
        List<Map<String, Object>> policies = jdbc.queryForList("""
                SELECT tablename, policyname, cmd, roles::text AS roles, qual
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename IN ('commercial_import_batch', 'commercial_import_candidate')
                ORDER BY tablename, policyname
                """);

        assertThat(policies)
                .as("exactly one policy per staging table — no client-role policy is added by V143")
                .hasSize(2);
        assertThat(policies).allSatisfy(p -> {
            assertThat((String) p.get("cmd")).as("policy command").isEqualTo("ALL");
            assertThat((String) p.get("roles"))
                    .as("policy on %s must target authenticated only", p.get("tablename"))
                    .isEqualTo("{authenticated}");
            // The explicit NEGATIVE: an empty/PUBLIC role list would read as "{public}" here and
            // would silently make the table readable by every role, RLS enabled or not.
            assertThat((String) p.get("roles")).doesNotContain("anon").doesNotContain("public");
            assertThat((String) p.get("qual"))
                    .as("policy predicate must be the admin check")
                    .contains("is_admin");
        });
    }

    // ── denial, measured against the platform's own GRANT ───────────────────

    @Test
    @DisplayName("#2680: anon holding the Supabase baseline GRANT still reads zero rows from "
            + "commercial_import_candidate and cannot INSERT")
    void rlsDeniesAnonOnCandidateEvenWithBaselineTableGrant() throws Exception {
        jdbc.update("INSERT INTO " + CANDIDATE + " ("
                + "batch_id, source_platform, source_listing_id, property_family, property_type, "
                + "commercial_subtype, listing_purpose, outcome) "
                + "VALUES (?, 'housing.com', 'COMM-RLS-1', 'COMMERCIAL', 'commercial', 'SHOP', 'sale', 'STAGED')",
                batchId);

        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);

            asRole(conn, null, "anon", () -> {
                assertThat(countOn(conn, CANDIDATE))
                        .as("anon holds SELECT on the table but RLS must still show zero rows")
                        .isZero();
                assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE,
                        () -> insertCandidateOn(conn, "COMM-RLS-ANON-INSERT"));
            });
        }

        assertThat(count("SELECT count(*) FROM " + CANDIDATE
                + " WHERE source_listing_id='COMM-RLS-ANON-INSERT'"))
                .as("the anon INSERT must not have landed, whichever error it hit")
                .isZero();
        assertThat(count("SELECT count(*) FROM " + CANDIDATE + " WHERE source_listing_id='COMM-RLS-1'"))
                .as("the owner-inserted row is still there — RLS blocks anon, not the owner")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("#2680: anon holding the Supabase baseline GRANT still reads zero rows from "
            + "commercial_import_batch and cannot INSERT")
    void rlsDeniesAnonOnBatchEvenWithBaselineTableGrant() throws Exception {
        long batchesBefore = count("SELECT count(*) FROM " + BATCH);
        assertThat(batchesBefore)
                .as("the @BeforeEach batch exists, so 'anon sees zero' is a real denial and not an empty table")
                .isPositive();

        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);

            asRole(conn, null, "anon", () -> {
                assertThat(countOn(conn, BATCH))
                        .as("anon holds SELECT on the table but RLS must still show zero rows")
                        .isZero();
                assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> insertBatchOn(conn));
            });
        }

        assertThat(count("SELECT count(*) FROM " + BATCH))
                .as("no anon row landed")
                .isEqualTo(batchesBefore);
    }

    @Test
    @DisplayName("#2680: a NON-ADMIN authenticated user holding the baseline GRANT is denied on both "
            + "staging tables — the admin policy does not leak to every logged-in user")
    void rlsDeniesNonAdminAuthenticatedEvenWithBaselineTableGrant() throws Exception {
        UUID nonAdmin = seedUserWithRole("user");

        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);

            asRole(conn, nonAdmin, "authenticated", () -> {
                assertThat(countOn(conn, CANDIDATE))
                        .as("non-admin authenticated must see zero candidate rows")
                        .isZero();
                assertThat(countOn(conn, BATCH))
                        .as("non-admin authenticated must see zero batch rows")
                        .isZero();
                assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE,
                        () -> insertCandidateOn(conn, "COMM-RLS-NONADMIN-INSERT"));
                assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> insertBatchOn(conn));
            });
        }

        assertThat(count("SELECT count(*) FROM " + CANDIDATE
                + " WHERE source_listing_id='COMM-RLS-NONADMIN-INSERT'"))
                .isZero();
    }

    // ── positive controls: the policy admits, and the backend keeps working ──

    @Test
    @DisplayName("POSITIVE CONTROL #2680: an ADMIN authenticated user can read and write both staging "
            + "tables — the denials above are row security discriminating, not a table broken for all")
    void adminCanReadAndWriteBothStagingTables() throws Exception {
        UUID admin = seedUserWithRole("admin");
        jdbc.update("INSERT INTO " + CANDIDATE + " ("
                + "batch_id, source_platform, source_listing_id, property_family, property_type, "
                + "commercial_subtype, listing_purpose, outcome) "
                + "VALUES (?, 'housing.com', 'COMM-RLS-ADMIN-SEES', 'COMMERCIAL', 'commercial', 'SHOP', "
                + "'sale', 'STAGED')", batchId);

        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);

            asRole(conn, admin, "authenticated", () -> {
                assertThat(countOn(conn, CANDIDATE))
                        .as("admin must be able to read staging candidates")
                        .isPositive();
                assertThat(countOn(conn, BATCH))
                        .as("admin must be able to read staging batches")
                        .isPositive();
                // The FOR ALL policy omits WITH CHECK, so Postgres uses USING for the write check
                // too — an admin write must therefore be admitted, not merely an admin read.
                insertCandidateOn(conn, "COMM-RLS-ADMIN-INSERT");
            });
        }

        assertThat(count("SELECT count(*) FROM " + CANDIDATE
                + " WHERE source_listing_id='COMM-RLS-ADMIN-INSERT'"))
                .as("the admin INSERT must actually have landed")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("POSITIVE CONTROL #2680: the backend's own owner/service path still reads and writes "
            + "both staging tables after RLS is enabled (no FORCE ROW LEVEL SECURITY regression)")
    void ownerBackendPathStillReadsAndWrites() {
        jdbc.update("INSERT INTO " + CANDIDATE + " ("
                + "batch_id, source_platform, source_listing_id, property_family, property_type, "
                + "commercial_subtype, listing_purpose, outcome) "
                + "VALUES (?, 'housing.com', 'COMM-RLS-OWNER-1', 'COMMERCIAL', 'commercial', 'OFFICE', "
                + "'sale', 'STAGED')", batchId);

        assertThat(count("SELECT count(*) FROM " + CANDIDATE
                + " WHERE source_listing_id='COMM-RLS-OWNER-1'"))
                .as("the staging writer path #2575 depends on must be unaffected by V143")
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM " + BATCH + " WHERE id=" + batchId))
                .isEqualTo(1);

        jdbc.update("UPDATE " + CANDIDATE + " SET outcome='PROMOTED' WHERE source_listing_id='COMM-RLS-OWNER-1'");
        assertThat(count("SELECT count(*) FROM " + CANDIDATE
                + " WHERE source_listing_id='COMM-RLS-OWNER-1' AND outcome='PROMOTED'"))
                .as("owner UPDATE still applies — promotion logic is untouched by this PR")
                .isEqualTo(1);
    }
}
