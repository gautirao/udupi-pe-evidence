package com.example.realestate.discover;

import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryImportRunner;
import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real-PostGIS (Testcontainers), real-OSM-geometry calibration evidence for {@link
 * PolygonGeographicSafetyPolicy}'s (#2420) thresholds — ties the class Javadoc's "Threshold
 * evidence" numbers to executable assertions against the same real Bangalore ward geometry
 * imported by #2422/#2423 (the {@code bangalore-real-boundary-evidence.jsonl} fixture, via the
 * real {@link CanonicalBoundaryGeometryImportRunner}), rather than only against the synthetic
 * axis-aligned rectangles used by {@link PolygonGeographicSafetyPolicyIT} to calibrate the
 * counting/percentage arithmetic.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class PolygonGeographicSafetyPolicyRealGeometryCalibrationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private static final String AREA_WHITEFIELD = "IN|KA|Bengaluru|Whitefield";
    private static final String AREA_INDIRANAGAR = "IN|KA|Bengaluru|Indiranagar";
    private static final String AREA_HSR_LAYOUT = "IN|KA|Bengaluru|HSR Layout";
    private static final String AREA_JAYAMAHAL = "IN|KA|Bengaluru|Jayamahal";
    private static final String AREA_VASANTH_NAGAR = "IN|KA|Bengaluru|Vasanth Nagar";
    private static final String AREA_MARATHAHALLI = "IN|KA|Bengaluru|Marathahalli";

    // Both rectangles below start well west of Marathahalli's real western edge (real bbox
    // measured via ST_XMin/ST_XMax/ST_YMin/ST_YMax against the persisted geometry: lon
    // [77.6896353, 77.7050279], lat [12.9456404, 12.9570756]) and penetrate inward by a fixed
    // fraction of its real bbox width — a "shopper draws a polygon mostly elsewhere that clips
    // the edge of one more real ward" shape. The penetration depths (2% / 20%) and the resulting
    // measured real ST_Intersection values below were captured by directly querying
    // ST_Area(ST_Intersection(...)) against Marathahalli's real persisted geometry for a range of
    // penetration fractions (1%-30%); 2% and 20% were chosen because they land with comfortable
    // margin on either side of both MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON (5%) and
    // MEANINGFUL_OVERLAP_ABSOLUTE_M2 (50,000 m²) — not merely exceeding/missing them by a hair,
    // which would make the assertions brittle to sub-metre differences in a future OSM re-import.
    private static final String SLIVER_CLIP_INTO_MARATHAHALLI_WKT =
            "POLYGON((77.681939 12.945640,77.689943 12.945640,77.689943 12.957076,"
                    + "77.681939 12.957076,77.681939 12.945640))";
    private static final String MATERIAL_CLIP_INTO_MARATHAHALLI_WKT =
            "POLYGON((77.681939 12.945640,77.692714 12.945640,77.692714 12.957076,"
                    + "77.681939 12.957076,77.681939 12.945640))";

    private int importRealBangaloreWards() throws Exception {
        CanonicalBoundaryGeometryRepository repository =
                new CanonicalBoundaryGeometryRepository(jdbcTemplate, transactionManager);
        int cityId = jdbcTemplate.queryForObject(
                "SELECT id FROM public.cities WHERE slug = ?", Integer.class, "bangalore");
        jdbcTemplate.update("DELETE FROM canonical_boundary_geometry WHERE city_id = ?", cityId);

        String raw;
        try (InputStream in = new ClassPathResource("citylaunch/bangalore-real-boundary-evidence.jsonl")
                .getInputStream()) {
            raw = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        raw = raw.replace("\"city_id\": 999999", "\"city_id\": " + cityId);
        Path tmp = Files.createTempFile("bangalore-evidence", ".jsonl");
        Files.writeString(tmp, raw, StandardCharsets.UTF_8);

        CanonicalBoundaryGeometryImportRunner runner = new CanonicalBoundaryGeometryImportRunner(
                repository, new ObjectMapper(), "file:" + tmp.toAbsolutePath());
        runner.run(new DefaultApplicationArguments());
        return cityId;
    }

    /**
     * Real, genuinely-adjacent ward pair (Jayamahal/Vasanth Nagar, proven touching in {@code
     * CanonicalBoundaryGeometryBangaloreEvidenceIT}): their real persisted geometry produces an
     * {@code ST_Intersection} area of exactly 0 m² — a real incidental boundary touch, comfortably
     * under both {@link PolygonGeographicSafetyPolicy#MEANINGFUL_OVERLAP_ABSOLUTE_M2} and {@link
     * PolygonGeographicSafetyPolicy#MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON}, grounding the "tiny
     * touch never counts" calibration in real geometry rather than a synthetic rectangle.
     */
    @Test
    void realAdjacentWardPair_touchesWithZeroOverlapArea() throws Exception {
        int cityId = importRealBangaloreWards();

        Double intersectionM2 = jdbcTemplate.queryForObject(
                "SELECT ST_Area(ST_Intersection(a.geom, b.geom)::geography) "
                        + "FROM public.canonical_boundary_geometry a, public.canonical_boundary_geometry b "
                        + "WHERE a.city_id = ? AND a.entity_type = 'AREA' AND a.area_key = ? "
                        + "  AND b.city_id = ? AND b.entity_type = 'AREA' AND b.area_key = ?",
                Double.class, cityId, AREA_JAYAMAHAL, cityId, AREA_VASANTH_NAGAR);

        assertThat(intersectionM2).isEqualTo(0.0);
        assertThat(intersectionM2).isLessThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_ABSOLUTE_M2);
    }

    /**
     * The largest real 3-ward span in the imported evidence (Whitefield + Indiranagar + HSR
     * Layout — mutually non-overlapping, so their union area equals the sum of their individual
     * areas) stays under {@link PolygonGeographicSafetyPolicy#ABSOLUTE_SIZE_CEILING_M2} — the
     * concrete, executable basis for the class Javadoc's "ceiling sits just above the real
     * measured 3-ward extent" claim.
     */
    @Test
    void largestRealThreeWardSpan_staysUnderAbsoluteSizeCeiling() throws Exception {
        int cityId = importRealBangaloreWards();

        Double unionM2 = jdbcTemplate.queryForObject(
                "SELECT ST_Area(ST_Union(ST_Union(a.geom, b.geom), c.geom)::geography) "
                        + "FROM public.canonical_boundary_geometry a, "
                        + "     public.canonical_boundary_geometry b, "
                        + "     public.canonical_boundary_geometry c "
                        + "WHERE a.city_id = ? AND a.entity_type = 'AREA' AND a.area_key = ? "
                        + "  AND b.city_id = ? AND b.entity_type = 'AREA' AND b.area_key = ? "
                        + "  AND c.city_id = ? AND c.entity_type = 'AREA' AND c.area_key = ?",
                Double.class,
                cityId, AREA_WHITEFIELD, cityId, AREA_INDIRANAGAR, cityId, AREA_HSR_LAYOUT);

        assertThat(unionM2).isLessThan(PolygonGeographicSafetyPolicy.ABSOLUTE_SIZE_CEILING_M2);
        // Sanity: this is a real ~10 km² span, not a trivially-small one — proves the ceiling has
        // genuine headroom above a real 3-ward extent rather than merely exceeding a tiny number.
        assertThat(unionM2).isGreaterThan(9_000_000.0);
    }

    /**
     * Calibrates the "incidental" side of {@link
     * PolygonGeographicSafetyPolicy#MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON}/{@link
     * PolygonGeographicSafetyPolicy#MEANINGFUL_OVERLAP_ABSOLUTE_M2} against a real, non-zero clip
     * — the {@code realAdjacentWardPair_touchesWithZeroOverlapArea} test above only proves the
     * zero-overlap boundary-touch case; this proves a small but genuinely non-zero real clip into
     * Marathahalli (a ~2% penetration of its real bbox width) still measures as clearly incidental
     * under both thresholds.
     */
    @Test
    void smallRealClipIntoWard_measuresWellBelowMeaningfulOverlapThresholds() throws Exception {
        int cityId = importRealBangaloreWards();

        double[] measured = measureOverlap(cityId, SLIVER_CLIP_INTO_MARATHAHALLI_WKT);
        double overlapM2 = measured[0];
        double overlapFractionOfPolygon = measured[1];

        assertThat(overlapM2).isLessThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_ABSOLUTE_M2);
        assertThat(overlapFractionOfPolygon)
                .isLessThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON);
        // Comfortable margin, not a hair's-width pass: real measured value is ~900 m² / ~0.08%,
        // roughly 50x and 60x below the 50,000 m² / 5% thresholds respectively.
        assertThat(overlapM2).isLessThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_ABSOLUTE_M2 / 10);
        assertThat(overlapFractionOfPolygon)
                .isLessThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON / 10);
    }

    /**
     * Calibrates the "materially entered" side of the same thresholds against a real clip: a
     * ~20% penetration of Marathahalli's real bbox width measures well above both the absolute
     * and fractional meaningful-overlap thresholds, proving a shopper's polygon that genuinely
     * enters a real ward (not merely grazes its edge) is correctly counted as meaningful.
     */
    @Test
    void materialRealClipIntoWard_measuresWellAboveMeaningfulOverlapThresholds() throws Exception {
        int cityId = importRealBangaloreWards();

        double[] measured = measureOverlap(cityId, MATERIAL_CLIP_INTO_MARATHAHALLI_WKT);
        double overlapM2 = measured[0];
        double overlapFractionOfPolygon = measured[1];

        assertThat(overlapM2).isGreaterThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_ABSOLUTE_M2);
        assertThat(overlapFractionOfPolygon)
                .isGreaterThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON);
        // Comfortable margin: real measured value is ~133,500 m² / ~9%, roughly 2.5x the 50,000
        // m² absolute floor and 1.8x the 5% fractional floor — not a borderline pass.
        assertThat(overlapM2).isGreaterThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_ABSOLUTE_M2 * 2);
        assertThat(overlapFractionOfPolygon)
                .isGreaterThan(PolygonGeographicSafetyPolicy.MEANINGFUL_OVERLAP_FRACTION_OF_POLYGON * 1.5);
    }

    /** Returns {overlapM2, overlapFractionOfPolygon} for the given WKT against real Marathahalli. */
    private double[] measureOverlap(int cityId, String wkt) {
        Double polygonAreaM2 = jdbcTemplate.queryForObject(
                "SELECT ST_Area(ST_GeomFromText(?, 4326)::geography)", Double.class, wkt);
        Double overlapM2 = jdbcTemplate.queryForObject(
                "SELECT ST_Area(ST_Intersection(cbg.geom, ST_GeomFromText(?, 4326))::geography) "
                        + "FROM public.canonical_boundary_geometry cbg "
                        + "WHERE cbg.city_id = ? AND cbg.entity_type = 'AREA' AND cbg.area_key = ?",
                Double.class, wkt, cityId, AREA_MARATHAHALLI);
        return new double[] {overlapM2, overlapM2 / polygonAreaM2};
    }
}
