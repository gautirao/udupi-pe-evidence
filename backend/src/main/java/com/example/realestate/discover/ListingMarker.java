package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListingMarker(UUID id, double lat, double lon, Long pricePaise) {}
