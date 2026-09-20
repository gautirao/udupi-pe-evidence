package com.example.realestate.listing.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Optional;

/**
 * Provider router and facade for listing image storage operations.
 *
 * <p>Annotated with {@code @Primary} so Spring autowires this router whenever
 * {@link ListingImageStorage} is injected.
 *
 * <p>Reads configuration property {@code listing.images.storage.provider}
 * (environment variable {@code LISTING_IMAGES_STORAGE_PROVIDER}, default {@code supabase}).
 * When {@link LocalDevStorageService#isEnabled()} is true in local dev worktrees,
 * local storage routing takes precedence.
 */
@Primary
@Service
public class ListingImageStorageRouter implements ListingImageStorage {

    private static final Logger log = LoggerFactory.getLogger(ListingImageStorageRouter.class);

    private final SupabaseStorageService supabaseStorageService;
    private final R2StorageService r2StorageService;
    private final LocalDevStorageService localDevStorageService;
    private final String configuredProvider;

    private final ListingImageStorage localDevAdapter = new ListingImageStorage() {
        @Override
        public String getPublicUrl(String storageBucket, String storagePath) {
            if (storagePath == null || storagePath.isBlank()) {
                return "";
            }
            if (storagePath.startsWith("external:")) {
                return storagePath.substring("external:".length());
            }
            return localDevStorageService != null ? localDevStorageService.getPublicUrl(storageBucket, storagePath).orElse("") : "";
        }

        @Override
        public Optional<UploadTarget> createUploadTarget(String storageBucket, String storagePath, String contentType) {
            if (localDevStorageService == null) {
                return Optional.empty();
            }
            return localDevStorageService.createSignedUploadUrl(storageBucket, storagePath)
                    .map(url -> new UploadTarget(url, storagePath, null, Map.of()));
        }

        @Override
        public void deleteObjectBestEffort(String storagePath) {
            // Local dev storage best-effort delete — no-op
        }

        @Override
        public ImageObjectMetadata inspect(String storagePath) {
            if (storagePath == null || storagePath.isBlank()) {
                return ImageObjectMetadata.notFound();
            }
            if (storagePath.startsWith("external:")) {
                return new ImageObjectMetadata(true, null, null);
            }
            if (localDevStorageService != null && localDevStorageService.isEnabled()) {
                return new ImageObjectMetadata(true, null, null);
            }
            return ImageObjectMetadata.notFound();
        }
    };

    public ListingImageStorageRouter(
            SupabaseStorageService supabaseStorageService,
            R2StorageService r2StorageService,
            LocalDevStorageService localDevStorageService,
            @Value("${listing.images.storage.provider:supabase}") String configuredProvider) {
        this.supabaseStorageService = supabaseStorageService;
        this.r2StorageService = r2StorageService;
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
        if ("r2".equalsIgnoreCase(configuredProvider)) {
            return r2StorageService;
        }
        if ("supabase".equalsIgnoreCase(configuredProvider)) {
            return supabaseStorageService;
        }
        if ("local".equalsIgnoreCase(configuredProvider) || "local-dev".equalsIgnoreCase(configuredProvider) || "localdev".equalsIgnoreCase(configuredProvider)) {
            return localDevAdapter;
        }
        throw new IllegalArgumentException("Unknown listing image storage provider: " + configuredProvider);
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
