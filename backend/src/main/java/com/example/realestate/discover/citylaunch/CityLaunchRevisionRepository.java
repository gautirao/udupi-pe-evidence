package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.LockModeType;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link CityLaunchRevision} (V118, #1911 PR1).
 *
 * <p>The only UPDATE surface in PR1: a guarded supersession transition and a guarded generic
 * lifecycle transition, both scoped by an expected current-state predicate so a stale caller
 * cannot silently clobber a concurrent transition. No service in PR1 invokes either — that
 * orchestration ships in a later PR. {@link #findByIdForUpdate} exists to let a future
 * orchestrator take a pessimistic lock before evaluating a transition.
 */
@Repository
public interface CityLaunchRevisionRepository extends JpaRepository<CityLaunchRevision, Long> {

    List<CityLaunchRevision> findByCityId(Integer cityId);

    Optional<CityLaunchRevision> findByCityIdAndRevisionNumber(Integer cityId, Integer revisionNumber);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM CityLaunchRevision r WHERE r.id = :id")
    Optional<CityLaunchRevision> findByIdForUpdate(@Param("id") Long id);

    /**
     * Atomically supersedes {@code oldRevisionId} (must currently be PROMOTED) in favour of
     * {@code newRevisionId}. Guarded by the expected-current-status predicate so a concurrent or
     * out-of-order caller cannot double-supersede. Returns the number of rows updated (0 or 1) —
     * callers must treat 0 as "precondition not met" and abort, never retry blindly.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.lifecycleStatus = com.example.realestate.discover.citylaunch.LifecycleStatus.SUPERSEDED, "
            + "r.supersededBy = :newRevisionId "
            + "WHERE r.id = :oldRevisionId AND r.lifecycleStatus = com.example.realestate.discover.citylaunch.LifecycleStatus.PROMOTED")
    int supersede(@Param("oldRevisionId") Long oldRevisionId, @Param("newRevisionId") Long newRevisionId);

    /**
     * Guarded generic lifecycle transition: updates {@code lifecycle_status} only when the row's
     * current status matches {@code expectedStatus}. Returns the number of rows updated (0 or 1).
     * No caller in PR1 invokes this — it exists so a future orchestration PR has a
     * concurrency-safe primitive to build on, rather than introducing an unguarded save().
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.lifecycleStatus = :newStatus "
            + "WHERE r.id = :id AND r.lifecycleStatus = :expectedStatus")
    int transitionLifecycleStatus(@Param("id") Long id,
                                   @Param("expectedStatus") LifecycleStatus expectedStatus,
                                   @Param("newStatus") LifecycleStatus newStatus);

    // ── Validation checklist guarded writes (V120, #1911 PR4) ───────────────────────────────────
    //
    // Every method below is scoped by id + city_id + supersededBy IS NULL + lifecycle_status IN
    // (PREPARED, VALIDATED) — a write can NEVER touch another city's/revision's row, and a
    // superseded or non-editable (PREPARING/PROMOTING/PROMOTED/SUPERSEDED/FAILED) revision can
    // NEVER be mutated, because the guard lives in the SQL WHERE clause itself, not just a
    // service-layer pre-check. The five SET-FALSE methods and reset()/markValidated() use
    // nativeQuery (JPQL CASE-on-enum-with-NULL-branch is awkward with Hibernate's type inference)
    // but remain fully parameterized — no string concatenation of caller input.

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.landingValidated = true "
            + "WHERE r.id = :id AND r.cityId = :cityId AND r.supersededBy IS NULL "
            + "AND r.lifecycleStatus IN (com.example.realestate.discover.citylaunch.LifecycleStatus.PREPARED, "
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.VALIDATED)")
    int setLandingValidatedTrue(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.regionsValidated = true "
            + "WHERE r.id = :id AND r.cityId = :cityId AND r.supersededBy IS NULL "
            + "AND r.lifecycleStatus IN (com.example.realestate.discover.citylaunch.LifecycleStatus.PREPARED, "
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.VALIDATED)")
    int setRegionsValidatedTrue(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.areaGroupsValidated = true "
            + "WHERE r.id = :id AND r.cityId = :cityId AND r.supersededBy IS NULL "
            + "AND r.lifecycleStatus IN (com.example.realestate.discover.citylaunch.LifecycleStatus.PREPARED, "
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.VALIDATED)")
    int setAreaGroupsValidatedTrue(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.areasValidated = true "
            + "WHERE r.id = :id AND r.cityId = :cityId AND r.supersededBy IS NULL "
            + "AND r.lifecycleStatus IN (com.example.realestate.discover.citylaunch.LifecycleStatus.PREPARED, "
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.VALIDATED)")
    int setAreasValidatedTrue(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.listingValidated = true "
            + "WHERE r.id = :id AND r.cityId = :cityId AND r.supersededBy IS NULL "
            + "AND r.lifecycleStatus IN (com.example.realestate.discover.citylaunch.LifecycleStatus.PREPARED, "
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.VALIDATED)")
    int setListingValidatedTrue(@Param("id") Long id, @Param("cityId") Integer cityId);

    /**
     * Unticking a check while VALIDATED atomically demotes lifecycle_status back to PREPARED and
     * clears validated_at IN THE SAME UPDATE (never a separate write), so the "VALIDATED implies
     * all-5" invariant can never be observed broken between two statements.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "landing_validated = false, "
            + "lifecycle_status = CASE WHEN lifecycle_status = 'VALIDATED' THEN 'PREPARED' ELSE lifecycle_status END, "
            + "validated_at = CASE WHEN lifecycle_status = 'VALIDATED' THEN NULL ELSE validated_at END "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED')", nativeQuery = true)
    int setLandingValidatedFalse(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "regions_validated = false, "
            + "lifecycle_status = CASE WHEN lifecycle_status = 'VALIDATED' THEN 'PREPARED' ELSE lifecycle_status END, "
            + "validated_at = CASE WHEN lifecycle_status = 'VALIDATED' THEN NULL ELSE validated_at END "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED')", nativeQuery = true)
    int setRegionsValidatedFalse(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "area_groups_validated = false, "
            + "lifecycle_status = CASE WHEN lifecycle_status = 'VALIDATED' THEN 'PREPARED' ELSE lifecycle_status END, "
            + "validated_at = CASE WHEN lifecycle_status = 'VALIDATED' THEN NULL ELSE validated_at END "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED')", nativeQuery = true)
    int setAreaGroupsValidatedFalse(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "areas_validated = false, "
            + "lifecycle_status = CASE WHEN lifecycle_status = 'VALIDATED' THEN 'PREPARED' ELSE lifecycle_status END, "
            + "validated_at = CASE WHEN lifecycle_status = 'VALIDATED' THEN NULL ELSE validated_at END "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED')", nativeQuery = true)
    int setAreasValidatedFalse(@Param("id") Long id, @Param("cityId") Integer cityId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "listing_validated = false, "
            + "lifecycle_status = CASE WHEN lifecycle_status = 'VALIDATED' THEN 'PREPARED' ELSE lifecycle_status END, "
            + "validated_at = CASE WHEN lifecycle_status = 'VALIDATED' THEN NULL ELSE validated_at END "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED')", nativeQuery = true)
    int setListingValidatedFalse(@Param("id") Long id, @Param("cityId") Integer cityId);

    /**
     * Resets all five checklist columns to false, atomically demoting VALIDATED -> PREPARED and
     * clearing validated_at in the same UPDATE as the per-column set-false methods above.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "landing_validated = false, regions_validated = false, area_groups_validated = false, "
            + "areas_validated = false, listing_validated = false, "
            + "lifecycle_status = CASE WHEN lifecycle_status = 'VALIDATED' THEN 'PREPARED' ELSE lifecycle_status END, "
            + "validated_at = CASE WHEN lifecycle_status = 'VALIDATED' THEN NULL ELSE validated_at END "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED')", nativeQuery = true)
    int resetValidation(@Param("id") Long id, @Param("cityId") Integer cityId);

    /**
     * Transitions PREPARED -&gt; VALIDATED. The all-five-checked invariant is enforced IN THE SQL
     * WHERE clause itself (never a disabled button / service-only check) — a caller with 4/5
     * checked gets 0 rows affected exactly like a caller on a non-editable revision; the SERVICE
     * distinguishes the two by pre-loading the revision when rows == 0.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_launch_revision SET "
            + "lifecycle_status = 'VALIDATED', validated_at = :now "
            + "WHERE id = :id AND city_id = :cityId AND superseded_by IS NULL "
            + "AND lifecycle_status IN ('PREPARED', 'VALIDATED') "
            + "AND landing_validated AND regions_validated AND area_groups_validated "
            + "AND areas_validated AND listing_validated", nativeQuery = true)
    int markValidated(@Param("id") Long id, @Param("cityId") Integer cityId, @Param("now") Instant now);

    /**
     * New variant of the V118 {@link #supersede} method: supersedes an in-flight (PREPARED or
     * VALIDATED) revision rather than a PROMOTED one, so {@link CityLaunchPreparationService}'s
     * rerun path can atomically retire the current revision before inserting its replacement.
     * Returns 0 if the revision is not currently in-flight (already superseded, or in a
     * pre-/post-in-flight state) — the caller must treat 0 as "cannot rerun" and abort without
     * inserting a new revision.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.lifecycleStatus = com.example.realestate.discover.citylaunch.LifecycleStatus.SUPERSEDED "
            + "WHERE r.id = :oldRevisionId AND r.cityId = :cityId AND r.lifecycleStatus IN ("
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.PREPARED, "
            + "com.example.realestate.discover.citylaunch.LifecycleStatus.VALIDATED)")
    int supersedeInflight(@Param("oldRevisionId") Long oldRevisionId, @Param("cityId") Integer cityId);

    /**
     * Back-links a just-superseded revision to its replacement, called AFTER the replacement row
     * has been inserted (so {@code newRevisionId} is known) — mirrors the two-step
     * supersede-then-backlink sequence {@link CityLaunchPreparationService#rerunSuperseding} uses.
     * Guarded on the row already being SUPERSEDED so this cannot silently backlink an unrelated
     * (non-superseded) row.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE CityLaunchRevision r SET r.supersededBy = :newRevisionId "
            + "WHERE r.id = :oldRevisionId "
            + "AND r.lifecycleStatus = com.example.realestate.discover.citylaunch.LifecycleStatus.SUPERSEDED")
    int backLinkSuperseded(@Param("oldRevisionId") Long oldRevisionId, @Param("newRevisionId") Long newRevisionId);
}
