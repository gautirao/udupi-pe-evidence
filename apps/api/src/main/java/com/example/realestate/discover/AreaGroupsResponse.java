package com.example.realestate.discover;

import java.util.List;

/**
 * Wrapper response for GET /api/discover/area-groups.
 * Shape: {"city": "bangalore", "groups": [...]}
 */
public record AreaGroupsResponse(String city, List<AreaGroupResponse> groups) {}
