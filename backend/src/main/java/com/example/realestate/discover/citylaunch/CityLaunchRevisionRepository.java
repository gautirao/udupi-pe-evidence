package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.LockModeType;

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
}
