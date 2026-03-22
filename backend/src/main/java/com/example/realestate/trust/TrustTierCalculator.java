package com.example.realestate.trust;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Calculates the trust tier for a listing based on its earned verification
 * dimensions and any open complaints.
 *
 * <p>Tier rules (evaluated in order — first match wins):
 * <ul>
 *   <li><b>Tier A</b>: IDENTITY + AUTHORITY + PHOTOS all EARNED, no OPEN complaints</li>
 *   <li><b>Tier B</b>: IDENTITY + (AUTHORITY OR PHOTOS) EARNED, no OPEN complaints</li>
 *   <li><b>Tier C</b>: Any single EARNED dimension, no OPEN complaints</li>
 *   <li><b>Tier D</b>: Default — no higher tier applies (no EARNED dimensions,
 *       or any OPEN complaint present)</li>
 * </ul>
 *
 * <p>EARNED means {@code badge_state = "EARNED"} only.
 * EXPIRED and SUSPENDED are not considered EARNED.
 *
 * <p>This service is read-only — it never writes to the database.
 */
@Service
public class TrustTierCalculator {

    private static final Logger log = LoggerFactory.getLogger(TrustTierCalculator.class);

    private final ListingVerificationDimensionRepository dimensionRepository;
    private final ListingComplaintRepository complaintRepository;

    public TrustTierCalculator(
            ListingVerificationDimensionRepository dimensionRepository,
            ListingComplaintRepository complaintRepository) {
        this.dimensionRepository = dimensionRepository;
        this.complaintRepository = complaintRepository;
    }

    /**
     * Calculates and returns the trust tier for the given listing.
     *
     * <p>Never returns {@code null} — always at minimum "D".
     *
     * <p>Complaint demotion: only complaints in status {@code OPEN} demote a listing
     * to Tier D. A complaint in {@code UNDER_REVIEW} is actively being investigated
     * but has not been confirmed — per product spec (RE-148 AC2), the demotion
     * trigger is specifically {@code "OPEN"} status. If the product decision changes,
     * update the {@code hasOpenComplaint} predicate below and add a corresponding
     * test case in {@code TrustTierCalculatorTest}.
     *
     * @param listingId the listing to evaluate; must not be {@code null}
     * @return a {@link TrustTierResult} with tier "A", "B", "C", or "D"
     */
    @Transactional(readOnly = true)
    public TrustTierResult calculate(UUID listingId) {
        List<ListingVerificationDimension> dimensions =
                dimensionRepository.findAllByListingId(listingId);
        List<ListingComplaint> complaints =
                complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId);

        Set<String> earnedDimensions = dimensions.stream()
                .filter(d -> "EARNED".equals(d.getBadgeState()))
                .map(ListingVerificationDimension::getDimensionType)
                .collect(Collectors.toSet());

        boolean hasOpenComplaint = complaints.stream()
                .anyMatch(c -> "OPEN".equals(c.getStatus()));

        if (hasOpenComplaint) {
            log.debug("Listing {} has an OPEN complaint — assigning Tier D", listingId);
            return new TrustTierResult(listingId, "D");
        }

        // Tier A: IDENTITY + AUTHORITY + PHOTOS all EARNED
        if (earnedDimensions.containsAll(Set.of("IDENTITY", "AUTHORITY", "PHOTOS"))) {
            log.debug("Listing {} qualifies for Tier A", listingId);
            return new TrustTierResult(listingId, "A");
        }

        // Tier B: IDENTITY + (AUTHORITY OR PHOTOS)
        if (earnedDimensions.contains("IDENTITY")
                && (earnedDimensions.contains("AUTHORITY") || earnedDimensions.contains("PHOTOS"))) {
            log.debug("Listing {} qualifies for Tier B", listingId);
            return new TrustTierResult(listingId, "B");
        }

        // Tier C: any single EARNED dimension
        if (!earnedDimensions.isEmpty()) {
            log.debug("Listing {} qualifies for Tier C", listingId);
            return new TrustTierResult(listingId, "C");
        }

        // Tier D: default
        log.debug("Listing {} assigned default Tier D", listingId);
        return new TrustTierResult(listingId, "D");
    }
}
