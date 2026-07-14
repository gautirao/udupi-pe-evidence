package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pure unit tests for {@link CityRegionProjection} — no Spring, no DB (#1882).
 *
 * <p>Method names are a committed contract with the qa/code-review specialists reviewing
 * this slice; do not rename without coordinating.
 */
class CityRegionProjectionTest {

    @Test
    void centralCardinal4CollapsesDiagonalsIntoCardinals() {
        // Outside the CENTRAL radius, diagonals collapse onto the adjacent cardinal.
        assertEquals("E", CityRegionProjection.projectRegionKey(20.0, "NE", "CENTRAL_CARDINAL_4", 4));
        assertEquals("S", CityRegionProjection.projectRegionKey(20.0, "SE", "CENTRAL_CARDINAL_4", 4));
        assertEquals("W", CityRegionProjection.projectRegionKey(20.0, "SW", "CENTRAL_CARDINAL_4", 4));
        assertEquals("N", CityRegionProjection.projectRegionKey(20.0, "NW", "CENTRAL_CARDINAL_4", 4));
        // Cardinals pass through unchanged.
        assertEquals("N", CityRegionProjection.projectRegionKey(20.0, "N", "CENTRAL_CARDINAL_4", 4));
        assertEquals("E", CityRegionProjection.projectRegionKey(20.0, "E", "CENTRAL_CARDINAL_4", 4));
        assertEquals("S", CityRegionProjection.projectRegionKey(20.0, "S", "CENTRAL_CARDINAL_4", 4));
        assertEquals("W", CityRegionProjection.projectRegionKey(20.0, "W", "CENTRAL_CARDINAL_4", 4));
        // Within the CENTRAL radius, any direction still maps to CENTRAL.
        assertEquals("CENTRAL", CityRegionProjection.projectRegionKey(2.0, "NE", "CENTRAL_CARDINAL_4", 4));
    }

    @Test
    void centralCardinal8KeepsAllEight() {
        for (String dir : List.of("N", "NE", "E", "SE", "S", "SW", "W", "NW")) {
            assertEquals(dir, CityRegionProjection.projectRegionKey(20.0, dir, "CENTRAL_CARDINAL_8", 8));
        }
        // Within radius still collapses to CENTRAL regardless of direction.
        assertEquals("CENTRAL", CityRegionProjection.projectRegionKey(5.0, "NW", "CENTRAL_CARDINAL_8", 8));
    }

    @Test
    void directional8HasNoCentralBucket_centralFolds() {
        // Even distance=0 (dead center) still maps to the raw direction key, never CENTRAL.
        assertEquals("N", CityRegionProjection.projectRegionKey(0.0, "N", "DIRECTIONAL_8", 8));
        assertEquals("SE", CityRegionProjection.projectRegionKey(1.0, "SE", "DIRECTIONAL_8", 8));
        assertEquals("SE", CityRegionProjection.projectRegionKey(50.0, "SE", "DIRECTIONAL_8", 8));

        assertEquals(
                List.of("N", "E", "S", "W", "NE", "SE", "SW", "NW"),
                CityRegionProjection.canonicalRegionOrder("DIRECTIONAL_8"));
    }

    @Test
    void centralRuleUsesDistanceKmVsRadius_boundary() {
        // distance == radius (inclusive boundary) -> CENTRAL
        assertEquals("CENTRAL", CityRegionProjection.projectRegionKey(8.0, "N", "CENTRAL_CARDINAL_8", 8));
        // distance just over radius -> directional
        assertEquals("N", CityRegionProjection.projectRegionKey(8.0001, "N", "CENTRAL_CARDINAL_8", 8));
        // distance 0 -> CENTRAL
        assertEquals("CENTRAL", CityRegionProjection.projectRegionKey(0.0, "N", "CENTRAL_CARDINAL_8", 8));

        assertThrows(IllegalArgumentException.class,
                () -> CityRegionProjection.projectRegionKey(-1.0, "N", "CENTRAL_CARDINAL_8", 8));
    }

    @Test
    void deterministicSameInputsSameOutput() {
        String first = CityRegionProjection.projectRegionKey(12.34, "SW", "CENTRAL_CARDINAL_4", 4);
        String second = CityRegionProjection.projectRegionKey(12.34, "SW", "CENTRAL_CARDINAL_4", 4);
        assertEquals(first, second);
        assertEquals("W", first);

        // Canonical order + display order are stable across repeated calls too.
        assertEquals(
                CityRegionProjection.canonicalRegionOrder("CENTRAL_CARDINAL_8"),
                CityRegionProjection.canonicalRegionOrder("CENTRAL_CARDINAL_8"));
    }

    @Test
    void canonicalRegionSetsAndDisplayOrder() {
        assertEquals(
                List.of("CENTRAL", "N", "E", "S", "W"),
                CityRegionProjection.canonicalRegionOrder("CENTRAL_CARDINAL_4"));
        assertEquals(
                List.of("CENTRAL", "N", "E", "S", "W", "NE", "SE", "SW", "NW"),
                CityRegionProjection.canonicalRegionOrder("CENTRAL_CARDINAL_8"));

        assertEquals(0, CityRegionProjection.displayOrder("CENTRAL"));
        assertEquals(1, CityRegionProjection.displayOrder("N"));
        assertEquals(2, CityRegionProjection.displayOrder("E"));
        assertEquals(3, CityRegionProjection.displayOrder("S"));
        assertEquals(4, CityRegionProjection.displayOrder("W"));
        assertEquals(5, CityRegionProjection.displayOrder("NE"));
        assertEquals(6, CityRegionProjection.displayOrder("SE"));
        assertEquals(7, CityRegionProjection.displayOrder("SW"));
        assertEquals(8, CityRegionProjection.displayOrder("NW"));

        assertThrows(IllegalArgumentException.class, () -> CityRegionProjection.displayOrder("BOGUS"));
    }
}
