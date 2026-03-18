package com.example.realestate.listing.core;

import com.example.realestate.listing.exception.ListingNotFoundException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Encapsulates the ownership check that is shared between {@link com.example.realestate.listing.crud.ListingCrudService}
 * and {@link com.example.realestate.listing.workflow.ListingWorkflowService}.
 *
 * <p>Archived listings are treated as not found to prevent brokers from accessing or
 * modifying them via update, image upload, or any other owner-scoped endpoint.
 */
@Component
public class ListingOwnershipGuard {

    private final ListingRepository listingRepository;

    public ListingOwnershipGuard(ListingRepository listingRepository) {
        this.listingRepository = listingRepository;
    }

    /**
     * Find a listing that the user owns (or any listing if admin).
     * Throws {@link ListingNotFoundException} if the listing does not exist or has been archived.
     * Throws {@link ListingOwnershipException} if the listing exists but is owned by someone else.
     */
    public Listing findOwned(UUID listingId, UUID userId, boolean isAdmin) {
        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new ListingNotFoundException(listingId));

        // Archived listings are invisible to all owner-scoped operations.
        if (listing.getArchivedAt() != null) {
            throw new ListingNotFoundException(listingId);
        }

        if (!isAdmin && !userId.equals(listing.getCreatedBy())) {
            throw new ListingOwnershipException(listingId);
        }
        return listing;
    }
}
