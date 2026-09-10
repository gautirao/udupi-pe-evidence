package com.example.realestate.discover;

import java.util.List;

/**
 * The committed geographic result scope a relaxation-preview count is computed over (#2454,
 * #2018 slice 4). Exactly one of the three #2016 result-scope kinds, mirroring the frontend's
 * {@code ResultScope} discriminated union.
 *
 * <p>Every variant is validated at construction so {@link RelaxationPreviewsService} can never be
 * handed a scope it would have to silently widen: an empty area-key list, a degenerate polygon or
 * a missing viewport are rejected here rather than turned into a city-wide answer downstream.
 *
 * <p>Which variant a caller may construct is decided at the HTTP boundary, not here:
 * {@link RelaxationPreviewsController} (anonymous) builds {@link AreaKeys} and {@link Viewport}
 * only, and {@link PolygonRelaxationPreviewsController} (authenticated, behind the same
 * {@link PolygonGeographicSafetyPolicy} as the listings path) is the sole producer of
 * {@link Polygon}.
 */
public sealed interface RelaxationScope {

    enum Kind { AREA_SET, POLYGON, VIEWPORT }

    Kind kind();

    /** Committed AREA / AREA_SET canonical keys; already de-duplicated and capped by the caller. */
    record AreaKeys(List<String> areaKeys) implements RelaxationScope {
        public AreaKeys {
            if (areaKeys == null || areaKeys.isEmpty()) {
                throw new IllegalArgumentException("area-key scope must not be empty");
            }
            areaKeys = List.copyOf(areaKeys);
        }

        @Override
        public Kind kind() {
            return Kind.AREA_SET;
        }
    }

    /** A committed, policy-validated POLYGON as {@code [[lat, lon], ...]}. */
    record Polygon(List<List<Double>> polygon) implements RelaxationScope {
        public Polygon {
            if (polygon == null || polygon.size() < 3) {
                throw new IllegalArgumentException("polygon scope needs at least 3 vertices");
            }
            polygon = List.copyOf(polygon);
        }

        @Override
        public Kind kind() {
            return Kind.POLYGON;
        }
    }

    /** A committed VIEWPORT bbox, already parsed and span-checked by {@link BboxParser}. */
    record Viewport(DiscoverListingPredicateBuilder.Bbox bounds) implements RelaxationScope {
        public Viewport {
            if (bounds == null) {
                throw new IllegalArgumentException("viewport scope needs bounds");
            }
        }

        @Override
        public Kind kind() {
            return Kind.VIEWPORT;
        }
    }
}
