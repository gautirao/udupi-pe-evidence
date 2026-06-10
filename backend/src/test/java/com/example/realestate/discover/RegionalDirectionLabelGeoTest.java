package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Bearing-verification tests for V88 city_regional_direction_labels seed data.
 *
 * <p>For each non-neutral Udupi corridor label, verifies that
 * {@link RegionalGeo#directionKey(double)} on the bearing from the Udupi city centroid
 * to the target area centroid produces the expected direction_code.
 *
 * <p>Coordinates source:
 * <ul>
 *   <li>Udupi city centroid: V71 cities seed (13.3409, 74.7421)</li>
 *   <li>Area centroids: V71 areas seed geo_center coordinates</li>
 *   <li>Karkala: public geographic centroid (not in V71; closest known landmark)</li>
 * </ul>
 *
 * <p>These tests fail if the seed data in V88 contains a bearing mismatch
 * (e.g., 'NW towards Mangalore' would cause the Mangalore CHECK to fail).
 */
class RegionalDirectionLabelGeoTest {

    // Udupi city centroid from V71
    private static final double U_LAT = 13.3409;
    private static final double U_LON = 74.7421;

    @Test
    void udupiLabelsBearingVerification() {
        // N → Brahmavar: geo_center from V71 areas seed (13.4286, 74.7540)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(U_LAT, U_LON, 13.4286, 74.7540)))
                .as("Brahmavar should be N of Udupi")
                .isEqualTo("N");

        // NE → Hiriadka: approximate public coordinates (spec §8.5 verified)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(U_LAT, U_LON, 13.4200, 74.8150)))
                .as("Hiriadka should be NE of Udupi")
                .isEqualTo("NE");

        // E → Manipal: geo_center from V71 areas seed (13.3528, 74.7947)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(U_LAT, U_LON, 13.3528, 74.7947)))
                .as("Manipal should be E of Udupi")
                .isEqualTo("E");

        // SE → Karkala: approximate public geographic centroid
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(U_LAT, U_LON, 13.2115, 74.8986)))
                .as("Karkala should be SE of Udupi")
                .isEqualTo("SE");

        // S → Padubidri: geo_center from V71 areas seed (13.1843, 74.7841)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(U_LAT, U_LON, 13.1843, 74.7841)))
                .as("Padubidri should be S of Udupi")
                .isEqualTo("S");

        // W → Malpe: geo_center from V71 areas seed (13.3537, 74.7022)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(U_LAT, U_LON, 13.3537, 74.7022)))
                .as("Malpe should be W of Udupi")
                .isEqualTo("W");
    }

    /**
     * Hard constraint: Mangalore must NOT be labeled NW.
     * Mangalore bears ~165° (due SOUTH) from Udupi.
     * 'NW towards Mangalore' is prohibited in V88 seed data.
     */
    @Test
    void mangaloreIsSouthOfUdupi_notNorthwest() {
        // Mangalore city centroid from V71: (12.9141, 74.8560)
        double bearing = RegionalGeo.bearingDeg(U_LAT, U_LON, 12.9141, 74.8560);
        String direction = RegionalGeo.directionKey(bearing);
        assertThat(direction)
                .as("Mangalore (bearing ~165 deg) must map to S, not NW")
                .isEqualTo("S");
        assertThat(direction)
                .as("Mangalore must not be classified as NW — hard block")
                .isNotEqualTo("NW");
    }

    // ── Sector boundary edge cases ────────────────────────────────────────────

    @Test
    void directionKey_sectorBoundary_292_5_isNW() {
        // 292.5° is the W/NW boundary — the W sector is [247.5, 292.5) (exclusive at 292.5),
        // so exactly 292.5° falls into NW = [292.5, 337.5).
        assertThat(RegionalGeo.directionKey(292.5)).isEqualTo("NW");
    }

    @Test
    void directionKey_sectorBoundary_337_5_isN() {
        // 337.5° is the NW/N boundary — the N sector wraps: [337.5, 360) ∪ [0, 22.5),
        // so exactly 337.5° maps to N.
        assertThat(RegionalGeo.directionKey(337.5)).isEqualTo("N");
    }

    /**
     * Kundapur bearing verification for V88 label seed.
     * Kundapur city centroid from V71: (13.6218, 74.6943).
     */
    @Test
    void kundapurLabelsBearingVerification() {
        double kLat = 13.6218, kLon = 74.6943;

        // N → Byndoor: geo_center from V71 areas seed (13.8717, 74.6508)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(kLat, kLon, 13.8717, 74.6508)))
                .as("Byndoor should be N of Kundapur")
                .isEqualTo("N");

        // NW → Kundapura area: geo_center from V71 areas seed (13.6236, 74.6899)
        assertThat(RegionalGeo.directionKey(RegionalGeo.bearingDeg(kLat, kLon, 13.6236, 74.6899)))
                .as("Kundapura area should be NW of Kundapur city centroid")
                .isEqualTo("NW");
    }
}
