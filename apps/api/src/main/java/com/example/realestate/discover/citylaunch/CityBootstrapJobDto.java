package com.example.realestate.discover.citylaunch;

import java.util.List;

/** Read model for {@link CityBootstrapJob}, returned by the admin bootstrap status endpoint
 *  (#2676 Slice A). {@code candidates} is populated only when {@code status ==
 *  DISAMBIGUATION_REQUIRED}. */
public record CityBootstrapJobDto(
        long jobId,
        String requestedName,
        BootstrapJobStatus status,
        Integer resolvedCityId,
        List<GeocodeCandidate> candidates,
        String failureCode,
        String failureReason) {

    static CityBootstrapJobDto from(CityBootstrapJob job, List<GeocodeCandidate> candidates) {
        return new CityBootstrapJobDto(
                job.getId(),
                job.getRequestedName(),
                job.getStatus(),
                job.getResolvedCityId(),
                job.getStatus() == BootstrapJobStatus.DISAMBIGUATION_REQUIRED ? candidates : null,
                job.getFailureCode(),
                job.getFailureReason());
    }
}
