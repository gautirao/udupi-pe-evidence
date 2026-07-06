package com.example.realestate.listing.core;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingOwnershipGuardTest {

    @Mock
    private ListingRepository listingRepository;

    private ListingOwnershipGuard ownershipGuard;

    @BeforeEach
    void setUp() {
        ownershipGuard = new ListingOwnershipGuard(listingRepository);
    }

    @Test
    void findOwnedListing_archivedListing_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(userId);
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> ownershipGuard.findOwned(listingId, userId, false));
    }

    // ==================== #1726: canAccessExactPin (non-throwing predicate) ====================

    @Test
    void canAccessExactPin_admin_trueRegardlessOfOwnership() {
        UUID ownerId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setCreatedBy(ownerId);

        assertThat(ownershipGuard.canAccessExactPin(listing, otherUserId, true)).isTrue();
    }

    @Test
    void canAccessExactPin_owner_true() {
        UUID ownerId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setCreatedBy(ownerId);

        assertThat(ownershipGuard.canAccessExactPin(listing, ownerId, false)).isTrue();
    }

    @Test
    void canAccessExactPin_otherAuthenticatedBuyer_false() {
        UUID ownerId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setCreatedBy(ownerId);

        assertThat(ownershipGuard.canAccessExactPin(listing, otherUserId, false)).isFalse();
    }

    @Test
    void canAccessExactPin_nullUserId_neverGrantsExceptForAdmin() {
        UUID ownerId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setCreatedBy(ownerId);

        assertThat(ownershipGuard.canAccessExactPin(listing, null, false)).isFalse();
        assertThat(ownershipGuard.canAccessExactPin(listing, null, true)).isTrue();
    }
}
