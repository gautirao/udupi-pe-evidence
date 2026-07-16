package com.example.realestate.discover.citylaunch;

import java.time.Instant;

/**
 * Response body for {@code GET /api/admin/city-launch/cities/{cityId}/prepare} — the full
 * progress detail of a city's latest (MAX-{@code revision_number}) {@link CityLaunchRevision}.
 *
 * @param geographyPercent 0-100; {@code prepState == DONE ? 100 : round(prepStage / 6 * 100)}
 * @param prepStageLabel human-readable name for {@code prepStage}: 1=candidate, 2=canonical,
 *                       3=regions, 4=groups, 5=projections, 6=ready; {@code pending} for 0/other
 */
public record CityLaunchProgressDto(
        Long revisionId,
        Integer cityId,
        Integer revisionNumber,
        String lifecycleStatus,
        String prepState,
        short prepStage,
        String prepStageLabel,
        int geographyPercent,
        String failureReason,
        Instant createdAt,
        Instant preparedAt) {
}
