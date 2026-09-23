package com.example.realestate.discover.citylaunch;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;

import org.springframework.transaction.annotation.Transactional;

/**
 * Admin-facing orchestration owner for the "type a city name, Start launch" bootstrap
 * workflow (#2676 Slice A).
 *
 * <p>This is deliberately the ONLY new "job" concept Slice A introduces. Once a job reaches
 * {@link BootstrapJobStatus#CITY_CREATED}, the resulting {@code cityId} is handed to the
 * EXISTING, unmodified {@link CityLaunchPreparationService#prepare(int, UUID)} pipeline for
 * Slices B/C onward — this service does not know or care what happens after that hand-off,
 * keeping City Launch as the single orchestration owner without this class duplicating its
 * job/progress model.
 */
@Service
public class CityBootstrapService {

    private static final Logger log = LoggerFactory.getLogger(CityBootstrapService.class);

    private final CityBootstrapJobRepository jobRepository;
    private final CityBootstrapResolutionWorker resolutionWorker;

    public CityBootstrapService(CityBootstrapJobRepository jobRepository, CityBootstrapResolutionWorker resolutionWorker) {
        this.jobRepository = jobRepository;
        this.resolutionWorker = resolutionWorker;
    }

    @Transactional
    public CityBootstrapJobDto startBootstrap(String rawName, UUID callerId) {
        if (rawName == null || rawName.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "City name is required");
        }
        String trimmed = rawName.trim();
        String slug = CityNameResolutionService.normalizeToSlug(trimmed);
        if (slug.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "City name must contain letters or digits");
        }

        CityBootstrapJob job = new CityBootstrapJob(trimmed, slug, callerId);
        CityBootstrapJob saved;
        try {
            // saveAndFlush forces uq_city_bootstrap_job_inflight to be evaluated now, inside
            // this method — mirrors CityLaunchPreparationService#insertPreparingRevision.
            saved = jobRepository.saveAndFlush(job);
        } catch (DataIntegrityViolationException e) {
            throw new CityBootstrapConflictException(
                    "A bootstrap job is already in progress for \"" + trimmed + "\"");
        }

        registerResolveAfterCommit(saved.getId());
        return CityBootstrapJobDto.from(saved, null);
    }

    @Transactional(readOnly = true)
    public CityBootstrapJobDto getJob(long jobId) {
        CityBootstrapJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bootstrap job not found"));
        List<GeocodeCandidate> candidates = resolutionWorker.readJson(job.getCandidates());
        return CityBootstrapJobDto.from(job, candidates);
    }

    @Transactional
    public CityBootstrapJobDto confirmDisambiguation(long jobId, int candidateIndex, UUID callerId) {
        CityBootstrapJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bootstrap job not found"));

        if (job.getStatus() == BootstrapJobStatus.CITY_CREATED) {
            // Idempotent replay (e.g. a double-submitted confirm click): same terminal outcome,
            // not an error.
            return CityBootstrapJobDto.from(job, null);
        }
        if (job.getStatus() != BootstrapJobStatus.DISAMBIGUATION_REQUIRED) {
            throw new CityBootstrapConflictException(
                    "Bootstrap job " + jobId + " is not awaiting disambiguation (status=" + job.getStatus() + ")");
        }

        List<GeocodeCandidate> candidates = resolutionWorker.readJson(job.getCandidates());
        if (candidateIndex < 0 || candidateIndex >= candidates.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "candidateIndex " + candidateIndex + " is out of range for " + candidates.size() + " candidates");
        }
        GeocodeCandidate chosen = candidates.get(candidateIndex);

        int cityId = resolutionWorker.createOrGetCityIdempotently(job.getNormalizedName(), job.getRequestedName(), chosen);

        int updated = jobRepository.transitionDisambiguationRequiredToCityCreated(jobId, cityId, Instant.now());
        if (updated == 0) {
            // Lost a race to a concurrent confirm on the same job; re-read rather than error,
            // since the city itself was created idempotently above either way.
            CityBootstrapJob current = jobRepository.findById(jobId).orElseThrow();
            return CityBootstrapJobDto.from(current, null);
        }
        return getJob(jobId);
    }

    private void registerResolveAfterCommit(Long jobId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        resolutionWorker.resolveAsync(jobId);
                    } catch (RejectedExecutionException e) {
                        log.error("City bootstrap resolution executor saturated; marking job FAILED jobId={}", jobId, e);
                        resolutionWorker.markFailed(jobId, "EXECUTOR_SATURATED",
                                "City bootstrap resolution could not be scheduled — retry.");
                    }
                }
            });
        } else {
            resolutionWorker.resolveAsync(jobId);
        }
    }
}
