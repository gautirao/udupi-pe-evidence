package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * ApplicationRunner that triggers an area-onboarding dry-run on startup (#1887 PR1). Mirrors
 * {@link CityRegionOnboardingRunner}'s shape exactly.
 *
 * <p>Gated by {@code app.area-onboarding.enabled=true} (default: false) — the bean is not created
 * at all when the property is absent or false. There is NO HTTP endpoint anywhere in PR1 and NO
 * live OSM/Nominatim/geo-provider call: the candidate batch is read from a static,
 * operator-provided classpath JSON resource (configured via
 * {@code app.area-onboarding.candidates-resource}), never fetched over the network.
 *
 * <p>Only {@code dryRun} is ever invoked — there is no {@code apply} mode in PR1 (design decision
 * D6: no canonical write path exists yet). Errors are logged, never rethrown.
 *
 * <h2>DESIGN NOTE — classpath-JSON input is a TEMPORARY PR1 bootstrapping adapter (#1887 rework,
 * documentation-only fix item)</h2>
 * <ul>
 *   <li>This classpath-resource mechanism exists ONLY to exercise {@link AreaOnboardingService}
 *       end-to-end in PR1. It is NOT the intended production transport.</li>
 *   <li>Production #1887 input will be the approved, versioned artifact produced by issue #1900
 *       (the upstream provider-dataset curation pipeline).</li>
 *   <li>Licensed or sensitive provider extracts must NEVER be committed to this application
 *       repository, classpath or otherwise.</li>
 *   <li>A future apply step (PR2) reads the PERSISTED validated {@code area_onboarding_batch}/
 *       {@code area_onboarding_candidate} rows (including {@code candidate_payload} and the batch
 *       identity columns) — it does NOT reread this classpath file, which may have since
 *       changed or been removed.</li>
 * </ul>
 */
@Component
@ConditionalOnProperty(
        prefix = "app.area-onboarding",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false
)
public class AreaOnboardingRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AreaOnboardingRunner.class);

    private final AreaOnboardingService onboardingService;
    private final JdbcOperations jdbcOperations;
    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;
    private final String citySlug;
    private final String sourceLabel;
    private final String candidatesResource;

    public AreaOnboardingRunner(
            AreaOnboardingService onboardingService,
            JdbcOperations jdbcOperations,
            ObjectMapper objectMapper,
            @Value("${app.area-onboarding.city-slug:}") String citySlug,
            @Value("${app.area-onboarding.source-label:manual}") String sourceLabel,
            @Value("${app.area-onboarding.candidates-resource:}") String candidatesResource) {
        this.onboardingService = onboardingService;
        this.jdbcOperations = jdbcOperations;
        this.objectMapper = objectMapper;
        this.resourceLoader = new DefaultResourceLoader();
        this.citySlug = citySlug;
        this.sourceLabel = sourceLabel;
        this.candidatesResource = candidatesResource;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("AreaOnboardingRunner: app.area-onboarding.enabled=true citySlug={} candidatesResource={} — "
                + "starting dry-run", citySlug, candidatesResource);
        try {
            if (citySlug == null || citySlug.isBlank()) {
                log.error("AreaOnboardingRunner: app.area-onboarding.city-slug is required — skipping");
                return;
            }
            if (candidatesResource == null || candidatesResource.isBlank()) {
                log.error("AreaOnboardingRunner: app.area-onboarding.candidates-resource is required — skipping");
                return;
            }

            Integer cityId = jdbcOperations.query(
                    "SELECT id FROM cities WHERE slug = ?",
                    rs -> rs.next() ? rs.getInt("id") : null,
                    citySlug);
            if (cityId == null) {
                log.error("AreaOnboardingRunner: no city found for slug={} — skipping", citySlug);
                return;
            }

            CandidateBatchFile batchFile = loadCandidateBatchFile(candidatesResource);
            AreaOnboardingService.BatchIdentity batchIdentity = toBatchIdentity(batchFile);
            AreaOnboardingReport report =
                    onboardingService.dryRun(cityId, sourceLabel, batchIdentity, batchFile.candidates());

            log.info("AreaOnboardingRunner: dry-run batchId={} cityId={} slug={} provider={} candidates={} "
                            + "applyAllowed={} counts={}",
                    report.batchId(), cityId, citySlug, batchIdentity.provider(), batchFile.candidates().size(),
                    report.applyAllowed(), report.outcomeCounts());
            if (!report.applyAllowed()) {
                report.blockingReasons().forEach(reason ->
                        log.warn("AreaOnboardingRunner: blocking reason — {}", reason));
            }
        } catch (Exception e) {
            // Log and allow application to continue — onboarding failure is not fatal.
            log.error("AreaOnboardingRunner: dry-run failed for slug={} candidatesResource={} — application continues",
                    citySlug, candidatesResource, e);
        }
    }

    private CandidateBatchFile loadCandidateBatchFile(String location) throws IOException {
        Resource resource = resourceLoader.getResource(location);
        try (InputStream in = resource.getInputStream()) {
            return objectMapper.readValue(in, CandidateBatchFile.class);
        }
    }

    private static AreaOnboardingService.BatchIdentity toBatchIdentity(CandidateBatchFile batchFile) {
        OffsetDateTime sourceExtractedAt = null;
        if (batchFile.sourceExtractedAt() != null && !batchFile.sourceExtractedAt().isBlank()) {
            sourceExtractedAt = OffsetDateTime.parse(batchFile.sourceExtractedAt());
        }
        return new AreaOnboardingService.BatchIdentity(
                batchFile.datasetId(), batchFile.datasetVersion(), batchFile.artifactChecksum(),
                batchFile.provider(), batchFile.inputSchemaVersion(), sourceExtractedAt);
    }

    /**
     * Shape of the TEMPORARY PR1 classpath-JSON bootstrapping adapter — see the class-level
     * DESIGN NOTE. Carries a batch-level dataset/provider identity header alongside the candidate
     * list so {@link AreaOnboardingService.BatchIdentity} can be populated without a separate
     * config surface. NOT the production #1900 artifact shape.
     *
     * @param sourceExtractedAt ISO-8601 offset date-time string (e.g. {@code "2026-01-15T00:00:00Z"}),
     *                          or {@code null}/blank if unknown
     */
    record CandidateBatchFile(
            String datasetId,
            String datasetVersion,
            String artifactChecksum,
            String provider,
            String inputSchemaVersion,
            String sourceExtractedAt,
            List<AreaOnboardingService.CandidateInput> candidates
    ) {}
}
