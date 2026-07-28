package com.example.realestate.discover.navigation;

import java.util.List;

/**
 * One of a city's primary directional regions, plus its member canonical areas.
 *
 * <p>{@code displayOrder}/{@code displayLabel} (#1956 D4) are the region's CANONICAL ordering/label
 * from {@code city_regions} (see {@code CanonicalGeographyReader.CanonicalCityRegion}), used to
 * number the region's DIRECTION root node in canonical region order (CENTRAL, N, E, S, W) rather
 * than the alphabetical {@code region_key} sort {@link NavigationTreeGenerator#generateCity} uses
 * for processing determinism. The 2-arg constructor defaults both to {@code regionKey} itself —
 * back-compat for callers (mostly unit tests) that don't have/need a canonical region row; ties in
 * {@code displayOrder} (e.g. every region defaulting to the same value) are broken deterministically
 * by {@code regionKey} in {@link NavigationTreeGenerator#generateCity}.
 */
public record GeneratorRegionInput(String regionKey, List<GeneratorArea> members, int displayOrder, String displayLabel) {

    public GeneratorRegionInput(String regionKey, List<GeneratorArea> members) {
        this(regionKey, members, 0, regionKey);
    }
}
