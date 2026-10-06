package com.example.realestate.propertyrequest;

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
 * Issue #1793 PR-B — RLS default-deny on {@code public.property_requests} (V146). Mirrors
 * {@code CommercialStagingRls2680IT}: the Supabase platform GRANT is simulated BEFORE every denial
 * assertion so the denial measures row security and nothing else; negative assertions carry
 * positive controls (admin admitted, owner/backend path unaffected). The table has a uuid PK
 * default, so no sequence grants are needed and a 42501 on INSERT can only be row security.
 *
 * <p>{@code Propagation.NOT_SUPPORTED} is load-bearing: a failed permission statement would poison
 * a single rolled-back test transaction and later assertions would never run.
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
class PropertyRequestRlsIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String INSUFFICIENT_PRIVILEGE = "42501";
    private static final String TABLE = "public.property_requests";

    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;

    @FunctionalInterface
    private interface SqlAction {
        void run() throws SQLException;
    }

    private static String authUidFunctionSql(UUID uid) {
        String literal = (uid == null) ? "NULL::UUID" : ("'" + uid + "'::UUID");
        return "CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT "
                + literal + " $$;";
    }

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

    /** Supabase platform baseline: GRANT ALL on public tables to anon/authenticated (invisible to migrations). */
    private void simulateSupabasePlatformGrants(Connection conn) throws SQLException {
        try (Statement owner = conn.createStatement()) {
            owner.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON " + TABLE + " TO anon, authenticated");
        }
    }

    private long countOn(Connection conn) throws SQLException {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT count(*) FROM " + TABLE)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static String insertSql(String city) {
        return "INSERT INTO " + TABLE + " (city, journey, intent, phone_enc, phone_hash, contact_via, "
                + "consent_version, consented_at) VALUES ('" + city + "', 'AREA', 'BUY', 'ENC:x', 'h', "
                + "'PHONE', 'v1', now())";
    }

    private void insertOn(Connection conn, String city) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute(insertSql(city));
        }
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0L : n;
    }

    private UUID seedUserWithRole(String appRole) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                id, "it-1793-" + id + "@test.local");
        jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                + "ON CONFLICT (user_id, role) DO NOTHING", id, appRole);
        return id;
    }

    @BeforeEach
    void seed() {
        jdbc.update("DELETE FROM " + TABLE);
        jdbc.update(insertSql("RLS-IT-SEED"));
    }

    @Test
    @DisplayName("datasource proof: the IT talks to the Testcontainers database, not a hosted one")
    void datasourceIsTheTestcontainer() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            String url = c.getMetaData().getURL();
            System.out.println("DATASOURCE_URL_PROOF[RlsIT]=" + url);
            assertThat(url).isEqualTo(postgres.getJdbcUrl());
            assertThat(url).matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):\\d+/.*");
        }
    }

    @Test
    @DisplayName("V146: row security is ENABLED on property_requests")
    void rlsIsEnabled() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = 'property_requests'
                """);
        assertThat(rows).as("table exists").hasSize(1);
        assertThat((Boolean) rows.get(0).get("relrowsecurity")).as("relrowsecurity").isTrue();
        assertThat((Boolean) rows.get(0).get("relforcerowsecurity"))
                .as("FORCE RLS must NOT be set: the backend writes as the table owner").isFalse();
    }

    @Test
    @DisplayName("V146: exactly one admin FOR ALL policy, targeting authenticated only; none for anon/PUBLIC")
    void onlyTheAdminPolicyExists() {
        List<Map<String, Object>> policies = jdbc.queryForList("""
                SELECT policyname, cmd, roles::text AS roles, qual
                FROM pg_policies WHERE schemaname = 'public' AND tablename = 'property_requests'
                """);
        assertThat(policies).hasSize(1);
        Map<String, Object> p = policies.get(0);
        assertThat((String) p.get("cmd")).isEqualTo("ALL");
        assertThat((String) p.get("roles")).isEqualTo("{authenticated}")
                .doesNotContain("anon").doesNotContain("public");
        assertThat((String) p.get("qual")).contains("is_admin");
    }

    @Test
    @DisplayName("anon holding the Supabase baseline GRANT reads zero rows and cannot INSERT (42501)")
    void rlsDeniesAnonEvenWithBaselineGrant() throws Exception {
        long before = count("SELECT count(*) FROM " + TABLE);
        assertThat(before).as("seed row exists, so 'zero' is a real denial").isPositive();
        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);
            asRole(conn, null, "anon", () -> {
                assertThat(countOn(conn)).isZero();
                assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> insertOn(conn, "RLS-IT-ANON"));
            });
        }
        assertThat(count("SELECT count(*) FROM " + TABLE + " WHERE city='RLS-IT-ANON'")).isZero();
        assertThat(count("SELECT count(*) FROM " + TABLE)).isEqualTo(before);
    }

    @Test
    @DisplayName("a NON-ADMIN authenticated user holding the baseline GRANT reads zero rows and cannot INSERT (42501)")
    void rlsDeniesNonAdminAuthenticated() throws Exception {
        UUID nonAdmin = seedUserWithRole("user");
        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);
            asRole(conn, nonAdmin, "authenticated", () -> {
                assertThat(countOn(conn)).isZero();
                assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> insertOn(conn, "RLS-IT-NONADMIN"));
            });
        }
        assertThat(count("SELECT count(*) FROM " + TABLE + " WHERE city='RLS-IT-NONADMIN'")).isZero();
    }

    @Test
    @DisplayName("POSITIVE CONTROL: an ADMIN authenticated user can read and insert")
    void adminCanReadAndWrite() throws Exception {
        UUID admin = seedUserWithRole("admin");
        try (Connection conn = dataSource.getConnection()) {
            simulateSupabasePlatformGrants(conn);
            asRole(conn, admin, "authenticated", () -> {
                assertThat(countOn(conn)).isPositive();
                insertOn(conn, "RLS-IT-ADMIN");
            });
        }
        assertThat(count("SELECT count(*) FROM " + TABLE + " WHERE city='RLS-IT-ADMIN'")).isEqualTo(1);
    }

    @Test
    @DisplayName("POSITIVE CONTROL: the backend's own owner path still reads and writes (no FORCE RLS regression)")
    void ownerBackendPathStillWorks() {
        jdbc.update(insertSql("RLS-IT-OWNER"));
        assertThat(count("SELECT count(*) FROM " + TABLE + " WHERE city='RLS-IT-OWNER'")).isEqualTo(1);
    }
}
