package com.example.realestate.savedsearch;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Performs the INSERT of a new {@link SavedSearch} in its own transaction so that a
 * {@code (user_id, fingerprint)} unique-index violation is (a) raised eagerly at flush rather
 * than deferred to the caller's commit, and (b) contained: the failed inner transaction rolls
 * back on its own, leaving {@link SavedSearchService#create}'s enclosing transaction usable for
 * the idempotent "return the concurrent winner" lookup. Without {@code REQUIRES_NEW}, the
 * violation would mark the caller's joined transaction rollback-only and the recovery path
 * would surface an untranslated {@code UnexpectedRollbackException} instead of the existing row.
 *
 * <p>Separate bean (not a private method) because Spring's transactional proxy does not apply
 * to self-invocation.
 */
@Component
public class SavedSearchInserter {

    private final SavedSearchRepository savedSearchRepository;

    public SavedSearchInserter(SavedSearchRepository savedSearchRepository) {
        this.savedSearchRepository = savedSearchRepository;
    }

    /**
     * Inserts and flushes. Throws {@link org.springframework.dao.DataIntegrityViolationException}
     * (translated) when the row collides with the unique index; the inner transaction is rolled
     * back before the exception reaches the caller.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public SavedSearch insert(SavedSearch savedSearch) {
        return savedSearchRepository.saveAndFlush(savedSearch);
    }
}
