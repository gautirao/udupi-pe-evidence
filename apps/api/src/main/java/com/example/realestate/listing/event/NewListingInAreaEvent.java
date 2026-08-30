package com.example.realestate.listing.event;

import java.util.UUID;

/** Fired when a listing with a known areaKey goes LIVE. Triggers area-subscriber notifications. */
public record NewListingInAreaEvent(UUID listingId, String areaKey, String areaLabel,
                                    String title, String propertyType, Long pricePaise) {}
