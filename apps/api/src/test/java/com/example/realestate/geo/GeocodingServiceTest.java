package com.example.realestate.geo;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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

    @Test
    void callNominatim_interrupted_restoresFlagAndReturnsNull() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenThrow(new InterruptedException("simulated interrupt"));
        injectHttpClient(mockHttpClient);

        try {
            GeocodingService.NominatimHit result = invokeCallNominatim("Manipal");

            assertThat(result).isNull();
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    // ===== searchPlaces URI encoding (issue #1892 scope extension) =====
    //
    // searchPlaces() had the identical defect as callNominatim(): build(false).toUri() without
    // .encode() leaves reserved characters like `&` and `=` inside a query param VALUE as
    // literal, unescaped delimiters. Fixed to build(false).encode().toUri(), and the URI
    // construction was moved inside the existing try block (matching the corrected
    // callNominatim pattern) so construction failures are handled by the same general
    // catch (Exception e) path. Unlike callNominatim, searchPlaces does NOT append a
    // ", Karnataka, India" suffix — the raw query argument is used as-is for `q`.

    @Test
    void searchPlaces_termWithAmpersand_doesNotSplitQueryParam() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        List<GeocodingService.PlaceResult> result = service.searchPlaces("A&B Layout", 5);

        assertThat(result).isEmpty(); // empty results array
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        String rawQuery = capturedUri.getRawQuery();

        // Proves the `&` inside the value was actually percent-escaped, not left as a raw
        // delimiter.
        assertThat(rawQuery).contains("%26");

        Map<String, String> params = parseRawQueryParams(rawQuery);
        assertThat(params).hasSize(7);
        assertThat(params.keySet()).containsExactlyInAnyOrder(
                "q", "format", "addressdetails", "limit", "countrycodes", "viewbox", "bounded");
        assertThat(params.get("q")).isEqualTo("A&B Layout");
        assertThat(params).doesNotContainKey("B Layout");
        assertThat(params.keySet()).noneMatch(key -> key.startsWith("B Layout"));
    }

    @Test
    void searchPlaces_termWithEquals_doesNotCorruptQueryParam() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        List<GeocodingService.PlaceResult> result = service.searchPlaces("Phase=2 Layout", 5);

        assertThat(result).isEmpty();
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        String rawQuery = capturedUri.getRawQuery();

        assertThat(rawQuery).contains("%3D");

        Map<String, String> params = parseRawQueryParams(rawQuery);
        assertThat(params).hasSize(7);
        assertThat(params.keySet()).containsExactlyInAnyOrder(
                "q", "format", "addressdetails", "limit", "countrycodes", "viewbox", "bounded");
        assertThat(params.get("q")).isEqualTo("Phase=2 Layout");
    }

    // ===== callNominatim URI encoding (issue #1892) =====
    //
    // callNominatim() previously built its query URI via
    // UriComponentsBuilder...build(true).toUri() — the `true` (already-encoded) flag meant
    // Spring did NOT encode the raw spaces/commas/ampersands in the search term, throwing
    // IllegalArgumentException for any real-world term before the HTTP call was ever made.
    // Fixed to use build(false).encode(), matching the proven searchPlaces() approach.
    // build(false) alone is NOT sufficient: it leaves reserved characters like `&` and `=`
    // inside a query param VALUE as literal, unescaped delimiters, which corrupts the query
    // structure (see callNominatim_termWithAmpersand_doesNotSplitQueryParam and
    // callNominatim_termWithEquals_doesNotCorruptQueryParam below — both assert on the actual
    // parsed parameter structure, not just substring containment of a whole-query decode,
    // since whole-query URLDecoder.decode cannot distinguish "& used as delimiter" from
    // "%26 decoded back to &"). These tests exercise the real (unmocked) UriComponentsBuilder
    // to prove the fix.

    @Test
    void callNominatim_simpleTerm_buildsValidUriAndReachesSend() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("Manipal");

        assertThat(result).isNull(); // empty results array
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        assertThat(capturedUri.toString()).doesNotContain(" ");
        String decodedQuery = java.net.URLDecoder.decode(capturedUri.getRawQuery(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(decodedQuery).contains("q=Manipal, Karnataka, India");
        assertThat(decodedQuery).contains("addressdetails=1");
    }

    @Test
    void callNominatim_termWithPeriodsAndSpaces_buildsValidUriAndReachesSend() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("J. P. Nagar");

        assertThat(result).isNull();
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        String decodedQuery = java.net.URLDecoder.decode(capturedUri.getRawQuery(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(decodedQuery).contains("q=J. P. Nagar, Karnataka, India");
    }

    @Test
    void callNominatim_termWithAmpersand_doesNotSplitQueryParam() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("A&B Layout");

        assertThat(result).isNull();
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        String rawQuery = capturedUri.getRawQuery();

        // Proves the `&` inside the value was actually percent-escaped, not left as a raw
        // delimiter (a whole-query URLDecoder.decode cannot distinguish the two cases).
        assertThat(rawQuery).contains("%26");

        // Split on the actual, unescaped `&` characters in the raw string — exactly the naive
        // parsing a real HTTP server / query-string parser would perform — and confirm the
        // value's `&` did NOT introduce a bogus extra parameter.
        Map<String, String> params = parseRawQueryParams(rawQuery);
        assertThat(params).hasSize(5);
        assertThat(params.keySet()).containsExactlyInAnyOrder(
                "q", "format", "addressdetails", "limit", "countrycodes");
        assertThat(params.get("q")).isEqualTo("A&B Layout, Karnataka, India");
        assertThat(params.get("format")).isEqualTo("json");
        assertThat(params.get("addressdetails")).isEqualTo("1");
        assertThat(params.get("limit")).isEqualTo("1");
        assertThat(params.get("countrycodes")).isEqualTo("in");
        assertThat(params).doesNotContainKey("B Layout, Karnataka, India");
        assertThat(params.keySet()).noneMatch(key -> key.startsWith("B Layout"));
    }

    @Test
    void callNominatim_termWithEquals_doesNotCorruptQueryParam() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("Phase=2 Layout");

        assertThat(result).isNull();
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        String rawQuery = capturedUri.getRawQuery();

        Map<String, String> params = parseRawQueryParams(rawQuery);
        assertThat(params).hasSize(5);
        assertThat(params.keySet()).containsExactlyInAnyOrder(
                "q", "format", "addressdetails", "limit", "countrycodes");
        assertThat(params.get("q")).isEqualTo("Phase=2 Layout, Karnataka, India");
    }

    @Test
    void callNominatim_nonAsciiTerm_buildsValidUriAndReachesSend() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse("[]");
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("ಉಡುಪಿ ಬೀಚ್");

        assertThat(result).isNull();
        ArgumentCaptor<HttpRequest> captor = ArgumentCaptor.forClass(HttpRequest.class);
        verify(mockHttpClient).send(captor.capture(), ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        URI capturedUri = captor.getValue().uri();
        String decodedQuery = java.net.URLDecoder.decode(capturedUri.getRawQuery(), java.nio.charset.StandardCharsets.UTF_8);
        assertThat(decodedQuery).contains("q=ಉಡುಪಿ ಬೀಚ್, Karnataka, India");
    }

    @Test
    void callNominatim_httpClientThrowsIOException_returnsNullWithoutCrashing() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenThrow(new java.io.IOException("simulated network failure"));
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("Manipal");

        assertThat(result).isNull();
    }

    @Test
    void callNominatim_httpNon200Status_returnsNull() throws Exception {
        HttpClient mockHttpClient = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(503);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);

        GeocodingService.NominatimHit result = invokeCallNominatim("Manipal");

        assertThat(result).isNull();
    }

    // ===== Address parsing (#2268: geocode() must populate country/region/city) =====

    @Test
    void geocode_cacheMiss_populatesCountryRegionCityFromNominatimAddress() throws Exception {
        // Real Nominatim response shape for "Manipal, Karnataka, India" (verified live, #2268):
        // Manipal is a town-level OSM place with NO "city" address field — only "town" +
        // "state_district" — which is exactly the gap that left GeoResult.city() always null.
        String body = """
                [{"lat":"13.3519723","lon":"74.7870308","address":{"town":"Manipal",
                "county":"Udupi taluku","state_district":"Udupi","state":"Karnataka",
                "country":"India","country_code":"in"}}]
                """;
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse(body);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);
        when(cacheRepository.findByLocalityIgnoreCase(anyString())).thenReturn(Optional.empty());

        GeocodingService.GeoResult result = service.geocode("Manipal");

        assertThat(result).isNotNull();
        assertThat(result.latitude()).isEqualTo(13.3519723);
        assertThat(result.longitude()).isEqualTo(74.7870308);
        assertThat(result.country()).isEqualTo("India");
        assertThat(result.region()).isEqualTo("Karnataka");
        assertThat(result.city()).isEqualTo("Manipal"); // falls back to "town" (no "city" field)
        assertThat(result.locality()).isEqualTo("Manipal"); // caller's original input, untouched
    }

    @Test
    void geocode_addressHasCityField_prefersCityOverTown() throws Exception {
        // Real shape for "Indiranagar, Karnataka, India": city="Bengaluru" is present directly.
        String body = """
                [{"lat":"12.9732913","lon":"77.6404672","address":{"suburb":"Indiranagar",
                "city":"Bengaluru","county":"Bangalore East","state_district":"Bengaluru Urban",
                "state":"Karnataka","country":"India"}}]
                """;
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse(body);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);
        when(cacheRepository.findByLocalityIgnoreCase(anyString())).thenReturn(Optional.empty());

        GeocodingService.GeoResult result = service.geocode("Indiranagar");

        assertThat(result.city()).isEqualTo("Bengaluru");
        assertThat(result.neighborhood()).isEqualTo("Indiranagar");
    }

    @Test
    void geocode_addressHasNeitherCityNorTown_fallsBackToStateDistrict() throws Exception {
        // Real shape for plain "Udupi, Karnataka, India": only state_district is present.
        String body = """
                [{"lat":"13.5269784","lon":"74.8731879","address":{"state_district":"Udupi",
                "state":"Karnataka","country":"India"}}]
                """;
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse(body);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);
        when(cacheRepository.findByLocalityIgnoreCase(anyString())).thenReturn(Optional.empty());

        GeocodingService.GeoResult result = service.geocode("Udupi");

        assertThat(result.city()).isEqualTo("Udupi");
    }

    @Test
    void geocode_addressMissingEntirely_returnsNullCountryRegionCity() throws Exception {
        String body = "[{\"lat\":\"13.0\",\"lon\":\"74.0\"}]";
        HttpClient mockHttpClient = mock(HttpClient.class);
        HttpResponse<String> mockResponse = mockOkResponse(body);
        when(mockHttpClient.send(any(HttpRequest.class),
                ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenReturn(mockResponse);
        injectHttpClient(mockHttpClient);
        when(cacheRepository.findByLocalityIgnoreCase(anyString())).thenReturn(Optional.empty());

        GeocodingService.GeoResult result = service.geocode("Some Unmapped Place");

        assertThat(result).isNotNull();
        assertThat(result.country()).isNull();
        assertThat(result.region()).isNull();
        assertThat(result.city()).isNull();
    }

    // ===== Private helpers =====

    /**
     * Parses a raw (percent-encoded) query string exactly the way a naive/vulnerable HTTP
     * server or query-string parser would: split on literal, unescaped {@code &} characters
     * first, then split each resulting pair on the first literal {@code =}, then URL-decode
     * the name and value independently. This is deliberately NOT a single whole-string
     * URLDecoder.decode() — that approach cannot distinguish a literal (delimiter) `&`/`=`
     * from a percent-encoded `%26`/`%3D` that decodes back to the same character, which is
     * exactly the gap that let the pre-fix bug hide behind a passing test.
     */
    private static Map<String, String> parseRawQueryParams(String rawQuery) {
        Map<String, String> params = new LinkedHashMap<>();
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            String rawName = eq >= 0 ? pair.substring(0, eq) : pair;
            String rawValue = eq >= 0 ? pair.substring(eq + 1) : "";
            String name = java.net.URLDecoder.decode(rawName, java.nio.charset.StandardCharsets.UTF_8);
            String value = java.net.URLDecoder.decode(rawValue, java.nio.charset.StandardCharsets.UTF_8);
            params.put(name, value);
        }
        return params;
    }

    private GeocodingService.NominatimHit invokeCallNominatim(String term) throws Exception {
        var method = GeocodingService.class.getDeclaredMethod("callNominatim", String.class);
        method.setAccessible(true);
        return (GeocodingService.NominatimHit) method.invoke(service, term);
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<String> mockOkResponse(String body) {
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(body);
        return mockResponse;
    }

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
