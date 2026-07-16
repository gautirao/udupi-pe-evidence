package com.example.realestate.discover.citylaunch;

/**
 * Response body for {@code POST /api/admin/city-launch/cities/{cityId}/prepare} (202 Accepted).
 * {@code status} is always the literal {@code "preparing"} at admission time — the caller polls
 * {@code GET .../prepare} for subsequent progress.
 */
public record PrepareResponse(Long revisionId, String status) {
}
