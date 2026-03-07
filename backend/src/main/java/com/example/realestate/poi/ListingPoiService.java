package com.example.realestate.poi;

import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class ListingPoiService {

    private static final int CAP_TOTAL = 15;

    private final ListingPoiRepository repository;

    public ListingPoiService(ListingPoiRepository repository) {
        this.repository = repository;
    }

    /**
     * Returns approved POIs for a listing, ordered: pinned first, then by position ASC,
     * then by distance ASC. Capped at 15 total. Never throws — returns empty list on any error.
     */
    public List<PoiResponse> getApproved(UUID listingId) {
        return repository.findByListingIdAndApproved(listingId, true)
                .stream()
                .sorted(Comparator
                        .comparing(ListingPoi::isPinned, Comparator.reverseOrder())
                        .thenComparing(p -> Optional.ofNullable(p.getPosition()).orElse(Integer.MAX_VALUE))
                        .thenComparing(p -> Optional.ofNullable(p.getDistanceMeters()).orElse(Integer.MAX_VALUE)))
                .limit(CAP_TOTAL)
                .map(PoiResponse::from)
                .toList();
    }

    /** Returns all POIs for a listing (approved + unapproved) — used by dealer suggestions endpoint. */
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
