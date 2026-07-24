package com.example.realestate.discover.navigation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link SandboxNavigationOverride} (V122, #1955 Areas PR A, SLICE
 * 2f+2g). Insert+delete (no in-place update — see entity javadoc).
 */
@Repository
public interface SandboxNavigationOverrideRepository extends JpaRepository<SandboxNavigationOverride, Long> {

    List<SandboxNavigationOverride> findByRevisionIdOrderByApplyOrderAsc(Long revisionId);

    Optional<SandboxNavigationOverride> findByIdAndRevisionId(Long id, Long revisionId);

    boolean existsByRevisionIdAndSubjectAreaKeyAndOverrideKind(
            Long revisionId, String subjectAreaKey, OverrideKind overrideKind);

    boolean existsByRevisionIdAndSubjectNodeKeyAndOverrideKind(
            Long revisionId, String subjectNodeKey, OverrideKind overrideKind);

    /**
     * Deliberately NO {@code clearAutomatically} — see {@link
     * com.example.realestate.discover.navigation.SandboxNavigationNodeRepository#deleteByRevisionId}
     * javadoc for why: this runs inside the SAME transaction as {@link
     * com.example.realestate.discover.citylaunch.CityLaunchNavigationOverrideService}, which already
     * holds a managed, locked {@code CityLaunchRevision} at the point this executes.
     */
    @Modifying
    @Query("DELETE FROM SandboxNavigationOverride o WHERE o.revisionId = :revisionId AND o.id = :id")
    int deleteByRevisionIdAndId(@Param("revisionId") Long revisionId, @Param("id") Long id);
}
