package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.profile.Profile;
import com.example.realestate.profile.ProfileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RankingScoreCalculator}.
 *
 * <p>AC4 scenarios:
 * <ol>
 *   <li>Tier A listing outranks Tier D listing of identical age and completeness.</li>
 *   <li>Newer listing outranks older listing at the same tier and completeness.</li>
 *   <li>More complete listing outranks less complete listing at same tier and same age.</li>
 * </ol>
 *
 * <p>AC5: {@link #calculate_doesNotRequireRankingScoreFromListing} confirms the calculator
 * reads/returns the score as a plain int — it does not use any rankingScore field from
 * the Listing entity during computation, so the field cannot leak back into the score.
 */
@ExtendWith(MockitoExtension.class)
class RankingScoreCalculatorTest {

    @Mock
    private ProfileRepository profileRepository;

    @Mock
    private ListingImageRepository listingImageRepository;

    private RankingProperties rankingProperties;

    // Not using @InjectMocks because RankingProperties is a concrete class that
    // Mockito cannot mock via @Mock; we construct the calculator manually.
    private RankingScoreCalculator calculator;

    @BeforeEach
    void setUp() {
        rankingProperties = new RankingProperties();
        // Uses default values from RankingProperties: A=1000, B=750, C=500, D=0
        // weights: freshness=200, profile=100, listing=100
        calculator = new RankingScoreCalculator(
                profileRepository, listingImageRepository, rankingProperties);
    }

    // -------------------------------------------------------------------------
    // Helper builders
    // -------------------------------------------------------------------------

    private Listing minimalListing(UUID id, String tier) {
        Listing l = new Listing();
        l.setId(id);
        l.setTrustTier(tier);
        l.setPropertyType("house");
        // statusChangedAt null → freshness = 1.0 (brand new)
        return l;
    }

    private Profile fullProfile(UUID userId) {
        Profile p = new Profile();
        p.setUserId(userId);
        p.setPhoneVerified(true);
        p.setOrgName("Best Brokers Ltd");
        p.setReraBrokerId("MH/RERA/12345");
        return p;
    }

    // -------------------------------------------------------------------------
    // AC4 Scenario 1: Tier A > Tier D at identical freshness and completeness
    // -------------------------------------------------------------------------

    /**
     * AC4-S1: tierBase difference (1000 vs 0) ensures Tier A always outranks Tier D
     * when freshness, profile, and listing scores are identical.
     */
    @Test
    void calculate_tierA_alwaysOutranksTierD_atSameAgeAndCompleteness() {
        UUID tierAId = UUID.randomUUID();
        UUID tierDId = UUID.randomUUID();
        UUID ownerA = UUID.randomUUID();
        UUID ownerD = UUID.randomUUID();

        Listing listingA = minimalListing(tierAId, "A");
        listingA.setCreatedBy(ownerA);

        Listing listingD = minimalListing(tierDId, "D");
        listingD.setCreatedBy(ownerD);

        // Both have zero images, no description, no videoUrl → listingScore = 0/3
        // Both have no profile row → profileScore = 0
        // Both have null statusChangedAt → freshness = 1.0
        when(listingImageRepository.countByListingId(tierAId)).thenReturn(0L);
        when(listingImageRepository.countByListingId(tierDId)).thenReturn(0L);
        when(profileRepository.findByUserId(ownerA)).thenReturn(Optional.empty());
        when(profileRepository.findByUserId(ownerD)).thenReturn(Optional.empty());

        int scoreA = calculator.calculate(listingA);
        int scoreD = calculator.calculate(listingD);

        // Tier A base = 1000, Tier D base = 0 — difference guaranteed by config
        assertThat(scoreA).isGreaterThan(scoreD);
        // Exact values with no completeness: A = 1000 + 200*1.0 + 0 + 0 = 1200; D = 0 + 200 = 200
        assertThat(scoreA).isEqualTo(1200);
        assertThat(scoreD).isEqualTo(200);
    }

    // -------------------------------------------------------------------------
    // AC4 Scenario 2: Newer listing > older listing at same tier + completeness
    // -------------------------------------------------------------------------

    /**
     * AC4-S2: A listing with {@code statusChangedAt} = today has higher freshness
     * than one with {@code statusChangedAt} = 45 days ago.  Both are Tier C with
     * no profile and no optional fields filled.
     */
    @Test
    void calculate_newerListing_outranksOlderListing_atSameTierAndCompleteness() {
        UUID newId = UUID.randomUUID();
        UUID oldId = UUID.randomUUID();

        Listing newListing = minimalListing(newId, "C");
        newListing.setStatusChangedAt(Instant.now());   // freshness ≈ 1.0

        Listing oldListing = minimalListing(oldId, "C");
        oldListing.setStatusChangedAt(Instant.now().minus(45, ChronoUnit.DAYS)); // freshness = 0.5

        when(listingImageRepository.countByListingId(newId)).thenReturn(0L);
        when(listingImageRepository.countByListingId(oldId)).thenReturn(0L);
        // No owner → no profile lookups triggered (createdBy is null)

        int scoreNew = calculator.calculate(newListing);
        int scoreOld = calculator.calculate(oldListing);

        assertThat(scoreNew).isGreaterThan(scoreOld);
    }

    // -------------------------------------------------------------------------
    // AC4 Scenario 3: More complete > less complete at same tier + same age
    // -------------------------------------------------------------------------

    /**
     * AC4-S3: At the same tier (B) and same statusChangedAt (null = brand new),
     * a listing with a full profile + all optional fields filled scores higher
     * than one with no profile and no optional fields.
     */
    @Test
    void calculate_moreCompleteListing_outranksLessComplete_atSameTierAndAge() {
        UUID completeId = UUID.randomUUID();
        UUID incompleteId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing completeListing = minimalListing(completeId, "B");
        completeListing.setCreatedBy(ownerId);
        completeListing.setDescription("Beautiful 3BHK flat near the beach");
        completeListing.setVideoUrl("https://youtube.com/watch?v=example");
        // images: stubbed to 5 below

        Listing incompleteListing = minimalListing(incompleteId, "B");
        // no description, no videoUrl, no images, no profile

        when(listingImageRepository.countByListingId(completeId)).thenReturn(5L);
        when(listingImageRepository.countByListingId(incompleteId)).thenReturn(0L);
        when(profileRepository.findByUserId(ownerId)).thenReturn(Optional.of(fullProfile(ownerId)));

        int scoreComplete = calculator.calculate(completeListing);
        int scoreIncomplete = calculator.calculate(incompleteListing);

        assertThat(scoreComplete).isGreaterThan(scoreIncomplete);
    }

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    @Test
    void calculate_throwsNullPointerException_whenListingIsNull() {
        assertThatThrownBy(() -> calculator.calculate((Listing) null))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("listing");
    }

    @Test
    void calculate_freshnessOne_whenStatusChangedAtIsNull() {
        double freshness = calculator.computeFreshnessScore(null);
        assertThat(freshness).isEqualTo(1.0);
    }

    @Test
    void calculate_freshnessZero_whenStatusChangedAtIsNinetyOrMoreDaysAgo() {
        Instant ninetyDaysAgo = Instant.now().minus(90, ChronoUnit.DAYS);
        double freshness = calculator.computeFreshnessScore(ninetyDaysAgo);
        assertThat(freshness).isLessThanOrEqualTo(0.0);
    }

    @Test
    void calculate_profileScore_isZero_whenOwnerUserIdIsNull() {
        double score = calculator.computeProfileScore(null);
        assertThat(score).isEqualTo(0.0);
    }

    @Test
    void calculate_profileScore_isZero_whenProfileNotFound() {
        UUID userId = UUID.randomUUID();
        when(profileRepository.findByUserId(userId)).thenReturn(Optional.empty());
        double score = calculator.computeProfileScore(userId);
        assertThat(score).isEqualTo(0.0);
    }

    @Test
    void calculate_profileScore_isOnePointZero_whenAllThreeFieldsFilled() {
        UUID userId = UUID.randomUUID();
        when(profileRepository.findByUserId(userId)).thenReturn(Optional.of(fullProfile(userId)));
        double score = calculator.computeProfileScore(userId);
        assertThat(score).isEqualTo(1.0);
    }

    /**
     * ADVISORY-FIX 3: Partial profile score — exactly 2 of 3 fields set.
     * phoneVerified=true, orgName="Corp", reraBrokerId=null → score = 2/3.
     */
    @Test
    void calculate_profileScore_isTwoThirds_whenTwoOfThreeFieldsFilled() {
        UUID userId = UUID.randomUUID();

        Profile partial = new Profile();
        partial.setUserId(userId);
        partial.setPhoneVerified(true);
        partial.setOrgName("Corp");
        partial.setReraBrokerId(null); // third field absent

        when(profileRepository.findByUserId(userId)).thenReturn(Optional.of(partial));

        double score = calculator.computeProfileScore(userId);

        // Default profileWeight=100; 2/3 * 100 = 66.66…
        // Verify raw ratio is within floating-point delta of 2/3
        double expectedRatio = 2.0 / 3.0;
        double profileWeight = rankingProperties.getWeights().getProfile();
        assertThat(score).isCloseTo(expectedRatio, within(1e-9));
        // Also verify the weighted contribution rounds correctly in a full score
        // profileWeight * score should be close to 2/3 * 100 = 66.666...
        assertThat(profileWeight * score).isCloseTo(2.0 / 3.0 * profileWeight, within(1e-9));
    }

    @Test
    void calculate_landListing_usesFourFieldMax() {
        Listing land = new Listing();
        land.setPropertyType("land");
        land.setDescription("Prime agricultural land");
        // videoUrl null, no images (imageCount=0), landArea=5 cents
        land.setLandArea(BigDecimal.valueOf(5));

        // 2 filled out of 4
        double score = calculator.computeListingScore(land, 0L);
        assertThat(score).isEqualTo(2.0 / 4.0);
    }

    @Test
    void calculate_nonLandListing_usesThreeFieldMax() {
        Listing house = new Listing();
        house.setPropertyType("house");
        house.setDescription("3BHK house");
        // videoUrl null, images = 3 → 2 out of 3

        double score = calculator.computeListingScore(house, 3L);
        assertThat(score).isEqualTo(2.0 / 3.0);
    }

    /**
     * AC5 verification: RankingScoreCalculator does not read the listing's existing
     * rankingScore field, so the score cannot feed back into itself or leak into
     * the API response via this calculation path.
     */
    @Test
    void calculate_doesNotRequireRankingScoreFromListing() {
        UUID id = UUID.randomUUID();
        Listing listing = minimalListing(id, "D");
        listing.setRankingScore(9999); // existing value — must not influence output

        when(listingImageRepository.countByListingId(id)).thenReturn(0L);

        int score = calculator.calculate(listing);

        // Tier D, no completeness, fresh (null statusChangedAt) → 0 + 200*1.0 + 0 + 0 = 200
        // The pre-existing rankingScore of 9999 must not appear in the result
        assertThat(score).isEqualTo(200);
        assertThat(score).isNotEqualTo(9999);
    }

    /**
     * ADVISORY-FIX 4: Full calculate(Listing) path for a land listing.
     * Verifies that the 4-field denominator branch is reached, imageCount is fetched
     * from the repository, and the returned score is arithmetically consistent.
     */
    @Test
    void calculate_fullPath_landListing_usesFourFieldDenominator() {
        UUID id = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing landListing = new Listing();
        landListing.setId(id);
        landListing.setTrustTier("B");
        landListing.setPropertyType("land");
        landListing.setCreatedBy(ownerId);
        landListing.setDescription("Fertile agricultural plot");
        landListing.setVideoUrl("https://example.com/video");
        landListing.setLandArea(BigDecimal.valueOf(10));
        // statusChangedAt null → freshness = 1.0

        // 1 image uploaded
        when(listingImageRepository.countByListingId(id)).thenReturn(1L);
        // Owner has no profile → profileScore = 0
        when(profileRepository.findByUserId(ownerId)).thenReturn(Optional.empty());

        int score = calculator.calculate(landListing);

        // tierBase(B)=750, freshness=200*1.0=200, profile=100*0=0,
        // listingScore: description+video+image+landArea = 4/4 = 1.0 → listing=100*1.0=100
        // rawScore = 750 + 200 + 0 + 100 = 1050 → (int) = 1050
        assertThat(score).isEqualTo(1050);

        // Verify the image repository was consulted (land-type path exercises countByListingId)
        org.mockito.Mockito.verify(listingImageRepository).countByListingId(id);
    }
}
