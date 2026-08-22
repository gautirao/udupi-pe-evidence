package com.example.realestate.listing.area;

import com.example.realestate.discover.AreaResolution;
import com.example.realestate.discover.AreaResolutionService;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.listing.core.Listing;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.ResultSetExtractor;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ListingAreaResolutionService} (#2263) — the broker-flow equivalent of
 * {@code ListingIngestionService}'s area resolution, proven with mocked collaborators. The real
 * canonical/alias lookup behaviour is already exhaustively covered by
 * {@code AreaResolutionServiceIT}; these tests only prove this class's own wiring/skip logic.
 *
 * <p>#2268: {@code resolveAndApply} tries {@link AreaResolutionService#resolveByAliasAnyCity}
 * FIRST, before ever calling {@link GeocodingPort#geocode}. Every test below that reaches that
 * call therefore stubs {@code resolveByAliasAnyCity} to {@link AreaResolution#unresolved()} so the
 * flow proceeds to the geocode-then-resolve fallback pipeline being exercised — the alias-first
 * success path itself is proven separately by
 * {@link #aliasFirstResolves_setsCanonicalAreaKeyAndMethod_neverCallsGeocoder}.
 */
@ExtendWith(MockitoExtension.class)
class ListingAreaResolutionServiceTest {

    @Mock
    private GeocodingPort geocodingPort;

    @Mock
    private AreaResolutionService areaResolutionService;

    @Mock
    private JdbcOperations jdbcOperations;

    private ListingAreaResolutionService service;

    private static final GeocodingService.GeoResult MANIPAL_GEO = new GeocodingService.GeoResult(
            13.35, 74.79, "Manipal, Udupi, Karnataka, India",
            "India", "Karnataka", "Udupi", "Manipal", null);

    private Listing draftListing(String locality) {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setLocality(locality);
        return listing;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubCityId(Integer cityId) {
        when(jdbcOperations.query(anyString(), (ResultSetExtractor) any(ResultSetExtractor.class), any(Object[].class)))
                .thenReturn(cityId);
    }

    private void stubAliasFirstMisses(String locality) {
        when(areaResolutionService.resolveByAliasAnyCity(locality)).thenReturn(AreaResolution.unresolved());
    }

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        service = new ListingAreaResolutionService(geocodingPort, areaResolutionService, jdbcOperations);
    }

    @Test
    void blankLocality_skipsResolution_leavesFieldsNull() {
        Listing listing = draftListing("  ");

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isNull();
        verifyNoInteractions(geocodingPort, areaResolutionService);
    }

    @Test
    void nullLocality_skipsResolution() {
        Listing listing = draftListing(null);

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isNull();
        verifyNoInteractions(geocodingPort, areaResolutionService);
    }

    @Test
    void alreadyResolved_isIdempotent_neverReGeocodes() {
        Listing listing = draftListing("Manipal");
        listing.setAreaKey("IN|KA|Udupi|Manipal");
        listing.setAreaResolutionStatus("RESOLVED");

        service.resolveAndApply(listing);

        verifyNoInteractions(geocodingPort, areaResolutionService);
    }

    // ── #2268: alias-first, tried before geocoding ──────────────────────────────

    @Test
    void aliasFirstResolves_setsCanonicalAreaKeyAndMethod_neverCallsGeocoder() {
        // The actual #2268 regression proof: a locality with a curated area_alias row resolves
        // WITHOUT ever calling the geocoder — so Manipal (or any other curated locality) still
        // resolves even if Nominatim is unreachable/down.
        Listing listing = draftListing("Manipal");
        when(areaResolutionService.resolveByAliasAnyCity("Manipal"))
                .thenReturn(AreaResolution.resolved(AreaResolution.Method.ALIAS, "IN|KA|Udupi|Manipal"));
        when(areaResolutionService.areaLabelForKey("IN|KA|Udupi|Manipal")).thenReturn("Manipal, Udupi");

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(listing.getAreaLabel()).isEqualTo("Manipal, Udupi");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isEqualTo("ALIAS");
        verifyNoInteractions(geocodingPort);
        verify(areaResolutionService, never()).resolve(anyInt(), any(), any(), any(), any());
    }

    @Test
    void aliasFirstMisses_fallsThroughToGeocodingPipeline() {
        Listing listing = draftListing("Manipal");
        stubAliasFirstMisses("Manipal");
        when(geocodingPort.geocode("Manipal")).thenReturn(MANIPAL_GEO);
        stubCityId(7);
        when(areaResolutionService.resolve(7, null, null, "india|karnataka|udupi|manipal", "Manipal"))
                .thenReturn(AreaResolution.resolved(AreaResolution.Method.CANONICAL_KEY, "IN|KA|Udupi|Manipal"));

        service.resolveAndApply(listing);

        verify(areaResolutionService).resolveByAliasAnyCity("Manipal");
        verify(geocodingPort).geocode("Manipal");
        assertThat(listing.getAreaKey()).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(listing.getAreaResolutionMethod()).isEqualTo("CANONICAL_KEY");
    }

    // ── Geocoding fallback pipeline (alias-first already missed) ────────────────

    @Test
    void geocodingReturnsNull_leavesAreaFieldsUntouched() {
        Listing listing = draftListing("Nonexistent Place Xyz");
        stubAliasFirstMisses("Nonexistent Place Xyz");
        when(geocodingPort.geocode("Nonexistent Place Xyz")).thenReturn(null);

        service.resolveAndApply(listing);

        // Listing.areaResolutionStatus defaults to "RESOLVED" on a brand-new entity (a pre-existing
        // entity-level default, unrelated to #2263) — a geocode miss must leave it exactly as it
        // was rather than touching it, so this asserts the (default, null-areaKey) pair survives.
        assertThat(listing.getAreaKey()).isNull();
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        verify(areaResolutionService, never()).resolve(anyInt(), any(), any(), any(), any());
    }

    @Test
    void geocodingThrows_neverPropagates_leavesAreaFieldsNull() {
        Listing listing = draftListing("Manipal");
        stubAliasFirstMisses("Manipal");
        when(geocodingPort.geocode("Manipal")).thenThrow(new RuntimeException("Nominatim down"));

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isNull();
        verify(areaResolutionService, never()).resolve(anyInt(), any(), any(), any(), any());
    }

    @Test
    void noCityRowForGeocodedCity_aliasFirstAlreadyMissed_setsUnresolvedWithGeocodedKeyFallback() {
        Listing listing = draftListing("Manipal");
        stubAliasFirstMisses("Manipal");
        when(geocodingPort.geocode("Manipal")).thenReturn(MANIPAL_GEO);
        stubCityId(null);

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isEqualTo("india|karnataka|udupi|manipal");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isNull();
        // Alias-first is only ever tried once per resolveAndApply call — the cityId==null branch
        // does not re-attempt it (it's deterministic on the same locality text).
        verify(areaResolutionService, times(1)).resolveByAliasAnyCity("Manipal");
        verify(areaResolutionService, never()).resolve(anyInt(), any(), any(), any(), any());
    }

    @Test
    void resolvedByCanonicalKey_setsCanonicalAreaKeyAndMethod() {
        Listing listing = draftListing("Manipal");
        stubAliasFirstMisses("Manipal");
        when(geocodingPort.geocode("Manipal")).thenReturn(MANIPAL_GEO);
        stubCityId(7);
        when(areaResolutionService.resolve(7, null, null, "india|karnataka|udupi|manipal", "Manipal"))
                .thenReturn(AreaResolution.resolved(AreaResolution.Method.CANONICAL_KEY, "IN|KA|Udupi|Manipal"));

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(listing.getAreaLabel()).isEqualTo("Manipal, Udupi");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isEqualTo("CANONICAL_KEY");
    }

    @Test
    void unresolvedByAreaResolutionService_setsUnresolvedWithGeocodedKeyFallback() {
        Listing listing = draftListing("Manipal");
        stubAliasFirstMisses("Manipal");
        when(geocodingPort.geocode("Manipal")).thenReturn(MANIPAL_GEO);
        stubCityId(7);
        when(areaResolutionService.resolve(7, null, null, "india|karnataka|udupi|manipal", "Manipal"))
                .thenReturn(AreaResolution.unresolved());

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isEqualTo("india|karnataka|udupi|manipal");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isNull();
    }
}
