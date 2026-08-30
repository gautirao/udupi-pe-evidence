package com.example.realestate.listing.duplicate;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Business logic for the admin duplicate-candidate review workflow.
 *
 * <p>Status transitions:
 * <ul>
 *   <li>{@link #confirm} moves PENDING → CONFIRMED and archives the newer listing.</li>
 *   <li>{@link #dismiss} moves PENDING → DISMISSED.</li>
 *   <li>{@link #undo} reverts CONFIRMED or DISMISSED back to PENDING; restores the
 *       archived listing when undoing a CONFIRMED decision.</li>
 * </ul>
 */
@Service
public class DuplicateCandidateService {

    private static final Logger log = LoggerFactory.getLogger(DuplicateCandidateService.class);
    private static final int MAX_PAGE_SIZE = 100;

    private final DuplicateCandidateRepository candidateRepository;
    private final ListingRepository listingRepository;

    public DuplicateCandidateService(DuplicateCandidateRepository candidateRepository,
                                     ListingRepository listingRepository) {
        this.candidateRepository = candidateRepository;
        this.listingRepository = listingRepository;
    }

    // ===== Query =====

    /**
     * Returns all duplicate candidates (all statuses) ordered by status ASC then
     * similarity score DESC. PENDING items appear last alphabetically (after CONFIRMED
     * and DISMISSED) but within each status group are ranked by confidence.
     * {@code size} is silently clamped to {@value #MAX_PAGE_SIZE} if exceeded.
     */
    @Transactional(readOnly = true)
    public Page<DuplicateCandidate> getPage(int page, int size) {
        int clampedSize = Math.min(size, MAX_PAGE_SIZE);
        PageRequest pageable = PageRequest.of(page, clampedSize);
        return candidateRepository.findAllByOrderByStatusAscSimilarityScoreDesc(pageable);
    }

    // ===== Mutations =====

    /**
     * Confirms a duplicate candidate: archives the newer of the two listings and
     * marks the candidate as CONFIRMED.
     *
     * <p>The newer listing is determined by {@code createdAt}. When both timestamps are
     * equal or either is null, listingA is treated as newer (consistent with
     * ProximityDuplicateService tie-break semantics).
     *
     * @throws DuplicateCandidateNotFoundException if no candidate exists with the given id
     * @throws IllegalStateException               if the candidate is not in PENDING status
     */
    @Transactional
    public void confirm(UUID candidateId, UUID adminId) {
        DuplicateCandidate candidate = loadOrThrow(candidateId);
        requirePending(candidate);

        Listing listingA = listingRepository.findById(candidate.getListingIdA())
                .orElseThrow(() -> new IllegalStateException(
                        "Listing not found: " + candidate.getListingIdA()));
        Listing listingB = listingRepository.findById(candidate.getListingIdB())
                .orElseThrow(() -> new IllegalStateException(
                        "Listing not found: " + candidate.getListingIdB()));

        Listing newer = determineNewer(listingA, listingB);
        archiveListing(newer);
        listingRepository.save(newer);

        candidate.setStatus(DuplicateCandidateStatus.CONFIRMED);
        candidate.setReviewedBy(adminId);
        candidate.setReviewedAt(Instant.now());
        candidateRepository.save(candidate);

        log.info("Duplicate confirmed: candidateId={} newer listingId={} archived by adminId={}",
                candidateId, newer.getId(), adminId);
    }

    /**
     * Dismisses a duplicate candidate: the pair is not a duplicate.
     *
     * @throws DuplicateCandidateNotFoundException if no candidate exists with the given id
     * @throws IllegalStateException               if the candidate is not in PENDING status
     */
    @Transactional
    public void dismiss(UUID candidateId, UUID adminId) {
        DuplicateCandidate candidate = loadOrThrow(candidateId);
        requirePending(candidate);

        candidate.setStatus(DuplicateCandidateStatus.DISMISSED);
        candidate.setReviewedBy(adminId);
        candidate.setReviewedAt(Instant.now());
        candidateRepository.save(candidate);

        log.info("Duplicate dismissed: candidateId={} by adminId={}", candidateId, adminId);
    }

    /**
     * Reverts a previously reviewed candidate back to PENDING.
     * When undoing a CONFIRMED decision, the archived listing is restored to LIVE.
     *
     * @throws DuplicateCandidateNotFoundException if no candidate exists with the given id
     * @throws IllegalStateException               if the candidate is already PENDING
     */
    @Transactional
    public void undo(UUID candidateId, UUID adminId) {
        DuplicateCandidate candidate = loadOrThrow(candidateId);

        if (candidate.getStatus() == DuplicateCandidateStatus.PENDING) {
            throw new IllegalStateException("Candidate is already PENDING");
        }

        if (candidate.getStatus() == DuplicateCandidateStatus.CONFIRMED) {
            restoreArchivedListing(candidate);
        }

        candidate.setStatus(DuplicateCandidateStatus.PENDING);
        candidate.setReviewedBy(null);
        candidate.setReviewedAt(null);
        candidateRepository.save(candidate);

        log.info("Duplicate review undone: candidateId={} by adminId={}", candidateId, adminId);
    }

    // ===== Helpers =====

    private DuplicateCandidate loadOrThrow(UUID candidateId) {
        return candidateRepository.findById(candidateId)
                .orElseThrow(() -> new DuplicateCandidateNotFoundException(candidateId));
    }

    private static void requirePending(DuplicateCandidate candidate) {
        if (candidate.getStatus() != DuplicateCandidateStatus.PENDING) {
            throw new IllegalStateException("Candidate is not PENDING");
        }
    }

    /**
     * Determines the newer of two listings by {@code createdAt}.
     * When timestamps are equal or either is null, listingA is treated as newer
     * (tie-break consistent with ProximityDuplicateService).
     */
    private static Listing determineNewer(Listing listingA, Listing listingB) {
        OffsetDateTime createdA = listingA.getCreatedAt();
        OffsetDateTime createdB = listingB.getCreatedAt();
        if (createdA == null || createdB == null) {
            return listingA;
        }
        // If B was created strictly after A, B is newer.
        return createdB.isAfter(createdA) ? listingB : listingA;
    }

    private static void archiveListing(Listing listing) {
        listing.setDuplicate(true);
        listing.setArchivedAt(Instant.now());
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setUpdatedAt(OffsetDateTime.now());
    }

    private void restoreArchivedListing(DuplicateCandidate candidate) {
        Listing listingA = listingRepository.findById(candidate.getListingIdA()).orElse(null);
        Listing listingB = listingRepository.findById(candidate.getListingIdB()).orElse(null);

        // BLOCKING #1: require both isDuplicate=true AND archivedAt != null to identify the
        // archived listing. The hash-dedup path in ListingService sets isDuplicate=true but does
        // NOT set archivedAt, so using isDuplicate alone could restore the wrong listing.
        Listing toRestore = null;
        if (listingA != null && listingA.isDuplicate() && listingA.getArchivedAt() != null) {
            toRestore = listingA;
        } else if (listingB != null && listingB.isDuplicate() && listingB.getArchivedAt() != null) {
            toRestore = listingB;
        }

        if (toRestore == null) {
            log.warn("Undo confirm: no listing with isDuplicate=true and archivedAt set found " +
                    "for candidateId={}; skipping listing restore", candidate.getId());
            return;
        }

        // BLOCKING #2: Only restore listings that are still ARCHIVED — if status changed since
        // confirmation, skip to avoid silent state corruption.
        if (!ListingStatus.ARCHIVED.toDbValue().equals(toRestore.getStatus())) {
            log.warn("Undo confirm: listing {} has isDuplicate=true and archivedAt set but " +
                    "status is '{}' (not ARCHIVED); skipping restoration to avoid silent state " +
                    "corruption for candidateId={}", toRestore.getId(), toRestore.getStatus(),
                    candidate.getId());
            return;
        }

        toRestore.setDuplicate(false);
        toRestore.setSuspectedDuplicate(false);
        toRestore.setArchivedAt(null);
        toRestore.setStatus(ListingStatus.LIVE.toDbValue());
        toRestore.setUpdatedAt(OffsetDateTime.now());
        listingRepository.save(toRestore);
    }

    // ===== Exception =====

    /**
     * Thrown when a duplicate candidate with the requested id does not exist. Maps to HTTP 404.
     */
    public static class DuplicateCandidateNotFoundException extends RuntimeException {
        public DuplicateCandidateNotFoundException(UUID id) {
            super("Duplicate candidate not found: " + id);
        }
    }
}
