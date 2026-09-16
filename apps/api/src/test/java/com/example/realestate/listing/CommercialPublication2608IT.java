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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Issue #2608 — Integration test suite for Controlled Commercial Publication, Ownership Remediation,
 * Canary Gate, and Batch Unpublish workflow.
 *
 * <p><b>DELIBERATELY UNTAGGED.</b> Surefire includes {@code **&#47;*IT.java} and excludes the
 * {@code integration} group, ensuring this IT executes during standard test runs.
 *
 * <p><b>{@code Propagation.NOT_SUPPORTED}</b> ensures real transaction commits occur so deferred
 * constraint triggers and batch audit records fire as designed.
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
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class CommercialPublication2608IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final Path IMPORTS_DIR =
            Path.of("..", "..", "data", "imports", "commercial-inventory-2575");

    private static final String CANONICAL_SERVICE_PRINCIPAL = "e7b61f70-d087-44d8-a81d-7f8a057d2775";
    private static final String NIL_UUID = "00000000-0000-0000-0000-000000000000";

    private static final List<String> CANARY_UUIDS = List.of(
            "15bd7df2-b578-6405-ca23-8f39f794d572", // Udupi SHOP
            "8e0896c4-bb5d-a9d8-0dd8-29a87f52380c", // Udupi OFFICE
            "05be37a2-6eca-2193-4cad-14109b966d87", // Udupi LAND
            "bbfe8c07-3fd2-90e0-c194-cb8607dff8c3", // Bengaluru SHOP
            "f335fc24-0ef8-cbf0-bfa8-177c94b5b8f5", // Bengaluru OFFICE
            "ea2b6b68-87f6-4f5e-b34c-59b2c082321a", // Bengaluru WAREHOUSE
            "c3b513e7-ee12-46c6-a1bc-513d66f22c22", // Bengaluru LAND
            "f96a87cd-8670-815b-e35d-bdbaadfb78ce", // Mangalore SHOP
            "a3bad877-bc47-deba-c588-9d5b7e136c20", // Mangalore OFFICE
            "964bb405-df45-1f7b-4d7d-4eaab56def14"  // Mangalore WAREHOUSE
    );

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    @BeforeEach
    void setUp() throws Exception {
        // Clean up database tables prior to test execution
        jdbc.execute("TRUNCATE public.commercial_publication_batch, public.property_listings, public.commercial_import_candidate, public.commercial_import_batch CASCADE");

        // Seed cities and areas required for RESOLVED canonical checks in test database
        jdbc.execute("""
            INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon) VALUES
              ('udupi', 'Udupi', 13.3409, 74.7421),
              ('bengaluru', 'Bengaluru', 12.9716, 77.5946),
              ('mangalore', 'Mangalore', 12.9141, 74.8560)
            ON CONFLICT (slug) DO NOTHING;
            """);

        jdbc.execute("""
            INSERT INTO public.areas (area_key, city_id, name, district, area_slug, lifecycle_status, geo_center_lat, geo_center_lon, min_lat, min_lon, max_lat, max_lon)
            SELECT v.area_key, c.id, v.name, v.district, v.area_slug, 'ACTIVE', v.lat, v.lon, v.lat-0.01, v.lon-0.01, v.lat+0.01, v.lon+0.01
            FROM (VALUES
                ('IN|KA|Udupi|Manipal', 'udupi', 'Manipal', 'Udupi', 'manipal', 13.35, 74.78),
                ('IN|KA|Udupi|Udupi', 'udupi', 'Udupi', 'Udupi', 'udupi', 13.34, 74.75),
                ('IN|KA|Udupi|Shivalli', 'udupi', 'Shivalli', 'Udupi', 'shivalli', 13.34, 74.76),
                ('IN|KA|Udupi|Kunjibettu', 'udupi', 'Kunjibettu', 'Udupi', 'kunjibettu', 13.35, 74.76),
                ('IN|KA|Udupi|Ambagilu', 'udupi', 'Ambagilu', 'Udupi', 'ambagilu', 13.36, 74.75),
                ('IN|KA|Udupi|Brahmagiri', 'udupi', 'Brahmagiri', 'Udupi', 'brahmagiri', 13.33, 74.74),
                ('IN|KA|Udupi|Saligrama', 'udupi', 'Saligrama', 'Udupi', 'saligrama', 13.31, 74.78),
                ('IN|KA|Bengaluru|Rajajinagar', 'bengaluru', 'Rajajinagar', 'Bengaluru', 'rajajinagar', 12.99, 77.55),
                ('IN|KA|Bengaluru|Chennakeshava-Nagar', 'bengaluru', 'Chennakeshava Nagar', 'Bengaluru', 'chennakeshava-nagar', 12.87, 77.64),
                ('IN|KA|Bengaluru|Peenya', 'bengaluru', 'Peenya', 'Bengaluru', 'peenya', 13.03, 77.52),
                ('IN|KA|Bengaluru|Hebbal', 'bengaluru', 'Hebbal', 'Bengaluru', 'hebbal', 13.03, 77.59),
                ('IN|KA|Bengaluru|Nelamangala', 'bengaluru', 'Nelamangala', 'Bengaluru', 'nelamangala', 13.09, 77.38),
                ('IN|KA|Bengaluru|Marathahalli', 'bengaluru', 'Marathahalli', 'Bengaluru', 'marathahalli', 12.95, 77.70),
                ('IN|KA|Bengaluru|Banashankari', 'bengaluru', 'Banashankari', 'Bengaluru', 'banashankari', 12.92, 77.57),
                ('IN|KA|Bengaluru|Electronic City', 'bengaluru', 'Electronic City', 'Bengaluru', 'electronic-city', 12.84, 77.66),
                ('IN|KA|Bengaluru|Vijayanagar', 'bengaluru', 'Vijayanagar', 'Bengaluru', 'vijayanagar', 12.97, 77.53),
                ('IN|KA|Bengaluru|Mahadevapura', 'bengaluru', 'Mahadevapura', 'Bengaluru', 'mahadevapura', 12.98, 77.68),
                ('IN|KA|Bengaluru|Kothanur', 'bengaluru', 'Kothanur', 'Bengaluru', 'kothanur', 13.06, 77.65),
                ('IN|KA|Bengaluru|Jayanagar', 'bengaluru', 'Jayanagar', 'Bengaluru', 'jayanagar', 12.92, 77.59),
                ('IN|KA|Bengaluru|Yelahanka', 'bengaluru', 'Yelahanka', 'Bengaluru', 'yelahanka', 13.10, 77.59),
                ('IN|KA|Bengaluru|Whitefield', 'bengaluru', 'Whitefield', 'Bengaluru', 'whitefield', 12.97, 77.75),
                ('IN|KA|Bengaluru|Abbigere', 'bengaluru', 'Abbigere', 'Bengaluru', 'abbigere', 13.08, 77.51),
                ('IN|KA|Bengaluru|Indiranagar', 'bengaluru', 'Indiranagar', 'Bengaluru', 'indiranagar', 12.97, 77.64),
                ('IN|KA|Bengaluru|Koramangala', 'bengaluru', 'Koramangala', 'Bengaluru', 'koramangala', 12.93, 77.62),
                ('IN|KA|Bengaluru|Byrathi', 'bengaluru', 'Byrathi', 'Bengaluru', 'byrathi', 13.06, 77.65),
                ('IN|KA|Bengaluru|Bommanahalli', 'bengaluru', 'Bommanahalli', 'Bengaluru', 'bommanahalli', 12.90, 77.62),
                ('IN|KA|Bengaluru|Begur', 'bengaluru', 'Begur', 'Bengaluru', 'begur', 12.87, 77.63),
                ('IN|KA|Bengaluru|HSR Layout', 'bengaluru', 'HSR Layout', 'Bengaluru', 'hsr-layout', 12.91, 77.64),
                ('IN|KA|Mangalore|Kadri', 'mangalore', 'Kadri', 'Mangalore', 'kadri', 12.88, 74.85),
                ('IN|KA|Mangalore|Bunder', 'mangalore', 'Bunder', 'Mangalore', 'bunder', 12.86, 74.83),
                ('IN|KA|Mangalore|Kankanady', 'mangalore', 'Kankanady', 'Mangalore', 'kankanady', 12.87, 74.85),
                ('IN|KA|Mangalore|Balmatta', 'mangalore', 'Balmatta', 'Mangalore', 'balmatta', 12.86, 74.83),
                ('IN|KA|Mangalore|Attavar', 'mangalore', 'Attavar', 'Mangalore', 'attavar', 12.86, 74.84),
                ('IN|KA|Mangalore|Surathkal', 'mangalore', 'Surathkal', 'Mangalore', 'surathkal', 12.99, 74.79)
            ) AS v (area_key, city_slug, name, district, area_slug, lat, lon)
            JOIN public.cities c ON c.slug = v.city_slug
            ON CONFLICT (area_key) DO UPDATE SET lifecycle_status = 'ACTIVE';
            """);

        // Load staging data across Udupi, Bengaluru, and Mangalore
        applySqlFile("udupi-load-staging.sql");
        applySqlFile("bengaluru-load-staging.sql");
        applySqlFile("mangalore-load-staging.sql");

        // Promote candidates to property_listings with NIL_UUID owner (simulating pre-remediation state)
        promoteWithOwner(NIL_UUID);
    }

    private void applySqlFile(String fileName) throws Exception {
        String sql = Files.readString(IMPORTS_DIR.resolve(fileName));
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    private void executeSqlFileInTransaction(String fileName) throws Exception {
        String sql = Files.readString(IMPORTS_DIR.resolve(fileName));
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute(sql);
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    private void promoteWithOwner(String ownerUuid) throws Exception {
        String sql = Files.readString(IMPORTS_DIR.resolve("promote.sql"));
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.execute("SET LOCAL app.import_owner = '" + ownerUuid + "'");
                st.execute(sql);
                c.commit();
            } catch (SQLException e) {
                c.rollback();
                throw e;
            }
        }
    }

    @Test
    @DisplayName("Condition 1: Remediation SQL updates nil created_by to canonical service principal")
    void ownershipRemediation_updatesNilOwnerToCanonicalPrincipal() throws Exception {
        Long nilOwnerCountBefore = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE created_by = ?::uuid",
                Long.class, NIL_UUID);
        assertThat(nilOwnerCountBefore).isGreaterThan(0);

        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        Long nilOwnerCountAfter = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE created_by = ?::uuid",
                Long.class, NIL_UUID);
        assertThat(nilOwnerCountAfter).isEqualTo(0L);

        Long canonicalOwnerCount = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE created_by = ?::uuid",
                Long.class, CANONICAL_SERVICE_PRINCIPAL);
        assertThat(canonicalOwnerCount).isEqualTo(nilOwnerCountBefore);
    }

    @Test
    @DisplayName("Condition 2: Remediation SQL is idempotent on re-execution")
    void ownershipRemediation_isIdempotent() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");
        Long countFirst = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE created_by = ?::uuid",
                Long.class, CANONICAL_SERVICE_PRINCIPAL);

        // Second execution
        executeSqlFileInTransaction("remediate-ownership-2608.sql");
        Long countSecond = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE created_by = ?::uuid",
                Long.class, CANONICAL_SERVICE_PRINCIPAL);

        assertThat(countSecond).isEqualTo(countFirst);
    }

    @Test
    @DisplayName("Condition 3: Remediation SQL scope is bounded to promoted commercial candidates")
    void ownershipRemediation_boundedScopeDoesNotTouchUnrelatedListings() throws Exception {
        // Insert an unrelated listing with nil owner not in commercial_import_candidate
        UUID unrelatedId = UUID.randomUUID();
        jdbc.update("INSERT INTO public.property_listings (id, created_by, title, status, listing_family, property_type) VALUES (?, ?::uuid, 'Unrelated Listing', 'DRAFT', 'RESIDENTIAL', 'apartment')",
                unrelatedId, NIL_UUID);

        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        String ownerAfter = jdbc.queryForObject(
                "SELECT created_by::text FROM public.property_listings WHERE id = ?",
                String.class, unrelatedId);
        assertThat(ownerAfter).isEqualTo(NIL_UUID);
    }

    @Test
    @DisplayName("Condition 4: Remediation rollback SQL reverts created_by to nil UUID")
    void ownershipRemediation_rollbackRevertsOwnerToNilUuid() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        executeSqlFileInTransaction("remediate-ownership-2608-rollback.sql");

        Long nilOwnerCount = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE created_by = ?::uuid",
                Long.class, NIL_UUID);
        assertThat(nilOwnerCount).isGreaterThan(0);
    }

    @Test
    @DisplayName("Condition 5: Data quality gate rejects empty/null title")
    void publicationGate_rejectsEmptyTitle() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        // Make one canary listing title null
        UUID targetCanary = UUID.fromString(CANARY_UUIDS.get(0));
        jdbc.update("UPDATE public.property_listings SET title = '' WHERE id = ?", targetCanary);

        assertThatThrownBy(() -> executeSqlFileInTransaction("publish-canary.sql"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Phase C data-quality gate");
    }

    @Test
    @DisplayName("Condition 6: Data quality gate rejects nil owner")
    void publicationGate_rejectsNilOwner() throws Exception {
        // Do NOT run remediation SQL -> listings still have NIL_UUID owner
        assertThatThrownBy(() -> executeSqlFileInTransaction("publish-canary.sql"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Phase C data-quality gate");
    }

    @Test
    @DisplayName("Condition 7: Data quality gate rejects invalid commercial_subtype")
    void publicationGate_rejectsInvalidSubtype() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        UUID targetCanary = UUID.fromString(CANARY_UUIDS.get(0));
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement st = c.createStatement()) {
                st.executeUpdate("UPDATE public.listing_commercial_space_details SET commercial_subtype = 'INVALID_TYPE' WHERE listing_id = '" + targetCanary + "'");
                st.executeUpdate("UPDATE public.property_listings SET commercial_subtype = 'INVALID_TYPE' WHERE id = '" + targetCanary + "'");
                c.commit();
            }
        }

        assertThatThrownBy(() -> executeSqlFileInTransaction("publish-canary.sql"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Phase C data-quality gate");
    }

    @Test
    @DisplayName("Condition 8: Data quality gate rejects unresolved area")
    void publicationGate_rejectsUnresolvedArea() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        UUID targetCanary = UUID.fromString(CANARY_UUIDS.get(0));
        jdbc.update("UPDATE public.property_listings SET area_resolution_status = 'UNRESOLVED' WHERE id = ?", targetCanary);

        assertThatThrownBy(() -> executeSqlFileInTransaction("publish-canary.sql"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Phase C data-quality gate");
    }

    @Test
    @DisplayName("Condition 9: Data quality gate rejects purpose/money mismatch")
    void publicationGate_rejectsPurposeMoneyMismatch() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        UUID targetCanary = UUID.fromString(CANARY_UUIDS.get(0));
        // Set sale listing price to null
        jdbc.update("UPDATE public.property_listings SET price = NULL WHERE id = ?", targetCanary);

        assertThatThrownBy(() -> executeSqlFileInTransaction("publish-canary.sql"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Phase C data-quality gate");
    }

    @Test
    @DisplayName("Condition 10: Data quality gate rejects non-commercial listing family")
    void publicationGate_rejectsNonCommercialFamily() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        UUID targetCanary = UUID.fromString(CANARY_UUIDS.get(0));
        jdbc.update("UPDATE public.property_listings SET listing_family = 'RESIDENTIAL' WHERE id = ?", targetCanary);

        assertThatThrownBy(() -> executeSqlFileInTransaction("publish-canary.sql"))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Phase C data-quality gate");
    }

    @Test
    @DisplayName("Condition 11: Canary publication publishes 10 canaries and records audit entry")
    void publishCanary_publishesTenListingsAndAuditsBatch() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        executeSqlFileInTransaction("publish-canary.sql");

        try (Connection c = dataSource.getConnection()) {
            Long liveCanaryCount = jdbc.queryForObject(
                    "SELECT count(*) FROM public.property_listings WHERE status = 'LIVE' AND id IN (SELECT unnest(?::uuid[]))",
                    Long.class,
                    c.createArrayOf("uuid", CANARY_UUIDS.stream().map(UUID::fromString).toArray()));

            assertThat(liveCanaryCount).isEqualTo(10L);
        }

        Long auditCount = jdbc.queryForObject(
                "SELECT count(*) FROM public.commercial_publication_batch WHERE batch_type = 'CANARY' AND batch_name = 'CANARY_2608' AND target_listing_count = 10",
                Long.class);
        assertThat(auditCount).isEqualTo(1L);
    }

    @Test
    @DisplayName("Condition 12: Canary unpublish reverts 10 canaries to DRAFT and records audit entry")
    void unpublishCanary_revertsCanariesToDraftAndAuditsBatch() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");
        executeSqlFileInTransaction("publish-canary.sql");

        executeSqlFileInTransaction("unpublish-canary.sql");

        try (Connection c = dataSource.getConnection()) {
            Long draftCanaryCount = jdbc.queryForObject(
                    "SELECT count(*) FROM public.property_listings WHERE status = 'DRAFT' AND id IN (SELECT unnest(?::uuid[]))",
                    Long.class,
                    c.createArrayOf("uuid", CANARY_UUIDS.stream().map(UUID::fromString).toArray()));

            assertThat(draftCanaryCount).isEqualTo(10L);
        }

        Long unpublishAuditCount = jdbc.queryForObject(
                "SELECT count(*) FROM public.commercial_publication_batch WHERE batch_type = 'UNPUBLISH' AND batch_name = 'UNPUBLISH_CANARY_2608'",
                Long.class);
        assertThat(unpublishAuditCount).isEqualTo(1L);
    }

    @Test
    @DisplayName("Condition 13: Batch publish and unpublish execute transactionally with audit records")
    void batchPublishAndUnpublish_executesTransactionallyWithAudits() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        executeSqlFileInTransaction("publish-batch.sql");

        Long liveCount = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE status = 'LIVE'",
                Long.class);
        assertThat(liveCount).isGreaterThan(0);

        Long publishBatchAudit = jdbc.queryForObject(
                "SELECT count(*) FROM public.commercial_publication_batch WHERE batch_type = 'BATCH' AND batch_name = 'BATCH_PUBLICATION_2608'",
                Long.class);
        assertThat(publishBatchAudit).isEqualTo(1L);

        // Execute batch unpublish
        executeSqlFileInTransaction("unpublish-batch.sql");

        Long liveCountAfterUnpublish = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE status = 'LIVE'",
                Long.class);
        assertThat(liveCountAfterUnpublish).isEqualTo(0L);

        Long unpublishBatchAudit = jdbc.queryForObject(
                "SELECT count(*) FROM public.commercial_publication_batch WHERE batch_type = 'UNPUBLISH' AND batch_name = 'BATCH_UNPUBLISH_2608'",
                Long.class);
        assertThat(unpublishBatchAudit).isEqualTo(1L);
    }

    @Test
    @DisplayName("Condition 14: Discover status predicate filters out DRAFT and exposes LIVE listings")
    void discoverPredicate_filtersDraftAndExposesLiveListings() throws Exception {
        executeSqlFileInTransaction("remediate-ownership-2608.sql");

        // When DRAFT: Discover query (status = 'LIVE') returns 0 rows
        Long discoverCountWhenDraft = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE status = 'LIVE' AND listing_family = 'COMMERCIAL'",
                Long.class);
        assertThat(discoverCountWhenDraft).isEqualTo(0L);

        // Publish canaries
        executeSqlFileInTransaction("publish-canary.sql");

        // When LIVE: Discover query returns the 10 LIVE canary listings
        Long discoverCountWhenLive = jdbc.queryForObject(
                "SELECT count(*) FROM public.property_listings WHERE status = 'LIVE' AND listing_family = 'COMMERCIAL'",
                Long.class);
        assertThat(discoverCountWhenLive).isEqualTo(10L);
    }
}
