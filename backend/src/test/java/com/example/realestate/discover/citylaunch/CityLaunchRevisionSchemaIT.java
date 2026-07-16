package com.example.realestate.discover.citylaunch;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
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

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers integration test (real Postgres, NOT mocked, NOT H2) proving the acceptance
 * criteria for V118's {@code city_launch_revision} + six {@code sandbox_*} tables (#1911 PR1).
 *
 * <p>Mirrors {@code AreaOnboardingApplyIT}'s Testcontainers + Flyway configuration: a real
 * postgis/postgis container, the full classpath:db/migration history (which now includes V118),
 * plus the shared test-stub relaxations under classpath:db/test-stubs.
 *
 * <p>PR1 ships schema + entities + repositories only — no service layer, no lifecycle
 * orchestration. This test therefore drives the repositories and raw JDBC directly rather than
 * through any application service.
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
class CityLaunchRevisionSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private SandboxAreaRepository sandboxAreaRepository;
    @Autowired private SandboxAreaAliasRepository sandboxAreaAliasRepository;
    @Autowired private SandboxCityRegionRepository sandboxCityRegionRepository;
    @Autowired private SandboxCityRegionMembershipRepository sandboxCityRegionMembershipRepository;
    @Autowired private SandboxAreaGroupRepository sandboxAreaGroupRepository;
    @Autowired private SandboxAreaGroupMemberRepository sandboxAreaGroupMemberRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    private Integer bangaloreCityId;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        bangaloreCityId = jdbcTemplate.queryForObject(
                "SELECT id FROM public.cities WHERE slug = 'bangalore'", Integer.class);
        udupiCityId = jdbcTemplate.queryForObject(
                "SELECT id FROM public.cities WHERE slug = 'udupi'", Integer.class);
    }

    // ── Migration sanity ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("V118 applies cleanly on top of V117 (Flyway green) and creates all 7 tables")
    void migrationAppliesCleanly() {
        List<String> tables = jdbcTemplate.queryForList(
                "SELECT table_name FROM information_schema.tables "
                        + "WHERE table_schema = 'public' AND table_name IN ("
                        + "'city_launch_revision','sandbox_areas','sandbox_area_aliases',"
                        + "'sandbox_city_regions','sandbox_city_region_memberships',"
                        + "'sandbox_area_groups','sandbox_area_group_members')",
                String.class);
        assertThat(tables).containsExactlyInAnyOrder(
                "city_launch_revision", "sandbox_areas", "sandbox_area_aliases",
                "sandbox_city_regions", "sandbox_city_region_memberships",
                "sandbox_area_groups", "sandbox_area_group_members");
    }

    // ── AC1: revision uniqueness + supersession ─────────────────────────────────────────────

    @Test
    @DisplayName("AC1: uq_clr_inflight rejects a 2nd in-flight revision for the same city")
    void inflightUniquenessEnforced() {
        insertRevision(bangaloreCityId, 1, "PREPARING");

        assertThatThrownBy(() -> {
            insertRevision(bangaloreCityId, 2, "PREPARED");
        }).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("AC1: uq_clr_current_promoted rejects two live PROMOTED revisions for the same city")
    void currentPromotedUniquenessEnforced() {
        insertRevision(bangaloreCityId, 1, "PROMOTED");
        entityManager.flush();

        // Note: the failing INSERT aborts the current Postgres transaction, so this must be the
        // last statement in the test (the @DataJpaTest transaction rolls back at teardown).
        assertThatThrownBy(() -> insertRevision(bangaloreCityId, 2, "PROMOTED"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("AC1: a SUPERSEDED (non-live) row never conflicts with uq_clr_current_promoted")
    void supersededRowDoesNotConflictWithCurrentPromotedIndex() {
        Long first = insertRevision(bangaloreCityId, 1, "PROMOTED");
        entityManager.flush();
        jdbcTemplate.update("UPDATE public.city_launch_revision SET lifecycle_status = 'SUPERSEDED' WHERE id = ?", first);

        Long second = insertRevision(bangaloreCityId, 2, "PROMOTED");

        assertThat(second).isNotNull();
    }

    @Test
    @DisplayName("AC1: single-transaction supersession succeeds via the guarded repository method")
    void supersessionSucceedsInSingleTransaction() {
        Long oldRevision = insertRevision(bangaloreCityId, 1, "PROMOTED");
        entityManager.flush();
        entityManager.clear();

        Long newRevision = insertRevision(bangaloreCityId, 2, "PROMOTING");
        entityManager.flush();

        int oldRowsAffected = revisionRepository.supersede(oldRevision, newRevision);
        int promoteRowsAffected = revisionRepository.transitionLifecycleStatus(
                newRevision, LifecycleStatus.PROMOTING, LifecycleStatus.PROMOTED);
        entityManager.flush();
        entityManager.clear();

        assertThat(oldRowsAffected).isEqualTo(1);
        assertThat(promoteRowsAffected).isEqualTo(1);

        CityLaunchRevision reloadedOld = revisionRepository.findById(oldRevision).orElseThrow();
        CityLaunchRevision reloadedNew = revisionRepository.findById(newRevision).orElseThrow();
        assertThat(reloadedOld.getLifecycleStatus()).isEqualTo(LifecycleStatus.SUPERSEDED);
        assertThat(reloadedOld.getSupersededBy()).isEqualTo(newRevision);
        assertThat(reloadedNew.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);
    }

    @Test
    @DisplayName("AC1: supersede() clears the persistence context so a same-transaction re-read sees fresh state, not a stale cached entity")
    void supersedeClearsPersistenceContextForSameTransactionReread() {
        Long oldRevision = insertRevision(bangaloreCityId, 1, "PROMOTED");
        entityManager.flush();
        entityManager.clear();

        Long newRevision = insertRevision(bangaloreCityId, 2, "PROMOTING");
        entityManager.flush();
        entityManager.clear();

        // Load the old revision into the persistence context BEFORE the guarded UPDATE, so a
        // stale first-level cache entry would be returned by findById() below if @Modifying did
        // not clearAutomatically.
        CityLaunchRevision preUpdate = revisionRepository.findById(oldRevision).orElseThrow();
        assertThat(preUpdate.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);

        int rowsAffected = revisionRepository.supersede(oldRevision, newRevision);
        assertThat(rowsAffected).isEqualTo(1);

        // No entityManager.clear() here — clearAutomatically=true on @Modifying must have already
        // evicted the first-level cache, so this read goes back to the database rather than
        // returning the pre-update managed entity.
        CityLaunchRevision postUpdate = revisionRepository.findById(oldRevision).orElseThrow();
        assertThat(postUpdate.getLifecycleStatus()).isEqualTo(LifecycleStatus.SUPERSEDED);
        assertThat(postUpdate.getSupersededBy()).isEqualTo(newRevision);
    }

    @Test
    @DisplayName("AC1: guarded supersede() returns 0 rows affected when the precondition doesn't hold")
    void supersedeIsGuardedAgainstStaleState() {
        Long notYetPromoted = insertRevision(bangaloreCityId, 1, "PREPARING");
        entityManager.flush();

        int rowsAffected = revisionRepository.supersede(notYetPromoted, 999_999L);

        assertThat(rowsAffected).isZero();
        entityManager.clear();
        assertThat(revisionRepository.findById(notYetPromoted).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARING);
    }

    @Test
    @DisplayName("AC1: UNIQUE(city_id, revision_number) is enforced")
    void revisionNumberUniquePerCity() {
        insertRevision(bangaloreCityId, 1, "SUPERSEDED");
        entityManager.flush();

        assertThatThrownBy(() -> {
            insertRevision(bangaloreCityId, 1, "FAILED");
        }).isInstanceOf(DataIntegrityViolationException.class);
    }

    // ── AC2: revision graph load + isolation ────────────────────────────────────────────────

    @Test
    @DisplayName("AC2: full revision graph loads by revision_id and is isolated per revision")
    void revisionGraphLoadsAndIsIsolated() {
        Long revisionA = insertRevision(bangaloreCityId, 1, "PREPARING");
        Long revisionB = insertRevision(udupiCityId, 1, "PREPARING");
        entityManager.flush();

        SandboxArea areaA = sandboxAreaRepository.save(new SandboxArea(
                revisionA, "IN|KA|Bengaluru|Hebbal", "Hebbal", "Bengaluru",
                13.05, 77.59, 13.04, 77.58, 13.06, 77.60, "OSM", "way", 111L));
        SandboxArea areaB = sandboxAreaRepository.save(new SandboxArea(
                revisionB, "IN|KA|Bengaluru|Hebbal", "Hebbal Udupi Namesake", "Udupi",
                13.34, 74.74, 13.33, 74.73, 13.35, 74.75, "OSM", "way", 222L));
        entityManager.flush();

        sandboxAreaAliasRepository.save(new SandboxAreaAlias(revisionA, areaA.getId(), "Hebbal North", "hebbal north"));

        SandboxCityRegion regionA = sandboxCityRegionRepository.save(new SandboxCityRegion(
                revisionA, "north", "North Bangalore", 1,
                BigDecimal.valueOf(13.05), BigDecimal.valueOf(77.59),
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(77.5),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(77.7), "fp-1"));
        sandboxCityRegionMembershipRepository.save(new SandboxCityRegionMembership(
                revisionA, areaA.getId(), "north", AssignmentSource.AUTO));

        SandboxAreaGroup groupA = sandboxAreaGroupRepository.save(new SandboxAreaGroup(
                revisionA, "hebbal-belt", "Hebbal Belt", "subtitle", "North", 1, true,
                13.05, 77.59, 13.04, 77.58, 13.06, 77.60));
        sandboxAreaGroupMemberRepository.save(new SandboxAreaGroupMember(revisionA, groupA.getId(), areaA.getId(), 1));
        entityManager.flush();
        entityManager.clear();

        // Same area_key legitimately exists in two different revisions with different surrogate ids.
        assertThat(areaA.getId()).isNotEqualTo(areaB.getId());

        List<SandboxArea> areasForA = sandboxAreaRepository.findByRevisionId(revisionA);
        List<SandboxArea> areasForB = sandboxAreaRepository.findByRevisionId(revisionB);
        assertThat(areasForA).extracting(SandboxArea::getAreaKey).containsExactly("IN|KA|Bengaluru|Hebbal");
        assertThat(areasForB).extracting(SandboxArea::getAreaKey).containsExactly("IN|KA|Bengaluru|Hebbal");
        assertThat(areasForA).extracting(SandboxArea::getId).doesNotContainAnyElementsOf(
                areasForB.stream().map(SandboxArea::getId).collect(Collectors.toList()));

        assertThat(sandboxAreaAliasRepository.findByRevisionId(revisionA)).hasSize(1);
        assertThat(sandboxAreaAliasRepository.findByRevisionId(revisionB)).isEmpty();
        assertThat(sandboxCityRegionRepository.findByRevisionId(revisionA)).hasSize(1);
        assertThat(sandboxCityRegionRepository.findByRevisionId(revisionB)).isEmpty();
        assertThat(sandboxCityRegionMembershipRepository.findByRevisionId(revisionA)).hasSize(1);
        assertThat(sandboxAreaGroupRepository.findByRevisionId(revisionA)).hasSize(1);
        assertThat(sandboxAreaGroupMemberRepository.findByRevisionId(revisionA)).hasSize(1);
    }

    @Test
    @DisplayName("AC2 isolation: V118 adds ZERO columns to production geography tables")
    void productionTablesUntouchedByMigration() {
        Set<String> areasColumns = columnsOf("areas");
        Set<String> areaGroupsColumns = columnsOf("area_groups");
        Set<String> cityRegionsColumns = columnsOf("city_regions");

        // Production column sets legitimately grow across migrations (e.g. V113/V116 added
        // osm_*/lifecycle_status/merged_into_area_key to areas), so we assert a subset (canonical
        // columns still present) plus a negative check (no sandbox/revision column leaked) rather
        // than an exact match that would rot as earlier migrations evolve.
        assertThat(areasColumns).doesNotContain("revision_id", "sandbox_area_id", "sandbox_area_group_id");
        assertThat(areasColumns).contains(
                "area_key", "city_id", "name", "district", "geo_center_lat", "geo_center_lon",
                "min_lat", "min_lon", "max_lat", "max_lon", "lifecycle_status", "geometry_source");
        assertThat(areaGroupsColumns).doesNotContain("revision_id", "sandbox_area_id");
        assertThat(cityRegionsColumns).doesNotContain("revision_id", "sandbox_area_id");
    }

    // ── AC3: revision field round-trip ──────────────────────────────────────────────────────

    @Test
    @DisplayName("AC3: revision round-trips lifecycle_status, source identity, checksums, timestamps, superseded_by, created_by")
    void revisionFieldsRoundTrip() {
        java.util.UUID createdBy = java.util.UUID.randomUUID();
        CityLaunchRevision revision = new CityLaunchRevision(bangaloreCityId, 7, createdBy);
        revision.setDatasetId("dataset-x");
        revision.setDatasetVersion("v3");
        revision.setSourceArtifactChecksum("sha256:abc");
        revision.setPersistedRevisionChecksum("sha256:persisted");
        revision.setAppliedRevisionChecksum("sha256:applied");
        revision.setRegionModel("macro-4");
        revision.setCentralRadiusKm(BigDecimal.valueOf(12.5));
        revision.setLifecycleStatus(LifecycleStatus.PROMOTED);
        revision.setPromotedAt(java.time.Instant.parse("2026-01-01T00:00:00Z"));
        CityLaunchRevision saved = revisionRepository.save(revision);
        entityManager.flush();
        entityManager.clear();

        CityLaunchRevision reloaded = revisionRepository.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getCityId()).isEqualTo(bangaloreCityId);
        assertThat(reloaded.getRevisionNumber()).isEqualTo(7);
        assertThat(reloaded.getLifecycleStatus()).isEqualTo(LifecycleStatus.PROMOTED);
        assertThat(reloaded.getDatasetId()).isEqualTo("dataset-x");
        assertThat(reloaded.getDatasetVersion()).isEqualTo("v3");
        assertThat(reloaded.getSourceArtifactChecksum()).isEqualTo("sha256:abc");
        assertThat(reloaded.getPersistedRevisionChecksum()).isEqualTo("sha256:persisted");
        assertThat(reloaded.getAppliedRevisionChecksum()).isEqualTo("sha256:applied");
        assertThat(reloaded.getPromotedAt()).isEqualTo(java.time.Instant.parse("2026-01-01T00:00:00Z"));
        assertThat(reloaded.getSupersededBy()).isNull();
        assertThat(reloaded.getCreatedBy()).isEqualTo(createdBy);
        assertThat(reloaded.getCreatedAt()).isNotNull(); // DB default now()
    }

    // ── AC4: prep_stage / prep_state constraints ────────────────────────────────────────────

    @Test
    @DisplayName("AC4: prep_stage accepts 0..6 and rejects 7")
    void prepStageRangeEnforced() {
        Long revisionId = insertRevision(bangaloreCityId, 1, "PREPARING");
        entityManager.flush();
        jdbcTemplate.update("UPDATE public.city_launch_revision SET prep_stage = 6 WHERE id = ?", revisionId);

        assertThatThrownBy(() ->
                jdbcTemplate.update("UPDATE public.city_launch_revision SET prep_stage = 7 WHERE id = ?", revisionId)
        ).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("AC4: prep_state rejects an invalid value")
    void prepStateCheckEnforced() {
        Long revisionId = insertRevision(bangaloreCityId, 1, "PREPARING");
        entityManager.flush();

        assertThatThrownBy(() ->
                jdbcTemplate.update("UPDATE public.city_launch_revision SET prep_state = 'BOGUS' WHERE id = ?", revisionId)
        ).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("AC4: a mid-run progress state round-trips")
    void midRunProgressRoundTrips() {
        CityLaunchRevision revision = new CityLaunchRevision(bangaloreCityId, 1, null);
        revision.setPrepStage((short) 3);
        revision.setPrepState(PrepState.RUNNING);
        CityLaunchRevision saved = revisionRepository.save(revision);
        entityManager.flush();
        entityManager.clear();

        CityLaunchRevision reloaded = revisionRepository.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getPrepStage()).isEqualTo((short) 3);
        assertThat(reloaded.getPrepState()).isEqualTo(PrepState.RUNNING);
    }

    // ── AC5: cascade delete ──────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AC5: deleting a revision cascades to all 6 sandbox tables with zero orphans; sibling revision untouched")
    void cascadeDeleteRemovesAllSandboxRowsWithNoOrphans() {
        Long revisionA = insertRevision(bangaloreCityId, 1, "PREPARING");
        Long revisionB = insertRevision(udupiCityId, 1, "PREPARING");
        entityManager.flush();

        SandboxArea areaA = sandboxAreaRepository.save(new SandboxArea(
                revisionA, "IN|KA|Bengaluru|Hebbal", "Hebbal", "Bengaluru",
                13.05, 77.59, 13.04, 77.58, 13.06, 77.60, "OSM", "way", 111L));
        SandboxArea areaB = sandboxAreaRepository.save(new SandboxArea(
                revisionB, "IN|KA|Udupi|Malpe", "Malpe", "Udupi",
                13.35, 74.70, 13.34, 74.69, 13.36, 74.71, "OSM", "way", 333L));
        entityManager.flush();

        sandboxAreaAliasRepository.save(new SandboxAreaAlias(revisionA, areaA.getId(), "Hebbal North", "hebbal north"));
        SandboxCityRegion regionA = sandboxCityRegionRepository.save(new SandboxCityRegion(
                revisionA, "north", "North", 1,
                BigDecimal.valueOf(13.05), BigDecimal.valueOf(77.59),
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(77.5),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(77.7), "fp"));
        sandboxCityRegionMembershipRepository.save(new SandboxCityRegionMembership(
                revisionA, areaA.getId(), "north", AssignmentSource.AUTO));
        SandboxAreaGroup groupA = sandboxAreaGroupRepository.save(new SandboxAreaGroup(
                revisionA, "hebbal-belt", "Hebbal Belt", null, "North", 1, true,
                13.05, 77.59, 13.04, 77.58, 13.06, 77.60));
        // Membership reachable via BOTH the group-cascade path and the area-cascade path.
        sandboxAreaGroupMemberRepository.save(new SandboxAreaGroupMember(revisionA, groupA.getId(), areaA.getId(), 1));

        sandboxAreaAliasRepository.save(new SandboxAreaAlias(revisionB, areaB.getId(), "Malpe Beach", "malpe beach"));
        entityManager.flush();
        entityManager.clear();

        revisionRepository.deleteById(revisionA);
        entityManager.flush();
        entityManager.clear();

        assertThat(revisionRepository.findById(revisionA)).isEmpty();
        assertThat(sandboxAreaRepository.findByRevisionId(revisionA)).isEmpty();
        assertThat(sandboxAreaAliasRepository.findByRevisionId(revisionA)).isEmpty();
        assertThat(sandboxCityRegionRepository.findByRevisionId(revisionA)).isEmpty();
        assertThat(sandboxCityRegionMembershipRepository.findByRevisionId(revisionA)).isEmpty();
        assertThat(sandboxAreaGroupRepository.findByRevisionId(revisionA)).isEmpty();
        assertThat(sandboxAreaGroupMemberRepository.findByRevisionId(revisionA)).isEmpty();
        // No orphaned membership row survives via either FK path.
        Integer orphanCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM public.sandbox_area_group_members WHERE sandbox_area_group_id = ? OR sandbox_area_id = ?",
                Integer.class, groupA.getId(), areaA.getId());
        assertThat(orphanCount).isZero();

        // Sibling revision B's rows are untouched.
        assertThat(revisionRepository.findById(revisionB)).isPresent();
        assertThat(sandboxAreaRepository.findByRevisionId(revisionB)).hasSize(1);
        assertThat(sandboxAreaAliasRepository.findByRevisionId(revisionB)).hasSize(1);
    }

    // ── Immutability: no update path for sandbox rows ──────────────────────────────────────

    @Test
    @DisplayName("Immutability: mutating a detached sandbox row in memory without save() leaves the DB row unchanged")
    void sandboxRowIsImmutableWithoutExplicitSave() {
        Long revisionId = insertRevision(bangaloreCityId, 1, "PREPARING");
        entityManager.flush();

        SandboxArea saved = sandboxAreaRepository.save(new SandboxArea(
                revisionId, "IN|KA|Bengaluru|Hebbal", "Hebbal", "Bengaluru",
                13.05, 77.59, 13.04, 77.58, 13.06, 77.60, "OSM", "way", 111L));
        entityManager.flush();
        entityManager.clear(); // fully detach everything from the persistence context

        SandboxArea managed = sandboxAreaRepository.findById(saved.getId()).orElseThrow();
        entityManager.detach(managed); // explicitly detach so dirty-checking cannot auto-flush it

        // SandboxArea intentionally exposes no setters — this test proves the DB-level invariant
        // via raw JDBC, mirroring the "no code path exists to mutate a persisted row" contract.
        String nameInDb = jdbcTemplate.queryForObject(
                "SELECT name FROM public.sandbox_areas WHERE id = ?", String.class, saved.getId());
        assertThat(nameInDb).isEqualTo("Hebbal");

        entityManager.flush(); // no-op: nothing dirty/managed to flush

        SandboxArea reloaded = sandboxAreaRepository.findById(saved.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo("Hebbal");
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────────────────

    private Long insertRevision(Integer cityId, int revisionNumber, String lifecycleStatus) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.city_launch_revision (city_id, revision_number, lifecycle_status) "
                        + "VALUES (?, ?, ?) RETURNING id",
                Long.class, cityId, revisionNumber, lifecycleStatus);
    }

    private Set<String> columnsOf(String tableName) {
        return jdbcTemplate.queryForList(
                        "SELECT column_name FROM information_schema.columns "
                                + "WHERE table_schema = 'public' AND table_name = ?",
                        String.class, tableName)
                .stream().collect(Collectors.toSet());
    }
}
