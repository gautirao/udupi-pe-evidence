package com.example.realestate.discover.citylaunch;

import java.time.Instant;

/**
 * One row of {@code GET /api/admin/city-launch/cities} — a city's derived launch status from its
 * MAX-{@code revision_number} {@link CityLaunchRevision} (or "not-started" if it has none).
 *
 * @param status derived label: {@code not-started}, {@code preparing}, {@code failed},
 *               {@code ready-preview}, {@code ready-launch}, {@code live}, {@code superseded}
 * @param revisionId latest revision's id, or {@code null} if the city has never been prepared
 * @param revisionNumber latest revision's number, or {@code null} if the city has never been prepared
 * @param prepStage 0-6 offline prep pipeline stage of the latest revision, or 0 if the city has
 *                  never been prepared
 * @param prepState latest revision's {@code prep_state} ({@code PENDING}/{@code RUNNING}/
 *                  {@code DONE}/{@code FAILED}), or {@code null} if the city has never been prepared
 * @param geographyPercent 0-100; {@code prepState == DONE ? 100 : round(prepStage / 6 * 100)}
 * @param failureReason latest revision's failure reason, or {@code null} if it hasn't failed (or
 *                       the city has never been prepared)
 * @param preparedAt latest revision's prepared-at timestamp, or {@code null} if not yet prepared
 */
public record CityLaunchStatusDto(
        Integer cityId,
        String citySlug,
        String cityName,
        String status,
        Long revisionId,
        Integer revisionNumber,
        short prepStage,
        String prepState,
        int geographyPercent,
        String failureReason,
        Instant preparedAt) {
}
