package com.example.realestate.discover.citylaunch;

/**
 * Response body for {@code POST /api/admin/city-launch/cities/{cityId}/prepare} (202 Accepted).
 * {@code status} is the literal {@code "preparing"} at admission time for {@code prepare()}/
 * {@code rerunSuperseding()} — the caller polls {@code GET .../prepare} for subsequent progress.
 * {@link CityLaunchCandidateService#editFromLive} reuses this same record but returns it with
 * {@code status = "prepared"} instead, since that path admits the candidate directly as
 * {@code PREPARED} with no async step to poll for.
 */
public record PrepareResponse(Long revisionId, String status) {
}
