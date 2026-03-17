package com.example.realestate.listing.event;

import com.example.realestate.listing.Listing;

import java.util.UUID;

public record ListingRejectedEvent(Listing listing, UUID ownerId, String title, String reason) {}
