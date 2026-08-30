package com.example.realestate.listing.event;

import com.example.realestate.listing.core.Listing;

import java.util.UUID;

public record ListingApprovedEvent(Listing listing, UUID ownerId, String title) {}
