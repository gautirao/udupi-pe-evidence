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

    public static CityLaunchProgressDto from(CityLaunchRevision latest) {
        return new CityLaunchProgressDto(
                latest.getId(),
                latest.getCityId(),
                latest.getRevisionNumber(),
                latest.getLifecycleStatus().name(),
                latest.getPrepState().name(),
                latest.getPrepStage(),
                prepStageLabel(latest.getPrepStage()),
                geographyPercent(latest),
                latest.getFailureReason(),
                latest.getCreatedAt(),
                latest.getPreparedAt());
    }

    private static int geographyPercent(CityLaunchRevision revision) {
        if (revision.getPrepState() == PrepState.DONE) {
            return 100;
        }
        return Math.round(revision.getPrepStage() / 6f * 100);
    }

    private static String prepStageLabel(short prepStage) {
        return switch (prepStage) {
            case 1 -> "candidate";
            case 2 -> "canonical";
            case 3 -> "regions";
            case 4 -> "groups";
            case 5 -> "projections";
            case 6 -> "ready";
            default -> "pending";
        };
    }
}
