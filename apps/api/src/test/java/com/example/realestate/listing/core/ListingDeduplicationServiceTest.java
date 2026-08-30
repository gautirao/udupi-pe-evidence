package com.example.realestate.listing.core;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

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
}
