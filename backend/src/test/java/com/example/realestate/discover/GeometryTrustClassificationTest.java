package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link GeometryTrust#classify} (#1887 PR1) — pure logic, no DB dependency.
 * Covers AC3's VERIFIED/PROVISIONAL/MISSING rules, including the two edge cases called out by
 * risk R4/R2: a NULL geometry_source (legacy bbox seed) must classify PROVISIONAL, never MISSING;
 * and a partial bbox must classify PROVISIONAL, never VERIFIED.
 */
class GeometryTrustClassificationTest {

    @Test
    void verifiedRequiresTrustedSourceAndFullBbox() {
        assertThat(GeometryTrust.classify("OSM", 13.34, 74.74, 13.20, 74.60, 13.50, 74.90))
                .isEqualTo(GeometryTrust.VERIFIED);
        assertThat(GeometryTrust.classify("MANUAL", 13.34, 74.74, 13.20, 74.60, 13.50, 74.90))
                .isEqualTo(GeometryTrust.VERIFIED);
    }

    @Test
    void nullGeometrySourceWithCentreIsProvisional_notMissing() {
        // Risk R4: NULL geometry_source is the legacy bbox seed convention (V113) — must NOT be
        // misread as MISSING, which would wrongly flag every pre-#1882 seeded area as invalid.
        assertThat(GeometryTrust.classify(null, 13.34, 74.74, 13.20, 74.60, 13.50, 74.90))
                .isEqualTo(GeometryTrust.PROVISIONAL);
    }

    @Test
    void nullGeometrySourceWithNoBboxIsProvisional() {
        assertThat(GeometryTrust.classify(null, 13.34, 74.74, null, null, null, null))
                .isEqualTo(GeometryTrust.PROVISIONAL);
    }

    @Test
    void trustedSourceButPartialBboxIsProvisional_notVerified() {
        // min_lat present but max_lon missing — an incomplete bbox never earns VERIFIED, even
        // with a trusted geometry_source.
        assertThat(GeometryTrust.classify("OSM", 13.34, 74.74, 13.20, 74.60, 13.50, null))
                .isEqualTo(GeometryTrust.PROVISIONAL);
    }

    @Test
    void trustedSourceWithNoBboxAtAllIsProvisional() {
        assertThat(GeometryTrust.classify("OSM", 13.34, 74.74, null, null, null, null))
                .isEqualTo(GeometryTrust.PROVISIONAL);
    }

    @Test
    void untrustedSourceWithFullBboxIsProvisional_notVerified() {
        assertThat(GeometryTrust.classify("USER_ENTERED", 13.34, 74.74, 13.20, 74.60, 13.50, 74.90))
                .isEqualTo(GeometryTrust.PROVISIONAL);
    }

    @Test
    void missingWhenCentreLatAbsent() {
        assertThat(GeometryTrust.classify("OSM", null, 74.74, 13.20, 74.60, 13.50, 74.90))
                .isEqualTo(GeometryTrust.MISSING);
    }

    @Test
    void missingWhenCentreLonAbsent() {
        assertThat(GeometryTrust.classify("OSM", 13.34, null, 13.20, 74.60, 13.50, 74.90))
                .isEqualTo(GeometryTrust.MISSING);
    }

    @Test
    void missingWhenNoGeometryAtAll() {
        assertThat(GeometryTrust.classify(null, null, null, null, null, null, null))
                .isEqualTo(GeometryTrust.MISSING);
    }
}
