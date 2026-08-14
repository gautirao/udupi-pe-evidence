package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data repository for {@link AgriDestinationClassification} (V125, #2151 PR A). Written
 * ONLY by {@link CityLaunchPromotionService} via REPLACE discipline (delete-by-city-id then
 * insert) — see {@link #deleteByCityId} javadoc for why compare-before-write (the discipline the
 * OTHER six geography tables use) is wrong for this table.
 */
@Repository
public interface AgriDestinationClassificationRepository extends JpaRepository<AgriDestinationClassification, Long> {

    List<AgriDestinationClassification> findByCityId(Integer cityId);

    /**
     * Clears every production classification row for a city ahead of a fresh promotion write —
     * mirrors {@code NavigationNodeRepository#deleteByCityId}. A re-launch of the SAME city may
     * legitimately produce a different classification set (an area was renamed, merged, made
     * INACTIVE, or the city's origin moved), so there is no stable natural key to
     * compare-before-write against the way the other six geography tables do; REPLACE discipline
     * is the only way to guarantee no stale row survives regeneration (closing the F2 defect this
     * PR must not reproduce — see {@code RegionalClassificationBackfillService}'s no-delete upsert).
     */
    @Modifying
    @Query("DELETE FROM AgriDestinationClassification a WHERE a.cityId = :cityId")
    int deleteByCityId(@Param("cityId") Integer cityId);
}
