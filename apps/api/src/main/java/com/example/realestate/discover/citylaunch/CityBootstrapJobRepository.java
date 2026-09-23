package com.example.realestate.discover.citylaunch;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Spring Data repository for {@link CityBootstrapJob} (V145, #2676 Slice A).
 *
 * <p>Post-admission RESOLVING -&gt; (DISAMBIGUATION_REQUIRED|CITY_CREATED|FAILED) transitions
 * are written by exactly one async worker per job (kicked off once, from an {@code
 * afterCommit} callback — see {@link CityBootstrapService}), so plain save()/dirty-checking is
 * safe there; there is no concurrent writer to race. The one write that IS reachable from a
 * second concurrent admin request — confirming disambiguation — uses the guarded {@link
 * #transitionDisambiguationRequiredToCityCreated} CAS below so a double-submitted confirm
 * can't create two cities.
 */
@Repository
public interface CityBootstrapJobRepository extends JpaRepository<CityBootstrapJob, Long> {

    List<CityBootstrapJob> findByNormalizedNameAndStatusIn(String normalizedName, List<BootstrapJobStatus> statuses);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query(value = "UPDATE public.city_bootstrap_job SET status = 'CITY_CREATED', "
            + "resolved_city_id = :resolvedCityId, candidates = NULL, updated_at = :now "
            + "WHERE id = :id AND status = 'DISAMBIGUATION_REQUIRED'", nativeQuery = true)
    int transitionDisambiguationRequiredToCityCreated(
            @Param("id") Long id, @Param("resolvedCityId") Integer resolvedCityId, @Param("now") Instant now);
}
