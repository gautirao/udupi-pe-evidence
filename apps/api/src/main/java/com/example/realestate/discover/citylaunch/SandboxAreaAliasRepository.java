package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Spring Data repository for {@link SandboxAreaAlias} (V118, #1911 PR1). Insert+read only — see
 * {@link SandboxAreaRepository} for the family-wide immutability convention.
 */
@Repository
public interface SandboxAreaAliasRepository extends JpaRepository<SandboxAreaAlias, Long> {

    List<SandboxAreaAlias> findByRevisionId(Long revisionId);

    List<SandboxAreaAlias> findBySandboxAreaId(Long sandboxAreaId);
}
