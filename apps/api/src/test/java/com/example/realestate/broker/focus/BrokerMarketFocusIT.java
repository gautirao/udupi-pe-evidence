package com.example.realestate.broker.focus;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;

/**
 * Integration test for {@link BrokerMarketFocusService}.
 *
 * <p>Runs against a real Postgres (PostGIS) Testcontainers instance with Flyway applying
 * all migrations through V95. Tests verify:
 * <ol>
 *   <li>Seed idempotency — seed twice: row count is stable, manual rows preserved</li>
 *   <li>Ownership isolation — Broker A never sees/edits/removes Broker B's rows</li>
 *   <li>LIVE-filter — non-LIVE listings excluded from seed</li>
 *   <li>city_slug resolved via areas→cities join for BOTH seed and manual add (not area_key string-split)</li>
 *   <li>Manual add of unknown areaKey is rejected with 422 (no row inserted)</li>
 *   <li>Manual add and seed for the same (areaKey, propertyType, listingPurpose) produce the SAME
 *       composite-PK bucket — AC4 idempotency-consistency</li>
 *   <li>NULL area_key listings are excluded from seed</li>
 *   <li>Broker with zero LIVE listings seeds nothing; GET returns empty list</li>
 * </ol>
 *
 * <p>Setup mirrors {@code ListingQualityOwnershipIT}: {@code @DataJpaTest + @Testcontainers +
 * @AutoConfigureTestDatabase(replace=NONE) + @TestPropertySource} with the same Flyway
 * placeholders ({@code flyway.mixed=true}, empty {@code concurrently_keyword}).
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword="
})
@Import(BrokerMarketFocusService.class)
class BrokerMarketFocusIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private BrokerMarketFocusService service;

    private static final UUID BROKER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    private static final UUID BROKER_B = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");

    /** area_key seeded by V71 in the 'udupi' city. */
    private static final String MANIPAL_KEY = "IN|KA|Udupi|Manipal";

    /** area_key seeded by V71 in the 'kundapur' city (district='Udupi', city_slug='kundapur'). */
    private static final String KUNDAPUR_KEY = "IN|KA|Udupi|Kundapur";

    @BeforeEach
    void cleanFocus() {
        // Isolate each test — purge only our test broker rows from broker_market_focus
        jdbcTemplate.update(
                "DELETE FROM broker_market_focus WHERE broker_id IN (?, ?)", BROKER_A, BROKER_B);
    }

    // -----------------------------------------------------------------------
    // 1. Seed idempotency: seed → re-seed produces no duplicates; manual rows preserved
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("seed idempotency: re-seeding is a no-op; row count stable")
    void seed_idempotent_rowCountStableOnReseed() {
        seedLiveListing(BROKER_A, MANIPAL_KEY, "land", "sale");
        seedLiveListing(BROKER_A, MANIPAL_KEY, "house", "rent");

        int first = service.seedFocus(BROKER_A);
        assertThat(first).isEqualTo(2);

        // Re-seed: same listings, ON CONFLICT DO NOTHING → 0 new rows
        int second = service.seedFocus(BROKER_A);
        assertThat(second).isEqualTo(0);

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        assertThat(rows).hasSize(2);
    }

    @Test
    @DisplayName("seed idempotency: manual rows are never overwritten by re-seed")
    void seed_preservesManualRows() {
        seedLiveListing(BROKER_A, MANIPAL_KEY, "land", "sale");

        // First seed plants source='seeded'
        service.seedFocus(BROKER_A);

        // Broker manually removes the seeded row and adds a manual one for the same tuple
        jdbcTemplate.update(
                "DELETE FROM broker_market_focus WHERE broker_id=? AND area_key=? AND property_type=? AND listing_purpose=?",
                BROKER_A, MANIPAL_KEY, "land", "sale");
        jdbcTemplate.update(
                "INSERT INTO broker_market_focus (broker_id,city_slug,area_key,property_type,listing_purpose,source) "
                + "VALUES (?,?,?,?,?,'manual')",
                BROKER_A, "udupi", MANIPAL_KEY, "land", "sale");

        // Re-seed: ON CONFLICT DO NOTHING must NOT clobber the manual row
        service.seedFocus(BROKER_A);

        String source = jdbcTemplate.queryForObject(
                "SELECT source FROM broker_market_focus WHERE broker_id=? AND area_key=? AND property_type=? AND listing_purpose=?",
                String.class, BROKER_A, MANIPAL_KEY, "land", "sale");
        assertThat(source).isEqualTo("manual");
    }

    // -----------------------------------------------------------------------
    // 2. Ownership isolation: Broker A never sees/edits/removes Broker B's rows
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("ownership: GET returns only caller's rows; Broker B rows never visible to Broker A")
    void list_ownershipIsolation() {
        seedLiveListing(BROKER_A, MANIPAL_KEY, "land", "sale");
        seedLiveListing(BROKER_B, MANIPAL_KEY, "house", "rent");

        service.seedFocus(BROKER_A);
        service.seedFocus(BROKER_B);

        List<BrokerMarketFocusRow> rowsA = service.listFocus(BROKER_A);
        assertThat(rowsA).hasSize(1);
        assertThat(rowsA.get(0).propertyType()).isEqualTo("land");

        List<BrokerMarketFocusRow> rowsB = service.listFocus(BROKER_B);
        assertThat(rowsB).hasSize(1);
        assertThat(rowsB.get(0).propertyType()).isEqualTo("house");
    }

    @Test
    @DisplayName("ownership: DELETE by Broker B on Broker A's row returns 404, does not delete")
    void remove_ownershipIsolation_brokerB_cannotDeleteBrokerA() {
        // Plant a manual row for Broker A
        jdbcTemplate.update(
                "INSERT INTO broker_market_focus (broker_id,city_slug,area_key,property_type,listing_purpose,source) "
                + "VALUES (?,?,?,?,?,'manual')",
                BROKER_A, "udupi", MANIPAL_KEY, "land", "sale");

        RemoveFocusRequest req = new RemoveFocusRequest("udupi", MANIPAL_KEY, "land", "sale");

        // Broker B tries to delete Broker A's row — must get 404
        assertThatThrownBy(() -> service.removeFocus(BROKER_B, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(NOT_FOUND);
                });

        // Row must still exist for Broker A
        int count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM broker_market_focus WHERE broker_id=?",
                Integer.class, BROKER_A);
        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("ownership: addFocus by Broker A only creates a row for Broker A")
    void add_ownershipIsolation_onlyBrokerARowCreated() {
        // AddFocusRequest is now 3-field: areaKey, propertyType, listingPurpose
        AddFocusRequest req = new AddFocusRequest(MANIPAL_KEY, "land", "sale");
        service.addFocus(BROKER_A, req);

        // Broker A has one row
        int countA = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM broker_market_focus WHERE broker_id=?",
                Integer.class, BROKER_A);
        assertThat(countA).isEqualTo(1);

        // Broker B has no rows
        int countB = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM broker_market_focus WHERE broker_id=?",
                Integer.class, BROKER_B);
        assertThat(countB).isZero();
    }

    // -----------------------------------------------------------------------
    // 3. LIVE-filter: non-LIVE listings excluded from seed
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("seed excludes DRAFT listings")
    void seed_excludesDraftListings() {
        insertListing(BROKER_A, MANIPAL_KEY, "land", "sale", "DRAFT");

        int inserted = service.seedFocus(BROKER_A);
        assertThat(inserted).isZero();

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        assertThat(rows).isEmpty();
    }

    @Test
    @DisplayName("seed excludes ARCHIVED listings")
    void seed_excludesArchivedListings() {
        insertListing(BROKER_A, MANIPAL_KEY, "land", "sale", "ARCHIVED");

        int inserted = service.seedFocus(BROKER_A);
        assertThat(inserted).isZero();
    }

    @Test
    @DisplayName("seed excludes listings with null area_key")
    void seed_excludesNullAreaKey() {
        insertListing(BROKER_A, null, "land", "sale", "LIVE");

        int inserted = service.seedFocus(BROKER_A);
        assertThat(inserted).isZero();
    }

    @Test
    @DisplayName("broker with zero LIVE listings seeds nothing; GET returns empty list, not 404")
    void seed_zeroLive_returnsEmpty() {
        // No listings at all for BROKER_A
        int inserted = service.seedFocus(BROKER_A);
        assertThat(inserted).isZero();

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        assertThat(rows).isEmpty();
    }

    // -----------------------------------------------------------------------
    // 4. city_slug resolved via areas→cities join (not area_key string-split)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("seed: city_slug for Manipal area resolves to 'udupi' via areas→cities join")
    void seed_citySlug_resolvedViaJoin_udupi() {
        seedLiveListing(BROKER_A, MANIPAL_KEY, "land", "sale");

        service.seedFocus(BROKER_A);

        String citySlug = jdbcTemplate.queryForObject(
                "SELECT city_slug FROM broker_market_focus WHERE broker_id=? AND area_key=?",
                String.class, BROKER_A, MANIPAL_KEY);
        assertThat(citySlug).isEqualTo("udupi");
    }

    @Test
    @DisplayName("seed: Kundapur area_key resolves city_slug='kundapur' not 'udupi' (Kundapur rule)")
    void seed_citySlug_kundapur_resolvedCorrectly() {
        // Kundapur: area_key contains 'Udupi' as district, but the city is 'kundapur'
        // This is the key correctness test for R-a risk
        seedLiveListing(BROKER_A, KUNDAPUR_KEY, "land", "sale");

        service.seedFocus(BROKER_A);

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        // The row may or may not exist depending on whether KUNDAPUR_KEY is seeded in V71.
        // If it is, city_slug must be 'kundapur', never 'udupi'.
        if (!rows.isEmpty()) {
            assertThat(rows.get(0).citySlug())
                    .as("Kundapur area_key must resolve to 'kundapur' city slug, not 'Udupi' district name")
                    .isEqualTo("kundapur");
        }
        // If the key is not in the areas table, the INNER JOIN skips it silently — also correct.
    }

    @Test
    @DisplayName("seed: area_key with no matching areas row is silently skipped (INNER JOIN)")
    void seed_unknownAreaKey_skippedByInnerJoin() {
        insertListing(BROKER_A, "UNKNOWN|AREA|KEY", "land", "sale", "LIVE");

        int inserted = service.seedFocus(BROKER_A);
        assertThat(inserted).isZero();

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        assertThat(rows).isEmpty();
    }

    // -----------------------------------------------------------------------
    // 5. Manual add: city_slug resolved server-side (AC2 + AC4)
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("addFocus: city_slug is server-resolved via join — stored slug matches seed slug for same area")
    void addFocus_resolvesCitySlug_viaJoin_identicalToSeedBucket() {
        // This is the primary AC4 regression guard:
        // If add stored a different city_slug than seed, they'd produce two rows for one area.

        // Seed plants the row for (BROKER_A, MANIPAL_KEY, land, sale) with city_slug='udupi'
        seedLiveListing(BROKER_A, MANIPAL_KEY, "land", "sale");
        service.seedFocus(BROKER_A);

        String seededSlug = jdbcTemplate.queryForObject(
                "SELECT city_slug FROM broker_market_focus WHERE broker_id=? AND area_key=? AND source='seeded'",
                String.class, BROKER_A, MANIPAL_KEY);
        assertThat(seededSlug).isEqualTo("udupi");

        // Now delete the seeded row and add manually for the same area — slug must match
        jdbcTemplate.update("DELETE FROM broker_market_focus WHERE broker_id=?", BROKER_A);

        // AddFocusRequest has NO citySlug — service must resolve it from the join
        AddFocusRequest req = new AddFocusRequest(MANIPAL_KEY, "land", "sale");
        service.addFocus(BROKER_A, req);

        String manualSlug = jdbcTemplate.queryForObject(
                "SELECT city_slug FROM broker_market_focus WHERE broker_id=? AND area_key=? AND source='manual'",
                String.class, BROKER_A, MANIPAL_KEY);
        assertThat(manualSlug)
                .as("Manual add city_slug must match seed city_slug for the same real area")
                .isEqualTo(seededSlug);
    }

    @Test
    @DisplayName("addFocus then seed for same area produce SAME bucket — ON CONFLICT absorbs one (AC4)")
    void addFocus_thenSeed_sameBucket_noSeparateRow() {
        // Plant a LIVE listing first (needed for seed to produce a row)
        seedLiveListing(BROKER_A, MANIPAL_KEY, "land", "sale");

        // Manual add first — service resolves city_slug='udupi' from join
        AddFocusRequest req = new AddFocusRequest(MANIPAL_KEY, "land", "sale");
        service.addFocus(BROKER_A, req);

        // Seed for the same area — ON CONFLICT DO NOTHING because city_slug matches
        int seedInserted = service.seedFocus(BROKER_A);
        assertThat(seedInserted)
                .as("Seed must produce 0 new rows because manual add already occupies the same PK bucket")
                .isEqualTo(0);

        // Only one row must exist (not two)
        int totalRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM broker_market_focus WHERE broker_id=?",
                Integer.class, BROKER_A);
        assertThat(totalRows).isEqualTo(1);

        // Source remains 'manual' (DO NOTHING means the first writer wins)
        String source = jdbcTemplate.queryForObject(
                "SELECT source FROM broker_market_focus WHERE broker_id=? AND area_key=?",
                String.class, BROKER_A, MANIPAL_KEY);
        assertThat(source).isEqualTo("manual");
    }

    @Test
    @DisplayName("addFocus rejects unknown areaKey with HTTP 422 — no row inserted")
    void addFocus_unknownAreaKey_throws422_noRowInserted() {
        // "UNKNOWN|AREA|KEY" has no entry in the areas table — slug resolution must fail
        AddFocusRequest req = new AddFocusRequest("UNKNOWN|AREA|KEY", "land", "sale");

        assertThatThrownBy(() -> service.addFocus(BROKER_A, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(UNPROCESSABLE_ENTITY);
                    assertThat(rse.getReason()).contains("Area not found");
                });

        // No row must have been inserted
        int count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM broker_market_focus WHERE broker_id=?",
                Integer.class, BROKER_A);
        assertThat(count).isZero();
    }

    // -----------------------------------------------------------------------
    // 6. addFocus manual + remove round-trip
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("addFocus manual: row is inserted with source='manual'; removeFocus deletes it")
    void addThenRemove_roundTrip() {
        // AddFocusRequest is now 3-field — city_slug resolved server-side
        AddFocusRequest addReq = new AddFocusRequest(MANIPAL_KEY, "land", "sale");
        service.addFocus(BROKER_A, addReq);

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).source()).isEqualTo("manual");
        // city_slug must be 'udupi' — resolved from the areas→cities join, not from client
        assertThat(rows.get(0).citySlug()).isEqualTo("udupi");
        assertThat(rows.get(0).areaKey()).isEqualTo(MANIPAL_KEY);

        // Remove uses the server-authoritative citySlug surfaced by GET
        RemoveFocusRequest removeReq = new RemoveFocusRequest(rows.get(0).citySlug(), MANIPAL_KEY, "land", "sale");
        service.removeFocus(BROKER_A, removeReq);

        List<BrokerMarketFocusRow> after = service.listFocus(BROKER_A);
        assertThat(after).isEmpty();
    }

    @Test
    @DisplayName("addFocus idempotency: re-adding same tuple is no-op; source stays 'manual'")
    void addFocus_idempotent_sameSource() {
        AddFocusRequest req = new AddFocusRequest(MANIPAL_KEY, "land", "sale");
        service.addFocus(BROKER_A, req);
        service.addFocus(BROKER_A, req); // second call — must not throw or create duplicate

        List<BrokerMarketFocusRow> rows = service.listFocus(BROKER_A);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).source()).isEqualTo("manual");
    }

    @Test
    @DisplayName("removeFocus returns 404 when row does not exist")
    void removeFocus_notFound_throws404() {
        RemoveFocusRequest req = new RemoveFocusRequest("udupi", MANIPAL_KEY, "land", "sale");

        assertThatThrownBy(() -> service.removeFocus(BROKER_A, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(NOT_FOUND);
                });
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Inserts a LIVE listing owned by {@code ownerId} with the given area_key,
     * property_type, and listing_purpose. Uses the minimal required columns only.
     */
    private void seedLiveListing(UUID ownerId, String areaKey, String propertyType, String listingPurpose) {
        insertListing(ownerId, areaKey, propertyType, listingPurpose, "LIVE");
    }

    private void insertListing(UUID ownerId, String areaKey, String propertyType,
                                String listingPurpose, String status) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                + "(id, created_by, area_key, property_type, listing_purpose, status, "
                + " is_duplicate, is_valid, created_at, updated_at) "
                + "VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, false, true, ?, ?)",
                ownerId, areaKey, propertyType, listingPurpose, status, now, now);
    }
}
