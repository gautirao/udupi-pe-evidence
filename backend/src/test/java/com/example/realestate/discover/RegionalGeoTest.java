package com.example.realestate.discover;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

/**
 * Unit tests for {@link RegionalGeo} — bearing, distance, sector, and band math.
 *
 * Reference values derived from known coordinates and online haversine/bearing calculators.
 */
class RegionalGeoTest {

    // ── haversineKm ───────────────────────────────────────────────────────────

    @Test
    void haversineKm_samePoint_returnsZero() {
        assertThat(RegionalGeo.haversineKm(13.3409, 74.7421, 13.3409, 74.7421))
                .isEqualTo(0.0);
    }

    @Test
    void haversineKm_udupiToMangalore_approx49km() {
        // Udupi (13.3409, 74.7421) → Mangalore (12.9141, 74.8560)
        // Great-circle haversine ≈ 49 km (road distance is longer due to terrain)
        double d = RegionalGeo.haversineKm(13.3409, 74.7421, 12.9141, 74.8560);
        assertThat(d).isCloseTo(49.0, within(1.0));
    }

    @Test
    void haversineKm_knownPairEquatorToEquator() {
        // Two points on the equator 1° apart ≈ 111.195 km
        double d = RegionalGeo.haversineKm(0.0, 0.0, 0.0, 1.0);
        assertThat(d).isCloseTo(111.195, within(0.1));
    }

    @Test
    void haversineKm_isSymmetric() {
        double d1 = RegionalGeo.haversineKm(13.3409, 74.7421, 12.9141, 74.8560);
        double d2 = RegionalGeo.haversineKm(12.9141, 74.8560, 13.3409, 74.7421);
        assertThat(d1).isCloseTo(d2, within(1e-9));
    }

    // ── bearingDeg ────────────────────────────────────────────────────────────

    @Test
    void bearingDeg_dueNorth_returns0() {
        // Moving north: lat increases, lon fixed
        double b = RegionalGeo.bearingDeg(0.0, 0.0, 1.0, 0.0);
        assertThat(b).isCloseTo(0.0, within(0.01));
    }

    @Test
    void bearingDeg_dueEast_returns90() {
        double b = RegionalGeo.bearingDeg(0.0, 0.0, 0.0, 1.0);
        assertThat(b).isCloseTo(90.0, within(0.01));
    }

    @Test
    void bearingDeg_dueSouth_returns180() {
        double b = RegionalGeo.bearingDeg(1.0, 0.0, 0.0, 0.0);
        assertThat(b).isCloseTo(180.0, within(0.01));
    }

    @Test
    void bearingDeg_dueWest_returns270() {
        double b = RegionalGeo.bearingDeg(0.0, 1.0, 0.0, 0.0);
        assertThat(b).isCloseTo(270.0, within(0.01));
    }

    @Test
    void bearingDeg_resultNormalisedToZeroTo360() {
        // Any bearing must be in [0, 360)
        double b = RegionalGeo.bearingDeg(13.0, 74.5, 12.0, 75.5);
        assertThat(b).isGreaterThanOrEqualTo(0.0).isLessThan(360.0);
    }

    // ── directionKey — all 8 sectors and boundary cases ─────────────────────

    @ParameterizedTest(name = "bearing={0} → {1}")
    @CsvSource({
            // N sector: wraps [337.5, 360) ∪ [0, 22.5)
            "0.0,   N",
            "22.4,  N",
            "337.5, N",
            "359.9, N",
            // NE sector: [22.5, 67.5)
            "22.5,  NE",
            "45.0,  NE",
            "67.4,  NE",
            // E sector: [67.5, 112.5)
            "67.5,  E",
            "90.0,  E",
            "112.4, E",
            // SE sector: [112.5, 157.5)
            "112.5, SE",
            "135.0, SE",
            "157.4, SE",
            // S sector: [157.5, 202.5)
            "157.5, S",
            "180.0, S",
            "202.4, S",
            // SW sector: [202.5, 247.5)
            "202.5, SW",
            "225.0, SW",
            "247.4, SW",
            // W sector: [247.5, 292.5)
            "247.5, W",
            "270.0, W",
            "292.4, W",
            // NW sector: [292.5, 337.5)
            "292.5, NW",
            "315.0, NW",
            "337.4, NW",
    })
    void directionKey_allSectorsAndBoundaries(double bearing, String expectedKey) {
        assertThat(RegionalGeo.directionKey(bearing)).isEqualTo(expectedKey);
    }

    @Test
    void directionKey_negativeBearing_throwsIllegalArgument() {
        assertThatThrownBy(() -> RegionalGeo.directionKey(-0.1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void directionKey_360_throwsIllegalArgument() {
        assertThatThrownBy(() -> RegionalGeo.directionKey(360.0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ── distanceBandKey — band ranges and boundaries ─────────────────────────

    @ParameterizedTest(name = "distance={0} → {1}")
    @CsvSource({
            "0.0,   0_10",
            "5.0,   0_10",
            "9.999, 0_10",
            // Lower-inclusive: exactly 10 → [10_25)
            "10.0,  10_25",
            "15.0,  10_25",
            "24.999,10_25",
            // Lower-inclusive: exactly 25 → [25_50)
            "25.0,  25_50",
            "40.0,  25_50",
            "49.999,25_50",
            // Lower-inclusive: exactly 50 → [50_up, ∞)
            "50.0,  50_up",
            "100.0, 50_up",
            "999.9, 50_up",
    })
    void distanceBandKey_bandsAndBoundaries(double distance, String expectedKey) {
        assertThat(RegionalGeo.distanceBandKey(distance)).isEqualTo(expectedKey);
    }

    @Test
    void distanceBandKey_negativeDistance_throwsIllegalArgument() {
        assertThatThrownBy(() -> RegionalGeo.distanceBandKey(-0.1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ── Integration: bearing + direction for known coords ────────────────────

    @Test
    void directionKey_udupiToKundapur_isNorth() {
        // Kundapur (13.6218, 74.6943) is north of Udupi (13.3409, 74.7421)
        double bearing = RegionalGeo.bearingDeg(13.3409, 74.7421, 13.6218, 74.6943);
        assertThat(RegionalGeo.directionKey(bearing)).isEqualTo("N");
    }

    @Test
    void directionKey_udupiToMangalore_isSouth() {
        // Mangalore (12.9141, 74.8560) is south of Udupi (13.3409, 74.7421)
        double bearing = RegionalGeo.bearingDeg(13.3409, 74.7421, 12.9141, 74.8560);
        assertThat(RegionalGeo.directionKey(bearing)).isEqualTo("S");
    }

    @Test
    void distanceBandKey_udupiToMangalore_is25_50() {
        // ≈49 km → [25_50) band (< 50)
        double d = RegionalGeo.haversineKm(13.3409, 74.7421, 12.9141, 74.8560);
        assertThat(RegionalGeo.distanceBandKey(d)).isEqualTo("25_50");
    }
}
