package com.example.realestate.listing.storage;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.info.Info;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link SupabaseStorageInfoContributor}.
 *
 * <p>Confirms the contributor reports the correct {@code enabled} flag and reason string
 * for each effective state of {@link SupabaseStorageService}.
 */
class SupabaseStorageInfoContributorTest {

    @SuppressWarnings("unchecked")
    private Map<String, Object> contributeAndGetDetail(SupabaseStorageService svc) {
        Info.Builder builder = new Info.Builder();
        new SupabaseStorageInfoContributor(svc).contribute(builder);
        Info info = builder.build();
        Object detail = info.getDetails().get("supabaseStorage");
        assertThat(detail).isInstanceOf(Map.class);
        return (Map<String, Object>) detail;
    }

    @Test
    void contribute_enabled_reportsEnabled() {
        SupabaseStorageService svc = mock(SupabaseStorageService.class);
        when(svc.isEnabled()).thenReturn(true);
        when(svc.getStatusReason()).thenReturn("enabled");

        Map<String, Object> detail = contributeAndGetDetail(svc);

        assertThat(detail.get("enabled")).isEqualTo(true);
        assertThat(detail.get("reason")).isEqualTo("enabled");
    }

    @Test
    void contribute_disabledByFlag_reportsDisabledByFlag() {
        SupabaseStorageService svc = mock(SupabaseStorageService.class);
        when(svc.isEnabled()).thenReturn(false);
        when(svc.getStatusReason()).thenReturn("disabled-by-flag");

        Map<String, Object> detail = contributeAndGetDetail(svc);

        assertThat(detail.get("enabled")).isEqualTo(false);
        assertThat(detail.get("reason")).isEqualTo("disabled-by-flag");
    }

    @Test
    void contribute_missingCredentials_reportsMissingCredentials() {
        SupabaseStorageService svc = mock(SupabaseStorageService.class);
        when(svc.isEnabled()).thenReturn(false);
        when(svc.getStatusReason()).thenReturn("missing-credentials");

        Map<String, Object> detail = contributeAndGetDetail(svc);

        assertThat(detail.get("enabled")).isEqualTo(false);
        assertThat(detail.get("reason")).isEqualTo("missing-credentials");
    }
}
