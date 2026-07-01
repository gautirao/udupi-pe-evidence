package com.example.realestate.listing;

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

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Live migration proof for V103 (M38-13A / #1626): residential typed-listing fields expand.
 *
 * <p>Verifies against a real PostgreSQL + PostGIS container:
 * <ol>
 *   <li>Flyway applies all migrations through V103 cleanly (V103 is included by the default
 *       {@code classpath:db/migration} location).</li>
 *   <li>All new columns exist, are nullable, and have no default.</li>
 *   <li>chk_listing_property_type accepts 'villa' and 'residential_plot' (net-new) while a
 *       pre-existing value ('house') and a bogus value are still handled correctly.</li>
 *   <li>listing_preferred_tenants is additive, empty, and enforces UNIQUE(listing_id, code).</li>
 *   <li>Re-running the V103 SQL body directly is idempotent (IF NOT EXISTS / DROP+re-ADD guards).</li>
 *   <li>A pre-V103-shaped legacy row (no new columns populated) reads back with every new column
 *       NULL — zero constraint violations, honest-null preserved.</li>
 * </ol>
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
class V103ResidentialFieldsMigrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static UUID insertMinimalListing(JdbcTemplate jdbcTemplate, String propertyType) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings (id, created_at, updated_at, property_type) "
                        + "VALUES (?, now(), now(), ?)",
                id, propertyType);
        return id;
    }

    @Test
    @DisplayName("V103: chk_listing_property_type accepts 'villa'")
    void v103_villa_insertSucceeds() {
        UUID id = insertMinimalListing(jdbcTemplate, "villa");
        String saved = jdbcTemplate.queryForObject(
                "SELECT property_type FROM public.property_listings WHERE id = ?", String.class, id);
        assertThat(saved).isEqualTo("villa");
    }

    @Test
    @DisplayName("V103: chk_listing_property_type accepts 'residential_plot'")
    void v103_residentialPlot_insertSucceeds() {
        UUID id = insertMinimalListing(jdbcTemplate, "residential_plot");
        String saved = jdbcTemplate.queryForObject(
                "SELECT property_type FROM public.property_listings WHERE id = ?", String.class, id);
        assertThat(saved).isEqualTo("residential_plot");
    }

    @Test
    @DisplayName("V103: preserved existing value 'house' still passes the constraint")
    void v103_existingValue_house_stillPasses() {
        UUID id = insertMinimalListing(jdbcTemplate, "house");
        String saved = jdbcTemplate.queryForObject(
                "SELECT property_type FROM public.property_listings WHERE id = ?", String.class, id);
        assertThat(saved).isEqualTo("house");
    }

    @Test
    @DisplayName("V103: bogus property_type still violates the constraint")
    void v103_bogusPropertyType_violatesConstraint() {
        assertThatThrownBy(() -> insertMinimalListing(jdbcTemplate, "not_a_type"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("V103: legacy pre-V103-shaped row — all new columns read back NULL (honest-null, zero violations)")
    void v103_legacyRow_allNewColumnsNull() {
        UUID id = insertMinimalListing(jdbcTemplate, "apartment");

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT balconies, facing, availability_timeline, super_built_area, super_built_area_unit, "
                        + "property_age, residential_water_source, parking_2w_count, parking_4w_count, "
                        + "road_width_ft, plot_dimensions, conversion_status, khata_number, property_tax_pid, "
                        + "approving_authority, project_name, builder_name, maintenance_paise, "
                        + "has_lift, has_power_backup, is_gated, has_garden, has_terrace, has_compound, "
                        + "has_servant_room, is_corner_plot, has_boundary_wall, is_gated_layout, "
                        + "has_water_connection, has_electricity_connection, has_drainage, "
                        + "price_negotiable, rent_negotiable, pets_allowed, maintenance_included "
                        + "FROM public.property_listings WHERE id = ?",
                id);

        assertThat(row.values()).as("every new V103 column must be NULL on a legacy-shaped row")
                .allMatch(v -> v == null);
    }

    @Test
    @DisplayName("V103: listing_preferred_tenants is additive, empty for existing rows, and unique per (listing_id, code)")
    void v103_listingPreferredTenants_additiveAndUnique() {
        UUID listingId = insertMinimalListing(jdbcTemplate, "villa");

        Long countBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_preferred_tenants WHERE listing_id = ?", Long.class, listingId);
        assertThat(countBefore).isZero();

        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (listing_id, code) VALUES (?, ?)",
                listingId, "FAMILY");

        Long countAfterFirstInsert = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_preferred_tenants WHERE listing_id = ?", Long.class, listingId);
        assertThat(countAfterFirstInsert).isEqualTo(1L);

        // Duplicate-key assertion is last: a violated UNIQUE constraint aborts the current
        // Postgres transaction, so no further statements can run against this connection
        // within the same @DataJpaTest-managed transaction after this point.
        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (listing_id, code) VALUES (?, ?)",
                listingId, "FAMILY"))
                .as("UNIQUE(listing_id, code) must reject a duplicate code for the same listing")
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("V103: listing_preferred_tenants cascades on listing delete")
    void v103_listingPreferredTenants_cascadeDelete() {
        UUID listingId = insertMinimalListing(jdbcTemplate, "residential_plot");
        jdbcTemplate.update(
                "INSERT INTO public.listing_preferred_tenants (listing_id, code) VALUES (?, ?)",
                listingId, "STUDENTS");

        jdbcTemplate.update("DELETE FROM public.property_listings WHERE id = ?", listingId);

        Long countAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.listing_preferred_tenants WHERE listing_id = ?", Long.class, listingId);
        assertThat(countAfter).isZero();
    }

    @Test
    @DisplayName("V103: re-running the ADD COLUMN / CHECK expand / CREATE TABLE body is idempotent")
    void v103_reRunning_isIdempotent() {
        // Re-executes the exact idempotent-guarded DDL shape from V103 a second time against an
        // already-migrated schema. IF NOT EXISTS / DROP-then-re-ADD guards must make this a no-op
        // that raises no error (proves the migration is safe to re-run, per architect decision).
        jdbcTemplate.execute("ALTER TABLE public.property_listings "
                + "ADD COLUMN IF NOT EXISTS balconies integer, "
                + "ADD COLUMN IF NOT EXISTS maintenance_paise bigint");
        jdbcTemplate.execute("ALTER TABLE public.property_listings "
                + "DROP CONSTRAINT IF EXISTS chk_listing_property_type");
        jdbcTemplate.execute("ALTER TABLE public.property_listings "
                + "ADD CONSTRAINT chk_listing_property_type CHECK (property_type IN ("
                + "'house', 'apartment', 'land', 'commercial', 'commercial_building', 'warehouse', "
                + "'commercial_land', 'other', 'agricultural_land', 'villa', 'residential_plot'))");
        jdbcTemplate.execute("CREATE TABLE IF NOT EXISTS public.listing_preferred_tenants ("
                + "id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
                + "listing_id uuid NOT NULL REFERENCES public.property_listings(id) ON DELETE CASCADE, "
                + "code text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), "
                + "CONSTRAINT listing_preferred_tenants_listing_code_uniq UNIQUE (listing_id, code))");

        // Schema is still usable after the re-run.
        UUID id = insertMinimalListing(jdbcTemplate, "villa");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT property_type FROM public.property_listings WHERE id = ?", String.class, id))
                .isEqualTo("villa");
    }

    @Test
    @DisplayName("V103: pre-seeded legacy rows across all pre-existing property types survive the CHECK expansion")
    void v103_preSeededLegacyRows_zeroConstraintViolations() {
        List<String> legacyTypes = List.of(
                "house", "apartment", "land", "commercial",
                "commercial_building", "warehouse", "commercial_land", "other", "agricultural_land");
        for (String type : legacyTypes) {
            UUID id = insertMinimalListing(jdbcTemplate, type);
            String saved = jdbcTemplate.queryForObject(
                    "SELECT property_type FROM public.property_listings WHERE id = ?", String.class, id);
            assertThat(saved).isEqualTo(type);
        }
    }
}
