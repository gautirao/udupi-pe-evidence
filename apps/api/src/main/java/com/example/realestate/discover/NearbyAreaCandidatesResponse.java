package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/** Response envelope for {@code GET /api/discover/areas/nearby-candidates} (#2017). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NearbyAreaCandidatesResponse(
        String city,
        List<String> selectedAreaKeys,
        List<NearbyAreaCandidate> candidates
) {}
