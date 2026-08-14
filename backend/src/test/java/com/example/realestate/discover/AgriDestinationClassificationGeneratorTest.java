package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit test for the geo-mapping {@link AgriDestinationClassificationGenerator} delegates to
 * {@link RegionalGeo} (#2151 PR A) — bearing-to-direction and distance-to-band boundary semantics.
 *
 * <p>{@link AgriDestinationClassificationGenerator} performs NO mapping logic of its own beyond
 * calling {@link RegionalGeo#bearingDeg}, {@link RegionalGeo#directionKey}, {@link
 * RegionalGeo#haversineKm}, and {@link RegionalGeo#distanceBandKey} — so this test exercises {@link
 * RegionalGeo} directly (same package, package-private access) rather than standing up the full
 * generator (repository) for what is, at the boundary, a pure-function question.
 *
 * <p>Boundary semantics are read from {@link RegionalGeo}'s ACTUAL implementation, not assumed:
 * <ul>
 *   <li>Direction sectors are lower-inclusive/upper-exclusive, EXCEPT the N sector which wraps
 *       {@code [337.5, 360) ∪ [0, 22.5)}. A bearing exactly ON a boundary value belongs to the
 *       sector for which that value is the LOWER bound (e.g. {@code 22.5} -&gt; NE, not N).</li>
 *   <li>Distance bands are lower-inclusive/upper-exclusive: {@code 10.0 -> "10_25"}, {@code
 *       25.0 -> "25_50"}, {@code 50.0 -> "50_up"} — a value exactly ON a boundary belongs to the
 *       band ABOVE it, matching {@link RegionalGeo}'s own javadoc examples verbatim.</li>
 * </ul>
 */
class AgriDestinationClassificationGeneratorTest {

    // ── Bearing -> direction_key, exactly on every one of the 8 sector boundaries ───────────────

    @ParameterizedTest(name = "bearing {0} degrees -> direction {1}")
    @DisplayName("bearings exactly on sector boundaries map to the expected direction_key")
    @CsvSource({
            "0.0,     N",   // inside the N wrap [337.5,360) U [0,22.5)
            "22.5,    NE",  // lower-inclusive bound of NE
            "67.5,    E",   // lower-inclusive bound of E
            "112.5,   SE",  // lower-inclusive bound of SE
            "157.5,   S",   // lower-inclusive bound of S
            "202.5,   SW",  // lower-inclusive bound of SW
            "247.5,   W",   // lower-inclusive bound of W
            "292.5,   NW",  // lower-inclusive bound of NW
            "337.5,   N",   // lower-inclusive bound of the N wrap's upper segment
    })
    void bearingBoundaries_mapToExpectedDirectionKey(double bearingDeg, String expectedDirectionKey) {
        assertThat(RegionalGeo.directionKey(bearingDeg)).isEqualTo(expectedDirectionKey);
    }

    // ── Distance -> distance_band_key, exactly on every band boundary ──────────────────────────

    @ParameterizedTest(name = "distance {0} km -> band {1}")
    @DisplayName("distances exactly on band boundaries map to the expected distance_band_key")
    @CsvSource({
            "0.0,   0_10",
            "9.999, 0_10",
            "10.0,  10_25",  // lower-inclusive bound of 10_25 (RegionalGeo javadoc: '10.0 -> 10_25')
            "25.0,  25_50",  // lower-inclusive bound of 25_50 (RegionalGeo javadoc: '25.0 -> 25_50')
            "50.0,  50_up",  // lower-inclusive bound of 50_up (RegionalGeo javadoc: '50.0 -> 50_up')
            "1000.0, 50_up",
    })
    void distanceBoundaries_mapToExpectedDistanceBandKey(double distanceKm, String expectedBandKey) {
        assertThat(RegionalGeo.distanceBandKey(distanceKm)).isEqualTo(expectedBandKey);
    }

    // ── End-to-end: haversine + bearing feed directly into the same boundary mapping ───────────

    @DisplayName("a destination exactly north of the origin at a known distance round-trips through "
            + "haversineKm/bearingDeg into the expected direction/band pair")
    @org.junit.jupiter.api.Test
    void haversineAndBearing_feedDirectlyIntoBoundaryMapping() {
        // Origin at the equator/prime-meridian-adjacent point used elsewhere in this test suite's
        // fixtures; destination displaced ~11.1 km due north (0.1 degree of latitude).
        double originLat = 13.0;
        double originLon = 74.7;
        double destLat = 13.1;
        double destLon = 74.7;

        double distanceKm = RegionalGeo.haversineKm(originLat, originLon, destLat, destLon);
        double bearingDeg = RegionalGeo.bearingDeg(originLat, originLon, destLat, destLon);

        assertThat(bearingDeg).isCloseTo(0.0, org.assertj.core.data.Offset.offset(0.5));
        assertThat(RegionalGeo.directionKey(bearingDeg)).isEqualTo("N");
        assertThat(distanceKm).isCloseTo(11.1, org.assertj.core.data.Offset.offset(0.5));
        assertThat(RegionalGeo.distanceBandKey(distanceKm)).isEqualTo("10_25");
    }
}
