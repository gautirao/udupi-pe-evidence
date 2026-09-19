package com.example.realestate.listing.storage;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class ListingImageStorageRouterTest {

    @Mock
    private SupabaseStorageService supabaseStorageService;

    @Mock
    private R2StorageService r2StorageService;

    @Mock
    private LocalDevStorageService localDevStorageService;

    private ListingImageStorageRouter router;

    @BeforeEach
    void setUp() {
        router = new ListingImageStorageRouter(supabaseStorageService, r2StorageService, localDevStorageService, "supabase");
    }

    @Test
    void getActiveProviderName_returnsConfiguredProvider() {
        given(localDevStorageService.isEnabled()).willReturn(false);
        assertThat(router.getActiveProviderName()).isEqualTo("supabase");
    }

    @Test
    void getActiveProviderName_whenLocalDevEnabled_returnsLocalDev() {
        given(localDevStorageService.isEnabled()).willReturn(true);
        assertThat(router.getActiveProviderName()).isEqualTo("local-dev");
    }

    @Test
    void resolveActiveStorage_routesToR2WhenConfigured() {
        ListingImageStorageRouter r2Router = new ListingImageStorageRouter(
                supabaseStorageService, r2StorageService, localDevStorageService, "r2");
        org.mockito.Mockito.lenient().when(localDevStorageService.isEnabled()).thenReturn(false);
        given(r2StorageService.getPublicUrl("listing-images", "listings/1/file.jpg"))
                .willReturn("https://img.propertysignal.in/listings/1/file.jpg");

        String url = r2Router.getPublicUrl("listing-images", "listings/1/file.jpg");

        assertThat(url).isEqualTo("https://img.propertysignal.in/listings/1/file.jpg");
        verify(r2StorageService).getPublicUrl("listing-images", "listings/1/file.jpg");
    }

    @Test
    void getPublicUrl_delegatesToResolvedStorage() {
        given(supabaseStorageService.getPublicUrl("listing-images", "listings/1/file.jpg"))
                .willReturn("https://example.supabase.co/storage/v1/object/public/listing-images/listings/1/file.jpg");

        String url = router.getPublicUrl("listing-images", "listings/1/file.jpg");

        assertThat(url).isEqualTo("https://example.supabase.co/storage/v1/object/public/listing-images/listings/1/file.jpg");
        verify(supabaseStorageService).getPublicUrl("listing-images", "listings/1/file.jpg");
    }

    @Test
    void createUploadTarget_delegatesToResolvedStorage() {
        UploadTarget target = new UploadTarget("https://signed-url", "listings/1/file.jpg", null, Map.of("Content-Type", "image/jpeg"));
        given(supabaseStorageService.createUploadTarget("listing-images", "listings/1/file.jpg", "image/jpeg"))
                .willReturn(Optional.of(target));

        Optional<UploadTarget> result = router.createUploadTarget("listing-images", "listings/1/file.jpg", "image/jpeg");

        assertThat(result).contains(target);
        verify(supabaseStorageService).createUploadTarget("listing-images", "listings/1/file.jpg", "image/jpeg");
    }

    @Test
    void deleteObjectBestEffort_delegatesToResolvedStorage() {
        router.deleteObjectBestEffort("listings/1/file.jpg");
        verify(supabaseStorageService).deleteObjectBestEffort("listings/1/file.jpg");
    }

    @Test
    void inspect_delegatesToResolvedStorage() {
        ImageObjectMetadata meta = new ImageObjectMetadata(true, 1024L, "image/jpeg");
        given(supabaseStorageService.inspect("listings/1/file.jpg")).willReturn(meta);

        ImageObjectMetadata result = router.inspect("listings/1/file.jpg");

        assertThat(result).isEqualTo(meta);
        verify(supabaseStorageService).inspect("listings/1/file.jpg");
    }
}
