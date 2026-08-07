package com.example.realestate.discover.citylaunch;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;

/**
 * Admits a new city launch preparation run (#1911 PR2).
 *
 * <p>ADMISSION is fully synchronous, inside this method's own {@code @Transactional} boundary:
 * load the city, compute the next {@code revision_number}, and {@code saveAndFlush} a new
 * {@link CityLaunchRevision} row so the V118 {@code uq_clr_inflight} unique index is evaluated
 * NOW rather than lazily at outer-transaction commit — a duplicate in-flight attempt therefore
 * fails inside {@link #prepare} itself, not silently later.
 *
 * <p>The background graph write ({@link CityLaunchGraphWriter#writeGraphAsync}) is kicked from a
 * {@code TransactionSynchronization#afterCommit} callback, not directly — this guarantees the
 * async worker's own transaction only ever starts AFTER the admission row is actually durable,
 * eliminating a cross-thread visibility race where the background thread could look up a revision
 * id the admission transaction had not yet committed.
 */
@Service
public class CityLaunchPreparationService {

    private static final Logger log = LoggerFactory.getLogger(CityLaunchPreparationService.class);

    private final CityLaunchRevisionRepository revisionRepository;
    private final CanonicalGeographyReader geographyReader;
    private final CityLaunchGraphWriter graphWriter;
    private final CityLaunchSseService sseService;

    public CityLaunchPreparationService(
            CityLaunchRevisionRepository revisionRepository,
            CanonicalGeographyReader geographyReader,
            CityLaunchGraphWriter graphWriter,
            CityLaunchSseService sseService) {
        this.revisionRepository = revisionRepository;
        this.geographyReader = geographyReader;
        this.graphWriter = graphWriter;
        this.sseService = sseService;
    }

    /**
     * KNOWN LIMITATION (AC11): if the process crashes AFTER admission commits but BEFORE (or
     * during) the background graph write, the revision is left stuck in
     * {@code lifecycle_status = 'PREPARING'} / {@code prep_state = 'RUNNING'} forever — there is
     * no crash-recovery sweep in PR2. An operator must manually resolve it:
     * <pre>
     * UPDATE city_launch_revision
     *    SET lifecycle_status = 'FAILED', prep_state = 'FAILED',
     *        failure_reason = 'manual: stuck after crash'
     *  WHERE id = &lt;id&gt;;
     * </pre>
     * After that, a fresh {@link #prepare} call for the same city allocates the next
     * {@code revision_number} (uq_clr_inflight no longer blocks it once the stuck row is FAILED).
     * See {@code .claude/handoffs/issue-1911/PROGRAMME.md} "Known limitations" for the same note.
     *
     * @param cityId   path-supplied city id
     * @param callerId the AUTHENTICATED caller's id (from {@code CallerInfo}, never from a
     *                 request body — this endpoint does not bind or read a request body at all,
     *                 so a client cannot influence {@code created_by} even if it sends one)
     */
    @Transactional
    public PrepareResponse prepare(int cityId, UUID callerId) {
        geographyReader.findCity(cityId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "City not found"));

