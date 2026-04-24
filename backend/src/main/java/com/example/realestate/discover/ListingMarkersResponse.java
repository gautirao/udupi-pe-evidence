package com.example.realestate.discover;

import java.util.List;

public record ListingMarkersResponse(String city, List<ListingMarker> markers) {}
