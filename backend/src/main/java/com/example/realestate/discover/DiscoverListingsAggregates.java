package com.example.realestate.discover;

import java.util.List;

public record DiscoverListingsAggregates(
        List<LocalityCount> topLocalities
) {
    public record LocalityCount(String locality, int count) {}
}
