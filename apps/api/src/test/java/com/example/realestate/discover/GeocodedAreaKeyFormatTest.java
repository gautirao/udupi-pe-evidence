package com.example.realestate.discover;

import com.example.realestate.geo.GeocodingService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.ResultSetExtractor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link GeocodedAreaKeyFormat} (#2268) — pure logic + a mocked
 * {@link JdbcOperations}, no real DB dependency (that's covered by {@code AreaResolutionServiceIT}
 * for the downstream resolution behaviour).
 */
class GeocodedAreaKeyFormatTest {

    @SuppressWarnings({"unchecked", "rawtypes"})
    private JdbcOperations jdbcOperationsReturning(Integer cityId) {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        when(jdbcOperations.query(anyString(), (ResultSetExtractor) any(ResultSetExtractor.class), any(Object[].class)))
                .thenReturn(cityId);
        return jdbcOperations;
    }

    // ===== resolveCityId: city-name alias mapping =====

    @Test
    void resolveCityId_manipal_isNoLongerHardcodedAliasedToUdupiSlug() {
        // #2268: the hardcoded "manipal" -> "udupi" city-slug alias was removed from
        // normalizeCityToSlug — a code-level town->city mapping was a second, unreviewed
        // authority parallel to the real area_alias table. Nominatim's address breakdown for
        // Manipal (a town-level OSM place with no "city" field of its own) yields city="Manipal"
        // via GeocodingService's town fallback, which now queries cities.slug='manipal' verbatim
        // (no cities row exists for it) and returns null. Manipal resolution now happens via
        // AreaResolutionService#resolveByAliasAnyCity's curated area_alias row instead (see
        // AreaResolutionServiceIT and ListingAreaResolutionServiceTest).
        JdbcOperations jdbcOperations = jdbcOperationsReturning(null);
        GeocodingService.GeoResult manipalGeo = new GeocodingService.GeoResult(
                13.35, 74.79, null, "India", "Karnataka", "Manipal", "Manipal", null);

        Integer cityId = GeocodedAreaKeyFormat.resolveCityId(jdbcOperations, manipalGeo);

        assertThat(cityId).isNull();
        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).query(anyString(), any(ResultSetExtractor.class), argsCaptor.capture());
        assertThat(argsCaptor.getValue()).containsExactly("manipal");
    }

    @Test
    void resolveCityId_bengaluru_isAliasedToBangaloreSlug() {
        JdbcOperations jdbcOperations = jdbcOperationsReturning(1);
        GeocodingService.GeoResult geo = new GeocodingService.GeoResult(
                12.97, 77.59, null, "India", "Karnataka", "Bengaluru", "Indiranagar", "Indiranagar");

        GeocodedAreaKeyFormat.resolveCityId(jdbcOperations, geo);

        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).query(anyString(), any(ResultSetExtractor.class), argsCaptor.capture());
        assertThat(argsCaptor.getValue()).containsExactly("bangalore");
    }

    @Test
    void resolveCityId_udupiStateDistrictFallback_matchesSlugDirectly() {
        // #2268: plain "Udupi" locality — Nominatim returns only state_district="Udupi" (no
        // city/town), which already matches the cities.slug vocabulary without aliasing.
        JdbcOperations jdbcOperations = jdbcOperationsReturning(7);
        GeocodingService.GeoResult geo = new GeocodingService.GeoResult(
                13.53, 74.87, null, "India", "Karnataka", "Udupi", "Udupi", null);

        GeocodedAreaKeyFormat.resolveCityId(jdbcOperations, geo);

        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).query(anyString(), any(ResultSetExtractor.class), argsCaptor.capture());
        assertThat(argsCaptor.getValue()).containsExactly("udupi");
    }

    @Test
    void resolveCityId_nullGeoResult_returnsNull() {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);

        assertThat(GeocodedAreaKeyFormat.resolveCityId(jdbcOperations, null)).isNull();
    }

    @Test
    void resolveCityId_blankCity_returnsNullWithoutQuerying() {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        GeocodingService.GeoResult geo = new GeocodingService.GeoResult(
                13.35, 74.79, null, "India", "Karnataka", null, "Manipal", null);

        assertThat(GeocodedAreaKeyFormat.resolveCityId(jdbcOperations, geo)).isNull();
    }

    // ===== computeAreaKey =====

    @Test
    void computeAreaKey_manipal_usesRawCityNotAliasedSlug() {
        // computeAreaKey normalises geoResult.city() verbatim (not through the resolveCityId
        // alias table) — the area_key's own city segment stays "manipal", distinct from the
        // cityId lookup which resolves to Udupi's row via the alias.
        GeocodingService.GeoResult geo = new GeocodingService.GeoResult(
                13.35, 74.79, null, "India", "Karnataka", "Manipal", "Manipal", null);

        assertThat(GeocodedAreaKeyFormat.computeAreaKey(geo)).isEqualTo("india|karnataka|manipal|manipal");
    }

    @Test
    void computeAreaKey_missingCountryOrCity_returnsNull() {
        GeocodingService.GeoResult noCity = new GeocodingService.GeoResult(
                13.35, 74.79, null, "India", "Karnataka", null, "Manipal", null);
        assertThat(GeocodedAreaKeyFormat.computeAreaKey(noCity)).isNull();

        GeocodingService.GeoResult noCountry = new GeocodingService.GeoResult(
                13.35, 74.79, null, null, "Karnataka", "Udupi", "Manipal", null);
        assertThat(GeocodedAreaKeyFormat.computeAreaKey(noCountry)).isNull();
    }

    // ===== computeAreaLabel =====

    @Test
    void computeAreaLabel_manipal_combinesLocalityAndCity() {
        GeocodingService.GeoResult geo = new GeocodingService.GeoResult(
                13.35, 74.79, null, "India", "Karnataka", "Manipal", "Manipal", null);

        assertThat(GeocodedAreaKeyFormat.computeAreaLabel(geo)).isEqualTo("Manipal, Manipal");
    }
}
