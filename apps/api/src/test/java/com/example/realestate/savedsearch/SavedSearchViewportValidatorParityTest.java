package com.example.realestate.savedsearch;

import com.example.realestate.discover.BboxParser;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

/**
 * #2019 Slice A, review ruling 1 (reuse the #2016/#2015 discover helpers, no package-private
 * copies): proves by construction that {@link SavedSearchViewportValidator} rejects exactly the
 * inputs {@link BboxParser} rejects, for the same reason, with only the documented
 * {@code bbox_} -> {@code saved_search_viewport_} prefix remap. If someone re-introduces a
 * local copy of the range/ordering rules, or the discover helper gains a new rule, this
 * parity drifts and one of the rows below fails.
 */
class SavedSearchViewportValidatorParityTest {

    static Stream<Arguments> rejectedBounds() {
        return Stream.of(
                Arguments.of("south > north", 13.0, 74.0, 12.0, 75.0, "bbox_south_must_be_lte_north"),
                Arguments.of("west > east", 12.0, 75.0, 13.0, 74.0, "bbox_west_must_be_lte_east"),
                Arguments.of("south below -90", -91.0, 74.0, 13.0, 75.0, "bbox_lat_out_of_range"),
                Arguments.of("north above 90", 12.0, 74.0, 90.5, 75.0, "bbox_lat_out_of_range"),
                Arguments.of("west below -180", 12.0, -180.5, 13.0, 75.0, "bbox_lon_out_of_range"),
                Arguments.of("east above 180", 12.0, 74.0, 13.0, 180.5, "bbox_lon_out_of_range"),
                Arguments.of("NaN south", Double.NaN, 74.0, 13.0, 75.0, "bbox_values_must_be_finite"),
                Arguments.of("infinite east", 12.0, 74.0, 13.0, Double.POSITIVE_INFINITY, "bbox_values_must_be_finite"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejectedBounds")
    @DisplayName("every BboxParser rejection is reproduced with the same reason under the saved-search prefix")
    void rejectionParity(String label, double south, double west, double north, double east, String bboxReason) {
        // 1. The discover helper rejects this exact bbox with the expected reason.
        ResponseStatusException fromDiscover = catchThrowableOfType(
                () -> BboxParser.parse(south + "," + west + "," + north + "," + east),
                ResponseStatusException.class);
        assertThat(fromDiscover).as("BboxParser must reject: " + label).isNotNull();
        assertThat(fromDiscover.getReason()).isEqualTo(bboxReason);

        // 2. The saved-search validator rejects the same four values, 400, with the remapped reason.
        ResponseStatusException fromSavedSearch = catchThrowableOfType(
                () -> SavedSearchViewportValidator.validate(south, west, north, east),
                ResponseStatusException.class);
        assertThat(fromSavedSearch).as("SavedSearchViewportValidator must reject: " + label).isNotNull();
        assertThat(fromSavedSearch.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(fromSavedSearch.getReason())
                .isEqualTo("saved_search_viewport_" + bboxReason.substring("bbox_".length()));
    }

    @Test
    @DisplayName("a bbox BboxParser accepts is accepted by the saved-search validator too")
    void acceptanceParity() {
        assertThat(BboxParser.parse("12.9,77.5,13.1,77.7")).isNotNull();
        assertThatCode(() -> SavedSearchViewportValidator.validate(12.9, 77.5, 13.1, 77.7))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a missing bound is rejected locally before delegation (discrete JSON fields, not a CSV)")
    void missingBound_rejectedWithSavedSearchReason() {
        assertThatThrownBy(() -> SavedSearchViewportValidator.validate(12.9, 77.5, null, 77.7))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("saved_search_viewport_must_have_4_values");
    }
}
