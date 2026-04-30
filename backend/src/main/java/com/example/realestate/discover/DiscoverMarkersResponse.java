package com.example.realestate.discover;

import java.util.List;

public record DiscoverMarkersResponse(String city, List<DiscoverMarker> markers, boolean truncated) {}
