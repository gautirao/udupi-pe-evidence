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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ListingAreaResolutionService} (#2263) — the broker-flow equivalent of
 * {@code ListingIngestionService}'s area resolution, proven with mocked collaborators. The real
 * canonical/alias lookup behaviour is already exhaustively covered by
 * {@code AreaResolutionServiceIT}; these tests only prove this class's own wiring/skip logic.
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

    @Test
    void geocodingReturnsNull_leavesAreaFieldsUntouched() {
        Listing listing = draftListing("Nonexistent Place Xyz");
        when(geocodingPort.geocode("Nonexistent Place Xyz")).thenReturn(null);

        service.resolveAndApply(listing);

        // Listing.areaResolutionStatus defaults to "RESOLVED" on a brand-new entity (a pre-existing
        // entity-level default, unrelated to #2263) — a geocode miss must leave it exactly as it
        // was rather than touching it, so this asserts the (default, null-areaKey) pair survives.
        assertThat(listing.getAreaKey()).isNull();
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        verifyNoInteractions(areaResolutionService);
    }

    @Test
    void geocodingThrows_neverPropagates_leavesAreaFieldsNull() {
        Listing listing = draftListing("Manipal");
        when(geocodingPort.geocode("Manipal")).thenThrow(new RuntimeException("Nominatim down"));

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isNull();
        verifyNoInteractions(areaResolutionService);
    }

    @Test
    void noCityRowForGeocodedCity_setsUnresolvedWithGeocodedKeyFallback() {
        Listing listing = draftListing("Manipal");
        when(geocodingPort.geocode("Manipal")).thenReturn(MANIPAL_GEO);
        stubCityId(null);

        service.resolveAndApply(listing);

        assertThat(listing.getAreaKey()).isEqualTo("india|karnataka|udupi|manipal");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isNull();
        verify(areaResolutionService, never()).resolve(anyInt(), any(), any(), any(), any());
    }

    @Test
    void resolvedByCanonicalKey_setsCanonicalAreaKeyAndMethod() {
        Listing listing = draftListing("Manipal");
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
