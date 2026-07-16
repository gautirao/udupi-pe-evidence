package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link SandboxCityRegion} (V118, #1911 PR1). Insert+read only — see
 * {@link SandboxAreaRepository} for the family-wide immutability convention.
 */
@Repository
public interface SandboxCityRegionRepository extends JpaRepository<SandboxCityRegion, Long> {

    List<SandboxCityRegion> findByRevisionId(Long revisionId);

    Optional<SandboxCityRegion> findByRevisionIdAndRegionKey(Long revisionId, String regionKey);
}
