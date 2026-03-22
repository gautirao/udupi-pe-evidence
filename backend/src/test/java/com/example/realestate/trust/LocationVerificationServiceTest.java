package com.example.realestate.trust;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Unit tests for the Haversine distance calculation in {@link TrustController#haversineMeters}.
 *
 * <p>All assertions use a 1-meter tolerance to account for floating-point rounding.
 */
class LocationVerificationServiceTest {

    /**
     * Same point: distance must be 0 (within floating-point tolerance).
     */
    @Test
    void haversine_samePoint_returnsZero() {
        double distance = TrustController.haversineMeters(13.3409, 74.7421, 13.3409, 74.7421);
        assertThat(distance).isCloseTo(0.0, within(0.001));
    }

    /**
     * Two points approximately 175m apart (lon offset 0.0018° at 13° latitude ≈ 175m):
     * result must be within the 200m threshold.
     */
    @Test
    void haversine_nearPoints_withinThreshold() {
        // At 13° latitude, 1° longitude ≈ 97 530 m, so 0.0018° ≈ 175 m
        double distance = TrustController.haversineMeters(13.3409, 74.7421, 13.3409, 74.7439);
        assertThat(distance).isLessThan(200.0);
        assertThat(distance).isGreaterThan(100.0); // sanity: it's a real non-trivial distance
    }

    /**
     * Two points approximately 390m apart (lon offset 0.004° at 13° latitude ≈ 390m):
     * result must exceed the 200m threshold.
     */
    @Test
    void haversine_farPoints_outsideThreshold() {
        // At 13° latitude, 0.004° longitude ≈ 390 m
        double distance = TrustController.haversineMeters(13.3409, 74.7421, 13.3409, 74.7461);
        assertThat(distance).isGreaterThan(200.0);
    }

    /**
     * Antipodal points (diametrically opposite on Earth) must produce ~20 015 km.
     */
    @Test
    void haversine_antipodalPoints_returnsHalfCircumference() {
        // Antipodal of (0, 0) is (0, 180) — half of Earth's circumference at equator
        double distance = TrustController.haversineMeters(0.0, 0.0, 0.0, 180.0);
        // Half circumference ~20,015 km
        assertThat(distance).isCloseTo(20_015_000.0, within(5_000.0));
    }
}
