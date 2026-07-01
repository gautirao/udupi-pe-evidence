package com.example.realestate.listing.api;

import com.example.realestate.ai.PropertyType;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Round-trip tests for the M38-13A (#1626) additive PropertyType enum values: VILLA and
 * RESIDENTIAL_PLOT. Confirms {@code fromValue}/{@code getValue} accept and re-emit the new
 * wire values, and that no pre-existing enum value's behaviour changed.
 */
class PropertyTypeResidentialRoundTripTest {

    @Test
    void villa_roundTrips() {
        assertThat(PropertyType.fromValue("villa")).isEqualTo(PropertyType.VILLA);
        assertThat(PropertyType.VILLA.getValue()).isEqualTo("villa");
    }

    @Test
    void villa_isCaseInsensitive() {
        assertThat(PropertyType.fromValue("VILLA")).isEqualTo(PropertyType.VILLA);
        assertThat(PropertyType.fromValue("Villa")).isEqualTo(PropertyType.VILLA);
    }

    @Test
    void residentialPlot_roundTrips() {
        assertThat(PropertyType.fromValue("residential_plot")).isEqualTo(PropertyType.RESIDENTIAL_PLOT);
        assertThat(PropertyType.RESIDENTIAL_PLOT.getValue()).isEqualTo("residential_plot");
    }

    @Test
    void residentialPlot_isCaseInsensitive() {
        assertThat(PropertyType.fromValue("RESIDENTIAL_PLOT")).isEqualTo(PropertyType.RESIDENTIAL_PLOT);
    }

    @Test
    void existingValues_unaffected() {
        assertThat(PropertyType.fromValue("house")).isEqualTo(PropertyType.HOUSE);
        assertThat(PropertyType.fromValue("apartment")).isEqualTo(PropertyType.APARTMENT);
        assertThat(PropertyType.fromValue("agricultural_land")).isEqualTo(PropertyType.AGRICULTURAL_LAND);
        assertThat(PropertyType.fromValue("land")).isEqualTo(PropertyType.LAND);
        assertThat(PropertyType.fromValue("other")).isEqualTo(PropertyType.OTHER);
    }

    @Test
    void unknownValue_stillThrows() {
        assertThatThrownBy(() -> PropertyType.fromValue("bungalow"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
