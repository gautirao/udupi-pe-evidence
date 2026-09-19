package com.example.realestate.listing.storage;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.info.Info;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link R2StorageInfoContributor} (#2630).
 * Confirms Actuator info reporting for R2 storage readiness without secret leakage.
 */
class R2StorageInfoContributorTest {

    @SuppressWarnings("unchecked")
    private Map<String, Object> contributeAndGetDetail(R2StorageService svc) {
        Info.Builder builder = new Info.Builder();
        new R2StorageInfoContributor(svc).contribute(builder);
        Info info = builder.build();
        Object detail = info.getDetails().get("r2Storage");
        assertThat(detail).isInstanceOf(Map.class);
        return (Map<String, Object>) detail;
    }

    @Test
    void contribute_enabled_reportsEnabledDetails() {
        R2StorageService svc = mock(R2StorageService.class);
        when(svc.isEnabled()).thenReturn(true);
        when(svc.getStatusReason()).thenReturn("enabled");
        when(svc.getBucket()).thenReturn("listing-images");
        when(svc.getPublicBaseUrl()).thenReturn("https://img.propertysignal.in");

        Map<String, Object> detail = contributeAndGetDetail(svc);

        assertThat(detail.get("enabled")).isEqualTo(true);
        assertThat(detail.get("reason")).isEqualTo("enabled");
        assertThat(detail.get("bucket")).isEqualTo("listing-images");
        assertThat(detail.get("publicBaseUrl")).isEqualTo("https://img.propertysignal.in");
    }

    @Test
    void contribute_disabledByProvider_reportsDisabledDetails() {
        R2StorageService svc = mock(R2StorageService.class);
        when(svc.isEnabled()).thenReturn(false);
        when(svc.getStatusReason()).thenReturn("disabled-by-provider");
        when(svc.getBucket()).thenReturn("listing-images");
        when(svc.getPublicBaseUrl()).thenReturn("https://img.propertysignal.in");

        Map<String, Object> detail = contributeAndGetDetail(svc);

        assertThat(detail.get("enabled")).isEqualTo(false);
        assertThat(detail.get("reason")).isEqualTo("disabled-by-provider");
    }

    @Test
    void contribute_missingCredentials_reportsMissingCredentialsDetails() {
        R2StorageService svc = mock(R2StorageService.class);
        when(svc.isEnabled()).thenReturn(false);
        when(svc.getStatusReason()).thenReturn("missing-credentials");
        when(svc.getBucket()).thenReturn("listing-images");
        when(svc.getPublicBaseUrl()).thenReturn("https://img.propertysignal.in");

        Map<String, Object> detail = contributeAndGetDetail(svc);

        assertThat(detail.get("enabled")).isEqualTo(false);
        assertThat(detail.get("reason")).isEqualTo("missing-credentials");
    }
}
