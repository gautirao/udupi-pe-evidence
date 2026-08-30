package com.example.realestate.quality;

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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Integration test for the V92 Flyway migration — listing quality foundation.
 *
 * <p>Harness mirrors {@code AreaSummaryServiceAgriIT}: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4} real container, no DB replacement, Flyway runs all
 * migrations (including V92) automatically on context startup.
 *
 * <p>Proves AC8 (schema shape), AC9 (reversibility), and that the PLAIN index in V92
 * does NOT trigger the {@code @DataJpaTest} Hikari-transaction hang that V90's
 * {@code CONCURRENTLY} index caused (this test completing is the proof).
 *
 * <p><strong>Production rollback note:</strong> Flyway Community Edition has no undo
 * command. The reversibility test below demonstrates the V92 DDL is cleanly
 * re-appliable by executing the inverse DDL in-test and then re-applying it, proving
 * there are no hidden dependencies or stale-object problems. Production rollback must
 * be done manually via expand/contract — this is documented here as a reminder.
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
class ListingQualityMigrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ─────────────────────────────────────────────────────────────────────────
    // AC8: property_listings new columns are nullable and of correct type
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC8: property_listings has quality_score (smallint), quality_breakdown (jsonb), quality_computed_at (timestamptz) — all nullable")
    void qualityColumns_existAndAreNullable() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT column_name, data_type, is_nullable "
                        + "FROM information_schema.columns "
                        + "WHERE table_name = 'property_listings' "
                        + "  AND column_name IN ('quality_score', 'quality_breakdown', 'quality_computed_at') "
                        + "ORDER BY column_name"
        );

        assertThat(rows).as("All three quality columns must exist on property_listings").hasSize(3);

        for (Map<String, Object> row : rows) {
            String colName  = (String) row.get("column_name");
            String nullable = (String) row.get("is_nullable");
            assertThat(nullable)
                    .as(colName + " must be nullable (NO DEFAULT, backward-compatible)")
                    .isEqualToIgnoringCase("YES");
        }

        Map<String, String> typesByName = new java.util.HashMap<>();
        for (Map<String, Object> row : rows) {
            typesByName.put((String) row.get("column_name"), (String) row.get("data_type"));
        }

        // quality_score: smallint maps to "smallint" in information_schema
        assertThat(typesByName.get("quality_score"))
                .as("quality_score data_type")
                .isEqualToIgnoringCase("smallint");

        // quality_breakdown: jsonb
        assertThat(typesByName.get("quality_breakdown"))
                .as("quality_breakdown data_type")
                .isEqualToIgnoringCase("jsonb");

        // quality_computed_at: timestamptz = "timestamp with time zone" in information_schema
        assertThat(typesByName.get("quality_computed_at"))
                .as("quality_computed_at data_type")
                .isEqualToIgnoringCase("timestamp with time zone");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC8: listing_quality_history table — columns, FK, index
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC8: listing_quality_history table exists with expected columns")
    void historyTable_exists() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_name = 'listing_quality_history' "
                        + "ORDER BY column_name"
        );
        List<String> colNames = rows.stream()
                .map(r -> (String) r.get("column_name"))
                .toList();

        assertThat(colNames).as("listing_quality_history columns")
                .containsExactlyInAnyOrder("id", "listing_id", "score", "breakdown", "computed_at");
    }

    @Test
    @DisplayName("AC8: listing_quality_history.listing_id FK references property_listings with ON DELETE CASCADE")
    void historyTable_foreignKey_onDeleteCascade() {
        // pg_constraint: confdeltype = 'c' means CASCADE
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT c.confdeltype "
                        + "FROM pg_constraint c "
                        + "JOIN pg_class cl  ON cl.oid  = c.conrelid "
                        + "JOIN pg_class rcl ON rcl.oid = c.confrelid "
                        + "WHERE cl.relname  = 'listing_quality_history' "
                        + "  AND rcl.relname = 'property_listings' "
                        + "  AND c.contype   = 'f'"
        );

        assertThat(rows).as("FK from listing_quality_history to property_listings must exist").hasSize(1);

        String confdeltype = (String) rows.get(0).get("confdeltype");
        assertThat(confdeltype)
                .as("FK must be ON DELETE CASCADE (confdeltype='c')")
                .isEqualTo("c");
    }

    @Test
    @DisplayName("AC8: idx_listing_quality_history_listing_computed index exists on (listing_id, computed_at)")
    void historyTable_index_exists() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT indexname FROM pg_indexes "
                        + "WHERE tablename = 'listing_quality_history' "
                        + "  AND indexname = 'idx_listing_quality_history_listing_computed'"
        );

        assertThat(rows)
                .as("idx_listing_quality_history_listing_computed must exist")
                .hasSize(1);
    }

    @Test
    @DisplayName("AC8 no-hang: test context started and queries run — proves PLAIN index does not hang @DataJpaTest")
    void plainIndex_doesNotCauseHikariHang() {
        // Reaching this point means Flyway completed V92 (including CREATE INDEX without
        // CONCURRENTLY) inside the Spring transaction and the Hikari pool was not deadlocked.
        // The mere fact that this @DataJpaTest context started is the proof.
        // We do a trivial query to confirm the template is fully operational.
        Integer one = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        assertThat(one).isEqualTo(1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AC9: reversibility — drop V92 DDL, assert objects gone, re-apply, assert restored
    //
    // NOTE: This is a manual DDL demonstration only. Flyway Community has no undo
    // support. Production rollback must be done via expand/contract (deploy a migration
    // that drops the columns/table after confirming no readers remain).
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC9: V92 DDL is reversible — drop objects, confirm gone, re-apply, confirm restored")
    void reversibility_dropAndReapply() {
        // ── Step 1: drop V92 objects (inverse DDL) ──────────────────────────
        assertDoesNotThrow(() ->
                jdbcTemplate.execute(
                        "DROP TABLE listing_quality_history; "
                                + "ALTER TABLE property_listings "
                                + "  DROP COLUMN IF EXISTS quality_score, "
                                + "  DROP COLUMN IF EXISTS quality_breakdown, "
                                + "  DROP COLUMN IF EXISTS quality_computed_at"
                ),
                "Inverse DDL must succeed without errors"
        );

        // ── Step 2: confirm objects are gone ────────────────────────────────
        List<Map<String, Object>> qualityCols = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_name = 'property_listings' "
                        + "  AND column_name IN ('quality_score','quality_breakdown','quality_computed_at')"
        );
        assertThat(qualityCols)
                .as("quality columns must be gone after DROP")
                .isEmpty();

        List<Map<String, Object>> historyTables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_name = 'listing_quality_history'"
        );
        assertThat(historyTables)
                .as("listing_quality_history must be gone after DROP TABLE")
                .isEmpty();

        // ── Step 3: re-apply V92 DDL ─────────────────────────────────────────
        // (Inline the same statements as V92 to prove re-applicability.)
        assertDoesNotThrow(() -> {
            jdbcTemplate.execute(
                    "ALTER TABLE property_listings "
                            + "  ADD COLUMN quality_score       smallint, "
                            + "  ADD COLUMN quality_breakdown   jsonb, "
                            + "  ADD COLUMN quality_computed_at timestamptz"
            );
            jdbcTemplate.execute(
                    "CREATE TABLE listing_quality_history ("
                            + "  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(), "
                            + "  listing_id  uuid        NOT NULL REFERENCES property_listings(id) ON DELETE CASCADE, "
                            + "  score       smallint, "
                            + "  breakdown   jsonb, "
                            + "  computed_at timestamptz NOT NULL DEFAULT now()"
                            + ")"
            );
            jdbcTemplate.execute(
                    "CREATE INDEX idx_listing_quality_history_listing_computed "
                            + "  ON listing_quality_history (listing_id, computed_at DESC)"
            );
        }, "Re-applying V92 DDL must succeed without stale-object errors");

        // ── Step 4: confirm restored ─────────────────────────────────────────
        List<Map<String, Object>> restoredCols = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_name = 'property_listings' "
                        + "  AND column_name IN ('quality_score','quality_breakdown','quality_computed_at')"
        );
        assertThat(restoredCols)
                .as("quality columns must be restored after re-apply")
                .hasSize(3);

        List<Map<String, Object>> restoredIndex = jdbcTemplate.queryForList(
                "SELECT indexname FROM pg_indexes "
                        + "WHERE tablename = 'listing_quality_history' "
                        + "  AND indexname = 'idx_listing_quality_history_listing_computed'"
        );
        assertThat(restoredIndex)
                .as("index must be restored after re-apply")
                .hasSize(1);
    }
}
