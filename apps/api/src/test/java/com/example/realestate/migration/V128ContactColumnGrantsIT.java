package com.example.realestate.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Proves #2280 V128 (apps/api/src/main/resources/db/migration/V128__revoke_browser_contact_column_grants.sql)
 * actually closes the browser-readable/writable contact-PII column leak on public.property_listings,
 * and that the one legitimate browser need (admin duplicate matching) is preserved without reopening it.
 *
 * <p>Testing-design note (read before touching assertions): contact_phone/contact_info are 0-of-1847
 * populated in production, and Testcontainers/plain Postgres never replicates the Supabase platform's
 * implicit default table-wide GRANTs to {@code anon}/{@code authenticated} — nothing in this migration
 * set ever issues a table-level GRANT to those roles (V128 only REVOKEs). That means on a bare
 * Testcontainers database, {@code authenticated}/{@code anon} start with ZERO privileges on
 * property_listings, with or without V128. A test that merely observes "authenticated cannot read
 * contact_phone" under that baseline would pass vacuously — it would also pass if V128 were deleted
 * entirely, or if the whole REVOKE grammar were malformed, because there was never anything to revoke.
 *
 * <p>To make the assertions actually discriminate, every privilege-behaviour test here first simulates
 * the pre-existing Supabase platform grant explicitly (GRANT SELECT/INSERT/UPDATE/DELETE on
 * property_listings TO authenticated/anon, applied between V127 and V128 — see
 * {@link #migrateToV127ThenSimulateSupabaseGrantsThenApplyV128()}), matching the V128 header comment's
 * own description of the pre-migration state. Only against that realistic baseline does "contact columns
 * lost the privilege, ordinary columns kept it" mean anything.
 */
@Testcontainers(disabledWithoutDocker = true)
class V128ContactColumnGrantsIT {

    private static final String INSUFFICIENT_PRIVILEGE = "42501";
    private static final String RAISE_EXCEPTION = "P0001";
    private static final String SENTINEL_PHONE = "SENTINEL-2280-DO-NOT-USE";
    private static final String SENTINEL_INFO = "SENTINEL-2280-CONTACT-INFO";

    @Container
    PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // ------------------------------------------------------------------
    // Flyway / connection plumbing
    // ------------------------------------------------------------------

    private FluentConfiguration baseConfig() {
        return Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/test-stubs", "classpath:db/migration")
                .mixed(true)
                .placeholders(Map.of("concurrently_keyword", ""));
    }

    private Connection adminConnection() throws SQLException {
        return DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }

    /**
     * Migrates to V127, then — AS THE MIGRATION/OWNER ROLE — grants the baseline table-wide privileges
     * that the Supabase platform grants to {@code anon}/{@code authenticated} outside of Flyway (see
     * class javadoc), then migrates the rest of the way so V128's REVOKE has something real to narrow.
     * Returns an open connection (the container's own superuser/table-owner login role) for fixture
     * setup and role-switching in the calling test.
     */
    private Connection migrateToV127ThenSimulateSupabaseGrantsThenApplyV128() throws Exception {
        Flyway toV127 = baseConfig().target("127").load();
        assertDoesNotThrow(toV127::migrate);

        Connection conn = adminConnection();
        try (Statement st = conn.createStatement()) {
            st.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listings TO authenticated");
            st.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_listings TO anon");
            // A listing-number-generation trigger nextval()s a sequence on INSERT; the Supabase
            // platform default privilege grant also covers ALL SEQUENCES IN SCHEMA public, so this
            // is part of the same realistic baseline, not an extra concession.
            st.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated");
            st.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon");
        }

        Flyway toLatest = baseConfig().load();
        assertDoesNotThrow(toLatest::migrate);

        return conn;
    }

    // ------------------------------------------------------------------
    // Auth-context helpers
    // ------------------------------------------------------------------

    @FunctionalInterface
    private interface SqlAction {
        void run() throws SQLException;
    }

    private static String authUidFunctionSql(UUID uid) {
        String literal = (uid == null) ? "NULL::UUID" : ("'" + uid + "'::UUID");
        return "CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT " + literal + " $$;";
    }

    /** Runs {@code body} as {@code pgRole} with {@code auth.uid()} overridden to {@code authUid}. */
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
            fail("expected a SQLException with SQLState " + expectedState + " but the statement succeeded");
        } catch (SQLException e) {
            assertThat(e.getSQLState()).as("SQLState (message: %s)", e.getMessage()).isEqualTo(expectedState);
        }
    }

    private boolean hasColumnPrivilege(Connection conn, String role, String column, String privilege) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT has_column_privilege(?, 'public.property_listings', ?, ?)")) {
            ps.setString(1, role);
            ps.setString(2, column);
            ps.setString(3, privilege);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getBoolean(1);
            }
        }
    }

    private boolean roleExists(Connection conn, String role) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ?)")) {
            ps.setString(1, role);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getBoolean(1);
            }
        }
    }

    // ------------------------------------------------------------------
    // Fixture seeding (always performed via the admin/owner connection, which
    // bypasses RLS and column grants entirely, so fixtures never depend on the
    // very privileges under test).
    // ------------------------------------------------------------------

    private UUID seedAuthUser(Connection conn) throws SQLException {
        UUID id = UUID.randomUUID();
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
        }
        try (PreparedStatement ps = conn.prepareStatement("INSERT INTO auth.users (id) VALUES (?)")) {
            ps.setObject(1, id);
            ps.executeUpdate();
        }
        return id;
    }

    /**
     * NOTE: inserting into auth.users fires public.handle_new_user() (V0.1:37-53), which
     * auto-assigns the 'user' app_role to every new id. This is therefore ON CONFLICT DO NOTHING —
     * assigning 'admin' is additive (a user can hold both rows), and re-asserting 'user' is a no-op
     * rather than a duplicate-key error.
     */
    private void assignAppRole(Connection conn, UUID userId, String appRole) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, ?::public.app_role) "
                        + "ON CONFLICT (user_id, role) DO NOTHING")) {
            ps.setObject(1, userId);
            ps.setString(2, appRole);
            ps.executeUpdate();
        }
    }

    private UUID seedListing(Connection conn, String status, boolean isValid, boolean isDuplicate, UUID createdBy) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO public.property_listings (status, is_valid, is_duplicate, created_by) "
                        + "VALUES (?, ?, ?, ?) RETURNING id")) {
            ps.setString(1, status);
            ps.setBoolean(2, isValid);
            ps.setBoolean(3, isDuplicate);
            if (createdBy == null) {
                ps.setNull(4, Types.OTHER);
            } else {
                ps.setObject(4, createdBy);
            }
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return (UUID) rs.getObject(1);
            }
        }
    }

    private UUID seedListingWithContactPhone(Connection conn, String contactPhone) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO public.property_listings (status, is_valid, is_duplicate, contact_phone) "
                        + "VALUES ('LIVE', true, false, ?) RETURNING id")) {
            ps.setString(1, contactPhone);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return (UUID) rs.getObject(1);
            }
        }
    }

    private UUID seedListingWithContact(Connection conn, String contactPhone, String contactInfo) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO public.property_listings (status, is_valid, is_duplicate, contact_phone, contact_info) "
                        + "VALUES ('LIVE', true, false, ?, ?) RETURNING id")) {
            ps.setString(1, contactPhone);
            ps.setString(2, contactInfo);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return (UUID) rs.getObject(1);
            }
        }
    }

    /** Builds a Postgres {@code uuid[]} parameter value from the given ids (zero ids -> a zero-length array). */
    private java.sql.Array uuidArray(Connection conn, UUID... ids) throws SQLException {
        return conn.createArrayOf("uuid", ids);
    }

    private static MigrationInfo findByVersion(Flyway flyway, String version) {
        for (MigrationInfo info : flyway.info().applied()) {
            if (info.getVersion() != null && version.equals(info.getVersion().toString())) {
                return info;
            }
        }
        return null;
    }

    private static long countOccurrences(Flyway flyway, String version) {
        return java.util.Arrays.stream(flyway.info().applied())
                .filter(info -> info.getVersion() != null && version.equals(info.getVersion().toString()))
                .count();
    }

    // ==================================================================
    // AC9 — migration application / upgrade paths
    // ==================================================================

    @Test
    @DisplayName("AC9: empty database — full migrate applies V128 exactly once, validate() succeeds")
    void ac9_emptyDatabase_fullMigrate_appliesV128OnceAndValidates() {
        Flyway flyway = baseConfig().load();

        assertDoesNotThrow(flyway::migrate);
        assertDoesNotThrow(flyway::validate);

        MigrationInfo v128 = findByVersion(flyway, "128");
        assertThat(v128).as("V128 present in schema history").isNotNull();
        assertThat(v128.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(countOccurrences(flyway, "128")).isEqualTo(1);
    }

    @Test
    @DisplayName("AC9: upgrade from V127 — V128 applies exactly once, validate() succeeds, "
            + "V126/V127 checksums unchanged before/after")
    void ac9_upgradeFromV127_appliesV128OnceAndPreservesPriorChecksums() {
        Flyway toV127 = baseConfig().target("127").load();
        assertDoesNotThrow(toV127::migrate);

        MigrationInfo v126Before = findByVersion(toV127, "126");
        MigrationInfo v127Before = findByVersion(toV127, "127");
        assertThat(v126Before).as("V126 applied before V128 upgrade").isNotNull();
        assertThat(v127Before).as("V127 applied before V128 upgrade").isNotNull();
        String v126ChecksumBefore = String.valueOf(v126Before.getChecksum());
        String v127ChecksumBefore = String.valueOf(v127Before.getChecksum());
        assertThat(findByVersion(toV127, "128")).as("V128 not yet applied at target 127").isNull();

        Flyway toLatest = baseConfig().load();
        assertDoesNotThrow(toLatest::migrate);
        assertDoesNotThrow(toLatest::validate);

        MigrationInfo v128After = findByVersion(toLatest, "128");
        assertThat(v128After).as("V128 applied after upgrade").isNotNull();
        assertThat(v128After.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(countOccurrences(toLatest, "128")).isEqualTo(1);

        assertThat(String.valueOf(findByVersion(toLatest, "126").getChecksum())).isEqualTo(v126ChecksumBefore);
        assertThat(String.valueOf(findByVersion(toLatest, "127").getChecksum())).isEqualTo(v127ChecksumBefore);
    }

    // ==================================================================
    // AC1 — authenticated non-admin loses contact-column privileges
    // ==================================================================

    @Test
    @DisplayName("AC1: authenticated non-admin — has_column_privilege is false for contact_phone/contact_info "
            + "x {SELECT,INSERT,UPDATE}, but true for an ordinary column (proves column-scoped, not blanket)")
    void ac1_authenticated_hasColumnPrivilegeFalseForBothContactColumnsAllThreePrivileges() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();

        for (String column : new String[] {"contact_phone", "contact_info"}) {
            for (String privilege : new String[] {"SELECT", "INSERT", "UPDATE"}) {
                assertThat(hasColumnPrivilege(conn, "authenticated", column, privilege))
                        .as("authenticated %s on %s", privilege, column)
                        .isFalse();
            }
        }

        // Sanity check the REVOKE was column-scoped, not an accidental blanket REVOKE on the table
        // (the exact malformed-grammar failure mode the author already caught once — see T3).
        assertThat(hasColumnPrivilege(conn, "authenticated", "price", "SELECT"))
                .as("authenticated SELECT on ordinary column 'price' must be unaffected")
                .isTrue();
    }

    @Test
    @DisplayName("AC1: authenticated non-admin — SELECT contact_phone, SELECT *, a WHERE filter, and an "
            + "ORDER BY on contact_phone each fail with insufficient_privilege (42501)")
    void ac1_authenticated_directQueriesOnContactColumnAllFailWithInsufficientPrivilege() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID randomAuthenticatedUser = UUID.randomUUID();

        asRole(conn, randomAuthenticatedUser, "authenticated", () -> {
            assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
                try (Statement st = conn.createStatement()) {
                    st.executeQuery("SELECT contact_phone FROM public.property_listings");
                }
            });
            assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
                try (Statement st = conn.createStatement()) {
                    st.executeQuery("SELECT * FROM public.property_listings");
                }
            });
            assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
                try (Statement st = conn.createStatement()) {
                    st.executeQuery("SELECT id FROM public.property_listings WHERE contact_phone = 'x'");
                }
            });
            assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
                try (Statement st = conn.createStatement()) {
                    st.executeQuery("SELECT id FROM public.property_listings ORDER BY contact_phone");
                }
            });
        });
    }

    // ==================================================================
    // AC1b — RETURNING is enforced under the same column privilege as a plain
    // SELECT list (Postgres checks column privilege on a RETURNING clause
    // exactly as on a target list). This is the exact failure mode that
    // escaped review and broke the admin Listings Save button and the
    // Dismiss-duplicate action in production: supabase-js's argument-less
    // .select() expands to `columns=*`, which PostgREST turns into an
    // explicit `RETURNING *` on the UPDATE — post-V128 that aborts the whole
    // write with 42501 for every caller, admins included, and the row rolls
    // back. The frontend has since been fixed to RETURNING only permitted
    // columns; these tests prove the backend enforces that shape regardless
    // of what any future caller sends.
    // ==================================================================

    @Test
    @DisplayName("AC1b: authenticated owner — UPDATE ... RETURNING * and RETURNING <contact column> both fail "
            + "with insufficient_privilege (42501) and the write rolls back; RETURNING of only permitted "
            + "columns succeeds, proving the failure is about the revoked columns and not RETURNING itself")
    void ac1b_authenticated_updateReturningStarOrContactColumnFails_permittedColumnsReturningSucceeds() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID owner = seedAuthUser(conn);
        assignAppRole(conn, owner, "user");

        UUID[] listingId = new UUID[1];
        asRole(conn, owner, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO public.property_listings (created_by, status) VALUES (?, 'DRAFT') RETURNING id")) {
                ps.setObject(1, owner);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("owner INSERT of own DRAFT listing succeeds").isTrue();
                    listingId[0] = (UUID) rs.getObject(1);
                }
            }
        });
        assertThat(listingId[0]).as("listing id captured from owner INSERT").isNotNull();

        // Case 1: UPDATE ... RETURNING * — the exact shape supabase-js's argument-less .select() emitted.
        asRole(conn, owner, "authenticated", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE public.property_listings SET is_duplicate = true WHERE id = ? RETURNING *")) {
                ps.setObject(1, listingId[0]);
                ps.executeUpdate();
            }
        }));
        assertThat(currentIsDuplicate(conn, listingId[0]))
                .as("failed UPDATE ... RETURNING * must roll back — is_duplicate must remain unchanged (false)")
                .isFalse();

        // Case 2: UPDATE ... RETURNING <contact column> — a narrower RETURNING list, same outcome.
        asRole(conn, owner, "authenticated", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE public.property_listings SET is_duplicate = true WHERE id = ? RETURNING contact_phone")) {
                ps.setObject(1, listingId[0]);
                ps.executeUpdate();
            }
        }));
        assertThat(currentIsDuplicate(conn, listingId[0]))
                .as("failed UPDATE ... RETURNING contact_phone must roll back — is_duplicate must remain false")
                .isFalse();

        // Case 3: RETURNING of only permitted columns succeeds — this is what proves cases 1 and 2 failed
        // specifically because of the revoked contact columns, not because RETURNING is blocked wholesale.
        asRole(conn, owner, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE public.property_listings SET is_duplicate = true WHERE id = ? RETURNING id, is_duplicate")) {
                ps.setObject(1, listingId[0]);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("UPDATE ... RETURNING id, is_duplicate succeeds").isTrue();
                    assertThat(rs.getObject(1)).isEqualTo(listingId[0]);
                    assertThat(rs.getBoolean(2))
                            .as("permitted-column RETURNING reflects the write once it actually commits")
                            .isTrue();
                }
            }
        });
    }

    private boolean currentIsDuplicate(Connection conn, UUID listingId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT is_duplicate FROM public.property_listings WHERE id = ?")) {
            ps.setObject(1, listingId);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("listing row exists for rollback check").isTrue();
                return rs.getBoolean(1);
            }
        }
    }

    @Test
    @DisplayName("AC1b: authenticated owner — INSERT ... RETURNING * and RETURNING <contact column> both fail "
            + "with insufficient_privilege (42501) and no row is persisted; RETURNING of only permitted "
            + "columns succeeds")
    void ac1b_authenticated_insertReturningStarOrContactColumnFails_permittedColumnsReturningSucceeds() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID owner = seedAuthUser(conn);
        assignAppRole(conn, owner, "user");

        String markerStar = "RETURNING-STAR-2280-DO-NOT-USE";
        String markerContact = "RETURNING-CONTACT-2280-DO-NOT-USE";

        // Case 1: INSERT ... RETURNING * fails, and the row must not be persisted at all — this is the
        // INSERT-side sibling of the frontend bug (an admin-authored create flow using the same
        // argument-less .select() would have failed identically).
        asRole(conn, owner, "authenticated", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO public.property_listings (created_by, status, locality) VALUES (?, 'DRAFT', ?) "
                            + "RETURNING *")) {
                ps.setObject(1, owner);
                ps.setString(2, markerStar);
                ps.executeUpdate();
            }
        }));
        assertThat(countListingsWithLocality(conn, markerStar))
                .as("failed INSERT ... RETURNING * must not persist a row")
                .isZero();

        // Case 2: INSERT ... RETURNING <contact column> — same outcome, narrower RETURNING list.
        asRole(conn, owner, "authenticated", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO public.property_listings (created_by, status, locality) VALUES (?, 'DRAFT', ?) "
                            + "RETURNING contact_phone")) {
                ps.setObject(1, owner);
                ps.setString(2, markerContact);
                ps.executeUpdate();
            }
        }));
        assertThat(countListingsWithLocality(conn, markerContact))
                .as("failed INSERT ... RETURNING contact_phone must not persist a row")
                .isZero();

        // Case 3: RETURNING of only permitted columns succeeds.
        asRole(conn, owner, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO public.property_listings (created_by, status) VALUES (?, 'DRAFT') "
                            + "RETURNING id, status")) {
                ps.setObject(1, owner);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("INSERT ... RETURNING id, status succeeds").isTrue();
                    assertThat(rs.getString(2)).isEqualTo("DRAFT");
                }
            }
        });
    }

    private int countListingsWithLocality(Connection conn, String locality) throws SQLException {
        try (Statement st = conn.createStatement()) {
            st.execute("RESET ROLE");
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT count(*) FROM public.property_listings WHERE locality = ?")) {
            ps.setString(1, locality);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getInt(1);
            }
        }
    }

    // ==================================================================
    // AC2 — ordinary browsing at the DB layer is not broken
    // ==================================================================

    @Test
    @DisplayName("AC2: authenticated non-admin can still SELECT ordinary columns and get visible rows back")
    void ac2_authenticated_canSelectOrdinaryColumnsAndSeeVisibleRows() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        // Visible under "Authenticated users can view visible listings": status = 'LIVE'.
        seedListing(conn, "LIVE", true, false, null);

        asRole(conn, UUID.randomUUID(), "authenticated", () -> {
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery(
                         "SELECT id, price, locality, property_type, bedrooms, status, created_at, "
                                 + "is_valid, is_duplicate FROM public.property_listings")) {
                assertThat(rs.next()).as("ordinary-column SELECT returns at least one visible row").isTrue();
            }
        });
    }

    // ==================================================================
    // AC3 — anon behaves identically to authenticated (the vacuous-pass risk)
    // ==================================================================

    @Test
    @DisplayName("AC3: anon role exists in the DB, and has_column_privilege is false for anon on both "
            + "contact columns x {SELECT,INSERT,UPDATE} — mirrors AC1 for the anon role")
    void ac3_anonRoleExists_andHasColumnPrivilegeFalseForBothContactColumnsAllThreePrivileges() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();

        assertThat(roleExists(conn, "anon"))
                .as("anon role must actually exist in this database, otherwise this test asserts nothing")
                .isTrue();

        for (String column : new String[] {"contact_phone", "contact_info"}) {
            for (String privilege : new String[] {"SELECT", "INSERT", "UPDATE"}) {
                assertThat(hasColumnPrivilege(conn, "anon", column, privilege))
                        .as("anon %s on %s", privilege, column)
                        .isFalse();
            }
        }
    }

    @Test
    @DisplayName("AC3: anon — direct SELECT of contact_phone fails with insufficient_privilege (42501)")
    void ac3_anon_directSelectOfContactPhoneFailsWithInsufficientPrivilege() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();

        asRole(conn, null, "anon", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (Statement st = conn.createStatement()) {
                st.executeQuery("SELECT contact_phone FROM public.property_listings");
            }
        }));
    }

    // ==================================================================
    // AC4 — row-level paths (owner/broker, admin ALL) keep working;
    //        column grant applies independently of row policy outcome.
    // ==================================================================

    @Test
    @DisplayName("AC4: owner (role 'user') can INSERT/UPDATE(non-contact)/DELETE their own DRAFT listing, "
            + "but UPDATE of contact_phone on that same row fails with 42501")
    void ac4_owner_ordinaryRowOperationsSucceed_contactColumnUpdateFails() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID owner = seedAuthUser(conn);
        assignAppRole(conn, owner, "user");

        UUID[] listingId = new UUID[1];

        asRole(conn, owner, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO public.property_listings (created_by, status) VALUES (?, 'DRAFT') RETURNING id")) {
                ps.setObject(1, owner);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("owner INSERT of own DRAFT listing succeeds").isTrue();
                    listingId[0] = (UUID) rs.getObject(1);
                }
            }
        });
        assertThat(listingId[0]).as("listing id captured from owner INSERT").isNotNull();

        asRole(conn, owner, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE public.property_listings SET is_duplicate = true WHERE id = ?")) {
                ps.setObject(1, listingId[0]);
                assertThat(ps.executeUpdate())
                        .as("owner UPDATE of a non-contact column on own listing succeeds")
                        .isEqualTo(1);
            }

            assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
                try (PreparedStatement ps = conn.prepareStatement(
                        "UPDATE public.property_listings SET contact_phone = ? WHERE id = ?")) {
                    ps.setString(1, SENTINEL_PHONE);
                    ps.setObject(2, listingId[0]);
                    ps.executeUpdate();
                }
            });

            try (PreparedStatement ps = conn.prepareStatement(
                    "DELETE FROM public.property_listings WHERE id = ?")) {
                ps.setObject(1, listingId[0]);
                assertThat(ps.executeUpdate())
                        .as("owner DELETE of own DRAFT listing succeeds")
                        .isEqualTo(1);
            }
        });
    }

    @Test
    @DisplayName("AC4: admin ALL policy still bypasses row ownership for non-contact columns, but the "
            + "column-level REVOKE still applies to the admin's 'authenticated' session for contact_phone")
    void ac4_admin_rowPolicyBypassWorks_columnRevokeStillApplies() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");
        UUID otherOwner = UUID.randomUUID();
        UUID otherUsersDraftListing = seedListing(conn, "DRAFT", true, false, otherOwner);

        asRole(conn, admin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT id FROM public.property_listings WHERE id = ?")) {
                ps.setObject(1, otherUsersDraftListing);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next())
                            .as("admin can SELECT another user's DRAFT listing via the admin ALL policy")
                            .isTrue();
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE public.property_listings SET is_duplicate = true WHERE id = ?")) {
                ps.setObject(1, otherUsersDraftListing);
                assertThat(ps.executeUpdate())
                        .as("admin can UPDATE a non-contact column on another user's listing")
                        .isEqualTo(1);
            }

            assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
                try (PreparedStatement ps = conn.prepareStatement(
                        "UPDATE public.property_listings SET contact_phone = ? WHERE id = ?")) {
                    ps.setString(1, SENTINEL_PHONE);
                    ps.setObject(2, otherUsersDraftListing);
                    ps.executeUpdate();
                }
            });
        });
    }

    // ==================================================================
    // AC5 — admin_find_contact_duplicate_candidates(p_duplicate_id UUID, p_limit INTEGER)
    // (reroute cycle 3 / GAP-1: retargeted from the retired (TEXT, INTEGER) overload, which
    // this migration explicitly DROPs and would now fail with 42883 "function does not exist")
    // ==================================================================

    @Test
    @DisplayName("AC5: admin caller gets matching candidate id(s) excluding the duplicate row itself, "
            + "result shape has ONLY an 'id' column")
    void ac5_adminCaller_getsCandidateIds_excludesSelf_resultShapeIsIdOnly() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");
        // The duplicate row itself also carries the sentinel phone (that's how the function
        // resolves it server-side) — it must never be echoed back among its own candidates.
        UUID duplicateListing = seedListingWithContactPhone(conn, SENTINEL_PHONE);
        UUID expectedCandidate = seedListingWithContactPhone(conn, SENTINEL_PHONE);

        asRole(conn, admin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_find_contact_duplicate_candidates(?, 10)")) {
                ps.setObject(1, duplicateListing);
                try (ResultSet rs = ps.executeQuery()) {
                    ResultSetMetaData meta = rs.getMetaData();
                    assertThat(meta.getColumnCount()).as("result has exactly one column").isEqualTo(1);
                    assertThat(meta.getColumnName(1)).as("the one column is 'id'").isEqualToIgnoringCase("id");
                    // Deliberately check the metadata column NAME/TYPE rather than merely not reading a
                    // second column value — proves the shape itself is id-only, not just our own restraint.
                    assertThat(meta.getColumnTypeName(1)).as("the one column is a uuid").isEqualToIgnoringCase("uuid");

                    List<UUID> returned = new ArrayList<>();
                    while (rs.next()) {
                        returned.add((UUID) rs.getObject(1));
                    }
                    assertThat(returned)
                            .as("candidates exclude the duplicate row itself and contain only the real match")
                            .containsExactly(expectedCandidate);
                }
            }
        });
    }

    @Test
    @DisplayName("AC5: non-admin authenticated caller RAISEs (P0001), gets ZERO rows (not rows-plus-exception), "
            + "and the error carries no contact value")
    void ac5_nonAdminAuthenticatedCaller_raisesWithZeroRowsAndNoLeak() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID nonAdmin = seedAuthUser(conn);
        assignAppRole(conn, nonAdmin, "user");
        UUID duplicateListing = seedListingWithContactPhone(conn, SENTINEL_PHONE);

        asRole(conn, nonAdmin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_find_contact_duplicate_candidates(?, 10)")) {
                ps.setObject(1, duplicateListing);
                try {
                    try (ResultSet rs = ps.executeQuery()) {
                        List<UUID> leaked = new ArrayList<>();
                        while (rs.next()) {
                            leaked.add((UUID) rs.getObject(1));
                        }
                        fail("expected the function to RAISE for a non-admin caller, but it returned "
                                + leaked.size() + " row(s) instead — the admin gate was bypassed");
                    }
                } catch (SQLException e) {
                    assertThat(e.getSQLState()).isEqualTo(RAISE_EXCEPTION);
                    assertThat(e.getMessage()).containsIgnoringCase("admin privileges");
                    assertThat(e.getMessage()).as("error must not echo the contact value").doesNotContain(SENTINEL_PHONE);
                }
            }
        });
    }

    @Test
    @DisplayName("AC5: anon caller is denied at the EXECUTE-grant level (42501), never reaches the function body")
    void ac5_anonCaller_deniedAtExecuteGrantLevel() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID duplicateListing = seedListingWithContactPhone(conn, SENTINEL_PHONE);

        asRole(conn, null, "anon", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_find_contact_duplicate_candidates(?, 10)")) {
                ps.setObject(1, duplicateListing);
                ps.executeQuery();
            }
        }));
    }

    @Test
    @DisplayName("AC5: a duplicate with NO contact_phone and a p_duplicate_id that does not exist at all both "
            + "return ZERO rows without raising — deliberately indistinguishable, so the function cannot be "
            + "used as an id-existence oracle")
    void ac5_noPhoneDuplicateAndNonexistentId_bothReturnZeroRowsIndistinguishably() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");

        UUID duplicateWithNoPhone = seedListing(conn, "LIVE", true, false, null); // contact_phone NULL
        UUID nonexistentId = UUID.randomUUID();

        asRole(conn, admin, "authenticated", () -> {
            int noPhoneRowCount = countCandidateRows(conn, duplicateWithNoPhone);
            int nonexistentRowCount = countCandidateRows(conn, nonexistentId);

            assertThat(noPhoneRowCount).as("duplicate with NULL contact_phone returns zero rows, no exception").isEqualTo(0);
            assertThat(nonexistentRowCount).as("nonexistent p_duplicate_id returns zero rows, no exception").isEqualTo(0);
            assertThat(nonexistentRowCount)
                    .as("the nonexistent-id case must be indistinguishable from the no-phone case "
                            + "(id-oracle safety property — do not let a future change make these differ)")
                    .isEqualTo(noPhoneRowCount);
        });
    }

    private int countCandidateRows(Connection conn, UUID duplicateId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT * FROM public.admin_find_contact_duplicate_candidates(?, 10)")) {
            ps.setObject(1, duplicateId);
            try (ResultSet rs = ps.executeQuery()) {
                int count = 0;
                while (rs.next()) {
                    count++;
                }
                return count;
            }
        }
    }

    // ==================================================================
    // GAP-2 — admin_get_listing_contacts(p_listing_ids UUID[])
    // The one function in this migration that deliberately DOES return contact PII, gated to
    // admins only. See the V128 header note (lines ~83-102) for why this is a security
    // improvement over the pre-migration client-side isAdmin flag, not a regression.
    // ==================================================================

    @Test
    @DisplayName("GAP-2: admin caller gets back the seeded contact values, correctly keyed by id")
    void adminGetListingContacts_adminCaller_getsContactValuesKeyedById() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");

        UUID id1 = seedListingWithContact(conn, SENTINEL_PHONE + "-1", SENTINEL_INFO + "-1");
        UUID id2 = seedListingWithContact(conn, SENTINEL_PHONE + "-2", SENTINEL_INFO + "-2");

        asRole(conn, admin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, uuidArray(conn, id1, id2));
                try (ResultSet rs = ps.executeQuery()) {
                    Map<UUID, String[]> byId = new HashMap<>();
                    while (rs.next()) {
                        byId.put((UUID) rs.getObject("id"),
                                new String[] {rs.getString("contact_phone"), rs.getString("contact_info")});
                    }
                    assertThat(byId).as("both requested ids present, keyed correctly").containsOnlyKeys(id1, id2);
                    assertThat(byId.get(id1)[0]).isEqualTo(SENTINEL_PHONE + "-1");
                    assertThat(byId.get(id1)[1]).isEqualTo(SENTINEL_INFO + "-1");
                    assertThat(byId.get(id2)[0]).isEqualTo(SENTINEL_PHONE + "-2");
                    assertThat(byId.get(id2)[1]).isEqualTo(SENTINEL_INFO + "-2");
                }
            }
        });
    }

    @Test
    @DisplayName("GAP-2: non-admin authenticated caller RAISEs, gets ZERO rows (not rows-plus-exception — the "
            + "gate cannot be bypassed by the planner), and neither the exception message nor any row carries "
            + "a contact value")
    void adminGetListingContacts_nonAdminCaller_raisesWithZeroRowsAndNoLeak() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID nonAdmin = seedAuthUser(conn);
        assignAppRole(conn, nonAdmin, "user");
        UUID id1 = seedListingWithContact(conn, SENTINEL_PHONE, SENTINEL_INFO);

        asRole(conn, nonAdmin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, uuidArray(conn, id1));
                try {
                    try (ResultSet rs = ps.executeQuery()) {
                        List<UUID> leaked = new ArrayList<>();
                        while (rs.next()) {
                            leaked.add((UUID) rs.getObject("id"));
                        }
                        fail("expected admin_get_listing_contacts to RAISE for a non-admin caller, but it "
                                + "returned " + leaked.size() + " row(s) — the admin gate was bypassed");
                    }
                } catch (SQLException e) {
                    assertThat(e.getSQLState()).isEqualTo(RAISE_EXCEPTION);
                    assertThat(e.getMessage()).containsIgnoringCase("admin privileges");
                    assertThat(e.getMessage())
                            .as("error must not echo either contact value")
                            .doesNotContain(SENTINEL_PHONE)
                            .doesNotContain(SENTINEL_INFO);
                }
            }
        });
    }

    @Test
    @DisplayName("GAP-2: anon caller is denied at the EXECUTE-grant level (42501), never reaches the function body")
    void adminGetListingContacts_anonCaller_deniedAtExecuteGrantLevel() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID id1 = seedListingWithContact(conn, SENTINEL_PHONE, SENTINEL_INFO);

        asRole(conn, null, "anon", () -> assertFailsWithSqlState(INSUFFICIENT_PRIVILEGE, () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, uuidArray(conn, id1));
                ps.executeQuery();
            }
        }));
    }

    @Test
    @DisplayName("GAP-2: a NULL array and an empty array both return zero rows, no exception")
    void adminGetListingContacts_nullAndEmptyArray_returnZeroRowsNoException() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");

        asRole(conn, admin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, null);
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("NULL array returns zero rows, no exception").isFalse();
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, uuidArray(conn));
                try (ResultSet rs = ps.executeQuery()) {
                    assertThat(rs.next()).as("empty array returns zero rows, no exception").isFalse();
                }
            }
        });
    }

    @Test
    @DisplayName("GAP-2: an array of 201 ids RAISEs the anti-bulk-exfiltration cap and returns NO partial data")
    void adminGetListingContacts_over200Ids_raisesCapWithNoPartialData() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");
        UUID realId = seedListingWithContact(conn, SENTINEL_PHONE, SENTINEL_INFO);

        UUID[] tooMany = new UUID[201];
        tooMany[0] = realId;
        for (int i = 1; i < tooMany.length; i++) {
            tooMany[i] = UUID.randomUUID();
        }

        asRole(conn, admin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, uuidArray(conn, tooMany));
                try {
                    try (ResultSet rs = ps.executeQuery()) {
                        List<UUID> leaked = new ArrayList<>();
                        while (rs.next()) {
                            leaked.add((UUID) rs.getObject("id"));
                        }
                        fail("expected admin_get_listing_contacts to RAISE for >200 ids, but it returned "
                                + leaked.size() + " row(s) of partial data");
                    }
                } catch (SQLException e) {
                    assertThat(e.getSQLState()).isEqualTo(RAISE_EXCEPTION);
                    assertThat(e.getMessage()).containsIgnoringCase("too many ids");
                }
            }
        });
    }

    @Test
    @DisplayName("GAP-2: ids that do not exist are simply absent from the result, no exception")
    void adminGetListingContacts_nonexistentIds_areAbsentNoException() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        UUID admin = seedAuthUser(conn);
        assignAppRole(conn, admin, "admin");
        UUID realId = seedListingWithContact(conn, SENTINEL_PHONE, SENTINEL_INFO);
        UUID fakeId = UUID.randomUUID();

        asRole(conn, admin, "authenticated", () -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT * FROM public.admin_get_listing_contacts(?)")) {
                ps.setArray(1, uuidArray(conn, realId, fakeId));
                try (ResultSet rs = ps.executeQuery()) {
                    List<UUID> returned = new ArrayList<>();
                    while (rs.next()) {
                        returned.add((UUID) rs.getObject("id"));
                    }
                    assertThat(returned)
                            .as("only the real id is present; the nonexistent id is silently absent")
                            .containsExactly(realId);
                }
            }
        });
    }

    // ==================================================================
    // AC7 — DECLARED STOP-CONDITION: the backend's own JDBC/migration login role
    // must retain full column access. If this fails, STOP — do not weaken it.
    // ==================================================================

    @Test
    @DisplayName("AC7 [STOP-CONDITION]: the migration/JDBC login role retains full SELECT/INSERT/UPDATE on "
            + "both contact columns, and a real INSERT+SELECT round-trip of both columns succeeds")
    void ac7_backendLoginRole_retainsFullContactColumnAccess() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();
        String backendRole = postgres.getUsername();

        for (String column : new String[] {"contact_phone", "contact_info"}) {
            for (String privilege : new String[] {"SELECT", "INSERT", "UPDATE"}) {
                assertThat(hasColumnPrivilege(conn, backendRole, column, privilege))
                        .as("backend login role (%s) %s on %s must remain TRUE (AC7 stop-condition)",
                                backendRole, privilege, column)
                        .isTrue();
            }
        }

        UUID id;
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO public.property_listings (contact_phone, contact_info) VALUES (?, ?) RETURNING id")) {
            ps.setString(1, SENTINEL_PHONE);
            ps.setString(2, SENTINEL_INFO);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("backend role INSERT of both contact columns succeeds").isTrue();
                id = (UUID) rs.getObject(1);
            }
        }

        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT contact_phone, contact_info FROM public.property_listings WHERE id = ?")) {
            ps.setObject(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                assertThat(rs.next()).as("backend role SELECT of the round-tripped row succeeds").isTrue();
                assertThat(rs.getString("contact_phone")).isEqualTo(SENTINEL_PHONE);
                assertThat(rs.getString("contact_info")).isEqualTo(SENTINEL_INFO);
            }
        }
    }

    // ==================================================================
    // Allow-list completeness — catalog-driven, not a second hand-written list.
    // Guards against a column silently OMITTED from V128's 161-column allow-list
    // (a GRANT on a nonexistent column errors loudly; an omission does not).
    // ==================================================================

    private static final Set<String> CONTACT_COLUMNS = Set.of("contact_phone", "contact_info");
    private static final List<String> PRIVILEGES = List.of("SELECT", "INSERT", "UPDATE");

    private List<String> allColumnsOf(Connection conn, String schema, String table) throws SQLException {
        List<String> columns = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position")) {
            ps.setString(1, schema);
            ps.setString(2, table);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    columns.add(rs.getString(1));
                }
            }
        }
        return columns;
    }

    @Test
    @DisplayName("Allow-list completeness: EVERY catalog column of property_listings has the expected "
            + "authenticated/anon x SELECT/INSERT/UPDATE privilege shape — contact columns FALSE, all "
            + "others TRUE — with no hand-written column list of our own driving the assertion")
    void allowListCompleteness_everyCatalogColumnMatchesExpectedPrivilegeShape() throws Exception {
        Connection conn = migrateToV127ThenSimulateSupabaseGrantsThenApplyV128();

        List<String> allColumns = allColumnsOf(conn, "public", "property_listings");

        // Pin the true catalog-derived column count (the plan/types.ts figure of 44 is stale;
        // the real DDL has far more). This is a fact about the schema, not an assumption.
        assertThat(allColumns.size())
                .as("property_listings ACTUAL catalog column count (plan/types.ts stale figure was 44)")
                .isGreaterThan(44);
        System.out.println("[V128ContactColumnGrantsIT] property_listings actual column count = " + allColumns.size());

        List<String> mismatches = new ArrayList<>();

        for (String column : allColumns) {
            boolean isContactColumn = CONTACT_COLUMNS.contains(column);

            for (String privilege : PRIVILEGES) {
                boolean authenticatedActual = hasColumnPrivilege(conn, "authenticated", column, privilege);
                boolean authenticatedExpected = !isContactColumn;
                if (authenticatedActual != authenticatedExpected) {
                    mismatches.add(String.format(
                            "authenticated %s on '%s': expected %s but was %s",
                            privilege, column, authenticatedExpected, authenticatedActual));
                }
            }

            if (isContactColumn) {
                // Contact columns must be locked down for anon across all three privileges.
                for (String privilege : PRIVILEGES) {
                    boolean anonActual = hasColumnPrivilege(conn, "anon", column, privilege);
                    if (anonActual) {
                        mismatches.add(String.format(
                                "anon %s on '%s': expected false but was true", privilege, column));
                    }
                }
            } else {
                // Ordinary columns: anon SELECT must be preserved. (Anon never gets INSERT/UPDATE
                // back on any column post-V128 — no row policy admits an anon write — so those two
                // privileges are not part of the "otherwise" completeness contract here.)
                boolean anonSelectActual = hasColumnPrivilege(conn, "anon", column, "SELECT");
                if (!anonSelectActual) {
                    mismatches.add(String.format(
                            "anon SELECT on '%s': expected true but was false", column));
                }
            }
        }

        assertThat(mismatches)
                .as("catalog-driven privilege-shape mismatches against V128's 161-column allow-list "
                        + "(non-empty means the allow-list silently omits or over-includes a column)")
                .isEmpty();
    }
}
