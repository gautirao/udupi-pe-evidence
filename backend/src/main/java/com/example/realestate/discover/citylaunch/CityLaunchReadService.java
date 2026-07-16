package com.example.realestate.discover.citylaunch;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Read-only status/progress views over {@link CityLaunchRevision} for the admin city-launch
 * dashboard (#1911 PR2). Every city's status/progress is derived from its MAX-{@code
 * revision_number} row — never a stored "current status" column, so it always reflects the
 * latest attempt even mid-run.
 */
@Service
public class CityLaunchReadService {

    private final CityLaunchRevisionRepository revisionRepository;
    private final JdbcOperations jdbcOperations;

    public CityLaunchReadService(CityLaunchRevisionRepository revisionRepository, JdbcOperations jdbcOperations) {
        this.revisionRepository = revisionRepository;
        this.jdbcOperations = jdbcOperations;
    }

    @Transactional(readOnly = true)
    public List<CityLaunchStatusDto> listCities() {
        List<CityRow> cities = jdbcOperations.query(
                "SELECT id, slug, name FROM public.cities ORDER BY name",
                (rs, rowNum) -> new CityRow(rs.getInt("id"), rs.getString("slug"), rs.getString("name")));

        return cities.stream().map(this::toStatusDto).toList();
    }

    @Transactional(readOnly = true)
    public CityLaunchProgressDto getProgress(int cityId) {
        CityLaunchRevision latest = latestRevision(cityId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No city launch preparation found for this city"));

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

    private CityLaunchStatusDto toStatusDto(CityRow city) {
        Optional<CityLaunchRevision> latest = latestRevision(city.id());
        if (latest.isEmpty()) {
            return new CityLaunchStatusDto(
                    city.id(), city.slug(), city.name(), "not-started", null, null,
                    (short) 0, null, 0, null, null);
        }
        CityLaunchRevision revision = latest.get();
        return new CityLaunchStatusDto(
                city.id(), city.slug(), city.name(),
                deriveStatus(revision), revision.getId(), revision.getRevisionNumber(),
                revision.getPrepStage(), revision.getPrepState().name(),
                geographyPercent(revision), revision.getFailureReason(), revision.getPreparedAt());
    }

    private Optional<CityLaunchRevision> latestRevision(int cityId) {
        return revisionRepository.findByCityId(cityId).stream()
                .max(Comparator.comparing(CityLaunchRevision::getRevisionNumber));
    }

    /**
     * Status map (approved design):
     * no revision -> not-started; PREPARING -> preparing; FAILED (either the lifecycle status or
     * a FAILED prep_state on a non-terminal lifecycle) -> failed; PREPARED -> ready-preview;
     * VALIDATED -> ready-launch; PROMOTING/PROMOTED -> defensively ready-launch/live;
     * SUPERSEDED -> superseded (not reachable via PR2's prepare-only flow, but a sane label for a
     * revision left behind by a later PR's promotion/supersession step).
     */
    private static String deriveStatus(CityLaunchRevision revision) {
        if (revision.getPrepState() == PrepState.FAILED || revision.getLifecycleStatus() == LifecycleStatus.FAILED) {
            return "failed";
        }
        return switch (revision.getLifecycleStatus()) {
            case PREPARING -> "preparing";
            case PREPARED -> "ready-preview";
            case VALIDATED, PROMOTING -> "ready-launch";
            case PROMOTED -> "live";
            case SUPERSEDED -> "superseded";
            case FAILED -> "failed";
        };
    }

    private static int geographyPercent(CityLaunchRevision revision) {
        if (revision.getPrepState() == PrepState.DONE) {
            return 100;
        }
        return Math.round(revision.getPrepStage() / 6f * 100);
    }

    /** Canonical 6-stage offline prep pipeline label; {@code pending} for 0/unrecognized stages. */
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

    private record CityRow(Integer id, String slug, String name) {}
}
