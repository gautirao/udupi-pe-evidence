package com.example.realestate.discover.navigation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link NavigationNode} (V121, #1955 Areas PR A).
 */
@Repository
public interface NavigationNodeRepository extends JpaRepository<NavigationNode, Long> {

    /** Set-based full-tree load for a city, ordered for cheap in-memory tree assembly (no N+1) —
     * consumed by {@link NavigationGraphLoader} for a single-city (re)load. */
    List<NavigationNode> findByCityIdOrderByDepthAscDisplayOrderAsc(Integer cityId);

    /**
     * Set-based full-tree load across MULTIPLE cities in one query — the shape {@code
     * NavigationCachePreloadRunner} uses for eager startup preload, so loading every public-active
     * city's tree costs exactly one query total, never one query per city (#1955 Areas PR A,
     * SLICE 2d). Ordered so that, once split by {@code city_id} in memory, each city's sublist is
     * already depth-ascending (ties broken by display_order) — the same shape {@link
     * NavigationGraph#build} requires.
     */
    List<NavigationNode> findByCityIdInOrderByCityIdAscDepthAscDisplayOrderAsc(List<Integer> cityIds);

    /** Direct children of a node (or, with a null parentNodeId, the city's root nodes). */
    List<NavigationNode> findByCityIdAndParentNodeIdOrderByDisplayOrderAsc(Integer cityId, Long parentNodeId);

    Optional<NavigationNode> findByCityIdAndNodeKey(Integer cityId, String nodeKey);

    Optional<NavigationNode> findByCityIdAndAreaKey(Integer cityId, String areaKey);

    /**
     * Bulk-clears every production node for a city (#1955 Areas PR A promotion, SLICE 2c) — the
     * REPLACE-discipline {@link com.example.realestate.discover.citylaunch.CityLaunchPromotionService}
     * uses ahead of inserting a freshly-promoted revision's tree, since a re-launched city's CLUSTER
     * shape (unlike area_key/region_key/slug natural keys elsewhere in promotion) is not guaranteed
     * stable across revisions — this also keeps the partial unique index
     * {@code uq_navigation_nodes_city_area (city_id, area_key WHERE node_type='AREA')} from ever
     * seeing a stale prior-revision leaf collide with the new revision's leaf for the same area.
     * A single bulk DELETE (not a per-row FOR-UPDATE loop) is safe here even with the self-FK,
     * since the whole city's row set — parents and children alike — is removed atomically in ONE
     * statement.
     */
    @Modifying
    @Query("DELETE FROM NavigationNode n WHERE n.cityId = :cityId")
    int deleteByCityId(@Param("cityId") Integer cityId);
}
