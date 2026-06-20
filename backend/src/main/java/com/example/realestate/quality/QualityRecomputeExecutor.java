package com.example.realestate.quality;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.image.ListingImageRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Executes a single listing quality recomputation inside its own
 * {@code REQUIRES_NEW} transaction.
 *
 * <h3>Why a separate bean?</h3>
 * Spring's {@code @Transactional} is applied via an AOP proxy. When a method calls
 * another method on the SAME bean ({@code this.recompute()}) the proxy is bypassed and
 * the transaction annotation has no effect. By extracting the transactional work into
 * this separate bean, {@link QualityRecomputeService} can inject it and call
 * {@code executor.recompute(id)} through the proxy — guaranteeing the
 * {@code REQUIRES_NEW} semantics are active on every invocation, including the
 * afterCommit hook path.
 *
 * <h3>Atomicity</h3>
 * The column UPDATE ({@code updateQualityColumns}) and the history INSERT both run
 * inside the single REQUIRES_NEW transaction started by {@link #recompute(UUID)}.
 * If either fails the entire transaction is rolled back — both-or-neither.
 *
 * <h3>Materiality key</h3>
 * Materiality is evaluated via a JSONB equality query in the DB:
 * {@link ListingQualityHistoryRepository#isLatestBreakdownEquivalent} compares the
 * prior row's breakdown (minus {@code computedAt}) against the new computation's
 * comparable key (overall + components, no {@code computedAt}), using PostgreSQL's
 * native {@code ::jsonb} cast so that key ordering and whitespace differences are
 * ignored. The full canonical JSON (including {@code computedAt}) is still what gets
 * written to both {@code property_listings.quality_breakdown} and
 * {@code listing_quality_history.breakdown}.
 */
@Service
public class QualityRecomputeExecutor {

    private static final Logger log = LoggerFactory.getLogger(QualityRecomputeExecutor.class);

    static final int SUFFICIENCY_FLOOR_BP = 5_000;

    private final ListingRepository listingRepository;
    private final ListingImageRepository imageRepository;
    private final QualityScoreService qualityScoreService;
    private final ListingQualityHistoryRepository historyRepository;
    private final Clock clock;

    public QualityRecomputeExecutor(
            ListingRepository listingRepository,
            ListingImageRepository imageRepository,
            QualityScoreService qualityScoreService,
            ListingQualityHistoryRepository historyRepository,
            Clock clock) {
        this.listingRepository = listingRepository;
        this.imageRepository = imageRepository;
        this.qualityScoreService = qualityScoreService;
        this.historyRepository = historyRepository;
        this.clock = clock;
    }

    /**
     * Recomputes the quality score for the given listing and persists the result.
     *
     * <p>Always runs in its own independent transaction ({@code REQUIRES_NEW}) — isolated
     * from any caller transaction. This means a recompute failure NEVER rolls back the
     * listing write that triggered it.
     *
     * <p>Called by {@link QualityRecomputeService#safeRecompute} (via the Spring proxy,
     * so REQUIRES_NEW is active) and directly by {@link QualityBackfillRunner} (cross-bean,
     * proxy also active).
     *
     * @param listingId the listing to recompute
     * @return SCORED if a real score was stored, INSUFFICIENT if NULL (honest-null),
     *         SKIPPED if listing not found
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public QualityRecomputeService.RecomputeOutcome recompute(UUID listingId) {
        Optional<Listing> opt = listingRepository.findById(listingId);
        if (opt.isEmpty()) {
            log.debug("Quality recompute skipped — listing not found listingId={}", listingId);
            return QualityRecomputeService.RecomputeOutcome.SKIPPED;
        }
        Listing listing = opt.get();

        Instant now = clock.instant();

        // Photo count — pure DB read, no side effects
        long photoCount = imageRepository.countByListingId(listingId);

        // Per-cent median for PRICE_SANITY comparison
        Long listingPricePerCentPaise = listing.getPricePerCentPaise();
        Long medianPricePerCentPaise = null;
        if (listing.getAreaKey() != null && listingPricePerCentPaise != null) {
            medianPricePerCentPaise = listingRepository
                    .findAreaMedianPricePerCentPaise(listing.getAreaKey())
                    .orElse(null);
        }

        // Build inputs — compute() stays pure (no clock/DB/random calls inside)
        QualityScoreInputs inputs = new QualityScoreInputs(
                (int) Math.min(photoCount, Integer.MAX_VALUE),
                listing.getDescription(),
                listing.getTrustTier(),
                listing.getPropertyType(),
                listing.getLandCategory(),
                listing.getWaterSource(),
                listing.getSoilType(),
                listing.getRoadAccess(),
                listing.getCultivationStatus(),
                listing.getOwnershipType(),
                listing.getFarmhouseAvailable(),
                listing.getFencingDone(),
                listingPricePerCentPaise,
                medianPricePerCentPaise,
                listing.getLocality(),
                listing.getAreaKey(),
                listing.getLatitude(),
                listing.getLongitude(),
                listing.getCreatedAt(),
                now
        );

        QualityScore result = qualityScoreService.compute(inputs);

        // Sufficiency check
        int appliedWeightSum = result.components().stream()
                .filter(QualityComponent::applied)
                .mapToInt(QualityComponent::weightBp)
                .sum();

        boolean sufficient = appliedWeightSum >= SUFFICIENCY_FLOOR_BP;

        // breakdownJson — STORED in DB (full canonical, includes computedAt).
        // comparableJson — used only for materiality check (no computedAt).
        String breakdownJson;
        String comparableJson;
        Integer scoreToStore;
        QualityRecomputeService.RecomputeOutcome outcome;

        if (sufficient) {
            scoreToStore   = result.overall();
            breakdownJson  = qualityScoreService.toCanonicalJson(result);   // has computedAt
            comparableJson = qualityScoreService.toComparableJson(result);  // no computedAt
            outcome = QualityRecomputeService.RecomputeOutcome.SCORED;
        } else {
            scoreToStore = null;
            List<String> missing = new ArrayList<>();
            for (QualityComponent c : result.components()) {
                if (!c.applied()) missing.add(c.type().name());
            }
            // Diagnostic JSON has no timestamp — comparableJson == breakdownJson here
            breakdownJson  = QualityRecomputeService.buildInsufficientBreakdown(missing);
            comparableJson = breakdownJson;
            outcome = QualityRecomputeService.RecomputeOutcome.INSUFFICIENT;
            log.debug("Quality recompute INSUFFICIENT listingId={} appliedWeightSum={} missing={}",
                    listingId, appliedWeightSum, missing);
        }

        // Direct UPDATE — reentrancy prevention: no listing.save(), no new afterCommit hook.
        listingRepository.updateQualityColumns(listingId, scoreToStore, breakdownJson, now);

        // Materiality check: compare via JSONB minus computedAt in the DB.
        // Using the repository's native JSONB equality avoids false mismatches from
        // PostgreSQL's JSONB normalisation (whitespace, key ordering) that would occur
        // if we compared raw strings. isLatestBreakdownEquivalent returns true when the
        // prior row exists AND its breakdown (minus computedAt) JSONB-equals comparableJson.
        boolean equivalent = historyRepository.isLatestBreakdownEquivalent(listingId, comparableJson);

        if (!equivalent) {
            ListingQualityHistory history = new ListingQualityHistory();
            history.setListingId(listingId);
            history.setScore(scoreToStore != null ? scoreToStore.shortValue() : null);
            history.setBreakdown(breakdownJson);
            history.setComputedAt(now);
            historyRepository.save(history);
            log.info("Quality recompute complete listingId={} score={} appliedWeightBp={} historyAppended=true",
                    listingId, scoreToStore, appliedWeightSum);
        } else {
            log.debug("Quality recompute complete listingId={} score={} historyAppended=false (no material change)",
                    listingId, scoreToStore);
        }

        return outcome;
    }

}
