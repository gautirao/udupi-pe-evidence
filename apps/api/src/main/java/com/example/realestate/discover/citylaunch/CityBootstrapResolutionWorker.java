package com.example.realestate.discover.citylaunch;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Off-request-thread half of {@link CityBootstrapService}: performs the actual name
 * resolution (which may make an outbound geocoding call — see {@link
 * NominatimGeocodingProvider}) and writes the {@link CityBootstrapJob} transition (#2676
 * Slice A).
 *
 * <p>Kept as a separate bean (never called via {@code this.} from {@link
 * CityBootstrapService}) so {@code @Async} actually applies — the same self-invocation
 * concern {@link CityLaunchPreparationService} avoids by delegating to its own {@code
 * graphWriter} bean rather than an internal method.
 */
@Component
public class CityBootstrapResolutionWorker {

    private static final Logger log = LoggerFactory.getLogger(CityBootstrapResolutionWorker.class);

    private static final String INSERT_CITY_SQL = """
            INSERT INTO public.cities
                (slug, name, geo_center_lat, geo_center_lon, min_lat, min_lon, max_lat, max_lon, default_zoom, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 12, true)
            ON CONFLICT (slug) DO NOTHING
            """;

    private static final String FIND_CITY_ID_BY_SLUG_SQL = "SELECT id FROM public.cities WHERE slug = ?";

    private final CityBootstrapJobRepository jobRepository;
    private final CityNameResolutionService resolutionService;
    private final JdbcOperations jdbcOperations;
    private final ObjectMapper objectMapper;

    public CityBootstrapResolutionWorker(
            CityBootstrapJobRepository jobRepository,
            CityNameResolutionService resolutionService,
            JdbcOperations jdbcOperations,
            ObjectMapper objectMapper) {
        this.jobRepository = jobRepository;
        this.resolutionService = resolutionService;
        this.jdbcOperations = jdbcOperations;
        this.objectMapper = objectMapper;
    }

    @Async
    public void resolveAsync(Long jobId) {
        try {
            resolve(jobId);
        } catch (RuntimeException e) {
            log.error("City bootstrap resolution failed unexpectedly for jobId={}", jobId, e);
            markFailed(jobId, "INTERNAL_ERROR", "Resolution failed unexpectedly — retry with a fresh submission.");
        }
    }

    @Transactional
    void resolve(Long jobId) {
        CityBootstrapJob job = jobRepository.findById(jobId).orElse(null);
        if (job == null) {
            log.error("City bootstrap job id={} vanished before resolution ran", jobId);
            return;
        }

        CityResolutionResult result = resolutionService.resolve(job.getRequestedName());
        switch (result.kind()) {
            case EXISTING_CITY -> {
                job.markCityCreated(result.existingCityId());
                jobRepository.save(job);
            }
            case SINGLE_CANDIDATE -> {
                int cityId = createOrGetCityIdempotently(job.getNormalizedName(), job.getRequestedName(), result.singleCandidate());
                job.markCityCreated(cityId);
                jobRepository.save(job);
            }
            case DISAMBIGUATION_REQUIRED -> {
                job.markDisambiguationRequired(writeJson(result.candidates()));
                jobRepository.save(job);
            }
            case NOT_FOUND -> {
                job.markFailed("NOT_FOUND",
                        "No matching place found for \"" + job.getRequestedName() + "\". "
                                + "Check spelling or try a more specific name (e.g. include the state).");
                jobRepository.save(job);
            }
            case PROVIDER_FAILURE -> {
                job.markFailed("PROVIDER_FAILURE", result.failureMessage());
                jobRepository.save(job);
            }
        }
    }

    /**
     * Idempotently creates the {@code cities} row for a confirmed candidate. Called both from
     * the unambiguous single-candidate path above and from {@link
     * CityBootstrapService#confirmDisambiguation} — both paths funnel through the SAME {@code
     * INSERT ... ON CONFLICT (slug) DO NOTHING} + re-select, so two callers racing on the same
     * slug can never create two rows, and a caller that loses the race still gets the winner's
     * id back (#2676 AC "no duplicate canonical cities").
     */
    int createOrGetCityIdempotently(String slug, String name, GeocodeCandidate candidate) {
        try {
            jdbcOperations.update(INSERT_CITY_SQL, slug, name,
                    candidate.lat(), candidate.lon(),
                    candidate.minLat(), candidate.minLon(), candidate.maxLat(), candidate.maxLon());
        } catch (DataIntegrityViolationException e) {
            // Benign race: another concurrent resolution/confirm for the same slug won first.
            log.info("cities insert for slug={} lost an idempotent-creation race (expected under concurrency)", slug);
        }
        List<Integer> ids = jdbcOperations.query(
                FIND_CITY_ID_BY_SLUG_SQL, (rs, rowNum) -> rs.getInt("id"), slug);
        return ids.stream().findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "cities row for slug=" + slug + " missing immediately after idempotent insert"));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void markFailed(Long jobId, String code, String reason) {
        jobRepository.findById(jobId).ifPresent(job -> {
            job.markFailed(code, reason);
            jobRepository.save(job);
        });
    }

    List<GeocodeCandidate> readJson(String candidatesJson) {
        if (candidatesJson == null) {
            return List.of();
        }
        try {
            return objectMapper.readValue(candidatesJson, objectMapper.getTypeFactory()
                    .constructCollectionType(List.class, GeocodeCandidate.class));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Corrupt candidates JSON on city_bootstrap_job", e);
        }
    }

    private String writeJson(List<GeocodeCandidate> candidates) {
        try {
            return objectMapper.writeValueAsString(candidates);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize geocode candidates", e);
        }
    }
}
