package com.example.realestate.discover.citylaunch;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression test for #2676 Slice A's real Jackson deserialization bug, found only by manual
 * browser verification: {@link NominatimGeocodingProvider.NominatimResult}'s fields are
 * package-private with no {@code @JsonProperty}, and Jackson's default field visibility is
 * {@code PUBLIC_ONLY} — so {@code lat}/{@code lon} silently deserialized as {@code null},
 * every candidate got excluded, and every real lookup surfaced as a false NOT_FOUND. {@link
 * CityBootstrapServiceIT}'s fake provider never exercises this class's actual JSON parsing at
 * all, which is exactly why this test exists at this layer specifically.
 */
class NominatimGeocodingProviderDeserializationTest {

    private static final String SAMPLE_NOMINATIM_RESPONSE = """
            [
              {
                "display_name": "Springfield, Sangamon County, Illinois, United States",
                "lat": "39.7990175",
                "lon": "-89.6439575",
                "type": "administrative",
                "boundingbox": ["39.6536560", "39.8741700", "-89.7731820", "-89.5685100"],
                "address": {"country_code": "us"}
              }
            ]
            """;

    @Test
    @DisplayName("NominatimResult deserializes lat/lon/type/boundingbox/address despite package-private fields")
    void nominatimResult_deserializesAllFieldsFromRealResponseShape() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        NominatimGeocodingProvider.NominatimResult[] results = mapper.readValue(
                SAMPLE_NOMINATIM_RESPONSE, NominatimGeocodingProvider.NominatimResult[].class);

        assertThat(results).hasSize(1);
        NominatimGeocodingProvider.NominatimResult result = results[0];
        assertThat(result.displayName).isEqualTo("Springfield, Sangamon County, Illinois, United States");
        assertThat(result.lat).as("lat must not be null — this is the exact field that silently broke").isEqualTo("39.7990175");
        assertThat(result.lon).as("lon must not be null — this is the exact field that silently broke").isEqualTo("-89.6439575");
        assertThat(result.type).isEqualTo("administrative");
        assertThat(result.boundingbox).containsExactly("39.6536560", "39.8741700", "-89.7731820", "-89.5685100");
        assertThat(result.addressCountryCode()).isEqualTo("us");
    }
}
