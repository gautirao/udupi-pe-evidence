package com.example.realestate.listing.storage;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Optional;

/**
 * Filesystem-backed stand-in for {@link SupabaseStorageService}'s signed-upload-URL contract,
 * used only in local dev worktrees where real Supabase Storage is unavailable (#2351).
 *
 * <p>Enabled only when {@code local.dev.storage.enabled=true} (never set in prod/CI config —
 * see {@code backend/.env.example}). When enabled, {@link SupabaseStorageService#createSignedUploadUrl}
 * delegates here instead of returning {@link Optional#empty()}, so the real-UI photo-upload path
 * works in local dev without touching real/shared Supabase Storage.
 *
 * <p>The returned "signed URL" is a same-origin PUT endpoint served by {@link LocalDevStorageController},
 * which is itself gated by the same {@code local.dev.storage.enabled} flag and mounts no routes when off.
 */
@Service
public class LocalDevStorageService {

    private static final Logger log = LoggerFactory.getLogger(LocalDevStorageService.class);

    @Value("${local.dev.storage.enabled:false}")
    private boolean enabled;

    @Value("${local.dev.storage.root:${java.io.tmpdir}/udupi-local-storage}")
    private String rootDir;

    /**
     * Explicit override for the local storage base URL. Left blank by default: each worktree
     * runs its backend on its own port (#2351 — 8 concurrent worktree backends is normal), so
     * the base URL is derived from the current request's own host/port instead of a shared
     * static value in the worktree-shared {@code backend/.env}.
     */
    @Value("${local.dev.storage.public-base-url:}")
    private String publicBaseUrlOverride;

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * @return the same-origin PUT URL the frontend should upload bytes to, or empty if disabled
     *         or the path is unsafe.
     */
    public Optional<String> createSignedUploadUrl(String bucket, String storagePath) {
        if (!enabled) {
            log.debug("Local dev storage upload URL skipped (disabled): path={}", storagePath);
            return Optional.empty();
        }
        if (!isSafePath(storagePath)) {
            log.warn("Local dev storage upload URL rejected — unsafe path: path={}", storagePath);
            return Optional.empty();
        }
        String url = resolvePublicBaseUrl() + "/upload/" + bucket + "/" + storagePath;
        return Optional.of(url);
    }

    /**
     * @return the same-origin GET URL that resolves to the bytes previously written for
     *         {@code bucket}/{@code storagePath} via {@link #writeObject}, or empty if disabled
     *         or the path is unsafe. Served by {@link LocalDevStorageController#serve}.
     */
    public Optional<String> getPublicUrl(String bucket, String storagePath) {
        if (!enabled) {
            return Optional.empty();
        }
        if (!isSafePath(storagePath)) {
            log.warn("Local dev storage public URL rejected — unsafe path: path={}", storagePath);
            return Optional.empty();
        }
        return Optional.of(resolvePublicBaseUrl() + "/public/" + bucket + "/" + storagePath);
    }

    private String resolvePublicBaseUrl() {
        if (publicBaseUrlOverride != null && !publicBaseUrlOverride.isBlank()) {
            return publicBaseUrlOverride;
        }
        try {
            HttpServletRequest request = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();
            return request.getScheme() + "://" + request.getServerName() + ":" + request.getServerPort() + "/api/dev/local-storage";
        } catch (IllegalStateException e) {
            // No active HTTP request (e.g. a background job) — fall back to the conventional local port.
            return "http://localhost:8085/api/dev/local-storage";
        }
    }

    /** Writes bytes for {@code bucket}/{@code storagePath} under the configured local root. */
    public boolean writeObject(String bucket, String storagePath, byte[] content) {
        if (!enabled || !isSafePath(storagePath)) {
            return false;
        }
        try {
            Path target = resolve(bucket, storagePath);
            Files.createDirectories(target.getParent());
            Path tmp = Files.createTempFile(target.getParent(), "upload-", ".tmp");
            Files.write(tmp, content);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
            log.info("Local dev storage object written: bucket={} path={} bytes={}", bucket, storagePath, content.length);
            return true;
        } catch (IOException e) {
            log.warn("Local dev storage write failed — bucket={} path={} error={}", bucket, storagePath, e.getClass().getSimpleName());
            return false;
        }
    }

    /** Reads bytes previously written for {@code bucket}/{@code storagePath}, or empty if missing/disabled. */
    public Optional<byte[]> readObject(String bucket, String storagePath) {
        if (!enabled || !isSafePath(storagePath)) {
            return Optional.empty();
        }
        try {
            Path target = resolve(bucket, storagePath);
            if (!Files.isRegularFile(target)) {
                return Optional.empty();
            }
            return Optional.of(Files.readAllBytes(target));
        } catch (IOException e) {
            log.warn("Local dev storage read failed — bucket={} path={} error={}", bucket, storagePath, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private Path resolve(String bucket, String storagePath) {
        Path root = Paths.get(rootDir).toAbsolutePath().normalize();
        Path target = root.resolve(bucket).resolve(storagePath).normalize();
        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("resolved path escapes local storage root");
        }
        return target;
    }

    private boolean isSafePath(String storagePath) {
        return storagePath != null && !storagePath.isBlank() && !storagePath.contains("..");
    }
}
