package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data repository for {@link SandboxAgriDestinationClassification} (V125, #2151 PR A).
 * Insert+read only for a given row, with ONE documented exception — {@link #deleteByRevisionId}
 * supports a wholesale replace of a revision's entire classification set on regeneration, mirroring
 * {@code SandboxNavigationNodeRepository#deleteByRevisionId}. No individual row is ever UPDATEd.
 */
@Repository
public interface SandboxAgriDestinationClassificationRepository
        extends JpaRepository<SandboxAgriDestinationClassification, Long> {

    /** Full sandbox classification set for a revision, in insertion order (the generator itself
     *  writes in area_key ascending order — see {@code AgriDestinationClassificationGenerator}). */
    List<SandboxAgriDestinationClassification> findByRevisionId(Long revisionId);

    /**
     * Cheap existence probe (correction pass, #2151 AC2) — used by {@link CityLaunchValidationService}
     * ONLY to shape the error message after {@code setAgriValidatedTrue}'s EXISTS-guarded UPDATE
     * already rejected the write with 0 rows affected. This is diagnostic, never the enforcement
     * point itself — the guard lives in the repository UPDATE's own WHERE/EXISTS clause.
     */
    boolean existsByRevisionId(Long revisionId);

    /**
     * Bulk-clears every sandbox classification row for a revision, ahead of a fresh (re)generation
     * write — the same stale-row-removal discipline {@link
     * com.example.realestate.discover.navigation.SandboxNavigationNodeRepository#deleteByRevisionId}
     * uses, so a re-run of prepare for an already-PREPARING revision never leaves an orphaned row
     * for an area that has since been renamed/merged/made INACTIVE.
     *
     * <p>Deliberately NO {@code clearAutomatically} — this method runs inside the SAME transaction
     * as callers that already hold a managed {@link CityLaunchRevision} entity (e.g. {@link
     * CityLaunchGraphWriter#writeGraphTransactional}), and {@code clearAutomatically} would detach
     * that entity from the persistence context, silently dropping its later
     * {@code setLifecycleStatus}/{@code setPersistedRevisionChecksum} writes with NO exception
     * (the documented #1955 SLICE 2f+2g regression this convention guards against).
     */
    @Modifying
    @Query("DELETE FROM SandboxAgriDestinationClassification a WHERE a.revisionId = :revisionId")
    int deleteByRevisionId(@Param("revisionId") Long revisionId);
}
