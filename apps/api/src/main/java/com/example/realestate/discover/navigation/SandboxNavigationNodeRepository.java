package com.example.realestate.discover.navigation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link SandboxNavigationNode} (V121, #1955 Areas PR A). Insert+read
 * only for a given row — see {@link com.example.realestate.discover.citylaunch.SandboxAreaRepository}
 * for the family-wide immutability convention — with ONE documented exception: {@link
 * #deleteByRevisionId} supports a WHOLESALE replace of a revision's entire node set, used by
 * {@link NavigationTreeSandboxWriter#persist} to make navigation-tree REGENERATION (#1955 Areas PR
 * A, SLICE 2f+2g override endpoints) idempotent — no individual row is ever UPDATEd.
 */
@Repository
public interface SandboxNavigationNodeRepository extends JpaRepository<SandboxNavigationNode, Long> {

    /** Full sandbox tree for a revision — the shape a future promotion step will load. */
    List<SandboxNavigationNode> findByRevisionId(Long revisionId);

    /** Full sandbox tree ordered for NavigationGraph.build consumption. */
    List<SandboxNavigationNode> findByRevisionIdOrderByDepthAscDisplayOrderAsc(Long revisionId);

    /** Direct children of a node (or, with a null parentNodeId, the revision's root nodes). */
    List<SandboxNavigationNode> findByRevisionIdAndParentNodeIdOrderByDisplayOrderAsc(Long revisionId, Long parentNodeId);

    Optional<SandboxNavigationNode> findByRevisionIdAndNodeKey(Long revisionId, String nodeKey);

    Optional<SandboxNavigationNode> findByRevisionIdAndAreaKey(Long revisionId, String areaKey);

    /**
     * Bulk-clears every sandbox node for a revision, ahead of a fresh (re)generation write.
     * Deliberately NO {@code clearAutomatically} (matches {@link
     * com.example.realestate.discover.navigation.NavigationNodeRepository#deleteByCityId}'s own
     * convention) — this method runs inside the SAME transaction as callers that already hold a
     * managed {@code CityLaunchRevision} (e.g. {@link
     * com.example.realestate.discover.citylaunch.CityLaunchGraphWriter#writeGraphTransactional}),
     * and {@code clearAutomatically} would detach that entity from the persistence context,
     * silently dropping its later {@code setLifecycleStatus}/{@code setPersistedRevisionChecksum}
     * writes with NO exception (a real #1955 SLICE 2f+2g regression this comment documents).
     */
    @Modifying
    @Query("DELETE FROM SandboxNavigationNode n WHERE n.revisionId = :revisionId")
    int deleteByRevisionId(@Param("revisionId") Long revisionId);
}
