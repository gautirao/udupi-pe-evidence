package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link SandboxAreaGroup} (V118, #1911 PR1). Insert+read only — see
 * {@link SandboxAreaRepository} for the family-wide immutability convention.
 */
@Repository
public interface SandboxAreaGroupRepository extends JpaRepository<SandboxAreaGroup, Long> {

    List<SandboxAreaGroup> findByRevisionId(Long revisionId);

    Optional<SandboxAreaGroup> findByRevisionIdAndSlug(Long revisionId, String slug);
}
