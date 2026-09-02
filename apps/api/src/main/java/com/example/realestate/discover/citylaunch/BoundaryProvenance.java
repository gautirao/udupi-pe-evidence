package com.example.realestate.discover.citylaunch;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Provenance for a {@link BoundaryGeometryResult.Found} boundary — where the geometry came from,
 * independent of the {@code areas}/{@code cities} tables' own {@code geometry_source}/{@code osm_*}
 * columns (#2422 deliberately keeps this a separate, additive table; see
 * {@code canonical_boundary_geometry}'s migration comment for why).
 */
public record BoundaryProvenance(
        String geometrySource,
        String osmElementType,
        Long osmElementId,
        Long osmVersion,
        LocalDate osmExtractDate,
        String osmSourceName,
        String osmSourceChecksumSha256,
        OffsetDateTime importedAt) {}
