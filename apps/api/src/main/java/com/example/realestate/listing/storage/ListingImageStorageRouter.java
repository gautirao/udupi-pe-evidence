package com.example.realestate.listing.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Provider router and facade for listing image storage operations.
 *
 * <p>Annotated with {@code @Primary} so Spring autowires this router whenever
 * {@link ListingImageStorage} is injected.
 *
 * <p>Reads configuration property {@code listing.images.storage.provider}
 * (environment variable {@code LISTING_IMAGE_STORAGE_PROVIDER}, default {@code supabase}).
 * When {@link LocalDevStorageService#isEnabled()} is true in local dev worktrees,
 * local storage routing takes precedence.
 */
@Primary
@Service
public class ListingImageStorageRouter implements ListingImageStorage {

    private static final Logger log = LoggerFactory.getLogger(ListingImageStorageRouter.class);

    private final SupabaseStorageService supabaseStorageService;
    private final LocalDevStorageService localDevStorageService;
    private final String configuredProvider;

    public ListingImageStorageRouter(
            SupabaseStorageService supabaseStorageService,
            LocalDevStorageService localDevStorageService,
            @Value("${listing.images.storage.provider:supabase}") String configuredProvider) {
        this.supabaseStorageService = supabaseStorageService;
        this.localDevStorageService = localDevStorageService;
        this.configuredProvider = configuredProvider != null ? configuredProvider.trim().toLowerCase() : "supabase";
    }

    public String getActiveProviderName() {
        if (localDevStorageService != null && localDevStorageService.isEnabled()) {
            return "local-dev";
        }
        return configuredProvider;
    }

    private ListingImageStorage resolveActiveStorage() {
        if ("supabase".equalsIgnoreCase(configuredProvider)) {
            return supabaseStorageService;
        }
        log.warn("Unknown listing image storage provider '{}', falling back to Supabase", configuredProvider);
        return supabaseStorageService;
    }

    @Override
    public String getPublicUrl(String storageBucket, String storagePath) {
        return resolveActiveStorage().getPublicUrl(storageBucket, storagePath);
    }

    @Override
    public Optional<UploadTarget> createUploadTarget(String storageBucket, String storagePath, String contentType) {
        return resolveActiveStorage().createUploadTarget(storageBucket, storagePath, contentType);
    }

    @Override
    public void deleteObjectBestEffort(String storagePath) {
        resolveActiveStorage().deleteObjectBestEffort(storagePath);
    }

    @Override
    public ImageObjectMetadata inspect(String storagePath) {
        return resolveActiveStorage().inspect(storagePath);
    }
}
