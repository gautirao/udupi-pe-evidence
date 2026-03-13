package com.example.realestate.listing;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link DuplicateCandidate#prePersist()}.
 *
 * These tests invoke {@code prePersist()} directly — no Spring context required.
 * The lifecycle callback is package-private (same package), so the test can call
 * it without reflection.
 */
class DuplicateCandidatePrePersistTest {

    private DuplicateCandidate buildMinimalCandidate(UUID listingIdA, UUID listingIdB) {
        DuplicateCandidate dc = new DuplicateCandidate();
        dc.setListingIdA(listingIdA);
        dc.setListingIdB(listingIdB);
        dc.setSimilarityScore(new BigDecimal("0.85"));
        dc.setDistanceMeters(new BigDecimal("45.50"));
        return dc;
    }

    // ===== createdAt defaults =====

    @Test
    void prePersist_setsCreatedAtWhenNull() {
        DuplicateCandidate dc = buildMinimalCandidate(UUID.randomUUID(), UUID.randomUUID());
        assertThat(dc.getCreatedAt()).isNull();

        dc.prePersist();

        assertThat(dc.getCreatedAt())
                .isNotNull()
                .isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void prePersist_doesNotOverwriteExplicitCreatedAt() {
        Instant explicit = Instant.parse("2026-01-01T00:00:00Z");
        DuplicateCandidate dc = buildMinimalCandidate(UUID.randomUUID(), UUID.randomUUID());
        dc.setCreatedAt(explicit);

        dc.prePersist();

        assertThat(dc.getCreatedAt()).isEqualTo(explicit);
    }

    // ===== status defaults =====

    @Test
    void prePersist_setsStatusToPendingWhenNull() {
        DuplicateCandidate dc = buildMinimalCandidate(UUID.randomUUID(), UUID.randomUUID());
        assertThat(dc.getStatus()).isNull();

        dc.prePersist();

        assertThat(dc.getStatus()).isEqualTo(DuplicateCandidateStatus.PENDING);
    }

    @Test
    void prePersist_doesNotOverwriteExplicitStatus() {
        DuplicateCandidate dc = buildMinimalCandidate(UUID.randomUUID(), UUID.randomUUID());
        dc.setStatus(DuplicateCandidateStatus.CONFIRMED);

        dc.prePersist();

        assertThat(dc.getStatus()).isEqualTo(DuplicateCandidateStatus.CONFIRMED);
    }

    // ===== canonical ordering =====

    @Test
    void prePersist_swapsIdsWhenAIsHigherThanB() {
        // UUID.compareTo uses signed long — use sequential UUIDs for predictable ordering
        UUID lower = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID higher = UUID.fromString("00000000-0000-0000-0000-000000000002");
        assertThat(lower.compareTo(higher)).isLessThan(0);

        // Pass in reverse order (higher as A, lower as B) — prePersist must swap
        DuplicateCandidate dc = buildMinimalCandidate(higher, lower);
        dc.prePersist();

        assertThat(dc.getListingIdA()).isEqualTo(lower);
        assertThat(dc.getListingIdB()).isEqualTo(higher);
    }

    @Test
    void prePersist_keepsOrderWhenAIsAlreadyLowerThanB() {
        UUID lower = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID higher = UUID.fromString("00000000-0000-0000-0000-000000000002");

        DuplicateCandidate dc = buildMinimalCandidate(lower, higher);
        dc.prePersist();

        // Already in canonical order — no swap should occur
        assertThat(dc.getListingIdA()).isEqualTo(lower);
        assertThat(dc.getListingIdB()).isEqualTo(higher);
    }

    // ===== Listing.isSuspectedDuplicate =====

    @Test
    void isSuspectedDuplicate_defaultsFalseOnNewListing() {
        Listing listing = new Listing();
        assertThat(listing.isSuspectedDuplicate()).isFalse();
    }

    @Test
    void isSuspectedDuplicate_setterRoundTrip() {
        Listing listing = new Listing();
        listing.setSuspectedDuplicate(true);
        assertThat(listing.isSuspectedDuplicate()).isTrue();

        listing.setSuspectedDuplicate(false);
        assertThat(listing.isSuspectedDuplicate()).isFalse();
    }
}
