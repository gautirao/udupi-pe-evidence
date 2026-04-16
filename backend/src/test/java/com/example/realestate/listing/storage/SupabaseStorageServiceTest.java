package com.example.realestate.listing.storage;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link SupabaseStorageService#validate()}.
 *
 * <p>Covers the (enabled × credentials) matrix plus HTTPS enforcement:
 * <ul>
 *   <li>{@code enabled=false} → disabled, reason=disabled-by-flag.</li>
 *   <li>{@code enabled=true} + both creds present + HTTPS → enabled.</li>
 *   <li>{@code enabled=true} + URL missing → graceful, reason=missing-credentials.</li>
 *   <li>{@code enabled=true} + key missing → graceful, reason=missing-credentials.</li>
 *   <li>{@code enabled=true} + both missing → graceful, reason=missing-credentials.</li>
 *   <li>{@code enabled=true} + non-HTTPS URL → throws (HTTPS hard-fail preserved).</li>
 * </ul>
 *
 * <p>Uses {@link ReflectionTestUtils#setField} to populate {@code @Value}-injected fields
 * without bootstrapping the Spring context, keeping the test light-weight and focused on
 * the reconciliation logic in {@code validate()}.
 */
class SupabaseStorageServiceTest {

    private static final String HTTPS_URL = "https://example.supabase.co";
    private static final String HTTP_URL  = "http://example.supabase.co";
    private static final String KEY       = "svc-role-key-abc";

    private SupabaseStorageService newService(boolean enabledFlag, String url, String key) {
        SupabaseStorageService svc = new SupabaseStorageService(new RestTemplate());
        ReflectionTestUtils.setField(svc, "configuredEnabled", enabledFlag);
        ReflectionTestUtils.setField(svc, "supabaseUrl", url);
        ReflectionTestUtils.setField(svc, "serviceRoleKey", key);
        ReflectionTestUtils.setField(svc, "bucket", "listing-images");
        return svc;
    }

    // -------------------------------------------------------------------------
    // Disabled by flag
    // -------------------------------------------------------------------------

    @Test
    void validate_enabledFalse_isDisabledByFlag_regardlessOfCreds() {
        SupabaseStorageService svc = newService(false, HTTPS_URL, KEY);
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("disabled-by-flag");
    }

    @Test
    void validate_enabledFalse_emptyCreds_stillDisabledByFlag() {
        SupabaseStorageService svc = newService(false, "", "");
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("disabled-by-flag");
    }

    // -------------------------------------------------------------------------
    // Enabled — happy path
    // -------------------------------------------------------------------------

    @Test
    void validate_enabledTrue_bothCredsPresent_enabled() {
        SupabaseStorageService svc = newService(true, HTTPS_URL, KEY);
        svc.validate();

        assertThat(svc.isEnabled()).isTrue();
        assertThat(svc.getStatusReason()).isEqualTo("enabled");
    }

    // -------------------------------------------------------------------------
    // Enabled — graceful downgrade (missing creds)
    // -------------------------------------------------------------------------

    @Test
    void validate_enabledTrue_urlMissing_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, "", KEY);
        // Must not throw.
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    @Test
    void validate_enabledTrue_urlBlank_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, "   ", KEY);
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    @Test
    void validate_enabledTrue_keyMissing_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, HTTPS_URL, "");
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    @Test
    void validate_enabledTrue_keyBlank_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, HTTPS_URL, "   ");
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    @Test
    void validate_enabledTrue_bothCredsMissing_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, "", "");
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    @Test
    void validate_enabledTrue_urlNull_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, null, KEY);
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    @Test
    void validate_enabledTrue_keyNull_gracefulDowngrade() {
        SupabaseStorageService svc = newService(true, HTTPS_URL, null);
        svc.validate();

        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("missing-credentials");
    }

    // -------------------------------------------------------------------------
    // Enabled — HTTPS enforcement (hard fail preserved)
    // -------------------------------------------------------------------------

    @Test
    void validate_enabledTrue_httpUrl_throws() {
        SupabaseStorageService svc = newService(true, HTTP_URL, KEY);

        assertThatThrownBy(svc::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("https://");
    }

    // -------------------------------------------------------------------------
    // Initial state (before validate() runs) — fail-safe default
    // -------------------------------------------------------------------------

    @Test
    void beforeValidate_serviceIsDisabled() {
        SupabaseStorageService svc = newService(true, HTTPS_URL, KEY);
        // validate() not yet called — must not report enabled.
        assertThat(svc.isEnabled()).isFalse();
        assertThat(svc.getStatusReason()).isEqualTo("disabled-by-flag");
    }

    // -------------------------------------------------------------------------
    // Sentinel prefix is exposed for TrustController
    // -------------------------------------------------------------------------

    @Test
    void sentinelPrefix_isStable() {
        assertThat(SupabaseStorageService.STORAGE_DISABLED_SENTINEL_PREFIX)
                .isEqualTo("storage-disabled://");
    }
}
