package com.example.realestate.listing.core;

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

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end regression test for Phase 1 features:
 * <ul>
 *   <li>Flyway migrations V0–V10 apply cleanly on real Postgres</li>
 *   <li>{@code listing_status} enum exists with all expected values</li>
 *   <li>{@code dealer} value exists in {@code app_role} enum</li>
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
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration"
})
class Phase1RegressionIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15-alpine");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ListingRepository listingRepository;

    // ===== Migration integrity =====

    @Test
    @DisplayName("Flyway migrations apply cleanly — listing_status enum exists")
    void flywayMigrationsApply_listingStatusEnumExists() {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM pg_type WHERE typname = 'listing_status'",
                Integer.class);
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("listing_status enum has all 6 expected values (including ARCHIVED added by V35)")
    void listingStatusEnum_hasAllValues() {
        List<String> values = jdbcTemplate.queryForList(
                "SELECT unnest(enum_range(NULL::listing_status))::text AS val",
                String.class);
        assertThat(values).containsExactly(
                "SCRAPED", "DRAFT", "PENDING_REVIEW", "LIVE", "REJECTED", "ARCHIVED");
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
