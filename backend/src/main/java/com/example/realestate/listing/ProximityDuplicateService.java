package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/**
 * Detects proximity-based duplicate listing candidates when a listing is approved.
 *
 * <p>Algorithm:
 * <ol>
 *   <li>Bounding-box query for LIVE listings within 50 m (expanded to 100 m if fewer than 2 candidates found).</li>
 *   <li>Java-side Haversine refinement to the true radius.</li>
 *   <li>Confidence classification (HIGH / MEDIUM) based on distance, price delta, and area delta.</li>
 *   <li>Idempotency check and per-listing pair cap before inserting {@link DuplicateCandidate} rows.</li>
 *   <li>For HIGH confidence pairs: mark the newer listing with {@code isSuspectedDuplicate=true}.</li>
 * </ol>
 *
 * <p>Runs in its own transaction ({@link Propagation#REQUIRES_NEW}) so that detection failures
 * do not roll back the calling {@code approveListing} transaction.
 */
@Service
public class ProximityDuplicateService {

    private static final Logger log = LoggerFactory.getLogger(ProximityDuplicateService.class);

    // --- Threshold constants (package-private for testability) ---

    static final double DEGREES_PER_METER          = 1.0 / 111_000.0;
    static final double RADIUS_PRIMARY_M            = 50.0;
    static final double RADIUS_FALLBACK_M           = 100.0;
    static final double HIGH_CONF_CLOSE_M           = 25.0;
    static final double HIGH_CONF_CLOSE_PRICE_PCT   = 0.15;
    static final double HIGH_CONF_PRICE_PCT         = 0.12;
    static final double HIGH_CONF_AREA_PCT          = 0.15;
    static final double MED_CONF_PRICE_AREA_PRESENT_PCT = 0.12;
    static final double MED_CONF_PRICE_AREA_NULL_PCT    = 0.08;
    static final int    PAIR_CAP                    = 30;

    private final ListingRepository listingRepository;
    private final DuplicateCandidateRepository duplicateCandidateRepo;

    public ProximityDuplicateService(
            ListingRepository listingRepository,
            DuplicateCandidateRepository duplicateCandidateRepo) {
        this.listingRepository = listingRepository;
        this.duplicateCandidateRepo = duplicateCandidateRepo;
    }

