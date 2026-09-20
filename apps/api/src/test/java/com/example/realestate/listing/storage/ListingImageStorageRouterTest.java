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
        router = new ListingImageStorageRouter(supabaseStorageService, r2StorageService, localDevStorageService, "r2");
    }

    @Test
    void getActiveProviderName_returnsConfiguredProvider() {
        given(localDevStorageService.isEnabled()).willReturn(false);
        assertThat(router.getActiveProviderName()).isEqualTo("r2");
    }

    @Test
    void getActiveProviderName_whenLocalDevEnabled_returnsLocalDev() {
        given(localDevStorageService.isEnabled()).willReturn(true);
        assertThat(router.getActiveProviderName()).isEqualTo("local-dev");
    }

    @Test
    void resolveActiveStorage_routesToR2ByDefault() {
        org.mockito.Mockito.lenient().when(localDevStorageService.isEnabled()).thenReturn(false);
        given(r2StorageService.getPublicUrl("listing-images", "listings/1/file.jpg"))
                .willReturn("https://img.propertysignal.in/listings/1/file.jpg");

        String url = router.getPublicUrl("listing-images", "listings/1/file.jpg");

        assertThat(url).isEqualTo("https://img.propertysignal.in/listings/1/file.jpg");
        verify(r2StorageService).getPublicUrl("listing-images", "listings/1/file.jpg");
    }

    @Test
    void resolveActiveStorage_routesToSupabaseWhenConfigured() {
        ListingImageStorageRouter supabaseRouter = new ListingImageStorageRouter(
                supabaseStorageService, r2StorageService, localDevStorageService, "supabase");
        given(supabaseStorageService.getPublicUrl("listing-images", "listings/1/file.jpg"))
                .willReturn("https://example.supabase.co/storage/v1/object/public/listing-images/listings/1/file.jpg");

        String url = supabaseRouter.getPublicUrl("listing-images", "listings/1/file.jpg");

        assertThat(url).isEqualTo("https://example.supabase.co/storage/v1/object/public/listing-images/listings/1/file.jpg");
        verify(supabaseStorageService).getPublicUrl("listing-images", "listings/1/file.jpg");
    }

    @Test
    void resolveActiveStorage_routesToLocalWhenConfigured() {
        ListingImageStorageRouter localRouter = new ListingImageStorageRouter(
                supabaseStorageService, r2StorageService, localDevStorageService, "local");
        given(localDevStorageService.getPublicUrl("listing-images", "listings/1/file.jpg"))
                .willReturn(Optional.of("http://localhost:8085/api/dev/local-storage/public/listing-images/listings/1/file.jpg"));

        String url = localRouter.getPublicUrl("listing-images", "listings/1/file.jpg");

        assertThat(url).isEqualTo("http://localhost:8085/api/dev/local-storage/public/listing-images/listings/1/file.jpg");
        verify(localDevStorageService).getPublicUrl("listing-images", "listings/1/file.jpg");
    }

    @Test
    void unknownProvider_throwsIllegalArgumentException() {
        ListingImageStorageRouter unknownRouter = new ListingImageStorageRouter(
                supabaseStorageService, r2StorageService, localDevStorageService, "unknown-provider");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> unknownRouter.getPublicUrl("listing-images", "listings/1/file.jpg"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown listing image storage provider: unknown-provider");
    }

    @Test
    void createUploadTarget_delegatesToResolvedStorage() {
        UploadTarget target = new UploadTarget("https://signed-url", "listings/1/file.jpg", null, Map.of("Content-Type", "image/jpeg"));
        given(r2StorageService.createUploadTarget("listing-images", "listings/1/file.jpg", "image/jpeg"))
                .willReturn(Optional.of(target));

        Optional<UploadTarget> result = router.createUploadTarget("listing-images", "listings/1/file.jpg", "image/jpeg");

        assertThat(result).contains(target);
        verify(r2StorageService).createUploadTarget("listing-images", "listings/1/file.jpg", "image/jpeg");
    }

    @Test
    void deleteObjectBestEffort_delegatesToResolvedStorage() {
        router.deleteObjectBestEffort("listings/1/file.jpg");
        verify(r2StorageService).deleteObjectBestEffort("listings/1/file.jpg");
    }

    @Test
    void inspect_delegatesToResolvedStorage() {
        ImageObjectMetadata meta = new ImageObjectMetadata(true, 1024L, "image/jpeg");
        given(r2StorageService.inspect("listings/1/file.jpg")).willReturn(meta);

        ImageObjectMetadata result = router.inspect("listings/1/file.jpg");

        assertThat(result).isEqualTo(meta);
        verify(r2StorageService).inspect("listings/1/file.jpg");
    }
}
