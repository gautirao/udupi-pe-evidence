package com.example.realestate.poi;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Public REST endpoints for listing POIs.
 * No authentication required — POI data is public read-only.
 */
@RestController
@RequestMapping("/api/listings/{listingId}/pois")
public class ListingPoiController {

    private final ListingPoiService service;

    public ListingPoiController(ListingPoiService service) {
        this.service = service;
    }

    /**
     * Public endpoint — no auth required.
     * Returns approved POIs for a listing, ordered pinned DESC then distance ASC, capped at 15.
     *
     * @param listingId UUID of the listing
     * @return 200 OK with list of approved POIs (may be empty)
     */
    @GetMapping
    public ResponseEntity<List<PoiResponse>> getApproved(@PathVariable UUID listingId) {
        return ResponseEntity.ok(service.getApproved(listingId));
    }
}
