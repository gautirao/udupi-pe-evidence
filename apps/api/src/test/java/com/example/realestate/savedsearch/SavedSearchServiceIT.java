package com.example.realestate.savedsearch;

import com.example.realestate.discover.PolygonGeographicSafetyPolicy;
import jakarta.persistence.EntityManager;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * #2019 Slice A: real-Postgres integration coverage for {@link SavedSearchService}.
 *
 * <p>{@link PolygonGeographicSafetyPolicy} is mocked rather than wired against the real
 * Testcontainers instance: it already has dedicated real-PostGIS coverage in
 * {@code PolygonGeographicSafetyPolicyIT} / {@code PolygonGeographicSafetyPolicyRealGeometryCalibrationIT}
 * (#2420), and real DB-backed polygon-geometry safety semantics are out of scope for this
 * slice. Only the service's delegation to (and persistence after) that policy is exercised
 * here.
 *
 * <p>Mirrors {@link com.example.realestate.broker.ListingQualityOwnershipIT} for Testcontainers
 * setup: {@code @DataJpaTest + @Testcontainers + @AutoConfigureTestDatabase(replace=NONE) +
 * @TestPropertySource}, with {@code spring.flyway.mixed=true} (matches
 * {@code SchoolAreaMatchingIntegrationTest} / {@code ListingQualityOwnershipIT}, tolerant of
 * mixed transactional/non-transactional DDL elsewhere in the migration history even though
 * V132 itself has no {@code CREATE INDEX CONCURRENTLY}).
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
class SavedSearchServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    private SavedSearchRepository savedSearchRepository;

    @Autowired
    private TestEntityManager entityManager;

    private static final UUID USER_A = UUID.fromString("aaaaaaaa-0000-0000-0000-0000000000a1");
    private static final UUID USER_B = UUID.fromString("bbbbbbbb-0000-0000-0000-0000000000b1");

    private PolygonGeographicSafetyPolicy polygonGeographicSafetyPolicy;
    private SavedSearchService service;

    @BeforeEach
    void setUp() {
        polygonGeographicSafetyPolicy = mock(PolygonGeographicSafetyPolicy.class);
        // Un-proxied inserter (no REQUIRES_NEW): every insert joins this test's transaction so
        // rows never leak between test methods. The REQUIRES_NEW race semantics are covered by
        // SavedSearchCreateIdempotencyRaceIT, which runs against real committed transactions.
        service = new SavedSearchService(
                savedSearchRepository, polygonGeographicSafetyPolicy, new SavedSearchInserter(savedSearchRepository));
    }

    // -----------------------------------------------------------------------
    // 1. Persistence + idempotent create + normalized fingerprint stability
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("create persists an AREA_SET saved search and round-trips every field")
    void create_areaSet_persistsAndRoundTrips() {
        SavedSearchService.CreateOutcome outcome = createAreaSet(
                USER_A, "bangalore", List.of("area-2", "area-1"), Map.of("bedrooms", List.of(2, 3)), "My search");

        assertThat(outcome.created()).as("first create must insert a new row").isTrue();
        SavedSearch saved = outcome.savedSearch();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getUserId()).isEqualTo(USER_A);
        assertThat(saved.getCitySlug()).isEqualTo("bangalore");
        assertThat(saved.getResultScopeKind()).isEqualTo(ResultScopeKind.AREA_SET);
        assertThat(saved.getAreaKeys()).containsExactlyInAnyOrder("area-1", "area-2");
        assertThat(saved.getPolygon()).isNull();
        assertThat(saved.getViewportSouth()).isNull();
        assertThat(saved.getLabel()).isEqualTo("My search");
        assertThat(saved.getStatus()).isEqualTo(SavedSearchStatus.ACTIVE);
        assertThat(saved.getAlertStatus()).isEqualTo(AlertStatus.IDLE);
        assertThat(saved.getAlertWatermark()).isNull();
        assertThat(saved.getFingerprint()).isNotBlank();
    }

    @Test
    @DisplayName("create is idempotent: an equivalent repeat create returns the existing row, not a duplicate")
    void create_repeatWithEquivalentInput_isIdempotentNoOp() {
        SavedSearchService.CreateOutcome first =
                createAreaSet(USER_A, "bangalore", List.of("area-1", "area-2"), Map.of(), null);

        SavedSearchService.CreateOutcome second =
                createAreaSet(USER_A, "bangalore", List.of("area-1", "area-2"), Map.of(), null);

        assertThat(second.created()).as("equivalent repeat create must be a no-op").isFalse();
        assertThat(second.savedSearch().getId()).isEqualTo(first.savedSearch().getId());
        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A))
                .as("no duplicate row must be inserted")
                .hasSize(1);
    }

    @Test
    @DisplayName("fingerprint is stable across areaKeys order and filters map key-insertion order")
    void fingerprint_stableAcrossKeyOrderAndAreaKeyOrder() {
        Map<String, Object> filtersOrderA = new LinkedHashMap<>();
        filtersOrderA.put("bedrooms", List.of(2, 3));
        filtersOrderA.put("listingPurpose", "SALE");

        Map<String, Object> filtersOrderB = new LinkedHashMap<>();
        filtersOrderB.put("listingPurpose", "SALE");
        filtersOrderB.put("bedrooms", List.of(2, 3));

        SavedSearchService.CreateOutcome first =
                createAreaSet(USER_A, "bangalore", List.of("area-1", "area-2"), filtersOrderA, null);
        SavedSearchService.CreateOutcome second =
                createAreaSet(USER_A, "bangalore", List.of("area-2", "area-1"), filtersOrderB, null);

        assertThat(second.created()).as("logically-equivalent input in different key order must be idempotent").isFalse();
        assertThat(second.savedSearch().getId()).isEqualTo(first.savedSearch().getId());
    }

    @Test
    @DisplayName("different logical inputs produce different fingerprints and distinct rows")
    void create_differentInputs_producesDistinctRows() {
        createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null);
        SavedSearchService.CreateOutcome second =
                createAreaSet(USER_A, "bangalore", List.of("area-2"), Map.of(), null);

        assertThat(second.created()).isTrue();
        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).hasSize(2);
    }

    // -----------------------------------------------------------------------
    // 2. VIEWPORT scope round-trip + malformed rejection
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("create persists a VIEWPORT saved search and round-trips all four bounds")
    void create_viewportScope_persists() {
        SavedSearchService.CreateOutcome outcome = service.create(
                USER_A, "bangalore", ResultScopeKind.VIEWPORT,
                null, null,
                12.90, 77.50, 13.10, 77.70,
                Map.of(), null, null);

        SavedSearch saved = outcome.savedSearch();
        assertThat(saved.getResultScopeKind()).isEqualTo(ResultScopeKind.VIEWPORT);
        assertThat(saved.getViewportSouth()).isEqualTo(12.90);
        assertThat(saved.getViewportWest()).isEqualTo(77.50);
        assertThat(saved.getViewportNorth()).isEqualTo(13.10);
        assertThat(saved.getViewportEast()).isEqualTo(77.70);
        assertThat(saved.getAreaKeys()).isNull();
        assertThat(saved.getPolygon()).isNull();
    }

    @Test
    @DisplayName("VIEWPORT with south > north is rejected as a 400 with the bounds-order reason")
    void create_viewportScope_southGreaterThanNorth_rejected() {
        assertThatThrownBy(() -> service.create(
                USER_A, "bangalore", ResultScopeKind.VIEWPORT,
                null, null,
                13.10, 77.50, 12.90, 77.70,
                Map.of(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_viewport_south_must_be_lte_north");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A))
                .as("nothing must be persisted on rejection")
                .isEmpty();
    }

    // -----------------------------------------------------------------------
    // 3. POLYGON scope: safety-policy delegation + exclusivity guard
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("create with POLYGON scope calls the safety policy and persists on approval")
    void create_polygonScope_callsSafetyPolicyAndPersists() {
        List<List<Double>> polygon = List.of(
                List.of(12.90, 77.50), List.of(12.91, 77.50), List.of(12.91, 77.51), List.of(12.90, 77.51));

        SavedSearchService.CreateOutcome outcome = service.create(
                USER_A, "bangalore", ResultScopeKind.POLYGON,
                null, polygon,
                null, null, null, null,
                Map.of(), null, null);

        verify(polygonGeographicSafetyPolicy, times(1)).validate(eq("bangalore"), eq(polygon));
        assertThat(outcome.savedSearch().getPolygon()).isEqualTo(polygon);
        assertThat(outcome.savedSearch().getResultScopeKind()).isEqualTo(ResultScopeKind.POLYGON);
    }

    @Test
    @DisplayName("a rejection from the safety policy propagates and nothing is persisted")
    void create_polygonScope_rejectedBySafetyPolicy_propagatesAndPersistsNothing() {
        List<List<Double>> polygon = List.of(
                List.of(12.90, 77.50), List.of(12.91, 77.50), List.of(12.91, 77.51));

        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "polygon_too_large"))
                .when(polygonGeographicSafetyPolicy).validate(any(), any());

        assertThatThrownBy(() -> service.create(
                USER_A, "bangalore", ResultScopeKind.POLYGON,
                null, polygon,
                null, null, null, null,
                Map.of(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("polygon_too_large");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }

    @Test
    @DisplayName("POLYGON with fewer than 3 vertices is rejected before the safety policy is ever called")
    void create_polygonScope_fewerThan3Vertices_rejectedBeforeSafetyPolicy() {
        List<List<Double>> polygon = List.of(List.of(12.90, 77.50), List.of(12.91, 77.50));

        assertThatThrownBy(() -> service.create(
                USER_A, "bangalore", ResultScopeKind.POLYGON,
                null, polygon,
                null, null, null, null,
                Map.of(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_polygon_requires_at_least_3_vertices");

        verifyNoInteractions(polygonGeographicSafetyPolicy);
    }

    @Test
    @DisplayName("multiple populated scopes for one kind is rejected as non-exclusive")
    void create_multipleScopesPopulated_rejectedAsNonExclusive() {
        assertThatThrownBy(() -> service.create(
                USER_A, "bangalore", ResultScopeKind.AREA_SET,
                List.of("area-1"), List.of(List.of(12.9, 77.5), List.of(12.91, 77.5), List.of(12.91, 77.51)),
                null, null, null, null,
                Map.of(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_result_scope_must_be_exclusive");
    }

    // -----------------------------------------------------------------------
    // 4. Unsupported filter handling
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("an unsupported filter key is rejected explicitly, never silently dropped")
    void create_unsupportedFilterKey_rejected() {
        Map<String, Object> filters = Map.of("q", "free text search");

        assertThatThrownBy(() -> createAreaSet(USER_A, "bangalore", List.of("area-1"), filters, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_unsupported_filter:q");

        assertThat(savedSearchRepository.findByUserIdOrderByCreatedAtDesc(USER_A)).isEmpty();
    }

    // -----------------------------------------------------------------------
    // 5. Input validation: city slug, label
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("a blank city slug is rejected as a required field")
    void create_blankCitySlug_rejected() {
        assertThatThrownBy(() -> createAreaSet(USER_A, "  ", List.of("area-1"), Map.of(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_city_slug_required");
    }

    @Test
    @DisplayName("a label over 120 characters is rejected")
    void create_labelTooLong_rejected() {
        String longLabel = "x".repeat(121);
        assertThatThrownBy(() -> createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), longLabel))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_label_too_long");
    }

    @Test
    @DisplayName("alertFrequency defaults to DAILY when not specified")
    void create_missingAlertFrequency_defaultsToDaily() {
        SavedSearchService.CreateOutcome outcome =
                createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null);

        assertThat(outcome.savedSearch().getAlertFrequency()).isEqualTo(AlertFrequency.DAILY);
    }

    // -----------------------------------------------------------------------
    // 6. IDOR — mutation-proven: findOwnedOrThrow must scope by user, not just id
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("IDOR: a non-owner cannot read another user's saved search (404, never 403 or leaked data)")
    void get_nonOwnerCannotReadAnotherUsersSavedSearch() {
        SavedSearch owned = createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null).savedSearch();

        assertThat(service.get(USER_A, owned.getId()))
                .as("the owner must be able to read their own row")
                .isNotNull();

        // This assertion structurally fails if findOwnedOrThrow used a plain findById lookup
        // (ignoring the caller's userId) instead of findByIdAndUserId: a non-scoped lookup
        // would return the row instead of throwing, and this test would fail.
        assertThatThrownBy(() -> service.get(USER_B, owned.getId()))
                .as("a non-owner must get 404, never the row itself")
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_not_found");
    }

    @Test
    @DisplayName("IDOR: a non-owner cannot update another user's saved search")
    void update_nonOwnerCannotUpdateAnotherUsersSavedSearch() {
        SavedSearch owned = createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null).savedSearch();

        assertThatThrownBy(() -> service.update(
                USER_B, owned.getId(), "bangalore", ResultScopeKind.AREA_SET,
                List.of("area-9"), null, null, null, null, null,
                Map.of(), "hijacked", null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_not_found");

        SavedSearch reloaded = savedSearchRepository.findById(owned.getId()).orElseThrow();
        assertThat(reloaded.getAreaKeys())
                .as("a rejected update from a non-owner must not mutate the row")
                .containsExactly("area-1");
    }

    @Test
    @DisplayName("IDOR: a non-owner cannot delete another user's saved search")
    void delete_nonOwnerCannotDeleteAnotherUsersSavedSearch() {
        SavedSearch owned = createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null).savedSearch();

        assertThatThrownBy(() -> service.delete(USER_B, owned.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_not_found");

        assertThat(savedSearchRepository.findById(owned.getId()))
                .as("the row must still exist after a rejected non-owner delete")
                .isPresent();
    }

    @Test
    @DisplayName("list only ever returns the calling user's own rows, ordered by createdAt desc")
    void list_returnsOnlyOwnersRowsOrderedByCreatedAtDesc() throws InterruptedException {
        SavedSearch a1 = createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null).savedSearch();
        Thread.sleep(5);
        SavedSearch a2 = createAreaSet(USER_A, "bangalore", List.of("area-2"), Map.of(), null).savedSearch();
        createAreaSet(USER_B, "bangalore", List.of("area-1"), Map.of(), null);

        List<SavedSearch> resultsA = service.list(USER_A);

        assertThat(resultsA).extracting(SavedSearch::getId).containsExactly(a2.getId(), a1.getId());
        assertThat(resultsA).noneMatch(s -> s.getUserId().equals(USER_B));
    }

    // -----------------------------------------------------------------------
    // 7. Max-active cap — mutation-proven boundary at MAX_ACTIVE_SAVED_SEARCHES
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("the 25th active saved search succeeds, the 26th is rejected at the exact cap boundary")
    void create_enforcesMaxActiveCapAtExactBoundary() {
        for (int i = 0; i < SavedSearchService.MAX_ACTIVE_SAVED_SEARCHES; i++) {
            SavedSearchService.CreateOutcome outcome =
                    createAreaSet(USER_A, "bangalore", List.of("area-" + i), Map.of(), null);
            assertThat(outcome.created()).as("row %d of the cap must succeed", i).isTrue();
        }

        assertThat(savedSearchRepository.countByUserIdAndStatus(USER_A, SavedSearchStatus.ACTIVE))
                .isEqualTo(SavedSearchService.MAX_ACTIVE_SAVED_SEARCHES);

        // This assertion structurally fails if the `activeCount >= MAX_ACTIVE_SAVED_SEARCHES`
        // guard in SavedSearchService.create were removed or off-by-one: the 26th distinct
        // search would silently succeed instead of throwing.
        assertThatThrownBy(() -> createAreaSet(USER_A, "bangalore", List.of("area-over-cap"), Map.of(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_max_active_limit_reached");

        assertThat(savedSearchRepository.countByUserIdAndStatus(USER_A, SavedSearchStatus.ACTIVE))
                .as("the rejected 26th create must not have persisted")
                .isEqualTo(SavedSearchService.MAX_ACTIVE_SAVED_SEARCHES);
    }

    @Test
    @DisplayName("resuming a paused search re-enforces the cap and is rejected if it would exceed it")
    void resume_reEnforcesCapAndRejectsIfWouldExceedIt() {
        List<SavedSearch> active = new ArrayList<>();
        for (int i = 0; i < SavedSearchService.MAX_ACTIVE_SAVED_SEARCHES; i++) {
            active.add(createAreaSet(USER_A, "bangalore", List.of("area-" + i), Map.of(), null).savedSearch());
        }

        // Pause one (now 24 active), then fill the freed slot with a new active row (back to 25).
        SavedSearch paused = service.pause(USER_A, active.get(0).getId());
        assertThat(paused.getStatus()).isEqualTo(SavedSearchStatus.PAUSED);
        createAreaSet(USER_A, "bangalore", List.of("area-refill"), Map.of(), null);

        assertThat(savedSearchRepository.countByUserIdAndStatus(USER_A, SavedSearchStatus.ACTIVE))
                .isEqualTo(SavedSearchService.MAX_ACTIVE_SAVED_SEARCHES);

        // Resuming the paused row would push active count to 26 — must be rejected.
        assertThatThrownBy(() -> service.resume(USER_A, paused.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_max_active_limit_reached");

        SavedSearch reloaded = savedSearchRepository.findById(paused.getId()).orElseThrow();
        assertThat(reloaded.getStatus())
                .as("a rejected resume must leave the row PAUSED, not ACTIVE")
                .isEqualTo(SavedSearchStatus.PAUSED);
    }

    // -----------------------------------------------------------------------
    // 8. Pause / resume
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("pause then resume round-trips status correctly")
    void pauseThenResume_roundTrips() {
        SavedSearch saved = createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null).savedSearch();

        SavedSearch paused = service.pause(USER_A, saved.getId());
        assertThat(paused.getStatus()).isEqualTo(SavedSearchStatus.PAUSED);

        SavedSearch resumed = service.resume(USER_A, saved.getId());
        assertThat(resumed.getStatus()).isEqualTo(SavedSearchStatus.ACTIVE);
    }

    // -----------------------------------------------------------------------
    // 9. Deterministic update semantics
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("update recomputes the fingerprint and resets alertWatermark/alertStatus to IDLE")
    void update_recomputesFingerprintAndResetsAlertWatermarkAndStatus() {
        SavedSearch saved = createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null).savedSearch();
        String originalFingerprint = saved.getFingerprint();

        // Directly dirty the alert-tracking columns via a native update — this slice's own API
        // surface has no way to set them to a non-default state (that's Slice B's job), so we
        // simulate "Slice B already alerted on this row" to prove update() resets it.
        entityManager.getEntityManager()
                .createNativeQuery("UPDATE saved_searches SET alert_watermark = now(), alert_status = 'SENT' WHERE id = :id")
                .setParameter("id", saved.getId())
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();

        SavedSearch dirtied = savedSearchRepository.findById(saved.getId()).orElseThrow();
        assertThat(dirtied.getAlertWatermark()).isNotNull();
        assertThat(dirtied.getAlertStatus()).isEqualTo(AlertStatus.SENT);

        SavedSearch updated = service.update(
                USER_A, saved.getId(), "bangalore", ResultScopeKind.AREA_SET,
                List.of("area-2"), null, null, null, null, null,
                Map.of(), "renamed", null);

        assertThat(updated.getFingerprint())
                .as("a scope change must recompute the fingerprint")
                .isNotEqualTo(originalFingerprint);
        assertThat(updated.getAreaKeys()).containsExactly("area-2");
        assertThat(updated.getAlertWatermark())
                .as("any successful update must reset the alert watermark to null")
                .isNull();
        assertThat(updated.getAlertStatus())
                .as("any successful update must reset alertStatus to IDLE")
                .isEqualTo(AlertStatus.IDLE);
    }

    @Test
    @DisplayName("an update whose new fingerprint collides with another owned row is rejected as 409 conflict")
    void update_duplicateFingerprintCollision_rejectedAsConflict() {
        createAreaSet(USER_A, "bangalore", List.of("area-1"), Map.of(), null);
        SavedSearch second = createAreaSet(USER_A, "bangalore", List.of("area-2"), Map.of(), null).savedSearch();

        // Flush + clear before update(): without this, `second` stays the exact managed
        // Java instance that create()'s merge() produced, and findOwnedOrThrow()'s lookup
        // resolves to that SAME already-managed instance via Hibernate's identity map
        // rather than a freshly loaded one. saveAndFlush() then re-merges an
        // already-managed instance, which — unlike a genuinely fresh load — does not
        // reliably re-register a dirty-checking snapshot for the in-place field mutations
        // applyUpdate() just made, so the update silently no-ops with zero SQL instead of
        // hitting the unique-index collision. Clearing here simulates what always happens
        // in production: create() and a later update() are separate HTTP requests, each
        // with its own transaction and persistence context, so this collapsed-session
        // artifact can only occur inside a single @DataJpaTest method sharing one session
        // across multiple service calls. Mirrors
        // update_recomputesFingerprintAndResetsAlertWatermarkAndStatus above.
        entityManager.flush();
        entityManager.clear();

        assertThatThrownBy(() -> service.update(
                USER_A, second.getId(), "bangalore", ResultScopeKind.AREA_SET,
                List.of("area-1"), null, null, null, null, null,
                Map.of(), null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_duplicate_fingerprint");
    }

    // -----------------------------------------------------------------------
    // 10. Repository-level unique index backstop
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("the (user_id, fingerprint) unique index rejects a raw duplicate insert at the DB level")
    void repository_uniqueUserFingerprintIndex_rejectsDuplicateInsert() {
        OffsetDateTime now = OffsetDateTime.now();
        SavedSearch first = new SavedSearch(
                UUID.randomUUID(), USER_A, "bangalore", ResultScopeKind.AREA_SET,
                List.of("area-1"), null, null, null, null, null,
                Map.of(), "same-fingerprint-value", null,
                SavedSearchStatus.ACTIVE, AlertFrequency.DAILY, AlertStatus.IDLE, now, now);
        savedSearchRepository.saveAndFlush(first);

        SavedSearch duplicate = new SavedSearch(
                UUID.randomUUID(), USER_A, "bangalore", ResultScopeKind.AREA_SET,
                List.of("area-2"), null, null, null, null, null,
                Map.of(), "same-fingerprint-value", null,
                SavedSearchStatus.ACTIVE, AlertFrequency.DAILY, AlertStatus.IDLE, now, now);

        assertThatThrownBy(() -> savedSearchRepository.saveAndFlush(duplicate))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private SavedSearchService.CreateOutcome createAreaSet(
            UUID userId, String citySlug, List<String> areaKeys, Map<String, Object> filters, String label) {
        return service.create(
                userId, citySlug, ResultScopeKind.AREA_SET,
                areaKeys, null,
                null, null, null, null,
                filters, label, null);
    }
}
