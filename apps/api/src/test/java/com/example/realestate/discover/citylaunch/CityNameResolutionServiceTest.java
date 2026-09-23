package com.example.realestate.discover.citylaunch;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Fast unit coverage (no Postgres) for {@link CityNameResolutionService}'s branching — the
 *  real-Postgres end-to-end paths are covered by {@link CityBootstrapServiceIT} (#2676 Slice A). */
@ExtendWith(MockitoExtension.class)
class CityNameResolutionServiceTest {

    @Mock private JdbcOperations jdbcOperations;
    @Mock private CityGeocodingProvider geocodingProvider;

    @SuppressWarnings("unchecked")
    private void stubExistingCity(Integer cityIdOrNull) {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString()))
                .thenReturn(cityIdOrNull == null ? List.of() : List.of(cityIdOrNull));
    }

    @Test
    @DisplayName("existing city by slug short-circuits before any geocoding call")
    void resolve_existingCity_neverCallsProvider() {
        stubExistingCity(42);
        CityNameResolutionService service = new CityNameResolutionService(jdbcOperations, geocodingProvider);

        CityResolutionResult result = service.resolve("Bangalore");

        assertThat(result.kind()).isEqualTo(CityResolutionResult.Kind.EXISTING_CITY);
        assertThat(result.existingCityId()).isEqualTo(42);
        verify(geocodingProvider, never()).search(anyString());
    }

    @Test
    @DisplayName("no existing city, single provider candidate -> SINGLE_CANDIDATE")
    void resolve_noExistingCity_singleCandidate() {
        stubExistingCity(null);
        GeocodeCandidate candidate = new GeocodeCandidate("Mysuru, Karnataka, India", "in", "city",
                12.29, 76.63, 12.19, 76.53, 12.39, 76.73);
        when(geocodingProvider.search("Mysore")).thenReturn(List.of(candidate));
        CityNameResolutionService service = new CityNameResolutionService(jdbcOperations, geocodingProvider);

        CityResolutionResult result = service.resolve("Mysore");

        assertThat(result.kind()).isEqualTo(CityResolutionResult.Kind.SINGLE_CANDIDATE);
        assertThat(result.singleCandidate()).isEqualTo(candidate);
    }

    @Test
    @DisplayName("no existing city, multiple provider candidates -> DISAMBIGUATION_REQUIRED")
    void resolve_noExistingCity_multipleCandidates_disambiguationRequired() {
        stubExistingCity(null);
        when(geocodingProvider.search("Springfield")).thenReturn(List.of(
                new GeocodeCandidate("Springfield, Illinois, USA", "us", "city", 39.78, -89.65, null, null, null, null),
                new GeocodeCandidate("Springfield, Massachusetts, USA", "us", "city", 42.10, -72.59, null, null, null, null)));
        CityNameResolutionService service = new CityNameResolutionService(jdbcOperations, geocodingProvider);

        CityResolutionResult result = service.resolve("Springfield");

        assertThat(result.kind()).isEqualTo(CityResolutionResult.Kind.DISAMBIGUATION_REQUIRED);
        assertThat(result.candidates()).hasSize(2);
    }

    @Test
    @DisplayName("no existing city, zero provider candidates -> NOT_FOUND")
    void resolve_noExistingCity_zeroCandidates_notFound() {
        stubExistingCity(null);
        when(geocodingProvider.search(anyString())).thenReturn(List.of());
        CityNameResolutionService service = new CityNameResolutionService(jdbcOperations, geocodingProvider);

        CityResolutionResult result = service.resolve("Zzzznotarealplace");

        assertThat(result.kind()).isEqualTo(CityResolutionResult.Kind.NOT_FOUND);
    }

    @Test
    @DisplayName("provider failure surfaces as a workflow stop, not a fabricated result")
    void resolve_providerThrows_surfacesAsProviderFailure() {
        stubExistingCity(null);
        when(geocodingProvider.search(anyString()))
                .thenThrow(new CityGeocodingProviderException("network down", new RuntimeException("boom")));
        CityNameResolutionService service = new CityNameResolutionService(jdbcOperations, geocodingProvider);

        CityResolutionResult result = service.resolve("Anywhere");

        assertThat(result.kind()).isEqualTo(CityResolutionResult.Kind.PROVIDER_FAILURE);
        assertThat(result.failureMessage()).isEqualTo("network down");
    }

    @Test
    @DisplayName("normalizeToSlug matches existing seed convention (lowercase, hyphenated, trimmed)")
    void normalizeToSlug_matchesExistingConvention() {
        assertThat(CityNameResolutionService.normalizeToSlug("  Mysore  ")).isEqualTo("mysore");
        assertThat(CityNameResolutionService.normalizeToSlug("New Delhi")).isEqualTo("new-delhi");
        assertThat(CityNameResolutionService.normalizeToSlug("Bangalore")).isEqualTo("bangalore");
    }
}
