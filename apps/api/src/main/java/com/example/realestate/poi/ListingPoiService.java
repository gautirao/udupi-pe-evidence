package com.example.realestate.poi;

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

    public ListingPoiService(ListingPoiRepository repository) {
        this.repository = repository;
    }

    /**
     * Returns approved POIs for a listing, ordered pinned DESC then distance ASC,
     * capped at 15 items. Public endpoint — no auth required.
     * Note: rate limiting for this endpoint is tracked as a future cross-cutting concern.
     */
    public List<PoiResponse> getApproved(UUID listingId) {
        log.debug("getApproved listingId={}", listingId);
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
