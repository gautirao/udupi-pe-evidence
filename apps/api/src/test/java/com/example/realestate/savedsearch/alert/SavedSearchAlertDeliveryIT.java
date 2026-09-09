package com.example.realestate.savedsearch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.example.realestate.discover.PolygonGeographicSafetyPolicy;
import com.example.realestate.insights.SavedAreaRepository;
import com.example.realestate.notification.EmailService;
import com.example.realestate.savedsearch.AlertFrequency;
import com.example.realestate.savedsearch.ResultScopeKind;
import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchInserter;
import com.example.realestate.savedsearch.SavedSearchRepository;
import com.example.realestate.savedsearch.SavedSearchService;
import com.example.realestate.savedsearch.SavedSearchStatus;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/**
 * #2019 Slice B: real-Postgres (PostGIS) coverage of matcher + bookkeeping + delivery + job.
 *
 * <p>Mirrors {@code SavedSearchCreateIdempotencyRaceIT}: {@code @DataJpaTest} with the REAL
 * {@code @Transactional} proxies imported and no test-managed transaction
 * ({@code NOT_SUPPORTED}), because the properties under test are transactional — the
 * {@code REQUIRES_NEW} bookkeeping, the watermark compare-and-set, the deliveries PK guard and
 * the advisory-lock scope. Rows genuinely commit and are wiped in {@link #cleanUp()}.
 * {@link EmailService} is mocked (no network); everything else is production wiring.
 *
 * <p>Fixture areas are the V71-seeded Udupi areas (Manipal 13.3528,74.7947 · Kunjibettu
 * 13.3382,74.7454 · Katapadi 13.3568,74.7783).
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ImportAutoConfiguration(JacksonAutoConfiguration.class)
@Import({
        SavedSearchService.class, SavedSearchInserter.class,
        SavedSearchAlertMatcher.class, SavedSearchAlertBookkeeper.class,
        SavedSearchAlertDeliveryService.class, SavedSearchAlertJob.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.task.scheduling.enabled=false",
        "app.saved-search-alerts.public-base-url=https://example.test",
        "app.saved-search-alerts.max-matches-per-run=200"
})
class SavedSearchAlertDeliveryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    static final String MANIPAL = "IN|KA|Udupi|Manipal";
    static final String KUNJIBETTU = "IN|KA|Udupi|Kunjibettu";
    static final String KATAPADI = "IN|KA|Udupi|Katapadi";
    static final List<String> FIXTURE_AREAS = List.of(MANIPAL, KUNJIBETTU, KATAPADI);

    static final UUID USER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-00000000b0a1");
    static final UUID USER_B = UUID.fromString("bbbbbbbb-0000-0000-0000-00000000b0b1");

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired SavedSearchRepository savedSearchRepository;
    @Autowired SavedSearchService savedSearchService;
    @Autowired SavedSearchAlertMatcher matcher;
    @Autowired SavedSearchAlertBookkeeper bookkeeper;
    @Autowired SavedSearchAlertDeliveryService deliveryService;
    @Autowired SavedSearchAlertJob job;
    @Autowired SavedAreaRepository savedAreaRepository;

    @MockitoBean EmailService emailService;
    @MockitoBean PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;

    OffsetDateTime t0;

    @BeforeEach
    void cleanUp() {
        jdbc.update("DELETE FROM saved_searches WHERE user_id IN (?, ?)", USER_A, USER_B); // cascades batches/deliveries
        jdbc.update("DELETE FROM notifications WHERE user_id IN (?, ?)", USER_A, USER_B);
        jdbc.update("DELETE FROM property_listings WHERE area_key IN (?, ?, ?)", MANIPAL, KUNJIBETTU, KATAPADI);
        jdbc.update("DELETE FROM profiles WHERE user_id IN (?, ?)", USER_A, USER_B);
        for (UUID u : List.of(USER_A, USER_B)) {
            jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                    u, "ssa-it-" + u + "@test.local");
        }
        // Inserting auth.users auto-creates a profiles row (Supabase-style trigger), so upsert
        // rather than insert. Only USER_A has a profile email; USER_B exercises the
        // "no email on file" path.
        jdbc.update("INSERT INTO profiles (user_id, email) VALUES (?, ?)"
                + " ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email", USER_A, "owner-a@example.test");
        jdbc.update("UPDATE profiles SET email = NULL WHERE user_id = ?", USER_B);
        t0 = OffsetDateTime.now(ZoneOffset.UTC);
    }

    // ---- fixtures ---------------------------------------------------------------------------

    UUID listing(String areaKey, double lat, double lon, String purpose, String type, int bedrooms,
                 long pricePaise, OffsetDateTime publishedAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO property_listings
                    (id, area_key, property_type, listing_purpose, price_paise, bedrooms, status, is_duplicate,
                     latitude, longitude, first_published_at, created_at, updated_at, title)
                VALUES (?, ?, ?, ?, ?, ?, 'LIVE', false, ?, ?, ?, ?, ?, 'Fixture')
                """, id, areaKey, type, purpose, pricePaise, bedrooms, lat, lon, publishedAt, publishedAt, publishedAt);
        return id;
    }

    /** A listing published one minute after {@link #t0} (i.e. after any saved search created in the test). */
    UUID newListing(String areaKey, double lat, double lon, int bedrooms) {
        return listing(areaKey, lat, lon, "sale", "apartment", bedrooms, 80_00_000_00L, t0.plusMinutes(1));
    }

    SavedSearch areaSet(UUID user, List<String> keys, Map<String, Object> filters, AlertFrequency freq) {
        return savedSearchService.create(user, "udupi", ResultScopeKind.AREA_SET, keys, null,
                null, null, null, null, filters, "My alert", freq).savedSearch();
    }

    SavedSearch reload(UUID id) {
        return savedSearchRepository.findById(id).orElseThrow();
    }

    int deliveries(UUID savedSearchId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM saved_search_alert_deliveries WHERE saved_search_id = ?",
                Integer.class, savedSearchId);
    }

    int notifications(UUID user) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND type = 'saved_search_alert'",
                Integer.class, user);
    }

    List<String> batchStatuses(UUID savedSearchId) {
        return jdbc.queryForList("SELECT email_status FROM saved_search_alert_batches WHERE saved_search_id = ? ORDER BY created_at",
                String.class, savedSearchId);
    }

    // ---- 1. scope matching ------------------------------------------------------------------

    @Test
    @DisplayName("AREA_SET: OR across saved keys + saved filters; pre-watermark and out-of-scope listings excluded; each listing once")
    void areaSet_matchesOnlyNewInScopeFiltered() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL, KUNJIBETTU), Map.of("bedrooms", List.of(3), "listingPurpose", "sale"), AlertFrequency.DAILY);

        UUID inManipal = newListing(MANIPAL, 13.3528, 74.7947, 3);
        UUID inKunjibettu = newListing(KUNJIBETTU, 13.3382, 74.7454, 3);
        newListing(KATAPADI, 13.3568, 74.7783, 3);                                   // out of scope
        newListing(MANIPAL, 13.3528, 74.7947, 2);                                    // fails bedrooms filter
        listing(MANIPAL, 13.3528, 74.7947, "rent", "apartment", 3, 0L, t0.plusMinutes(1)); // fails purpose filter
        listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, t0.minusHours(1));  // LIVE before the alert existed
        jdbc.update("UPDATE property_listings SET archived_at = now() WHERE id = ?",
                newListing(MANIPAL, 13.3528, 74.7947, 3));                            // archived: not visible

        SavedSearchAlertJob.RunSummary run = job.runNow(t0.plusMinutes(5));

        assertThat(run.lockAcquired()).isTrue();
        assertThat(run.evaluated()).isEqualTo(1);
        assertThat(run.delivered()).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactlyInAnyOrder(inManipal, inKunjibettu);

        SavedSearch after = reload(s.getId());
        assertThat(after.getAlertWatermark()).isNotNull();
        assertThat(after.getAlertWatermark().toInstant()).isEqualTo(t0.plusMinutes(1).toInstant());
        assertThat(after.getLastAlertedAt().toInstant()).isEqualTo(t0.plusMinutes(5).toInstant());
        assertThat(after.getAlertStatus().name()).isEqualTo("SENT");
        assertThat(notifications(USER_A)).isEqualTo(1);
        assertThat(batchStatuses(s.getId())).containsExactly("SENT");

        ArgumentCaptor<Integer> count = ArgumentCaptor.forClass(Integer.class);
        ArgumentCaptor<String> restore = ArgumentCaptor.forClass(String.class);
        verify(emailService, times(1)).sendSavedSearchAlert(eq("owner-a@example.test"), eq("My alert"),
                eq("Manipal, Kunjibettu"), eq("Buy · 3 BHK"), count.capture(), restore.capture(),
                eq("https://example.test/saved-searches"));
        assertThat(count.getValue()).isEqualTo(2);
        assertThat(restore.getValue()).isEqualTo(
                "https://example.test/discover?city=udupi&rscope=areas&rareas=IN%7CKA%7CUdupi%7CManipal%2CIN%7CKA%7CUdupi%7CKunjibettu&beds=3");
    }

    @Test
    @DisplayName("POLYGON: only listings inside the saved geometry match")
    void polygon_matchesInsideOnly() {
        List<List<Double>> aroundManipal = List.of(
                List.of(13.34, 74.78), List.of(13.37, 74.78), List.of(13.37, 74.82), List.of(13.34, 74.82));
        SavedSearch s = savedSearchService.create(USER_A, "udupi", ResultScopeKind.POLYGON, null, aroundManipal,
                null, null, null, null, Map.of(), null, null).savedSearch();
        UUID inside = newListing(MANIPAL, 13.3528, 74.7947, 3);
        newListing(KUNJIBETTU, 13.3382, 74.7454, 3); // outside the polygon

        SavedSearchAlertDeliveryService.Outcome out = deliveryService.evaluateAndDeliver(s, t0.plusMinutes(5));

        assertThat(out.delivered()).isTrue();
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactly(inside);
        verify(emailService).sendSavedSearchAlert(anyString(), any(), eq("Drawn area (4 points)"), eq(""), eq(1),
                eq("https://example.test/discover?city=udupi&rscope=poly&rpoly=13.34000%3A74.78000%3B13.37000%3A74.78000%3B13.37000%3A74.82000%3B13.34000%3A74.82000"),
                anyString());
    }

    @Test
    @DisplayName("VIEWPORT: only listings inside the committed bounds match")
    void viewport_matchesInsideBoundsOnly() {
        SavedSearch s = savedSearchService.create(USER_A, "udupi", ResultScopeKind.VIEWPORT, null, null,
                13.32, 74.73, 13.35, 74.76, Map.of("listingPurpose", "sale"), "Near Kunjibettu", null).savedSearch();
        UUID inside = newListing(KUNJIBETTU, 13.3382, 74.7454, 3);
        newListing(MANIPAL, 13.3528, 74.7947, 3); // outside the viewport

        SavedSearchAlertDeliveryService.Outcome out = deliveryService.evaluateAndDeliver(s, t0.plusMinutes(5));

        assertThat(out.delivered()).isTrue();
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactly(inside);
        verify(emailService).sendSavedSearchAlert(anyString(), eq("Near Kunjibettu"), eq("Visible map area"), eq("Buy"), eq(1),
                eq("https://example.test/discover?city=udupi&rscope=vp&rvp=13.32%2C74.73%2C13.35%2C74.76"), anyString());
    }

    @Test
    @DisplayName("saved-filter parity: the matcher's rows equal a direct query through the live predicate builder")
    void filtersParityWithLivePredicate() {
        Map<String, Object> filters = Map.of(
                "listingPurpose", "sale", "propertyTypes", List.of("apartment"),
                "priceMinPaise", 50_00_000_00L, "priceMaxPaise", 90_00_000_00L, "bedrooms", List.of(2, 3));
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), filters, AlertFrequency.DAILY);
        UUID a = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 80_00_000_00L, t0.plusMinutes(1));
        UUID b = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 2, 55_00_000_00L, t0.plusMinutes(2));
        listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 95_00_000_00L, t0.plusMinutes(1)); // over price
        listing(MANIPAL, 13.3528, 74.7947, "sale", "villa", 3, 80_00_000_00L, t0.plusMinutes(1));     // wrong type
        listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 4, 80_00_000_00L, t0.plusMinutes(1)); // wrong beds

        var live = com.example.realestate.discover.DiscoverListingPredicateBuilder.build(
                new com.example.realestate.discover.DiscoverListingPredicateBuilder.Filters(
                        "udupi", List.of("apartment"), null, 50_00_000_00L, 90_00_000_00L, null, null, List.of(2, 3),
                        null, null, null, null, null, null, null, null, null, null, null, "sale", null, List.of(MANIPAL), null));
        List<UUID> liveIds = jdbc.queryForList("SELECT pl.id FROM property_listings pl WHERE " + live.whereFragment()
                + " AND COALESCE(pl.first_published_at, pl.created_at) > ? ORDER BY pl.id",
                UUID.class, appendParam(live.params(), s.getCreatedAt()));

        List<UUID> matched = matcher.findNewMatches(s, s.getCreatedAt(), null, 200).stream()
                .map(SavedSearchAlertMatcher.Match::listingId).sorted().toList();

        assertThat(liveIds).containsExactlyInAnyOrder(a, b);
        assertThat(matched).isEqualTo(liveIds.stream().sorted().toList());
    }

    private static Object[] appendParam(List<Object> params, Object extra) {
        Object[] out = new Object[params.size() + 1];
        for (int i = 0; i < params.size(); i++) out[i] = params.get(i);
        out[params.size()] = extra;
        return out;
    }

    // ---- 2. watermark + once-per-search guard --------------------------------------------------

    @Test
    @DisplayName("rerun delivers nothing new; listings published after the watermark are delivered exactly once on the next run")
    void rerunIsIdempotentAndWatermarkAdvances() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        UUID first = newListing(MANIPAL, 13.3528, 74.7947, 3);

        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isEqualTo(1);
        assertThat(job.runNow(t0.plusMinutes(6)).delivered()).isZero();
        assertThat(deliveries(s.getId())).isEqualTo(1);
        assertThat(notifications(USER_A)).isEqualTo(1);

        UUID later = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, t0.plusMinutes(10));
        assertThat(job.runNow(t0.plusMinutes(15)).delivered()).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactlyInAnyOrder(first, later);
        assertThat(reload(s.getId()).getAlertWatermark().toInstant()).isEqualTo(t0.plusMinutes(10).toInstant());
        verify(emailService, times(2)).sendSavedSearchAlert(anyString(), any(), anyString(), anyString(), anyInt(), anyString(), anyString());
    }

    @Test
    @DisplayName("MUTATION PROOF (duplicate-delivery guard): after a watermark reset (as a Slice A edit does) the delivered listing never reappears; the deliveries PK rejects a forced re-delivery and rolls the watermark back")
    void duplicateDeliveryGuard_mutationProof() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        UUID delivered = newListing(MANIPAL, 13.3528, 74.7947, 3);
        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isEqualTo(1);

        // (a) The cursor alone is NOT the guard: reset it (applyUpdate semantics) and re-run.
        jdbc.update("UPDATE saved_searches SET alert_watermark = NULL, alert_watermark_listing_id = NULL WHERE id = ?", s.getId());
        assertThat(matcher.findNewMatches(reload(s.getId()), s.getCreatedAt(), null, 200)).isEmpty();
        assertThat(job.runNow(t0.plusMinutes(6)).delivered()).isZero();
        assertThat(deliveries(s.getId())).isEqualTo(1);

        // (b) Bypass the matcher's NOT EXISTS and force the already-delivered listing into
        //     bookkeeping: the PK must reject it and the whole unit (incl. the watermark CAS)
        //     must roll back — a mutant that dropped either the PK or the transaction boundary
        //     would leave a second delivery row or an advanced watermark here.
        SavedSearch reset = reload(s.getId());
        OffsetDateTime forcedWatermark = t0.plusMinutes(30);
        assertThatThrownBy(() -> bookkeeper.record(reset, reset.getAlertWatermark(), reset.getAlertWatermarkListingId(),
                List.of(new SavedSearchAlertMatcher.Match(delivered, forcedWatermark)), t0.plusMinutes(31)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(deliveries(s.getId())).isEqualTo(1);
        assertThat(reload(s.getId()).getAlertWatermark()).as("CAS advance must have rolled back").isNull();
        assertThat(batchStatuses(s.getId())).as("no second batch row survived").hasSize(1);
        assertThat(notifications(USER_A)).isEqualTo(1);
    }

    @Test
    @DisplayName("overlapping-run CAS: two evaluations against the same watermark commit exactly one delivery")
    void overlappingRun_casAllowsOnlyOneWinner() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        UUID l = newListing(MANIPAL, 13.3528, 74.7947, 3);
        List<SavedSearchAlertMatcher.Match> matches = matcher.findNewMatches(s, s.getCreatedAt(), null, 200);
        assertThat(matches).extracting(SavedSearchAlertMatcher.Match::listingId).containsExactly(l);

        // Both "runs" evaluated against the (NULL, NULL) first-run cursor.
        assertThat(bookkeeper.record(s, null, null, matches, t0.plusMinutes(5))).isPresent();
        assertThat(bookkeeper.record(s, null, null, matches, t0.plusMinutes(5))).as("loser of the CAS").isEmpty();

        assertThat(deliveries(s.getId())).isEqualTo(1);
        assertThat(batchStatuses(s.getId())).hasSize(1);
        assertThat(notifications(USER_A)).isEqualTo(1);
    }

    @Test
    @DisplayName("scheduler idempotency: a concurrent run holding the advisory lock makes the job skip; it proceeds once released")
    void advisoryLock_overlappingRunSkips() throws Exception {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        newListing(MANIPAL, 13.3528, 74.7947, 3);

        try (Connection other = dataSource.getConnection()) {
            other.setAutoCommit(false);
            try (Statement st = other.createStatement();
                 ResultSet rs = st.executeQuery("SELECT pg_try_advisory_xact_lock(" + SavedSearchAlertJob.ADVISORY_LOCK_NAMESPACE + ", 0)")) {
                assertThat(rs.next() && rs.getBoolean(1)).as("simulated overlapping run holds the lock").isTrue();
            }
            SavedSearchAlertJob.RunSummary blocked = job.runNow(t0.plusMinutes(5));
            assertThat(blocked.lockAcquired()).isFalse();
            assertThat(deliveries(s.getId())).isZero();
            verifyNoInteractions(emailService);
            other.rollback(); // releases the xact lock
        }

        assertThat(job.runNow(t0.plusMinutes(6)).delivered()).isEqualTo(1);
        assertThat(deliveries(s.getId())).isEqualTo(1);
    }

    // ---- 3. paused / deleted exclusion ------------------------------------------------------

    @Test
    @DisplayName("MUTATION PROOF (paused exclusion): a paused search is never evaluated, the CAS refuses a mid-run pause, and resume delivers once")
    void pausedExclusion_mutationProof() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        newListing(MANIPAL, 13.3528, 74.7947, 3);
        savedSearchService.pause(USER_A, s.getId());

        // (a) The due query excludes it and the job delivers nothing.
        assertThat(savedSearchRepository.findDueForAlertEvaluation(t0.plusMinutes(5))).isEmpty();
        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isZero();

        // (b) Even a direct evaluation of the paused entity is a no-op (service-level guard).
        assertThat(deliveryService.evaluateAndDeliver(reload(s.getId()), t0.plusMinutes(5)).delivered()).isFalse();

        // (c) Mid-run pause: a stale ACTIVE entity that was already matched must still not be
        //     delivered — the CAS `status = 'ACTIVE'` clause rejects it. A mutant dropping that
        //     clause (or the status check in (b)) would write a delivery row here.
        SavedSearch staleActive = new SavedSearch(s.getId(), USER_A, "udupi", ResultScopeKind.AREA_SET, List.of(MANIPAL),
                null, null, null, null, null, Map.of(), s.getFingerprint(), null, SavedSearchStatus.ACTIVE,
                AlertFrequency.INSTANT, s.getAlertStatus(), s.getCreatedAt(), s.getUpdatedAt());
        List<SavedSearchAlertMatcher.Match> matches = matcher.findNewMatches(staleActive, s.getCreatedAt(), null, 200);
        assertThat(matches).hasSize(1);
        assertThat(bookkeeper.record(staleActive, null, null, matches, t0.plusMinutes(5))).isEmpty();
        assertThat(deliveries(s.getId())).isZero();
        assertThat(notifications(USER_A)).isZero();
        verifyNoInteractions(emailService);

        // (d) Resume → delivered exactly once.
        savedSearchService.resume(USER_A, s.getId());
        assertThat(job.runNow(t0.plusMinutes(6)).delivered()).isEqualTo(1);
        assertThat(deliveries(s.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("deleted search: not evaluated; its delivery history cascades away")
    void deletedExclusion() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        newListing(MANIPAL, 13.3528, 74.7947, 3);
        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isEqualTo(1);
        assertThat(deliveries(s.getId())).isEqualTo(1);

        savedSearchService.delete(USER_A, s.getId());

        assertThat(deliveries(s.getId())).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM saved_search_alert_batches WHERE saved_search_id = ?", Integer.class, s.getId())).isZero();
        newListing(MANIPAL, 13.3528, 74.7947, 2);
        SavedSearchAlertJob.RunSummary run = job.runNow(t0.plusMinutes(6));
        assertThat(run.evaluated()).isZero();
        assertThat(run.delivered()).isZero();
    }

    // ---- 4. email / frequency / cap / privacy --------------------------------------------------

    @Test
    @DisplayName("email idempotency: a transport failure is recorded FAILED, the batch is not re-delivered, and no second email is attempted")
    void emailFailure_recordedNotRetried() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        newListing(MANIPAL, 13.3528, 74.7947, 3);
        doThrow(new RuntimeException("resend down")).when(emailService)
                .sendSavedSearchAlert(anyString(), any(), anyString(), anyString(), anyInt(), anyString(), anyString());

        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isEqualTo(1);
        assertThat(batchStatuses(s.getId())).containsExactly("FAILED");
        assertThat(deliveries(s.getId())).isEqualTo(1);
        assertThat(notifications(USER_A)).as("in-app channel is guaranteed").isEqualTo(1);

        assertThat(job.runNow(t0.plusMinutes(6)).delivered()).isZero();
        verify(emailService, times(1)).sendSavedSearchAlert(anyString(), any(), anyString(), anyString(), anyInt(), anyString(), anyString());
    }

    @Test
    @DisplayName("owner without an email on file: batch SKIPPED, in-app notification still written, no email call")
    void noEmailOnFile_skipped() {
        SavedSearch s = areaSet(USER_B, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        newListing(MANIPAL, 13.3528, 74.7947, 3);

        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isEqualTo(1);
        assertThat(batchStatuses(s.getId())).containsExactly("SKIPPED");
        assertThat(notifications(USER_B)).isEqualTo(1);
        assertThat(notifications(USER_A)).as("alerts are private to the owner").isZero();
        verifyNoInteractions(emailService);
    }

    @Test
    @DisplayName("frequency: DAILY is due again after 24h (with 30min tolerance), WEEKLY after 7d, INSTANT every run, OFF never")
    void frequencyDueQuery() {
        SavedSearch daily = areaSet(USER_A, List.of(MANIPAL), Map.of("bedrooms", List.of(1)), AlertFrequency.DAILY);
        SavedSearch weekly = areaSet(USER_A, List.of(MANIPAL), Map.of("bedrooms", List.of(2)), AlertFrequency.WEEKLY);
        SavedSearch immediate = areaSet(USER_A, List.of(MANIPAL), Map.of("bedrooms", List.of(3)), AlertFrequency.INSTANT);
        SavedSearch off = areaSet(USER_A, List.of(MANIPAL), Map.of("bedrooms", List.of(4)), AlertFrequency.OFF);
        for (SavedSearch s : List.of(daily, weekly, immediate)) {
            jdbc.update("UPDATE saved_searches SET last_alerted_at = ? WHERE id = ?", t0, s.getId());
        }

        assertThat(savedSearchRepository.findDueForAlertEvaluation(t0.plusMinutes(5)))
                .as("OFF is never due even when never alerted")
                .extracting(SavedSearch::getId).doesNotContain(off.getId());
        newListing(MANIPAL, 13.3528, 74.7947, 4);
        assertThat(deliveryService.evaluateAndDeliver(reload(off.getId()), t0.plusMinutes(5)).delivered()).isFalse();
        assertThat(deliveries(off.getId())).isZero();

        assertThat(savedSearchRepository.findDueForAlertEvaluation(t0.plusHours(1)))
                .extracting(SavedSearch::getId).containsExactly(immediate.getId());
        assertThat(savedSearchRepository.findDueForAlertEvaluation(t0.plusHours(23).plusMinutes(40)))
                .extracting(SavedSearch::getId).containsExactlyInAnyOrder(daily.getId(), immediate.getId());
        assertThat(savedSearchRepository.findDueForAlertEvaluation(t0.plusDays(7)))
                .extracting(SavedSearch::getId).containsExactlyInAnyOrder(daily.getId(), weekly.getId(), immediate.getId());
    }

    @Test
    @DisplayName("REGRESSION (008f0d86 review): more-than-cap listings sharing ONE eligibility timestamp are all delivered exactly once across runs via the (eligible_at, id) cursor")
    void sameTimestampOverflow_lexicographicCursorDeliversAllExactlyOnce() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        OffsetDateTime sameInstant = t0.plusMinutes(1);
        List<UUID> all = new java.util.ArrayList<>();
        for (int i = 0; i < 5; i++) {
            all.add(listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, sameInstant));
        }
        SavedSearchAlertDeliveryService capped = new SavedSearchAlertDeliveryService(
                matcher, bookkeeper, savedAreaRepository, emailService, "", 2);

        int[] perRun = new int[4];
        for (int run = 0; run < 4; run++) {
            perRun[run] = capped.evaluateAndDeliver(reload(s.getId()), t0.plusMinutes(5 + run)).matched();
        }
        // 2 + 2 + 1 + 0: a timestamp-only watermark would have stopped after the first page.
        assertThat(perRun).containsExactly(2, 2, 1, 0);
        List<UUID> deliveredIds = jdbc.queryForList(
                "SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId());
        assertThat(deliveredIds).containsExactlyInAnyOrderElementsOf(all);
        assertThat(deliveredIds).doesNotHaveDuplicates();

        SavedSearch after = reload(s.getId());
        assertThat(after.getAlertWatermark().toInstant()).isEqualTo(sameInstant.toInstant());
        // Postgres orders uuid bytewise (unsigned), unlike java.util.UUID#compareTo — ask the DB.
        UUID largestByDbOrder = jdbc.queryForObject(
                "SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ? ORDER BY listing_id DESC LIMIT 1",
                UUID.class, s.getId());
        assertThat(after.getAlertWatermarkListingId()).as("cursor id = the largest delivered id on that instant")
                .isEqualTo(largestByDbOrder);
    }

    @Test
    @DisplayName("MUTATION PROOF (email consent gate): an opted-out owner gets NO email while delivery bookkeeping + in-app notification stay intact; re-enabling resumes email for later matches only")
    void emailOptOut_mutationProof() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        savedSearchService.setEmailAlerts(USER_A, s.getId(), false);
        assertThat(reload(s.getId()).isEmailAlertsEnabled()).isFalse();
        UUID first = newListing(MANIPAL, 13.3528, 74.7947, 3);

        assertThat(job.runNow(t0.plusMinutes(5)).delivered()).isEqualTo(1);

        // A mutant that dropped the gate (or checked it after the send) would have called the
        // email service here — the address IS on file for USER_A.
        verifyNoInteractions(emailService);
        assertThat(batchStatuses(s.getId())).containsExactly("OPTED_OUT");
        assertThat(deliveries(s.getId())).isEqualTo(1);
        assertThat(notifications(USER_A)).as("in-app channel unaffected by email opt-out").isEqualTo(1);

        // Opt back in: the already-delivered listing is never re-sent; a new one is emailed.
        savedSearchService.setEmailAlerts(USER_A, s.getId(), true);
        assertThat(job.runNow(t0.plusMinutes(6)).delivered()).isZero();
        verifyNoInteractions(emailService);
        UUID later = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, t0.plusMinutes(10));
        assertThat(job.runNow(t0.plusMinutes(15)).delivered()).isEqualTo(1);
        verify(emailService, times(1)).sendSavedSearchAlert(eq("owner-a@example.test"), any(), anyString(), anyString(), eq(1), anyString(), anyString());
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactlyInAnyOrder(first, later);
    }

    @Test
    @DisplayName("MUTATION PROOF (stored-filter guard): a legacy row carrying a non-allowlisted key (excludePropertyTypes) is marked ERROR and never matched as a broadened search — no delivery, no notification, no email")
    void legacyUnsupportedStoredFilter_neverBroadened_mutationProof() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        // Plant the legacy shape directly (the save path now rejects this key): the owner
        // excluded apartments. If the key were silently dropped, the apartment below would match.
        jdbc.update("UPDATE saved_searches SET filters = ?::jsonb WHERE id = ?",
                "{\"excludePropertyTypes\":[\"apartment\"]}", s.getId());
        newListing(MANIPAL, 13.3528, 74.7947, 3); // type "apartment"

        SavedSearchAlertJob.RunSummary run = job.runNow(t0.plusMinutes(5));

        assertThat(run.delivered()).as("a broadened match would have delivered").isZero();
        assertThat(run.failed()).as("isolated as a failed search, not a silent no-op").isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT alert_status FROM saved_searches WHERE id = ?", String.class, s.getId()))
                .isEqualTo("ERROR");
        assertThat(deliveries(s.getId())).isZero();
        assertThat(notifications(USER_A)).isZero();
        assertThat(batchStatuses(s.getId())).isEmpty();
        verifyNoInteractions(emailService);
    }

    @Test
    @DisplayName("per-run cap: overflow rolls to the next run in eligibility order, nothing skipped, watermark = newest recorded")
    void perRunCap_overflowRollsForward() {
        SavedSearch s = areaSet(USER_A, List.of(MANIPAL), Map.of(), AlertFrequency.INSTANT);
        UUID l1 = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, t0.plusMinutes(1));
        UUID l2 = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, t0.plusMinutes(2));
        UUID l3 = listing(MANIPAL, 13.3528, 74.7947, "sale", "apartment", 3, 1L, t0.plusMinutes(3));
        SavedSearchAlertDeliveryService capped = new SavedSearchAlertDeliveryService(
                matcher, bookkeeper, savedAreaRepository, emailService, "", 2);

        SavedSearchAlertDeliveryService.Outcome first = capped.evaluateAndDeliver(reload(s.getId()), t0.plusMinutes(5));
        assertThat(first.matched()).isEqualTo(2);
        assertThat(reload(s.getId()).getAlertWatermark().toInstant()).isEqualTo(t0.plusMinutes(2).toInstant());
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactlyInAnyOrder(l1, l2);

        SavedSearchAlertDeliveryService.Outcome second = capped.evaluateAndDeliver(reload(s.getId()), t0.plusMinutes(6));
        assertThat(second.matched()).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT listing_id FROM saved_search_alert_deliveries WHERE saved_search_id = ?", UUID.class, s.getId()))
                .containsExactlyInAnyOrder(l1, l2, l3);
        assertThat(capped.evaluateAndDeliver(reload(s.getId()), t0.plusMinutes(7)).matched()).isZero();
    }
}
