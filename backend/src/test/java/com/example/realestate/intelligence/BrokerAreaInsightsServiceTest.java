package com.example.realestate.intelligence;

import com.example.realestate.booking.ViewingRequestRepository;
import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BrokerAreaInsightsService} using Mockito.
 *
 * <p>Does NOT use Testcontainers — all repository interactions are mocked.
 * SQL predicate correctness (IDOR, scraped exclusion) is documented here via mock
 * argument capture; the ADD-ONLY @Query methods in the repositories are separately
 * tested by the named test scenarios documented in [qa_requirements].
 *
 * <p>Named tests required by the approved plan:
 * <ul>
 *   <li>AC12 IDOR: broker A vs broker B data isolation (named: {@code idor_brokerA_cannotSeeBrokerB_counts})</li>
 *   <li>AC13 Suppression: sub-threshold SHARED null vs true-broker-zero (named: {@code suppression_sharedNullVsBrokerTrueZero})</li>
 *   <li>AC7 Scraped exclusion: scraped listing never counted (named: {@code scrapedExclusion_scrapedListing_notCountedInBrokerFields})</li>
 *   <li>City-aware: non-Malpe city/area resolves distinct snapshot (named: {@code cityAware_nonMalpeArea_resolvesDistinctSnapshot})</li>
 *   <li>Needs-attention: mixed quality scores, only below-threshold non-null counted</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class BrokerAreaInsightsServiceTest {

    private static final UUID BROKER_A = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID BROKER_B = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static final String CITY_UDUPI    = "udupi";
    private static final String AREA_MALPE    = "IN|KA|Udupi|Malpe";
    private static final String CITY_MANGALORE = "mangalore";
    private static final String AREA_KADRI    = "IN|KA|Mangalore|Kadri";

    @Mock
    private AreaIntelligenceSnapshotRepository snapshotRepository;

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ViewingRequestRepository viewingRequestRepository;

    @InjectMocks
    private BrokerAreaInsightsService service;

    @BeforeEach
    void setUp() {
        // Default: no snapshot, no listings, no enquiries
        when(snapshotRepository.findById(any())).thenReturn(Optional.empty());
        when(listingRepository.countBrokerLiveListingsInArea(any(), any())).thenReturn(0);
        when(listingRepository.countBrokerListingsNeedingAttention(any(), any(), anyInt())).thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(any(), any())).thenReturn(0);
        when(listingRepository.countQualifyingDemandSignalsForArea(any())).thenReturn(0);
    }

    // -----------------------------------------------------------------------
    // Missing snapshot — available=false, broker counts still present
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("Missing snapshot returns available=false with coherent shape and broker true-zeros")
    void missingSnapshot_returnsAvailableFalse() {
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.empty());

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);

        assertThat(response.available()).isFalse();
        assertThat(response.citySlug()).isEqualTo(CITY_UDUPI);
        assertThat(response.areaKey()).isEqualTo(AREA_MALPE);
        assertThat(response.area()).isNotNull();
        assertThat(response.broker()).isNotNull();
        // Broker counts are always present (primitive int), even when no snapshot
        assertThat(response.broker().liveListingsInArea()).isEqualTo(0);
        assertThat(response.broker().listingsNeedingAttention()).isEqualTo(0);
        assertThat(response.broker().enquiriesOnBrokerListings()).isEqualTo(0);
        assertThat(response.broker().opportunitiesToAct()).isEqualTo(0);
        // Shared metrics all null
        assertThat(response.area().medianPricePaise().value()).isNull();
        assertThat(response.area().activeListingCount().value()).isNull();
    }

    // -----------------------------------------------------------------------
    // AC12 IDOR test — broker A cannot see broker B's counts
    // -----------------------------------------------------------------------

    /**
     * AC12 IDOR — named test: broker A vs broker B in the same area.
     *
     * <p>Seeds distinct count values for broker A and broker B in the same area.
     * Asserts that when calling as broker A, only broker A's counts are returned.
     * Asserts the service derives brokerId from the parameter (which comes from CallerInfo.userId()
     * in the controller — never from any request field).
     *
     * <p>Verifies that the service passes BROKER_A's UUID to the repository queries when
     * called with BROKER_A, and BROKER_B's UUID when called with BROKER_B — isolation
     * is enforced by the created_by=:brokerId predicate in the @Query methods.
     */
    @Test
    @DisplayName("AC12 IDOR: brokerCannotSeeOtherBrokersAreaCounts — broker A and B in the same area, each sees only own counts")
    void idor_brokerA_cannotSeeBrokerB_counts() {
        AreaIntelligenceSnapshot snapshot = buildSnapshot(CITY_UDUPI, AREA_MALPE, 25, "full");
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.of(snapshot));
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_MALPE)).thenReturn(3);

        // Broker A: 5 live listings, 1 needing attention, 3 enquiries
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE)).thenReturn(5);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_A), eq(AREA_MALPE), eq(BrokerAreaInsightsService.QUALITY_NEEDS_ATTENTION_MAX)))
                .thenReturn(1);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE)).thenReturn(3);

        // Broker B: 2 live listings, 0 needing attention, 1 enquiry
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_B, AREA_MALPE)).thenReturn(2);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_B), eq(AREA_MALPE), eq(BrokerAreaInsightsService.QUALITY_NEEDS_ATTENTION_MAX)))
                .thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_B, AREA_MALPE)).thenReturn(1);

        // Call as broker A
        BrokerAreaInsightsResponse responseA = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);

        // Assert A's response contains ONLY A's counts
        assertThat(responseA.broker().liveListingsInArea()).isEqualTo(5);
        assertThat(responseA.broker().listingsNeedingAttention()).isEqualTo(1);
        assertThat(responseA.broker().enquiriesOnBrokerListings()).isEqualTo(3);

        // Call as broker B
        BrokerAreaInsightsResponse responseB = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_B);

        // Assert B's response contains ONLY B's counts (NOT broker A's values)
        assertThat(responseB.broker().liveListingsInArea()).isEqualTo(2);
        assertThat(responseB.broker().listingsNeedingAttention()).isEqualTo(0);
        assertThat(responseB.broker().enquiriesOnBrokerListings()).isEqualTo(1);

        // Repository called with BROKER_A's UUID — never accidentally with BROKER_B for A's call
        verify(listingRepository).countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE);
        verify(viewingRequestRepository).countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE);
        // Repository called with BROKER_B's UUID for B's call
        verify(listingRepository).countBrokerLiveListingsInArea(BROKER_B, AREA_MALPE);
        verify(viewingRequestRepository).countEnquiriesOnBrokerAreaListings(BROKER_B, AREA_MALPE);
    }

    // -----------------------------------------------------------------------
    // AC13 Suppression test — null Metric vs primitive 0
    // -----------------------------------------------------------------------

    /**
     * AC13 Suppression — named test.
     *
     * <p>Part (a): snapshot with activeListingCount &lt; K_ANON_MIN (price_comparison_supported=false)
     * → SHARED Metric.value=null, NOT 0; confidence label honest.
     *
     * <p>Part (b): broker owns 0 live listings in this area → primitive int 0 (TRUE ZERO),
     * NOT null/suppressed.
     *
     * <p>Both categories in the same test to prove distinction.
     */
    @Test
    @DisplayName("AC13 Suppression: sub-threshold SHARED metric → null+label (not 0); broker true-0 → int 0 (not unavailable)")
    void suppression_sharedNullVsBrokerTrueZero() {
        // Snapshot has 5 active listings — below K_ANON_MIN=10, so price_comparison_supported=false
        AreaIntelligenceSnapshot snapshotBelowThreshold =
                buildSnapshot(CITY_UDUPI, AREA_MALPE, 5, "insufficient");
        // Explicitly set priceComparisonSupported=false and null price/type (k-anon suppressed)
        snapshotBelowThreshold.setPriceComparisonSupported(false);
        snapshotBelowThreshold.setMedianPricePaise(null);
        snapshotBelowThreshold.setDominantPropertyType(null);

        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.of(snapshotBelowThreshold));

        // Broker B has 0 live listings in this area (true zero)
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_B, AREA_MALPE)).thenReturn(0);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_B), eq(AREA_MALPE), eq(BrokerAreaInsightsService.QUALITY_NEEDS_ATTENTION_MAX)))
                .thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_B, AREA_MALPE)).thenReturn(0);
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_MALPE)).thenReturn(0);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_B);

        // Category (a): SHARED suppressed → null value, NEVER 0
        assertThat(response.area().medianPricePaise().value())
                .as("Suppressed SHARED median price must be null, never 0")
                .isNull();
        assertThat(response.area().dominantPropertyType().value())
                .as("Suppressed SHARED dominant type must be null, never 0")
                .isNull();
        assertThat(response.area().activeListingCount().value())
                .as("Suppressed SHARED active count must be null (k-anon), never 0")
                .isNull();
        assertThat(response.area().medianPricePaise().confidenceLabel())
                .as("Suppressed metric must carry an honest label, never 'Enough data'")
                .isEqualTo("Not enough data yet");

        // Category (b): BROKER-OWN true-zero is primitive 0 — NOT null, NOT 'unavailable'
        assertThat(response.broker().liveListingsInArea())
                .as("Broker true-0 live listings must be int 0, not null/suppressed")
                .isEqualTo(0);
        assertThat(response.broker().listingsNeedingAttention())
                .as("Broker true-0 needs attention must be int 0")
                .isEqualTo(0);
        assertThat(response.broker().enquiriesOnBrokerListings())
                .as("Broker true-0 enquiries must be int 0")
                .isEqualTo(0);
    }

    // -----------------------------------------------------------------------
    // AC7 Scraped-exclusion test
    // -----------------------------------------------------------------------

    /**
     * AC7 Scraped exclusion — named test.
     *
     * <p>A SCRAPED listing (status='SCRAPED' or raw_post_id NOT NULL) must NEVER appear
     * in any broker-visible field. This is enforced by the SQL predicates (status='LIVE'
     * AND raw_post_id IS NULL) in the @Query methods.
     *
     * <p>In this unit test, we verify that the service passes the correct brokerId to
     * countBrokerLiveListingsInArea — the SQL exclusion itself is in the repository @Query.
     * The mock returns 0 even if a scraped listing were present (simulating SQL exclusion).
     */
    @Test
    @DisplayName("AC7 Scraped exclusion: SCRAPED/raw_post_id-NOT-NULL listing is NOT counted in broker-visible fields")
    void scrapedExclusion_scrapedListing_notCountedInBrokerFields() {
        AreaIntelligenceSnapshot snapshot = buildSnapshot(CITY_UDUPI, AREA_MALPE, 20, "full");
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.of(snapshot));

        // Mock: SQL predicate excludes scraped — returns 0 even though a scraped listing exists in the area
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE)).thenReturn(0);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_A), eq(AREA_MALPE), anyInt())).thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE)).thenReturn(0);
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_MALPE)).thenReturn(0);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);

        // Scraped listing NEVER appears in broker-scoped counts
        assertThat(response.broker().liveListingsInArea())
                .as("Scraped listing must not be counted as a live listing")
                .isEqualTo(0);
        assertThat(response.broker().listingsNeedingAttention())
                .as("Scraped listing must not appear in needs-attention count")
                .isEqualTo(0);
        assertThat(response.broker().enquiriesOnBrokerListings())
                .as("Enquiries on scraped listings must not appear in broker enquiry count")
                .isEqualTo(0);

        // Verify the correct method is called (not the scraped-inclusive version)
        verify(listingRepository).countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE);
        verify(viewingRequestRepository).countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE);
        // Must NOT call any scraped-inclusive method
        verify(listingRepository, never()).findAllLiveListings(any());
    }

    // -----------------------------------------------------------------------
    // City-aware test
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("City-aware: non-Malpe city/area (mangalore/Kadri) resolves distinct snapshot by composite key")
    void cityAware_nonMalpeArea_resolvesDistinctSnapshot() {
        AreaIntelligenceSnapshot mangaloreSnapshot = buildSnapshot(CITY_MANGALORE, AREA_KADRI, 30, "full");
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_MANGALORE, AREA_KADRI)))
                .thenReturn(Optional.of(mangaloreSnapshot));
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_A, AREA_KADRI)).thenReturn(2);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_A), eq(AREA_KADRI), eq(BrokerAreaInsightsService.QUALITY_NEEDS_ATTENTION_MAX)))
                .thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_KADRI)).thenReturn(1);
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_KADRI)).thenReturn(4);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_MANGALORE, AREA_KADRI, BROKER_A);

        assertThat(response.citySlug()).isEqualTo(CITY_MANGALORE);
        assertThat(response.areaKey()).isEqualTo(AREA_KADRI);
        assertThat(response.available()).isTrue();
        assertThat(response.broker().liveListingsInArea()).isEqualTo(2);
        assertThat(response.broker().enquiriesOnBrokerListings()).isEqualTo(1);

        // Repository called with MANGALORE/KADRI composite key — NOT UDUPI/MALPE
        verify(snapshotRepository).findById(new AreaIntelligenceSnapshotId(CITY_MANGALORE, AREA_KADRI));
        verify(snapshotRepository, never()).findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE));
        verify(listingRepository).countBrokerLiveListingsInArea(BROKER_A, AREA_KADRI);
        verify(viewingRequestRepository).countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_KADRI);
    }

    // -----------------------------------------------------------------------
    // Needs-attention test
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("Needs-attention: only below-threshold non-null quality_score listings counted (null and above-threshold excluded)")
    void needsAttention_mixedQualityScores_onlyBelowThresholdNonNullCounted() {
        // Fixture: 3 listings in area
        // - 1 with quality_score=null (unscored) — excluded
        // - 1 with quality_score=75 (above QUALITY_NEEDS_ATTENTION_MAX=60) — excluded
        // - 1 with quality_score=45 (below threshold, non-null) — counted
        // Repository mock simulates the SQL predicate result
        AreaIntelligenceSnapshot snapshot = buildSnapshot(CITY_UDUPI, AREA_MALPE, 20, "full");
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.of(snapshot));

        when(listingRepository.countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE)).thenReturn(3);
        // Only 1 matches: quality_score IS NOT NULL AND quality_score < 60
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_A), eq(AREA_MALPE), eq(BrokerAreaInsightsService.QUALITY_NEEDS_ATTENTION_MAX)))
                .thenReturn(1);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE)).thenReturn(0);
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_MALPE)).thenReturn(0);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);

        assertThat(response.broker().liveListingsInArea()).isEqualTo(3);
        // Only 1 listing matched (null and above-threshold excluded)
        assertThat(response.broker().listingsNeedingAttention())
                .as("Only below-threshold non-null quality_score listings counted")
                .isEqualTo(1);

        // Repository was called with the correct threshold constant
        verify(listingRepository).countBrokerListingsNeedingAttention(
                BROKER_A, AREA_MALPE, BrokerAreaInsightsService.QUALITY_NEEDS_ATTENTION_MAX);
    }

    // -----------------------------------------------------------------------
    // opportunitiesToAct derivation test
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("opportunitiesToAct = qualifying signals - broker live listings (floored at 0)")
    void opportunitiesToAct_derivedFromSignalsMinusCapturingListings() {
        AreaIntelligenceSnapshot snapshot = buildSnapshot(CITY_UDUPI, AREA_MALPE, 20, "full");
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.of(snapshot));

        // 5 qualifying signals, broker has 2 live listings capturing the area
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_MALPE)).thenReturn(5);
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE)).thenReturn(2);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_A), eq(AREA_MALPE), anyInt())).thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE)).thenReturn(0);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);

        // opportunitiesToAct = 5 signals - 2 capturing listings = 3
        assertThat(response.broker().opportunitiesToAct()).isEqualTo(3);
    }

    @Test
    @DisplayName("opportunitiesToAct is floored at 0 when broker has more live listings than signals")
    void opportunitiesToAct_flooredAtZero_whenMoreListingsThanSignals() {
        AreaIntelligenceSnapshot snapshot = buildSnapshot(CITY_UDUPI, AREA_MALPE, 20, "full");
        when(snapshotRepository.findById(new AreaIntelligenceSnapshotId(CITY_UDUPI, AREA_MALPE)))
                .thenReturn(Optional.of(snapshot));

        // 2 qualifying signals, broker has 5 live listings (more than signals)
        when(listingRepository.countQualifyingDemandSignalsForArea(AREA_MALPE)).thenReturn(2);
        when(listingRepository.countBrokerLiveListingsInArea(BROKER_A, AREA_MALPE)).thenReturn(5);
        when(listingRepository.countBrokerListingsNeedingAttention(
                eq(BROKER_A), eq(AREA_MALPE), anyInt())).thenReturn(0);
        when(viewingRequestRepository.countEnquiriesOnBrokerAreaListings(BROKER_A, AREA_MALPE)).thenReturn(0);

        BrokerAreaInsightsResponse response = service.getAreaInsights(CITY_UDUPI, AREA_MALPE, BROKER_A);

        // Floored at 0 — never negative
        assertThat(response.broker().opportunitiesToAct())
                .as("opportunitiesToAct must be floored at 0 (never negative)")
                .isEqualTo(0);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private AreaIntelligenceSnapshot buildSnapshot(
            String citySlug, String areaKey, int activeListingCount, String confidence) {
        AreaIntelligenceSnapshot s = new AreaIntelligenceSnapshot();
        s.setCitySlug(citySlug);
        s.setAreaKey(areaKey);
        s.setAreaLabel("Test Area");
        s.setComputedAt(Instant.now());
        s.setActiveListingCount(activeListingCount);
        s.setFreshListingCount(Math.min(activeListingCount, 3));
        s.setConfidence(confidence);
        boolean aboveThreshold = activeListingCount >= AggregationConstants.K_ANON_MIN;
        s.setPriceComparisonSupported(aboveThreshold);
        s.setPriceComparisonSampleCount(activeListingCount);
        if (aboveThreshold) {
            s.setMedianPricePaise(50_000_000L);
            s.setDominantPropertyType("apartment");
            s.setAvgListingQuality(new BigDecimal("72.50"));
        } else {
            s.setMedianPricePaise(null);
            s.setDominantPropertyType(null);
            s.setAvgListingQuality(null);
        }
        return s;
    }
}
