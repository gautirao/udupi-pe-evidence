package com.example.realestate.listing.storage;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Dev-only filesystem storage endpoints backing {@link LocalDevStorageService} (#2351).
 *
 * <p>Mounts no routes unless {@code local.dev.storage.enabled=true} — never set outside a
 * local-dev {@code apps/api/.env}. Never enabled in prod/CI, so this class exists in the
 * production JAR but is never wired into a running request path there.
 */
@RestController
@ConditionalOnProperty(name = "local.dev.storage.enabled", havingValue = "true")
public class LocalDevStorageController {

    private final LocalDevStorageService storageService;

    public LocalDevStorageController(LocalDevStorageService storageService) {
        this.storageService = storageService;
    }

    @PutMapping("/api/dev/local-storage/upload/{bucket}/**")
    public ResponseEntity<?> upload(@PathVariable String bucket,
                                     org.springframework.web.context.request.WebRequest request,
                                     @RequestBody byte[] body) {
        String storagePath = extractStoragePath(request, bucket);
        if (storagePath == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing storage path"));
        }
        boolean written = storageService.writeObject(bucket, storagePath, body);
        if (!written) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Local dev storage unavailable"));
        }
        return ResponseEntity.ok().build();
    }

    @GetMapping("/api/dev/local-storage/public/{bucket}/**")
    public ResponseEntity<byte[]> serve(@PathVariable String bucket,
                                         org.springframework.web.context.request.WebRequest request) {
        String storagePath = extractStoragePath(request, bucket);
        if (storagePath == null) {
            return ResponseEntity.notFound().build();
        }
        return storageService.readObject(bucket, storagePath)
                .map(bytes -> ResponseEntity.ok()
                        .header(HttpHeaders.CONTENT_TYPE, guessContentType(storagePath))
                        .body(bytes))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Pulls the {@code **} tail of the request path — Spring's {@code {bucket}/**} pattern does
     * not bind the wildcard remainder to a {@code @PathVariable} on its own.
     */
    private String extractStoragePath(org.springframework.web.context.request.WebRequest request, String bucket) {
        String uri = ((org.springframework.web.context.request.ServletWebRequest) request)
                .getRequest().getRequestURI();
        String marker = "/" + bucket + "/";
        int idx = uri.indexOf(marker);
        if (idx < 0) {
            return null;
        }
        String tail = uri.substring(idx + marker.length());
        return tail.isBlank() ? null : tail;
    }

    private String guessContentType(String storagePath) {
        String lower = storagePath.toLowerCase();
        if (lower.endsWith(".png")) return MediaType.IMAGE_PNG_VALUE;
        if (lower.endsWith(".webp")) return "image/webp";
        return MediaType.IMAGE_JPEG_VALUE;
    }
}
