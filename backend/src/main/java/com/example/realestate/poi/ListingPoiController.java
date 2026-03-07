package com.example.realestate.poi;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Public read endpoint for approved listing POIs.
 * No auth required — GET /api/listings/{id}/pois is in permitAll.
 */
@RestController
@RequestMapping("/api/listings/{listingId}/pois")
public class ListingPoiController {

    private final ListingPoiService service;

    public ListingPoiController(ListingPoiService service) {
        this.service = service;
    }

    /**
     * Returns approved POIs for a listing, ordered pinned first then by distance.
     * Always returns 200 with [] if no approved POIs exist or listing is unknown.
     */
    @GetMapping
    public ResponseEntity<List<PoiResponse>> getApprovedPois(@PathVariable UUID listingId) {
        return ResponseEntity.ok(service.getApproved(listingId));
    }
}
