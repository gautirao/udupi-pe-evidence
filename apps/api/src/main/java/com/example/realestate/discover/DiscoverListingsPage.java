package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverListingsPage(
        List<DiscoverListingResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        DiscoverListingsAggregates aggregates   // null when includeAggregates=false
) {}
