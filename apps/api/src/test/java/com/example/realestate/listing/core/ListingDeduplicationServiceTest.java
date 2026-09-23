package com.example.realestate.listing.core;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingDeduplicationServiceTest {

    @Mock
    private ListingRepository listingRepository;

    private ListingDeduplicationService deduplicationService;

    @BeforeEach
    void setUp() {
        deduplicationService = new ListingDeduplicationService(listingRepository);
    }

    @Test
    void computeDedupeHash_normalizesCaseAndWhitespace() {
        String hash1 = deduplicationService.computeDedupeHash("  House FOR Sale  ", "  UDUPI  ", new BigDecimal("5000000"));
        String hash2 = deduplicationService.computeDedupeHash("house for sale", "udupi", new BigDecimal("5000000"));

        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_differentInputsProduceDifferentHashes() {
        String hash1 = deduplicationService.computeDedupeHash("House A", "Udupi", new BigDecimal("5000000"));
        String hash2 = deduplicationService.computeDedupeHash("House B", "Udupi", new BigDecimal("5000000"));

        assertThat(hash1).isNotEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_sameInputs_returnsSameHash() {
        String hash1 = deduplicationService.computeDedupeHash("Nice plot", "Manipal", new BigDecimal("5000000"));
        String hash2 = deduplicationService.computeDedupeHash("Nice plot", "Manipal", new BigDecimal("5000000"));

        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_differentInputs_returnsDifferentHash() {
        String hash1 = deduplicationService.computeDedupeHash("Nice plot", "Manipal", new BigDecimal("5000000"));
        String hash2 = deduplicationService.computeDedupeHash("Nice plot", "Udupi", new BigDecimal("5000000"));

        assertThat(hash1).isNotEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_nullDescription_usesEmptyString() {
        String hash1 = deduplicationService.computeDedupeHash(null, "Manipal", new BigDecimal("5000000"));
        String hash2 = deduplicationService.computeDedupeHash("", "Manipal", new BigDecimal("5000000"));

        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_caseInsensitive() {
        String hash1 = deduplicationService.computeDedupeHash("Nice Plot", "MANIPAL", new BigDecimal("5000000"));
        String hash2 = deduplicationService.computeDedupeHash("nice plot", "manipal", new BigDecimal("5000000"));

        assertThat(hash1).isEqualTo(hash2);
    }

    // --- #2519: 5-arg computeDedupeHash(description, locality, listingPurpose, price, monthlyRent) ---

    // --- Code review follow-up: listingPurpose defaulting to "sale" everywhere must NOT make the
    // null-guard permanently unsatisfiable. A content-less listing (no description/locality/
    // price/monthlyRent) must still return null, or every such listing collapses onto the same
    // constant hash and the second one is falsely flagged a duplicate — reintroducing #2519's own
    // failure mode via a new trigger. ---

    @Test
    void computeDedupeHash_allContentEmpty_saleListing_returnsNull() {
        String hash = deduplicationService.computeDedupeHash(null, null, "sale", null, null);

        assertThat(hash).isNull();
    }

    @Test
    void computeDedupeHash_allContentEmpty_rentListing_monthlyRentNull_returnsNull() {
        String hash = deduplicationService.computeDedupeHash(null, null, "rent", null, null);

        assertThat(hash).isNull();
    }

    @Test
    void computeDedupeHash_allContentEmpty_blankStrings_returnsNull() {
        // Blank (whitespace-only) description/locality normalize to empty, same as null.
        String hash = deduplicationService.computeDedupeHash("  ", "  ", "sale", null, null);

        assertThat(hash).isNull();
    }

    @Test
    void computeDedupeHash_rentVsRent_bothMonthlyRentNull_stillCollapsesToLocalityOnly_acceptedPreExistingDegeneracy() {
        // Code review follow-up (MEDIUM, AC1 half-closed): a rent/lease listing that has NOT yet
        // had monthlyRent set (still null, e.g. mid-draft) has no amount component to hash, so two
        // such listings in the same locality with no description still collapse onto the same
        // hash — pre-existing degeneracy from BEFORE #2519 (the old 3-component hash had exactly
        // the same locality-only collapse for a price-less listing), just no longer partitioned
        // by listingPurpose in this one sub-case. NOT a regression introduced by this PR, and it
        // self-heals the moment either listing's monthlyRent is set (which recomputes the hash —
        // see ListingCrudService's widened recompute guard). Documenting this as an accepted gap,
        // not silently leaving AC1 looking fully closed.
        String hash1 = deduplicationService.computeDedupeHash(
                null, "Manipal", "rent", null, null);
        String hash2 = deduplicationService.computeDedupeHash(
                null, "Manipal", "rent", null, null);

        assertThat(hash1).isNotNull();
        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_rentVsRent_differentMonthlyRent_producesDifferentHash_evenWithEmptyDescription() {
        // Two rent listings, same (empty) description and locality, no price (rent listings never
        // set price) — before #2519 this collapsed to the same locality-only hash for both.
        String hash1 = deduplicationService.computeDedupeHash(
                null, "Manipal", "rent", null, 15000L);
        String hash2 = deduplicationService.computeDedupeHash(
                null, "Manipal", "rent", null, 25000L);

        assertThat(hash1).isNotNull();
        assertThat(hash2).isNotNull();
        assertThat(hash1).isNotEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_leaseTreatedAsRental_readsMonthlyRentNotPrice() {
        // A lease listing's amount component must be monthlyRent, not price — a stray/legacy
        // price value on a lease listing must NOT leak into the hash or affect discrimination.
        String hashLease1 = deduplicationService.computeDedupeHash(
                null, "Manipal", "lease", new BigDecimal("999999"), 15000L);
        String hashLease2 = deduplicationService.computeDedupeHash(
                null, "Manipal", "lease", new BigDecimal("111111"), 15000L);

        assertThat(hashLease1).isEqualTo(hashLease2);
    }

    @Test
    void computeDedupeHash_saleVsRent_sameLocalityNoDescription_doesNotCollide() {
        // Same locality, no description, no overlapping amount field set on either side — before
        // #2519 both degenerated to the same locality-only hash.
        String saleHash = deduplicationService.computeDedupeHash(
                null, "Manipal", "sale", new BigDecimal("5000000"), null);
        String rentHash = deduplicationService.computeDedupeHash(
                null, "Manipal", "rent", null, 15000L);

        assertThat(saleHash).isNotEqualTo(rentHash);
    }

    @Test
    void computeDedupeHash_threeArgOverload_delegatesAsSaleWithNoMonthlyRent() {
        String viaThreeArg = deduplicationService.computeDedupeHash(
                "Nice plot", "Manipal", new BigDecimal("5000000"));
        String viaFiveArg = deduplicationService.computeDedupeHash(
                "Nice plot", "Manipal", "sale", new BigDecimal("5000000"), null);

        assertThat(viaThreeArg).isEqualTo(viaFiveArg);
    }

    @Test
    void computeAndSetDedupeHash_readsAllFiveComponentsFromEntity() {
        Listing rentListing = new Listing();
        rentListing.setDescription(null);
        rentListing.setLocality("Manipal");
        rentListing.setListingPurpose("rent");
        rentListing.setMonthlyRent(18000L);

        deduplicationService.computeAndSetDedupeHash(rentListing);

        assertThat(rentListing.getDedupeHash()).isNotNull();
        assertThat(rentListing.getDedupeHash())
                .isEqualTo(deduplicationService.computeDedupeHash(null, "Manipal", "rent", null, 18000L));
    }

    // --- #2519: checkAndMarkDuplicate(ExcludingSelf) delegate to the Active-scoped repo API ---
    // NOTE: these verify WHICH repo method is called (a regression guard against silently
    // reverting to an unscoped lookup); the actual archived_at/status filtering semantics are a
    // JPQL predicate that only a @DataJpaTest against a real database can exercise — tracked
    // separately, not covered by this Mockito-level unit test.

    @Test
    void checkAndMarkDuplicate_queriesActiveScopedRepoMethods_notUnscopedOnes() {
        Listing listing = new Listing();
        listing.setDedupeHash("somehash");
        when(listingRepository.existsActiveByDedupeHash("somehash")).thenReturn(true);
        when(listingRepository.countActiveByDedupeHash("somehash")).thenReturn(2L);

        deduplicationService.checkAndMarkDuplicate(listing);

        verify(listingRepository).existsActiveByDedupeHash("somehash");
        verify(listingRepository).countActiveByDedupeHash("somehash");
        assertThat(listing.isDuplicate()).isTrue();
        assertThat(listing.getRepostCount()).isEqualTo(2);
    }

    @Test
    void checkAndMarkDuplicate_noActiveMatch_doesNotFlagDuplicate() {
        // Control: repo reports no ACTIVE match (as it would for a hash whose only prior
        // occurrence is archived/rejected) — duplicate protection stays off, not because the
        // service skipped the check, but because the (mocked) Active-scoped lookup says false.
        Listing listing = new Listing();
        listing.setDedupeHash("archivedonlyhash");
        when(listingRepository.existsActiveByDedupeHash("archivedonlyhash")).thenReturn(false);

        deduplicationService.checkAndMarkDuplicate(listing);

        assertThat(listing.isDuplicate()).isFalse();
        verify(listingRepository, org.mockito.Mockito.never()).countActiveByDedupeHash(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void checkAndMarkDuplicateExcludingSelf_queriesActiveScopedCountExcludingSelf() {
        UUID listingId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setDedupeHash("somehash");
        when(listingRepository.countActiveByDedupeHashAndIdNot("somehash", listingId)).thenReturn(1L);

        deduplicationService.checkAndMarkDuplicateExcludingSelf(listing);

        verify(listingRepository).countActiveByDedupeHashAndIdNot("somehash", listingId);
        assertThat(listing.isDuplicate()).isTrue();
        assertThat(listing.getRepostCount()).isEqualTo(1);
    }

    @Test
    void checkAndMarkDuplicateExcludingSelf_zeroActiveMatches_clearsDuplicateFlag() {
        // Control: an existing listing previously flagged duplicate must be un-flagged once the
        // Active-scoped count excluding self drops to zero (e.g. the colliding row was archived).
        UUID listingId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setDedupeHash("somehash");
        listing.setDuplicate(true);
        listing.setRepostCount(1);
        when(listingRepository.countActiveByDedupeHashAndIdNot("somehash", listingId)).thenReturn(0L);

        deduplicationService.checkAndMarkDuplicateExcludingSelf(listing);

        assertThat(listing.isDuplicate()).isFalse();
        assertThat(listing.getRepostCount()).isEqualTo(0);
    }
}
