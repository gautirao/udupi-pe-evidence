package com.example.realestate.listing.storage;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link SupabaseStorageService#createSignedUploadUrl(String, String)}.
 *
 * <p>Uses a Mockito-mocked {@link RestTemplate} to avoid live Supabase calls and to
 * simulate the response shape the upload-sign endpoint returns.
 *
 * <p>Key assertions:
 * <ul>
 *   <li>Happy path: parses the {@code url} key, builds the absolute signed URL.</li>
 *   <li>Disabled: returns {@link Optional#empty()} without touching the RestTemplate.</li>
 *   <li>REST 4xx/5xx: returns {@link Optional#empty()} (non-fatal).</li>
 *   <li>Missing {@code url} key in response: returns {@link Optional#empty()}.</li>
 *   <li>Unsafe path ({@code ..}): rejected before any HTTP call.</li>
 *   <li>Service-role key never appears in the returned signed URL.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class SupabaseStorageUploadUrlTest {

    private static final String SUPABASE_URL = "https://example.supabase.co";
    private static final String SERVICE_ROLE_KEY = "test-svc-role-key-secret";
    private static final String BUCKET = "listing-images";
    private static final String STORAGE_PATH = "listings/user1/listing1/uuid.jpg";

    @Mock
    private RestTemplate restTemplate;

    private SupabaseStorageService svc;

    @BeforeEach
    void setUp() {
        svc = new SupabaseStorageService(restTemplate, new LocalDevStorageService());
        ReflectionTestUtils.setField(svc, "configuredEnabled", true);
        ReflectionTestUtils.setField(svc, "supabaseUrl", SUPABASE_URL);
        ReflectionTestUtils.setField(svc, "serviceRoleKey", SERVICE_ROLE_KEY);
        ReflectionTestUtils.setField(svc, "bucket", BUCKET);
        ReflectionTestUtils.setField(svc, "uploadUrlTtlSeconds", 300);
        svc.validate();
    }

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void createSignedUploadUrl_success_returnsAbsoluteSignedUrl() {
        String relativeUrl = "/object/upload/sign/" + BUCKET + "/" + STORAGE_PATH + "?token=upload-tok";
        ResponseEntity<Map> mockResponse = ResponseEntity.ok(Map.of("url", relativeUrl));
        when(restTemplate.exchange(contains("/upload/sign/"), eq(HttpMethod.POST), any(), eq(Map.class)))
                .thenReturn(mockResponse);

        Optional<String> result = svc.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isPresent();
        String url = result.get();
        // Must be fully qualified
        assertThat(url).startsWith(SUPABASE_URL + "/storage/v1");
        // Must include the upload token
        assertThat(url).contains("?token=upload-tok");
        // Service-role key must NEVER appear in the returned URL
        assertThat(url).doesNotContain(SERVICE_ROLE_KEY);
    }

    // -------------------------------------------------------------------------
    // Disabled — no HTTP call must be made
    // -------------------------------------------------------------------------

    @Test
    void createSignedUploadUrl_disabled_returnsEmpty_noHttpCall() {
        SupabaseStorageService disabled = new SupabaseStorageService(restTemplate, new LocalDevStorageService());
        ReflectionTestUtils.setField(disabled, "configuredEnabled", false);
        ReflectionTestUtils.setField(disabled, "supabaseUrl", SUPABASE_URL);
        ReflectionTestUtils.setField(disabled, "serviceRoleKey", SERVICE_ROLE_KEY);
        ReflectionTestUtils.setField(disabled, "bucket", BUCKET);
        ReflectionTestUtils.setField(disabled, "uploadUrlTtlSeconds", 300);
        disabled.validate();

        Optional<String> result = disabled.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isEmpty();
        verifyNoInteractions(restTemplate);
    }

    // -------------------------------------------------------------------------
    // Disabled real Supabase, local dev storage opted-in (#2351) — no HTTP call,
    // returns a same-origin local upload URL instead of empty.
    // -------------------------------------------------------------------------

    @Test
    void createSignedUploadUrl_disabledWithLocalDevStorageEnabled_returnsLocalUrl_noHttpCall() {
        LocalDevStorageService localDevStorageService = new LocalDevStorageService();
        ReflectionTestUtils.setField(localDevStorageService, "enabled", true);
        ReflectionTestUtils.setField(localDevStorageService, "publicBaseUrlOverride", "http://localhost:8085/api/dev/local-storage");

        SupabaseStorageService disabled = new SupabaseStorageService(restTemplate, localDevStorageService);
        ReflectionTestUtils.setField(disabled, "configuredEnabled", false);
        ReflectionTestUtils.setField(disabled, "bucket", BUCKET);
        disabled.validate();

        Optional<String> result = disabled.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isPresent();
        assertThat(result.get()).isEqualTo("http://localhost:8085/api/dev/local-storage/upload/" + BUCKET + "/" + STORAGE_PATH);
        verifyNoInteractions(restTemplate);
    }

    // -------------------------------------------------------------------------
    // REST error responses — non-fatal
    // -------------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void createSignedUploadUrl_rest4xx_returnsEmpty() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(), eq(Map.class)))
                .thenThrow(new HttpClientErrorException(HttpStatus.FORBIDDEN));

        Optional<String> result = svc.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void createSignedUploadUrl_rest5xx_returnsEmpty() {
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(), eq(Map.class)))
                .thenThrow(new HttpServerErrorException(HttpStatus.INTERNAL_SERVER_ERROR));

        Optional<String> result = svc.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isEmpty();
    }

    // -------------------------------------------------------------------------
    // Response shape — wrong key (e.g. confusing with download-sign `signedURL` key)
    // -------------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void createSignedUploadUrl_responseMissingUrlKey_returnsEmpty() {
        // Supabase download-sign returns "signedURL"; upload-sign returns "url".
        // Guard against accidentally reading the wrong key.
        ResponseEntity<Map> mockResponse = ResponseEntity.ok(Map.of("signedURL", "/unexpected"));
        when(restTemplate.exchange(anyString(), eq(HttpMethod.POST), any(), eq(Map.class)))
                .thenReturn(mockResponse);

        Optional<String> result = svc.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isEmpty();
    }

    // -------------------------------------------------------------------------
    // Unsafe path — rejected before any HTTP call
    // -------------------------------------------------------------------------

    @Test
    void createSignedUploadUrl_pathWithDotDot_returnsEmpty_noHttpCall() {
        Optional<String> result = svc.createSignedUploadUrl(BUCKET, "listings/../secret/file.jpg");

        assertThat(result).isEmpty();
        verifyNoInteractions(restTemplate);
    }

    // -------------------------------------------------------------------------
    // Security: service-role key must not appear in signed URL
    // -------------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void createSignedUploadUrl_serviceRoleKeyNeverInReturnedUrl() {
        String relativeUrl = "/object/upload/sign/" + BUCKET + "/" + STORAGE_PATH + "?token=some-token";
        ResponseEntity<Map> mockResponse = ResponseEntity.ok(Map.of("url", relativeUrl));
        when(restTemplate.exchange(contains("/upload/sign/"), eq(HttpMethod.POST), any(), eq(Map.class)))
                .thenReturn(mockResponse);

        Optional<String> result = svc.createSignedUploadUrl(BUCKET, STORAGE_PATH);

        assertThat(result).isPresent();
        assertThat(result.get())
                .as("service-role key must not appear in the returned signed URL")
                .doesNotContain(SERVICE_ROLE_KEY);
    }
}
