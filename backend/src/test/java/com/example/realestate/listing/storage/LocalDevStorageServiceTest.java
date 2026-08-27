package com.example.realestate.listing.storage;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Path;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link LocalDevStorageService} (#2351).
 */
class LocalDevStorageServiceTest {

    private static final String BUCKET = "listing-images";

    private LocalDevStorageService newService(boolean enabled, Path root) {
        LocalDevStorageService svc = new LocalDevStorageService();
        ReflectionTestUtils.setField(svc, "enabled", enabled);
        ReflectionTestUtils.setField(svc, "rootDir", root.toString());
        // publicBaseUrlOverride left blank — outside a request context, resolvePublicBaseUrl()
        // falls back to the conventional local port (asserted below).
        return svc;
    }

    @Test
    void disabled_createSignedUploadUrl_returnsEmpty(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(false, tmp);
        assertThat(svc.createSignedUploadUrl(BUCKET, "listings/u1/l1/uuid.jpg")).isEmpty();
    }

    @Test
    void enabled_createSignedUploadUrl_returnsSameOriginPutUrl(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        Optional<String> url = svc.createSignedUploadUrl(BUCKET, "listings/u1/l1/uuid.jpg");
        assertThat(url).contains("http://localhost:8085/api/dev/local-storage/upload/listing-images/listings/u1/l1/uuid.jpg");
    }

    @Test
    void createSignedUploadUrl_rejectsPathTraversal(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        assertThat(svc.createSignedUploadUrl(BUCKET, "../../etc/passwd")).isEmpty();
    }

    @Test
    void writeThenReadObject_roundTrips(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        byte[] bytes = "fake-jpeg-bytes".getBytes();

        boolean written = svc.writeObject(BUCKET, "listings/u1/l1/uuid.jpg", bytes);

        assertThat(written).isTrue();
        assertThat(svc.readObject(BUCKET, "listings/u1/l1/uuid.jpg")).contains(bytes);
    }

    @Test
    void readObject_missingFile_returnsEmpty(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        assertThat(svc.readObject(BUCKET, "listings/u1/l1/does-not-exist.jpg")).isEmpty();
    }

    @Test
    void writeObject_disabled_returnsFalse(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(false, tmp);
        assertThat(svc.writeObject(BUCKET, "listings/u1/l1/uuid.jpg", "x".getBytes())).isFalse();
    }

    @Test
    void writeObject_rejectsPathTraversal(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        assertThat(svc.writeObject(BUCKET, "../escape.jpg", "x".getBytes())).isFalse();
    }

    // ==================== getPublicUrl (#2351 blocking fix) ====================

    @Test
    void disabled_getPublicUrl_returnsEmpty(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(false, tmp);
        assertThat(svc.getPublicUrl(BUCKET, "listings/u1/l1/uuid.jpg")).isEmpty();
    }

    @Test
    void enabled_getPublicUrl_returnsSameOriginPublicGetUrl(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        Optional<String> url = svc.getPublicUrl(BUCKET, "listings/u1/l1/uuid.jpg");
        assertThat(url).contains("http://localhost:8085/api/dev/local-storage/public/listing-images/listings/u1/l1/uuid.jpg");
    }

    @Test
    void getPublicUrl_rejectsPathTraversal(@org.junit.jupiter.api.io.TempDir Path tmp) {
        LocalDevStorageService svc = newService(true, tmp);
        assertThat(svc.getPublicUrl(BUCKET, "../../etc/passwd")).isEmpty();
    }

    @Test
    void getPublicUrl_thenReadObject_resolvesToThePreviouslyWrittenBytes(@org.junit.jupiter.api.io.TempDir Path tmp) {
        // Proves the URL getPublicUrl returns actually maps to bytes writeObject stored — i.e.
        // the same storagePath used to build the URL round-trips through readObject, which is
        // exactly what LocalDevStorageController#serve calls to serve that URL's GET request.
        LocalDevStorageService svc = newService(true, tmp);
        String storagePath = "listings/u1/l1/uuid.jpg";
        byte[] bytes = "fake-jpeg-bytes".getBytes();
        assertThat(svc.writeObject(BUCKET, storagePath, bytes)).isTrue();

        Optional<String> url = svc.getPublicUrl(BUCKET, storagePath);

        assertThat(url).isPresent();
        assertThat(url.get()).endsWith("/public/" + BUCKET + "/" + storagePath);
        assertThat(svc.readObject(BUCKET, storagePath)).contains(bytes);
    }
}