    /**
     * Detects and persists proximity duplicate candidates for the given listing.
     *
     * <p>Runs in a dedicated transaction ({@link Propagation#REQUIRES_NEW}). If detection
     * fails partway through, only the detection transaction rolls back — the caller's
     * {@code approveListing} transaction is unaffected.
     *
     * @param newListing the freshly approved LIVE listing to check against existing ones
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void detectAndRecord(Listing newListing) {
        if (newListing.getLatitude() == null || newListing.getLongitude() == null) {
            log.debug("Skipping proximity detection for listingId={}: no coordinates",
                    newListing.getId());
            return;
        }

        double lat = newListing.getLatitude();
        double lon = newListing.getLongitude();
        String propertyType = newListing.getPropertyType();
        UUID newId = newListing.getId();

        // 50 m bounding-box query
        double delta50 = RADIUS_PRIMARY_M * DEGREES_PER_METER;
        List<Listing> candidates = listingRepository.findLiveListingsInBoundingBox(
                lat - delta50, lat + delta50,
                lon - delta50, lon + delta50,
                propertyType, newId);

        // Java-side Haversine refinement for 50 m
        List<Listing> filtered50 = candidates.stream()
                .filter(c -> haversineMeters(lat, lon, c.getLatitude(), c.getLongitude()) <= RADIUS_PRIMARY_M)
                .toList();

        List<Listing> refined;
        if (filtered50.size() < 2) {
            log.debug("Fewer than 2 candidates in 50m for listingId={}, expanding to 100m", newId);
            double delta100 = RADIUS_FALLBACK_M * DEGREES_PER_METER;
            List<Listing> candidates100 = listingRepository.findLiveListingsInBoundingBox(
                    lat - delta100, lat + delta100,
                    lon - delta100, lon + delta100,
                    propertyType, newId);
            // Union: include any 50m candidates that may have been archived or mutated between the two queries.
            java.util.Set<UUID> seen = new java.util.HashSet<>();
            java.util.List<Listing> merged = new java.util.ArrayList<>(filtered50);
            filtered50.forEach(l -> seen.add(l.getId()));
            candidates100.stream()
                    .filter(c -> haversineMeters(lat, lon, c.getLatitude(), c.getLongitude()) <= RADIUS_FALLBACK_M)
                    .filter(c -> seen.add(c.getId()))
                    .forEach(merged::add);
            refined = java.util.Collections.unmodifiableList(merged);
        } else {
            refined = filtered50;
        }

        for (Listing candidate : refined) {
            processCandidatePair(newListing, candidate);
        }
    }

    // --- Private helpers ---

    private void processCandidatePair(Listing newListing, Listing candidate) {
        UUID newId = newListing.getId();

        // Guard: self-pair (should not happen due to query exclusion, but be safe)
        if (candidate.getId().equals(newId)) {
            return;
        }

        // Guard: price must be present and positive on both listings
        Long newPrice = newListing.getPricePaise();
        Long candPrice = candidate.getPricePaise();
        if (newPrice == null || newPrice <= 0 || candPrice == null || candPrice <= 0) {
            return;
        }

        double lat = newListing.getLatitude();
        double lon = newListing.getLongitude();
        double distanceM = haversineMeters(lat, lon, candidate.getLatitude(), candidate.getLongitude());

        double priceDelta = Math.abs(newPrice - candPrice) / (double) Math.max(newPrice, candPrice);

        Double areaDelta = null;
        BigDecimal newArea  = newListing.getAreaSqm();
        BigDecimal candArea = candidate.getAreaSqm();
        if (newArea != null && newArea.compareTo(BigDecimal.ZERO) > 0
                && candArea != null && candArea.compareTo(BigDecimal.ZERO) > 0) {
            double a = newArea.doubleValue();
            double b = candArea.doubleValue();
            areaDelta = Math.abs(a - b) / Math.max(a, b);
        }

        ConfidenceLevel confidence = classifyConfidence(distanceM, priceDelta, areaDelta);

        if (confidence == ConfidenceLevel.BELOW_THRESHOLD) {
            return;
        }

        // Idempotency check first: if this pair already exists, skip silently (no cap warning).
        UUID idA = newId.compareTo(candidate.getId()) <= 0 ? newId : candidate.getId();
        UUID idB = newId.compareTo(candidate.getId()) <= 0 ? candidate.getId() : newId;
        if (duplicateCandidateRepo.existsByListingIdAAndListingIdB(idA, idB)) {
            return;
        }

        // Pair cap check (after idempotency so already-recorded pairs don't emit a spurious cap warning)
        long capNew  = duplicateCandidateRepo.countByListingIdAndStatus(newId, DuplicateCandidateStatus.PENDING);
        long capCand = duplicateCandidateRepo.countByListingIdAndStatus(candidate.getId(), DuplicateCandidateStatus.PENDING);
        if (capNew >= PAIR_CAP || capCand >= PAIR_CAP) {
            log.warn("Pair cap reached for listingId={} or candidateId={}, skipping insert",
                    newId, candidate.getId());
            return;
        }

        // Compute similarity score; normalise proximity component against the effective radius
        // (50m for primary candidates, up to 100m for fallback candidates).
        double effectiveRadiusM = distanceM <= RADIUS_PRIMARY_M ? RADIUS_PRIMARY_M : RADIUS_FALLBACK_M;
        BigDecimal score = computeSimilarityScore(distanceM, priceDelta, areaDelta, effectiveRadiusM);

        DuplicateCandidate dc = new DuplicateCandidate();
        dc.setListingIdA(idA);
        dc.setListingIdB(idB);
        dc.setSimilarityScore(score);
        dc.setDistanceMeters(BigDecimal.valueOf(distanceM).setScale(2, RoundingMode.HALF_UP));
        dc.setStatus(DuplicateCandidateStatus.PENDING);
        duplicateCandidateRepo.save(dc);

        // For HIGH confidence: flag the newer listing as suspected duplicate
        if (confidence == ConfidenceLevel.HIGH) {
            Listing newer = determineNewer(newListing, candidate);
            newer.setSuspectedDuplicate(true);
            listingRepository.save(newer);
            log.info("HIGH confidence duplicate pair found: listingIdA={} listingIdB={} distanceM={} — flagged newer listingId={}",
                    idA, idB, String.format("%.1f", distanceM), newer.getId());
        }
    }

    private ConfidenceLevel classifyConfidence(double distanceM, double priceDelta, Double areaDelta) {
        // HIGH: close pair with loose price check
        if (distanceM <= HIGH_CONF_CLOSE_M && priceDelta <= HIGH_CONF_CLOSE_PRICE_PCT) {
            return ConfidenceLevel.HIGH;
        }
        // HIGH: within primary radius, tight price AND area match
        if (distanceM <= RADIUS_PRIMARY_M
                && priceDelta <= HIGH_CONF_PRICE_PCT
                && areaDelta != null
                && areaDelta <= HIGH_CONF_AREA_PCT) {
            return ConfidenceLevel.HIGH;
        }
        // MEDIUM: within primary radius with moderate price/area match
        if (distanceM <= RADIUS_PRIMARY_M) {
            boolean qualifies = (areaDelta == null && priceDelta <= MED_CONF_PRICE_AREA_NULL_PCT)
                    || (areaDelta != null && priceDelta <= MED_CONF_PRICE_AREA_PRESENT_PCT);
            if (qualifies) {
                return ConfidenceLevel.MEDIUM;
            }
        }
        return ConfidenceLevel.BELOW_THRESHOLD;
    }

    private BigDecimal computeSimilarityScore(
            double distanceM, double priceDelta, Double areaDelta, double effectiveRadiusM) {
        double proximityScore = Math.max(0, 1.0 - distanceM / effectiveRadiusM);
        double priceScore     = Math.max(0, 1.0 - priceDelta / HIGH_CONF_PRICE_PCT);
        double areaScore      = areaDelta != null ? Math.max(0, 1.0 - areaDelta / HIGH_CONF_AREA_PCT) : 0.5;
        BigDecimal raw = new BigDecimal(proximityScore * 0.4 + priceScore * 0.4 + areaScore * 0.2)
                .setScale(2, RoundingMode.HALF_UP);
        return raw.min(BigDecimal.ONE).max(BigDecimal.ZERO);
    }

    /**
     * Returns the listing with the later {@code createdAt}.
     * Tie-break policy (equal or either null): return {@code newListing} — the listing
     * being approved is treated as "at least as new" when the timestamps are ambiguous.
     */
    /**
     * Returns the listing with the later {@code createdAt}.
     * Tie-break policy: when timestamps are equal or either is null, return {@code newListing}
     * (the listing being approved is treated as "at least as new" under ambiguity).
     */
    private Listing determineNewer(Listing newListing, Listing candidate) {
        if (newListing.getCreatedAt() == null || candidate.getCreatedAt() == null) {
            return newListing;
        }
        // Return candidate only if it is STRICTLY after newListing; otherwise default to newListing.
        return candidate.getCreatedAt().isAfter(newListing.getCreatedAt()) ? candidate : newListing;
    }

    /**
     * Haversine formula: great-circle distance between two lat/lon points in metres.
     */
    private static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6_371_000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** Confidence tier used internally; not exposed in API responses. */
    private enum ConfidenceLevel {
        HIGH, MEDIUM, BELOW_THRESHOLD
    }
}
