package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit test (no Spring, no DB) for {@link NavigationNodeResponse#forRoot}'s bounds derivation
 * (#2083 RC_A part 3). Before this fix, {@code forRoot} always passed {@code bounds = null} by
 * design — the client's camera effect null-guarded on it and returned to the city root re-fit
 * NOTHING, leaving the map framed on the previously-viewed area. This proves root now carries a
 * real, server-derived bounds field: the union (min/max) and centroid (arithmetic mean of centres)
 * of its direct children's own bounds — mirroring {@code NavigationTreeGenerator#computeBounds}'s
 * fold rather than inventing a second bounds-derivation rule.
 */
class NavigationNodeResponseRootBoundsTest {

    @Test
    @DisplayName("forRoot: bounds is the union of two root-level children's bounds, "
            + "centre is the arithmetic mean of their centres")
    void forRoot_bounds_unionsChildrenBounds() {
        // childA: centre (10.0, 20.0), box [9.0,19.0]-[11.0,21.0]
        NavigationNode childA = node(1L, null, "CLUSTER", "child-a",
                bd(10.0), bd(20.0), bd(9.0), bd(19.0), bd(11.0), bd(21.0));
        // childB: centre (14.0, 24.0), box [13.0,23.0]-[15.0,25.0]
        NavigationNode childB = node(2L, null, "CLUSTER", "child-b",
                bd(14.0), bd(24.0), bd(13.0), bd(23.0), bd(15.0), bd(25.0));

        NavigationGraph graph = NavigationGraph.build("testcity", 1L, List.of(childA, childB));

        NavigationNodeResponse root = NavigationNodeResponse.forRoot("testcity", graph);

        assertThat(root.bounds()).as("root bounds must now be populated, not null").isNotNull();
        // Union: min across both boxes, max across both boxes.
        assertThat(root.bounds().minLat()).isEqualTo(9.0);
        assertThat(root.bounds().minLon()).isEqualTo(19.0);
        assertThat(root.bounds().maxLat()).isEqualTo(15.0);
        assertThat(root.bounds().maxLon()).isEqualTo(25.0);
        // Centroid: arithmetic mean of the two children's OWN centres — (10+14)/2=12, (20+24)/2=22.
        assertThat(root.bounds().centreLat()).isEqualTo(12.0);
        assertThat(root.bounds().centreLon()).isEqualTo(22.0);
    }

    @Test
    @DisplayName("forRoot: a single root-level child's bounds pass through as root's own bounds")
    void forRoot_bounds_singleChild_passesThrough() {
        NavigationNode onlyChild = node(1L, null, "AREA", "only-child",
                bd(5.0), bd(6.0), bd(4.5), bd(5.5), bd(5.5), bd(6.5));

        NavigationGraph graph = NavigationGraph.build("testcity", 1L, List.of(onlyChild));

        NavigationNodeResponse root = NavigationNodeResponse.forRoot("testcity", graph);

        assertThat(root.bounds()).isNotNull();
        assertThat(root.bounds().centreLat()).isEqualTo(5.0);
        assertThat(root.bounds().centreLon()).isEqualTo(6.0);
        assertThat(root.bounds().minLat()).isEqualTo(4.5);
        assertThat(root.bounds().maxLat()).isEqualTo(5.5);
    }

    @Test
    @DisplayName("forRoot: a city with zero root children returns null bounds — honest absence, "
            + "not a fabricated bounding box")
    void forRoot_bounds_noChildren_isNull() {
        NavigationGraph graph = NavigationGraph.build("emptycity", 1L, List.of());

        NavigationNodeResponse root = NavigationNodeResponse.forRoot("emptycity", graph);

        assertThat(root.bounds()).isNull();
        assertThat(root.children()).isEmpty();
    }

    // ── Fixture helpers (mirrors NavigationGraphTest's pattern) ─────────────────────────────────

    private static NavigationNode node(long id, Long parentId, String nodeType, String nodeKey,
                                        BigDecimal centreLat, BigDecimal centreLon,
                                        BigDecimal minLat, BigDecimal minLon,
                                        BigDecimal maxLat, BigDecimal maxLon) {
        NavigationNode n = new NavigationNode(
                1, "north", nodeType, parentId, nodeKey, null,
                List.of("area-1"), nodeKey, 1, 0, List.of(), 1,
                centreLat, centreLon, minLat, minLon, maxLat, maxLon,
                "fp", Instant.parse("2026-01-01T00:00:00Z"));
        return withId(n, id);
    }

    private static BigDecimal bd(double v) {
        return BigDecimal.valueOf(v);
    }

    /** Reflection-stamped surrogate id — {@link NavigationNode#getId()} is only ever assigned by
     *  JPA on persist; mirrors {@code NavigationGraphTest#withId}. */
    private static NavigationNode withId(NavigationNode n, long id) {
        try {
            Field f = NavigationNode.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(n, id);
            return n;
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
