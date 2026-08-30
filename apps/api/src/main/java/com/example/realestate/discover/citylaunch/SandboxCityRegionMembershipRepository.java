package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link SandboxCityRegionMembership} (V118, #1911 PR1). Insert+read
 * only — see {@link SandboxAreaRepository} for the family-wide immutability convention.
 */
@Repository
public interface SandboxCityRegionMembershipRepository extends JpaRepository<SandboxCityRegionMembership, Long> {

    List<SandboxCityRegionMembership> findByRevisionId(Long revisionId);

    Optional<SandboxCityRegionMembership> findByRevisionIdAndSandboxAreaId(Long revisionId, Long sandboxAreaId);
}
