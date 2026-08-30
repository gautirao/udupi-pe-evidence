package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data repository for {@link SandboxArea} (V118, #1911 PR1).
 *
 * <p>Insert+read only by convention: callers must persist a {@code SandboxArea} exactly once via
 * {@link #save(Object)} on a transient (never-yet-persisted) instance, and never re-save an
 * already-persisted row. There is no update/patch method on this interface, and
 * {@link SandboxArea} exposes no setters — only the constructor populates its fields.
 */
@Repository
public interface SandboxAreaRepository extends JpaRepository<SandboxArea, Long> {

    List<SandboxArea> findByRevisionId(Long revisionId);

    Optional<SandboxArea> findByRevisionIdAndAreaKey(Long revisionId, String areaKey);
}
