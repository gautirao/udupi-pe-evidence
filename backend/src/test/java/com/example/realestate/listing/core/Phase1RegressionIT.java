package com.example.realestate.listing.core;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * End-to-end regression test for Phase 1 features:
 * <ul>
 *   <li>The full Flyway migration chain (through v86) applies cleanly on real Postgres</li>
 *   <li>{@code property_listings.status} is {@code VARCHAR(30)} guarded by the CHECK
 *       constraint {@code chk_listing_status} — the {@code listing_status} enum was
 *       removed by V60 (see V60 lines 209-211 for the constraint, line 225 for the
 *       {@code DROP TYPE})</li>
 *   <li>{@code dealer} value exists in {@code app_role} enum (unaffected by V60)</li>
 *   <li>DB default for {@code status} column produces {@code 'SCRAPED'} (ingestion compat)</li>
 *   <li>JPA entity default for {@code status} produces {@code 'SCRAPED'}</li>
 * </ul>
 *
 * <p>Uses Testcontainers PostgreSQL so no network access to Supabase is needed.
 * Requires Docker to be running.</p>
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        // Disable SSL — Testcontainers Postgres doesn't use SSL
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        // Allow Hibernate to send String values into Postgres enum columns
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // Include test stubs (auth schema) before real migrations
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        // Override to empty so V73's CREATE INDEX runs without CONCURRENTLY.
        // CONCURRENTLY requires no-transaction mode; Flyway community does not support that pragma.
        // A fresh test container has no concurrent readers, so non-concurrent index creation is safe.
        "spring.flyway.placeholders.concurrently_keyword="
})
class Phase1RegressionIT {

    // postgis/postgis:15-3.4 includes PostGIS — required for geography type (V73+).
    // asCompatibleSubstituteFor("postgres") is required by Testcontainers for non-official images.
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ListingRepository listingRepository;

    // ===== Migration integrity =====

    @Test
    @DisplayName("status column is VARCHAR after V60 (listing_status enum dropped)")
    void statusColumn_isVarcharAfterV60() {
        // V60 dropped the enum type (line 225: DROP TYPE IF EXISTS public.listing_status)
        // after converting the column to VARCHAR(30) (lines 67-68). The type must be absent.
        Integer enumCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM pg_type WHERE typname = 'listing_status'",
                Integer.class);
        assertThat(enumCount).isEqualTo(0);

        // The status column is now plain character varying.
        String dataType = jdbcTemplate.queryForObject(
                "SELECT data_type FROM information_schema.columns "
                        + "WHERE table_schema = 'public' "
                        + "AND table_name = 'property_listings' "
                        + "AND column_name = 'status'",
                String.class);
        assertThat(dataType).isEqualTo("character varying");
    }

    @Test
    @DisplayName("chk_listing_status enforces all 6 status values")
    void statusCheckConstraint_enforcesAllSixValues() {
        // V60 lines 209-211 added CHECK (status IN ('DRAFT','PENDING_REVIEW','LIVE',
        // 'REJECTED','ARCHIVED','SCRAPED')). Functionally probe each value: all 6 must
        // insert, an unknown value must be rejected by chk_listing_status.
        List<String> validStatuses = List.of(
                "SCRAPED", "DRAFT", "PENDING_REVIEW", "LIVE", "REJECTED", "ARCHIVED");
        for (String status : validStatuses) {
            UUID id = UUID.randomUUID();
            jdbcTemplate.update(
                    "INSERT INTO public.property_listings (id, status, created_at, updated_at) "
                            + "VALUES (?, ?, now(), now())",
                    id, status);

            String persisted = jdbcTemplate.queryForObject(
                    "SELECT status FROM public.property_listings WHERE id = ?",
                    String.class, id);
            assertThat(persisted).as("status %s should be accepted", status).isEqualTo(status);
        }

        // A value outside the 6 must be rejected by chk_listing_status.
        UUID bogusId = UUID.randomUUID();
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, status, created_at, updated_at) "
                        + "VALUES (?, 'BOGUS', now(), now())",
                bogusId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("app_role enum includes 'dealer' value")
    void appRoleEnum_includesDealer() {
        List<String> values = jdbcTemplate.queryForList(
                "SELECT unnest(enum_range(NULL::app_role))::text AS val",
                String.class);
        assertThat(values).contains("dealer");
    }

    // ===== Ingestion compatibility: DB default =====

    @Test
    @DisplayName("INSERT without status column defaults to SCRAPED (edge-function ingestion path)")
    void insertWithoutStatus_defaultsToScraped() {
        // This mirrors what the parse-posts edge function does:
        // INSERT INTO property_listings (...) without specifying status.
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at) "
                        + "VALUES (?, now(), now())",
                id);

        String status = jdbcTemplate.queryForObject(
                "SELECT status::text FROM public.property_listings WHERE id = ?",
                String.class, id);
        assertThat(status).isEqualTo("SCRAPED");
    }

    @Test
    @DisplayName("INSERT without status — all NOT NULL columns get safe defaults")
    void insertWithoutStatus_allDefaultsApplied() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at) "
                        + "VALUES (?, now(), now())",
                id);

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT status::text AS status, property_type::text AS property_type, "
                        + "is_valid, is_duplicate, repost_count, address_confirmed "
                        + "FROM public.property_listings WHERE id = ?",
                id);

        assertThat(row.get("status")).isEqualTo("SCRAPED");
        assertThat(row.get("property_type")).isEqualTo("other");
        assertThat(row.get("is_valid")).isEqualTo(true);
        assertThat(row.get("is_duplicate")).isEqualTo(false);
        assertThat(row.get("repost_count")).isEqualTo(0);
        assertThat(row.get("address_confirmed")).isEqualTo(false);
    }

    // ===== JPA entity default =====

    @Test
    @DisplayName("JPA Listing entity save produces status=SCRAPED (ListingService path)")
    void jpaListingSave_statusDefaultsToScraped() {
        Listing listing = new Listing();
        // Hibernate sends all columns in INSERT (no @DynamicInsert), so we must
        // provide values for NOT NULL fields that the DB would normally DEFAULT.
        OffsetDateTime now = OffsetDateTime.now();
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        Listing saved = listingRepository.saveAndFlush(listing);

        // Re-read from DB to confirm persisted value
        Listing fromDb = listingRepository.findById(saved.getId()).orElseThrow();
        assertThat(fromDb.getStatus()).isEqualTo("SCRAPED");
    }

    @Test
    @DisplayName("JPA Listing entity — status field matches ListingStatus.SCRAPED")
    void jpaListingEntity_statusFieldMatchesEnum() {
        Listing listing = new Listing();
        assertThat(listing.getStatus()).isEqualTo(ListingStatus.SCRAPED.toDbValue());
    }
}