        int nextRevisionNumber = nextRevisionNumber(cityId);
        return insertPreparingRevision(cityId, nextRevisionNumber, callerId, null);
    }

    /**
     * Re-runs preparation for a city that already has an in-flight (PREPARED or VALIDATED)
     * revision: atomically supersedes the current revision, then inserts its replacement — all
     * within this one {@code @Transactional} method, reusing {@link #insertPreparingRevision} (the
     * exact admission + afterCommit-graph-write body {@link #prepare} uses) so the async kick is
     * never duplicated.
     *
     * <p>The supersede-first step is gated on
     * {@link CityLaunchRevisionRepository#supersedeInflight}'s rows-affected return value: if the
     * current revision is no longer in-flight (already superseded, or in some other terminal/
     * pre-flight state — including a concurrent caller having already superseded it), ZERO rows
     * are updated, this method throws immediately, and the transaction rolls back with NO new
     * revision inserted — a second concurrent {@code rerun} call on the same revision therefore
     * always loses cleanly with a 409, never a duplicate PREPARING row or a corrupted supersede
     * chain.
     *
     * @param cityId            path-supplied city id
     * @param currentRevisionId the revision being re-run
     * @param callerId          the AUTHENTICATED caller's id (from {@code CallerInfo}, never a
     *                          client-supplied value)
     */
    @Transactional
    public PrepareResponse rerunSuperseding(int cityId, long currentRevisionId, UUID callerId) {
        int supersededRows = revisionRepository.supersedeInflight(currentRevisionId, cityId);
        if (supersededRows == 0) {
            throw new CityPreparationConflictException(
                    "City launch revision is not currently in-flight and cannot be re-run");
        }

        int nextRevisionNumber = nextRevisionNumber(cityId);
        PrepareResponse response = insertPreparingRevision(cityId, nextRevisionNumber, callerId, currentRevisionId);

        int backLinkRows = revisionRepository.backLinkSuperseded(currentRevisionId, response.revisionId());
        if (backLinkRows == 0) {
            // Should be unreachable: we just set this row to SUPERSEDED ourselves, in the same
            // transaction, and nothing else can see it yet. Defensive log only — not fatal, the
            // new revision is still valid and previewable; only the backlink is missing.
            log.error("City launch rerun back-link affected 0 rows (unexpected) oldRevisionId={} newRevisionId={}",
                    currentRevisionId, response.revisionId());
        }
        return response;
    }

    private int nextRevisionNumber(int cityId) {
        return revisionRepository.findByCityId(cityId).stream()
                .map(CityLaunchRevision::getRevisionNumber)
                .max(Comparator.naturalOrder())
                .orElse(0) + 1;
    }

    /**
     * Shared admission body for both {@link #prepare} and {@link #rerunSuperseding}: inserts a new
     * PREPARING revision (forcing {@code uq_clr_inflight} to be evaluated now via
     * {@code saveAndFlush}) and registers the background graph write to kick from an
     * {@code afterCommit} callback — never directly — so the async worker's own transaction only
     * ever starts after this row is durable.
     *
     * @param backLinkFromId when re-running, the just-superseded revision's id, purely so the
     *                       conflict message can be specific; {@code null} for a fresh {@link
     *                       #prepare} admission. The actual back-link write happens in {@link
     *                       #rerunSuperseding} AFTER this method returns the new revision's id.
     */
    private PrepareResponse insertPreparingRevision(
            int cityId, int revisionNumber, UUID callerId, Long backLinkFromId) {
        CityLaunchRevision revision = new CityLaunchRevision(cityId, revisionNumber, callerId);
        revision.setPrepState(PrepState.RUNNING);

        CityLaunchRevision saved;
        try {
            // Forces the uq_clr_inflight / UNIQUE(city_id, revision_number) constraints to be
            // evaluated NOW, inside this method, rather than deferred to outer-transaction commit.
            saved = revisionRepository.saveAndFlush(revision);
        } catch (DataIntegrityViolationException e) {
            throw new CityPreparationConflictException(
                    backLinkFromId == null
                            ? "A city launch preparation is already in progress for this city"
                            : "A city launch preparation is already in progress for this city (rerun)");
        }

        Long revisionId = saved.getId();
        sseService.emitProgress(saved);
        registerGraphWriteAfterCommit(revisionId, cityId);

        return new PrepareResponse(revisionId, "preparing");
    }

    private void registerGraphWriteAfterCommit(Long revisionId, int cityId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    try {
                        graphWriter.writeGraphAsync(revisionId, cityId);
                    } catch (RejectedExecutionException e) {
                        // Executor saturated: the 202 response for this admission has already
                        // committed, so there is no transaction left to roll back. Synchronously
                        // mark the row FAILED (its own REQUIRES_NEW tx) rather than leaving a
                        // PREPARING row that no thread will ever pick up.
                        log.error("City launch graph writer executor saturated; marking revision "
                                + "FAILED revisionId={} cityId={}", revisionId, cityId, e);
                        graphWriter.markFailed(revisionId,
                                "City launch graph write could not be scheduled (executor saturated)",
                                (short) 0);
                    }
                }
            });
        } else {
            // Defensive fallback — should be unreachable since the caller is itself
            // @Transactional, but never silently drop the background write if it somehow is.
            graphWriter.writeGraphAsync(revisionId, cityId);
        }
    }
}
