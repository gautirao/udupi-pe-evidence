package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.profile.Profile;
import com.example.realestate.profile.ProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * Computes the within-tier ranking score for a listing.
 *
 * <p>Formula:
 * <pre>
 *   score = tierBase
 *         + (freshnessWeight * freshnessScore)
 *         + (profileWeight   * profileScore)
 *         + (listingWeight   * listingScore)
 * </pre>
 * The final result is cast to {@code int} (truncation toward zero).
 *
 * <p>Score components:
 * <ol>
 *   <li><b>Tier base</b> — from {@link RankingProperties}: A=1000, B=750, C=500, D=0</li>
 *   <li><b>Freshness</b> — {@code max(0.0, 1.0 - daysSinceStatusChange / 90.0)}.
 *       If {@code statusChangedAt} is null, treated as 0 days old (freshness = 1.0).</li>
 *   <li><b>Profile completeness</b> — fraction of {phoneVerified, orgName, reraBrokerId}
 *       fields that are filled on the owner's profile.  Range [0.0, 1.0].
 *       If the owner has no profile row, score = 0.0.</li>
 *   <li><b>Listing completeness</b> — fraction of optional fields that are filled.
 *       Fields for all types: description, videoUrl, hasImages.
 *       Additional field for "land" type: landArea &gt; 0.  Range [0.0, 1.0].</li>
 * </ol>
 *
 * <p>This service is read-only — it does NOT persist the score.  The caller
 * ({@link BadgeService}) must pass the already-fetched {@link Listing} (with any
 * in-memory tier updates already applied), then call
 * {@link Listing#setRankingScore(int)} and save the listing.
 */
@Service
public class RankingScoreCalculator {

    private static final Logger log = LoggerFactory.getLogger(RankingScoreCalculator.class);

    /**
     * Decay window in days. After 90 days, freshness hits 0.
     */
    private static final double FRESHNESS_DECAY_DAYS = 90.0;

    /**
     * Property type string used to identify land listings.
     */
    private static final String PROPERTY_TYPE_LAND = "land";

    private final ProfileRepository profileRepository;
    private final ListingImageRepository listingImageRepository;
    private final RankingProperties rankingProperties;

    public RankingScoreCalculator(
            ProfileRepository profileRepository,
            ListingImageRepository listingImageRepository,
            RankingProperties rankingProperties) {
        this.profileRepository = profileRepository;
        this.listingImageRepository = listingImageRepository;
        this.rankingProperties = rankingProperties;
    }

    /**
     * Computes and returns the ranking score for the given listing.
     *
     * <p>The caller is responsible for fetching the listing (with any in-memory mutations
     * already applied, e.g. an updated {@code trustTier}) and passing it here.
     * This avoids a hidden second DB round-trip and eliminates any stale-read risk when
     * the caller has already mutated the entity in the same transaction.
     *
     * <p>Does NOT persist anything — the caller must call
     * {@link Listing#setRankingScore(int)} and save.
     *
     * @param listing the listing to score; must not be null
     * @return computed ranking score as an int
     */
    @Transactional(readOnly = true)
    public int calculate(Listing listing) {
        Objects.requireNonNull(listing, "listing must not be null");

        UUID listingId = listing.getId();

        double tierBase = rankingProperties.tierBaseFor(listing.getTrustTier());

        double freshnessScore = computeFreshnessScore(listing.getStatusChangedAt());

        double profileScore = computeProfileScore(listing.getCreatedBy());

        long imageCount = listingImageRepository.countByListingId(listingId);
        double listingScore = computeListingScore(listing, imageCount);

        RankingProperties.Weights weights = rankingProperties.getWeights();
        double rawScore = tierBase
                + (weights.getFreshness() * freshnessScore)
                + (weights.getProfile() * profileScore)
                + (weights.getListing() * listingScore);

        int score = (int) rawScore;

        log.debug("Ranking score for listingId={} tier={} tierBase={} freshness={} profile={} "
                        + "listing={} → rawScore={} score={}",
                listingId, listing.getTrustTier(), tierBase, freshnessScore,
                profileScore, listingScore, rawScore, score);

        return score;
    }

    // -------------------------------------------------------------------------
    // Component calculations
    // -------------------------------------------------------------------------

    /**
     * Freshness score: {@code max(0.0, 1.0 - daysSinceStatusChange / 90.0)}.
     * A null {@code statusChangedAt} is treated as 0 days old → 1.0.
     */
    double computeFreshnessScore(Instant statusChangedAt) {
        if (statusChangedAt == null) {
            return 1.0;
        }
        long daysSince = ChronoUnit.DAYS.between(statusChangedAt, Instant.now());
        return Math.max(0.0, 1.0 - daysSince / FRESHNESS_DECAY_DAYS);
    }

    /**
     * Profile completeness score: count of filled {phoneVerified, orgName, reraBrokerId}
     * divided by 3.0.  Returns 0.0 if the owner userId is null or no profile row exists.
     */
    double computeProfileScore(UUID ownerUserId) {
        if (ownerUserId == null) {
            return 0.0;
        }
        Optional<Profile> profileOpt = profileRepository.findByUserId(ownerUserId);
        if (profileOpt.isEmpty()) {
            return 0.0;
        }
        Profile profile = profileOpt.get();

        int count = 0;
        if (profile.isPhoneVerified()) {
            count++;
        }
        if (profile.getOrgName() != null && !profile.getOrgName().isEmpty()) {
            count++;
        }
        if (profile.getReraBrokerId() != null && !profile.getReraBrokerId().isEmpty()) {
            count++;
        }
        return count / 3.0;
    }

    /**
     * Listing completeness score: filled optional fields divided by maxFields.
     *
     * <p>Fields for ALL types: description (non-null, non-empty),
     * videoUrl (non-null, non-empty), hasImages (image count &gt; 0).
     * Land listings add landArea (&gt; 0) as a 4th field (maxFields=4);
     * all others use maxFields=3.
     */
    double computeListingScore(Listing listing, long imageCount) {
        boolean isLand = PROPERTY_TYPE_LAND.equals(listing.getPropertyType());
        int maxFields = isLand ? 4 : 3;

        int filled = 0;

        if (listing.getDescription() != null && !listing.getDescription().isEmpty()) {
            filled++;
        }
        if (listing.getVideoUrl() != null && !listing.getVideoUrl().isEmpty()) {
            filled++;
        }
        if (imageCount > 0) {
            filled++;
        }
        if (isLand) {
            BigDecimal landArea = listing.getLandArea();
            if (landArea != null && landArea.compareTo(BigDecimal.ZERO) > 0) {
                filled++;
            }
        }

        return (double) filled / maxFields;
    }
}
