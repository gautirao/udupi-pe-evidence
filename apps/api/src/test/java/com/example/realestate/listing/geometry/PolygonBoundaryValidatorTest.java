package com.example.realestate.listing.geometry;

import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.exception.ListingValidationException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Unit tests for PolygonBoundaryValidator.
 * Uses Mockito to mock ListingRepository for DB-level checks (steps 8–9).
 * No Testcontainers — DB-level checks are mocked.
 */
@ExtendWith(MockitoExtension.class)
class PolygonBoundaryValidatorTest {

    @Mock
    private ListingRepository listingRepository;

    private PolygonBoundaryValidator validator;

    /** Valid GeoJSON polygon within India bounding box (Udupi region). */
    private static final String VALID_POLYGON =
            "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.1],[74.0,13.0]]]}";

    @BeforeEach
    void setUp() {
        validator = new PolygonBoundaryValidator(listingRepository, new ObjectMapper());
    }

    // ─── Rule 1: Non-agri type ───────────────────────────────────────────────

    @Test
    void validate_nonAgriType_throwsBoundaryNonAgriType() {
        assertThatThrownBy(() -> validator.validate(VALID_POLYGON, "house"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors).hasSize(1);
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_NON_AGRI_TYPE");
                });
    }

    @Test
    void validate_nullPropertyType_throwsBoundaryNonAgriType() {
        assertThatThrownBy(() -> validator.validate(VALID_POLYGON, null))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_NON_AGRI_TYPE");
                });
    }

    // ─── Rule 2: Invalid JSON ────────────────────────────────────────────────

    @Test
    void validate_invalidJson_throwsBoundaryInvalidJson() {
        assertThatThrownBy(() -> validator.validate("not-json", "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_INVALID_JSON");
                });
    }

    // ─── Rule 3: Wrong GeoJSON type ─────────────────────────────────────────

    @Test
    void validate_multiPolygonType_throwsBoundaryInvalidType() {
        String multiPolygon =
                "{\"type\":\"MultiPolygon\",\"coordinates\":[[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.0]]]]}";
        assertThatThrownBy(() -> validator.validate(multiPolygon, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_INVALID_TYPE");
                });
    }

    // ─── Rule 4: Multiple rings (holes) ─────────────────────────────────────

    @Test
    void validate_polygonWithHole_throwsBoundaryHasHoles() {
        // Two rings: outer + hole
        String withHole =
                "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.0]],"
                + "[[74.02,13.02],[74.08,13.02],[74.08,13.08],[74.02,13.02]]]}";
        assertThatThrownBy(() -> validator.validate(withHole, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_HAS_HOLES");
                });
    }

    // ─── Rule 5: Too few vertices ────────────────────────────────────────────

    @Test
    void validate_ringWith3Coords_throwsBoundaryTooFewVertices() {
        // Only 3 coordinates — need at least 4
        String tooFew =
                "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.0,13.0]]]}";
        assertThatThrownBy(() -> validator.validate(tooFew, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_TOO_FEW_VERTICES");
                });
    }

    // ─── Rule 6: Ring not closed ─────────────────────────────────────────────

    @Test
    void validate_unclosedRing_throwsBoundaryNotClosed() {
        // 4 coords but first != last
        String unclosed =
                "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.1]]]}";
        assertThatThrownBy(() -> validator.validate(unclosed, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_NOT_CLOSED");
                });
    }

    // ─── Rule 7: Outside India bounding box ──────────────────────────────────

    @Test
    void validate_coordOutsideIndia_throwsBoundaryOutsideIndia() {
        // London coordinates — outside India
        String outsideIndia =
                "{\"type\":\"Polygon\",\"coordinates\":[[[-0.1,51.5],[0.1,51.5],[0.1,51.6],[-0.1,51.6],[-0.1,51.5]]]}";
        assertThatThrownBy(() -> validator.validate(outsideIndia, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_OUTSIDE_INDIA");
                });
    }

    // ─── Rule 8: ST_IsValid = false (mock) ───────────────────────────────────

    @Test
    void validate_stIsValidFalse_throwsBoundaryInvalidGeometry() {
        when(listingRepository.isBoundaryGeometryValid(anyString())).thenReturn(false);

        assertThatThrownBy(() -> validator.validate(VALID_POLYGON, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors).hasSize(1);
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_INVALID_GEOMETRY");
                });
    }

    // ─── Rule 9: Area > 100 km² (mock) ───────────────────────────────────────

    @Test
    void validate_areaTooLarge_throwsBoundaryTooLarge() {
        when(listingRepository.isBoundaryGeometryValid(anyString())).thenReturn(true);
        when(listingRepository.computeBoundaryAreaSqm(anyString())).thenReturn(2e8); // 200 km²

        assertThatThrownBy(() -> validator.validate(VALID_POLYGON, "agricultural_land"))
                .isInstanceOf(ListingValidationException.class)
                .satisfies(ex -> {
                    var errors = ((ListingValidationException) ex).getErrors();
                    assertThat(errors).hasSize(1);
                    assertThat(errors.get(0).get("code")).isEqualTo("BOUNDARY_TOO_LARGE");
                });
    }

    // ─── Happy path ───────────────────────────────────────────────────────────

    @Test
    void validate_validPolygonAgriType_noException() {
        when(listingRepository.isBoundaryGeometryValid(anyString())).thenReturn(true);
        when(listingRepository.computeBoundaryAreaSqm(anyString())).thenReturn(50000.0); // 0.05 km²

        assertThatNoException().isThrownBy(
                () -> validator.validate(VALID_POLYGON, "agricultural_land"));
    }
}
