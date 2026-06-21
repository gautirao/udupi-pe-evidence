package com.example.realestate.discover.event;

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
 * Integration test for the V93 Flyway migration — discover_event table.
 *
 * <p>Harness mirrors {@code ListingQualityMigrationIT}: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4} real container.
 *
 * <p>Proves:
 * <ul>
 *   <li>Schema shape: table exists with correct columns and types.</li>
 *   <li>No PII columns present (regression guard).</li>
 *   <li>Index on ts exists.</li>
 *   <li>Reversibility: DROP TABLE succeeds cleanly (no dependents).</li>
 * </ul>
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
class DiscoverEventMigrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    // ── Schema shape ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("discover_event table exists")
    void table_exists() {
        List<Map<String, Object>> tables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_name = 'discover_event'");
        assertThat(tables).as("discover_event table must exist after V93").hasSize(1);
    }

    @Test
    @DisplayName("discover_event has all required columns with correct types and nullability")
    void columns_correctTypesAndNullability() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT column_name, data_type, is_nullable, column_default "
                        + "FROM information_schema.columns "
                        + "WHERE table_name = 'discover_event' "
                        + "ORDER BY column_name");

        Map<String, Map<String, Object>> byName = new java.util.HashMap<>();
        for (Map<String, Object> row : rows) {
            byName.put((String) row.get("column_name"), row);
        }

        // id — bigint / bigserial, NOT NULL, has default (nextval)
        assertThat(byName).containsKey("id");
        assertThat((String) byName.get("id").get("is_nullable")).isEqualToIgnoringCase("NO");

        // session_id — uuid, NOT NULL
        assertThat(byName).containsKey("session_id");
        assertThat((String) byName.get("session_id").get("is_nullable")).isEqualToIgnoringCase("NO");
        assertThat((String) byName.get("session_id").get("data_type")).containsIgnoringCase("uuid");

        // event_type — text, NOT NULL
        assertThat(byName).containsKey("event_type");
        assertThat((String) byName.get("event_type").get("is_nullable")).isEqualToIgnoringCase("NO");
        assertThat((String) byName.get("event_type").get("data_type")).isEqualToIgnoringCase("text");

        // area_key — text, nullable
        assertThat(byName).containsKey("area_key");
        assertThat((String) byName.get("area_key").get("is_nullable")).isEqualToIgnoringCase("YES");

        // property_type — text, nullable
        assertThat(byName).containsKey("property_type");
        assertThat((String) byName.get("property_type").get("is_nullable")).isEqualToIgnoringCase("YES");

        // listing_purpose — text, nullable
        assertThat(byName).containsKey("listing_purpose");
        assertThat((String) byName.get("listing_purpose").get("is_nullable")).isEqualToIgnoringCase("YES");

        // price_band — text, nullable
        assertThat(byName).containsKey("price_band");
        assertThat((String) byName.get("price_band").get("is_nullable")).isEqualToIgnoringCase("YES");

        // filters_jsonb — jsonb, NOT NULL, default '{}'::jsonb
        assertThat(byName).containsKey("filters_jsonb");
        assertThat((String) byName.get("filters_jsonb").get("is_nullable")).isEqualToIgnoringCase("NO");
        assertThat((String) byName.get("filters_jsonb").get("data_type")).isEqualToIgnoringCase("jsonb");

        // ts — timestamptz, NOT NULL, default now()
        assertThat(byName).containsKey("ts");
        assertThat((String) byName.get("ts").get("is_nullable")).isEqualToIgnoringCase("NO");
        assertThat((String) byName.get("ts").get("data_type")).containsIgnoringCase("timestamp");
    }

    @Test
    @DisplayName("discover_event has NO PII columns (regression guard)")
    void noPiiColumns() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_name = 'discover_event' "
                        + "ORDER BY column_name");
        List<String> columnNames = rows.stream()
                .map(r -> (String) r.get("column_name"))
                .toList();

        // PII-banned column names — none of these may ever appear
        for (String banned : List.of("user_id", "email", "phone", "name", "full_name",
                "ip", "user_agent", "device_id", "fingerprint",
                "lat", "lng", "latitude", "longitude",
                "raw_price", "exact_address", "address")) {
            assertThat(columnNames)
                    .as("PII column '" + banned + "' must not exist in discover_event")
                    .doesNotContain(banned);
        }
    }

    // ── Exactly the right columns (no extras) ──────────────────────────────────

    @Test
    @DisplayName("discover_event has exactly the 9 specified columns")
    void exactlyNineColumns() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.columns "
                        + "WHERE table_name = 'discover_event' "
                        + "ORDER BY column_name");
        List<String> columnNames = rows.stream()
                .map(r -> (String) r.get("column_name"))
                .toList();

        assertThat(columnNames).containsExactlyInAnyOrder(
                "id", "session_id", "event_type",
                "area_key", "property_type", "listing_purpose", "price_band",
                "filters_jsonb", "ts");
    }

    // ── Index on ts ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("idx_discover_event_ts index exists on discover_event.ts")
    void index_ts_exists() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT indexname FROM pg_indexes "
                        + "WHERE tablename = 'discover_event' "
                        + "  AND indexname = 'idx_discover_event_ts'");
        assertThat(rows).as("idx_discover_event_ts must exist").hasSize(1);
    }

    // ── event_type CHECK constraint ─────────────────────────────────────────────

    @Test
    @DisplayName("event_type CHECK constraint rejects unknown values")
    void checkConstraint_eventType_rejectsUnknown() {
        // Insert a row with an invalid event_type — must fail
        assertThat(
                org.junit.jupiter.api.Assertions.assertThrows(
                        Exception.class,
                        () -> jdbcTemplate.execute(
                                "INSERT INTO discover_event (session_id, event_type, filters_jsonb, ts) "
                                        + "VALUES (gen_random_uuid(), 'INVALID_TYPE', '{}', now())")
                )
        ).isNotNull();
    }

    @Test
    @DisplayName("event_type CHECK constraint accepts all three valid values")
    void checkConstraint_eventType_acceptsValid() {
        for (String valid : List.of("FILTER_APPLY", "PANEL_OPEN", "LEAD_INTENT")) {
            assertDoesNotThrow(() ->
                    jdbcTemplate.execute(
                            "INSERT INTO discover_event (session_id, event_type, filters_jsonb, ts) "
                                    + "VALUES (gen_random_uuid(), '" + valid + "', '{}', now())")
            );
        }
    }

    // ── session_id is NOT FK to auth.users ──────────────────────────────────────

    @Test
    @DisplayName("session_id has no foreign key constraint to auth.users")
    void sessionId_hasNoForeignKey() {
        List<Map<String, Object>> fks = jdbcTemplate.queryForList(
                "SELECT c.conname "
                        + "FROM pg_constraint c "
                        + "JOIN pg_class cl ON cl.oid = c.conrelid "
                        + "WHERE cl.relname = 'discover_event' AND c.contype = 'f'");
        assertThat(fks)
                .as("discover_event must have no foreign key constraints (session_id is not linked to users)")
                .isEmpty();
    }

    // ── Reversibility ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("V93 is reversible: DROP TABLE discover_event succeeds without errors")
    void reversibility_dropTableSucceeds() {
        // Confirm table exists first
        List<Map<String, Object>> before = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_name = 'discover_event'");
        assertThat(before).hasSize(1);

        // Drop the table (the rollback DDL documented in V93)
        assertDoesNotThrow(() -> jdbcTemplate.execute("DROP TABLE IF EXISTS discover_event"),
                "DROP TABLE discover_event must succeed — no FK dependents");

        // Confirm gone
        List<Map<String, Object>> after = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_name = 'discover_event'");
        assertThat(after).as("discover_event must be gone after DROP TABLE").isEmpty();

        // Re-apply to restore (prove no stale object issues)
        assertDoesNotThrow(() -> {
            jdbcTemplate.execute(
                    "CREATE TABLE discover_event ("
                            + "  id            bigserial   PRIMARY KEY, "
                            + "  session_id    uuid        NOT NULL, "
                            + "  event_type    text        NOT NULL "
                            + "                            CHECK (event_type IN ('FILTER_APPLY','PANEL_OPEN','LEAD_INTENT')), "
                            + "  area_key      text, "
                            + "  property_type text, "
                            + "  listing_purpose text, "
                            + "  price_band    text, "
                            + "  filters_jsonb jsonb       NOT NULL DEFAULT '{}'::jsonb, "
                            + "  ts            timestamptz NOT NULL DEFAULT now()"
                            + ")");
            jdbcTemplate.execute(
                    "CREATE INDEX idx_discover_event_ts ON discover_event (ts)");
        }, "Re-applying V93 DDL must succeed without stale-object errors");

        // Confirm restored
        List<Map<String, Object>> restored = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_name = 'discover_event'");
        assertThat(restored).as("discover_event must be restored after re-apply").hasSize(1);
    }
}
