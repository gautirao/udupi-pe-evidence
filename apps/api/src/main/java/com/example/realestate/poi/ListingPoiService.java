package com.example.realestate.poi;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.exception.ListingNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for {@link ListingPoi} business logic.
 * Provides the public read path used by {@link ListingPoiController}
 * and helper accessors used by admin/moderation flows (PR-15.4).
 */
@Service
public class ListingPoiService {

    private static final Logger log = LoggerFactory.getLogger(ListingPoiService.class);

    private final ListingPoiRepository repository;
    private final ListingRepository listingRepository;

    public ListingPoiService(ListingPoiRepository repository,
                             ListingRepository listingRepository) {
        this.repository = repository;
        this.listingRepository = listingRepository;
    }

    /**
     * Returns approved POIs for a LIVE listing, ordered pinned DESC then distance ASC,
     * capped at 15 items. Public endpoint — no auth required.
     * Throws {@link ListingNotFoundException} for nonexistent, archived, or non-LIVE listings
     * so non-public listing existence and location context are never leaked (#2887).
     * Note: rate limiting for this endpoint is tracked as a future cross-cutting concern.
     */
    public List<PoiResponse> getApproved(UUID listingId) {
        log.debug("getApproved listingId={}", listingId);
        Listing listing = listingRepository.findById(listingId).orElse(null);
        if (listing == null
                || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())
                || listing.getArchivedAt() != null) {
            throw new ListingNotFoundException(listingId);
        }
        return repository.findByListingIdAndApprovedTrue(listingId).stream()
                .sorted(Comparator.comparing((ListingPoi p) -> Boolean.TRUE.equals(p.getPinned()) ? 0 : 1)
                        .thenComparingInt(p -> p.getDistanceMeters() != null ? p.getDistanceMeters() : Integer.MAX_VALUE))
                .limit(15)
                .map(PoiResponse::from)
                .toList();
    }

    /** Returns all POIs for a listing regardless of approval status. Used by PR-15.4. */
    public List<ListingPoi> getAll(UUID listingId) {
        return repository.findByListingId(listingId);
    }

    public Optional<ListingPoi> findById(UUID poiId) {
        return repository.findById(poiId);
    }

    public ListingPoi save(ListingPoi poi) {
        return repository.save(poi);
    }

    public void delete(UUID poiId) {
        repository.deleteById(poiId);
    }
}
