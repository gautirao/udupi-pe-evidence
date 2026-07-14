package com.example.realestate.geo;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.util.UriComponents;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GeocodingServiceTest {

    @Mock
    private GeocodeCacheRepository cacheRepository;

    private GeocodingService service;

    @BeforeEach
    void setUp() {
        service = new GeocodingService(cacheRepository);
    }

    // ===== Cache hit =====

    @Test
    void geocode_cacheHit_returnsCachedResult() {
        GeocodeCache cached = new GeocodeCache("manipal", 13.3528, 74.7906, "Manipal, Karnataka", OffsetDateTime.now());
        setId(cached);
        when(cacheRepository.findByLocalityIgnoreCase("manipal")).thenReturn(Optional.of(cached));

        GeocodingService.GeoResult result = service.geocode("Manipal");

        assertThat(result).isNotNull();
        assertThat(result.latitude()).isEqualTo(13.3528);
        assertThat(result.longitude()).isEqualTo(74.7906);
        verifyNoMoreInteractions(cacheRepository);
    }

    @Test
    void geocode_nullLocality_returnsNull() {
        assertThat(service.geocode(null)).isNull();
        verifyNoInteractions(cacheRepository);
    }

    @Test
    void geocode_blankLocality_returnsNull() {
        assertThat(service.geocode("   ")).isNull();
        verifyNoInteractions(cacheRepository);
    }

    // ===== Locality simplification =====

    @Test
    void simplify_removesNoiseWords() {
        String result = GeocodingService.simplify("NH Highway Junction, Manipal");
        assertThat(result).doesNotContainIgnoringCase("highway");
        assertThat(result).doesNotContainIgnoringCase("junction");
        assertThat(result).containsIgnoringCase("manipal");
    }

    @Test
    void simplify_collapsesWhitespace() {
        String result = GeocodingService.simplify("Near   Temple,  Udupi");
        assertThat(result).doesNotContain("  ");
    }

    @Test
    void simplify_preservesMeaningfulParts() {
        String result = GeocodingService.simplify("Manipal");
        assertThat(result).isEqualToIgnoringCase("Manipal");
    }

    @Test
    void simplify_removesLeadingTrailingCommas() {
        String result = GeocodingService.simplify("Near beach, Udupi,");
        assertThat(result).doesNotEndWith(",");
    }

    // ===== InterruptedException handling (SonarQube java:S2142) =====
    //
    // GeocodingService builds its own HttpClient internally (no constructor seam), so these
    // tests inject a Mockito-mocked HttpClient via reflection into the private `httpClient`
    // field — reusing the same reflection technique as setId() below — and make send() throw
    // InterruptedException directly. This avoids any real network call while still exercising
    // the exact production catch blocks.

    @Test
    void searchPlaces_interrupted_restoresFlagAndReturnsEmptyList() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenThrow(new InterruptedException("simulated interrupt"));
        injectHttpClient(mockHttpClient);

        try {
            List<GeocodingService.PlaceResult> result = service.searchPlaces("Manipal", 5);

            assertThat(result).isEmpty();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted(); // clear flag so later tests aren't contaminated
        }
    }

    @Test
    void reverseGeocodePlace_interrupted_restoresFlagAndReturnsNull() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenThrow(new InterruptedException("simulated interrupt"));
        injectHttpClient(mockHttpClient);

        try {
            GeocodingService.PlaceResult result = service.reverseGeocodePlace(13.3409, 74.7421);

            assertThat(result).isNull();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    /**
     * NOTE: callNominatim() builds its query URI via
     * {@code UriComponentsBuilder...build(true).toUri()} — the {@code true} (already-encoded)
     * flag means Spring does NOT encode the unencoded ", Karnataka, India" suffix that
     * callNominatim always appends to the term, so this line throws
     * {@code IllegalArgumentException: Invalid character ' ' for QUERY_PARAM} for ANY term,
     * before ever reaching the try/catch this test targets. This is a pre-existing,
     * unrelated defect (confirmed via `git diff origin/main` — untouched by this change) and
     * out of scope for the S2142 fix. UriComponentsBuilder is stubbed here purely to route
     * around it so this test can isolate the InterruptedException catch block.
     */
    @Test
    void callNominatim_interrupted_restoresFlagAndReturnsNull() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenThrow(new InterruptedException("simulated interrupt"));
        injectHttpClient(mockHttpClient);

        UriComponentsBuilder mockBuilder = mock(UriComponentsBuilder.class, RETURNS_SELF);
        UriComponents mockComponents = mock(UriComponents.class);
        when(mockBuilder.build(true)).thenReturn(mockComponents);
        when(mockComponents.toUri()).thenReturn(URI.create("https://nominatim.openstreetmap.org/search"));

        try (MockedStatic<UriComponentsBuilder> mockedStatic = mockStatic(UriComponentsBuilder.class)) {
            mockedStatic.when(() -> UriComponentsBuilder.fromHttpUrl(anyString())).thenReturn(mockBuilder);

            var method = GeocodingService.class.getDeclaredMethod("callNominatim", String.class);
            method.setAccessible(true);
            double[] result = (double[]) method.invoke(service, "Manipal");

            assertThat(result).isNull();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    // ===== Private helpers =====

    private void setId(GeocodeCache cache) {
        try {
            var field = GeocodeCache.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(cache, UUID.randomUUID());
        } catch (Exception ignored) {}
    }

    private void injectHttpClient(HttpClient mockHttpClient) {
        try {
            var field = GeocodingService.class.getDeclaredField("httpClient");
            field.setAccessible(true);
            field.set(service, mockHttpClient);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to inject mock HttpClient", e);
        }
    }
}
