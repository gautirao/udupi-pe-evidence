package com.example.realestate.listing.storage;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URL;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class R2StorageServiceTest {

    @Mock
    private S3Client s3Client;

    @Mock
    private S3Presigner s3Presigner;

    @Mock
    private LocalDevStorageService localDevStorageService;

    private R2StorageService r2StorageService;

    @BeforeEach
    void setUp() {
        r2StorageService = new R2StorageService(
                "r2",
                "test-account-id",
                "test-access-key",
                "test-secret-key",
                "listing-images",
                "https://img.propertysignal.in",
                300,
                localDevStorageService,
                s3Client,
                s3Presigner
        );
    }

    @Test
    void validate_enabledWhenProviderIsR2AndCredsPresent() {
        assertThat(r2StorageService.isEnabled()).isTrue();
        assertThat(r2StorageService.getStatusReason()).isEqualTo("enabled");
        assertThat(r2StorageService.getBucket()).isEqualTo("listing-images");
        assertThat(r2StorageService.getPublicBaseUrl()).isEqualTo("https://img.propertysignal.in");
    }

    @Test
    void validate_disabledWhenProviderIsNotR2() {
        R2StorageService service = new R2StorageService(
                "supabase",
                "test-account-id",
                "test-access-key",
                "test-secret-key",
                "listing-images",
                "https://img.propertysignal.in",
                300,
                localDevStorageService,
                s3Client,
                s3Presigner
        );
        assertThat(service.isEnabled()).isFalse();
        assertThat(service.getStatusReason()).isEqualTo("disabled-by-provider");
    }

    @Test
    void validate_disabledWhenRequiredConfigMissing_failsClosedWithoutCrashing() {
        R2StorageService service = new R2StorageService(
                "r2",
                "",
                "test-access-key",
                "test-secret-key",
                "listing-images",
                "https://img.propertysignal.in",
                300,
                localDevStorageService,
                s3Client,
                s3Presigner
        );
        assertThat(service.isEnabled()).isFalse();
        assertThat(service.getStatusReason()).isEqualTo("missing-credentials");
        // Verify local test fallback behavior: functions don't crash
        given(localDevStorageService.isEnabled()).willReturn(false);
        assertThat(service.createUploadTarget("listing-images", "listings/1/photo.jpg", "image/jpeg")).isEmpty();
        assertThat(service.inspect("listings/1/photo.jpg").exists()).isFalse();
        service.deleteObjectBestEffort("listings/1/photo.jpg");
    }

    @Test
    void createUploadTarget_whenUnconfiguredAndLocalDevEnabled_delegatesToLocalDevStorage() {
        R2StorageService unconfiguredService = new R2StorageService(
                "r2",
                "",
                "",
                "",
                "listing-images",
                "https://img.propertysignal.in",
                300,
                localDevStorageService,
                null,
                null
        );
        given(localDevStorageService.isEnabled()).willReturn(true);
        given(localDevStorageService.createSignedUploadUrl("listing-images", "listings/1/photo.jpg"))
                .willReturn(Optional.of("http://localhost:8085/api/dev/local-storage/upload/listing-images/listings/1/photo.jpg"));

        Optional<UploadTarget> targetOpt = unconfiguredService.createUploadTarget("listing-images", "listings/1/photo.jpg", "image/jpeg");

        assertThat(targetOpt).isPresent();
        assertThat(targetOpt.get().signedUrl()).isEqualTo("http://localhost:8085/api/dev/local-storage/upload/listing-images/listings/1/photo.jpg");
    }

    @Test
    void getPublicUrl_derivesCanonicalPublicUrl() {
        String path = "listings/user-1/listing-2/test-uuid.jpg";
        String url = r2StorageService.getPublicUrl("listing-images", path);
        assertThat(url).isEqualTo("https://img.propertysignal.in/listings/user-1/listing-2/test-uuid.jpg");
    }

    @Test
    void getPublicUrl_stripsLeadingSlashFromPath() {
        String path = "/listings/user-1/listing-2/test-uuid.jpg";
        String url = r2StorageService.getPublicUrl("listing-images", path);
        assertThat(url).isEqualTo("https://img.propertysignal.in/listings/user-1/listing-2/test-uuid.jpg");
    }

    @Test
    void getPublicUrl_handlesExternalUrl() {
        String path = "external:https://cdn.external.com/photos/1.jpg";
        String url = r2StorageService.getPublicUrl("listing-images", path);
        assertThat(url).isEqualTo("https://cdn.external.com/photos/1.jpg");
    }

    @Test
    void createUploadTarget_presignsPutObjectWithHeadersAndExpiration() throws Exception {
        String storagePath = "listings/user-1/listing-2/test-uuid.jpg";
        String contentType = "image/jpeg";
        Instant expiresAt = Instant.now().plusSeconds(300);
        URL presignedUrl = new URL("https://test-account-id.r2.cloudflarestorage.com/listing-images/" + storagePath + "?X-Amz-Signature=12345");

        PresignedPutObjectRequest presignedPut = org.mockito.Mockito.mock(PresignedPutObjectRequest.class);
        given(presignedPut.url()).willReturn(presignedUrl);
        given(presignedPut.expiration()).willReturn(expiresAt);

        given(s3Presigner.presignPutObject(any(PutObjectPresignRequest.class))).willReturn(presignedPut);

        Optional<UploadTarget> targetOpt = r2StorageService.createUploadTarget("listing-images", storagePath, contentType);

        assertThat(targetOpt).isPresent();
        UploadTarget target = targetOpt.get();
        assertThat(target.signedUrl()).isEqualTo(presignedUrl.toString());
        assertThat(target.storagePath()).isEqualTo(storagePath);
        assertThat(target.expiresAt()).isEqualTo(expiresAt);
        assertThat(target.requiredHeaders()).containsEntry("Content-Type", "image/jpeg");
        assertThat(target.requiredHeaders()).containsEntry("Cache-Control", "public, max-age=31536000, immutable");

        ArgumentCaptor<PutObjectPresignRequest> captor = ArgumentCaptor.forClass(PutObjectPresignRequest.class);
        verify(s3Presigner).presignPutObject(captor.capture());
        PutObjectPresignRequest presignReq = captor.getValue();
        assertThat(presignReq.putObjectRequest().bucket()).isEqualTo("listing-images");
        assertThat(presignReq.putObjectRequest().key()).isEqualTo(storagePath);
        assertThat(presignReq.putObjectRequest().contentType()).isEqualTo("image/jpeg");
        assertThat(presignReq.putObjectRequest().cacheControl()).isEqualTo("public, max-age=31536000, immutable");
    }

    @Test
    void createUploadTarget_ignoresCallerSuppliedBucket_andUsesConfiguredBucketAuthority() throws Exception {
        String storagePath = "listings/user-1/listing-2/test-uuid.jpg";
        String contentType = "image/jpeg";
        Instant expiresAt = Instant.now().plusSeconds(300);
        URL presignedUrl = new URL("https://test-account-id.r2.cloudflarestorage.com/listing-images/" + storagePath + "?X-Amz-Signature=12345");

        PresignedPutObjectRequest presignedPut = org.mockito.Mockito.mock(PresignedPutObjectRequest.class);
        given(presignedPut.url()).willReturn(presignedUrl);
        given(presignedPut.expiration()).willReturn(expiresAt);

        given(s3Presigner.presignPutObject(any(PutObjectPresignRequest.class))).willReturn(presignedPut);

        Optional<UploadTarget> targetOpt = r2StorageService.createUploadTarget("custom-override-bucket", storagePath, contentType);

        assertThat(targetOpt).isPresent();

        ArgumentCaptor<PutObjectPresignRequest> captor = ArgumentCaptor.forClass(PutObjectPresignRequest.class);
        verify(s3Presigner).presignPutObject(captor.capture());
        PutObjectPresignRequest presignReq = captor.getValue();
        assertThat(presignReq.putObjectRequest().bucket()).isEqualTo("listing-images");
        assertThat(presignReq.putObjectRequest().key()).isEqualTo(storagePath);
    }

    @Test
    void createUploadTarget_whenDisabled_returnsEmpty() {
        R2StorageService service = new R2StorageService(
                "supabase",
                "", "", "", "listing-images", "https://img.propertysignal.in", 300, localDevStorageService, s3Client, s3Presigner
        );
        Optional<UploadTarget> target = service.createUploadTarget("listing-images", "listings/1/2/uuid.jpg", "image/png");
        assertThat(target).isEmpty();
    }

    @Test
    void inspect_whenObjectExists_returnsObjectMetadata() {
        String path = "listings/user-1/listing-2/photo.png";
        HeadObjectResponse response = HeadObjectResponse.builder()
                .contentLength(1024L * 1024L) // 1 MB
                .contentType("image/png")
                .build();

        given(s3Client.headObject(any(HeadObjectRequest.class))).willReturn(response);

        ImageObjectMetadata meta = r2StorageService.inspect(path);

        assertThat(meta.exists()).isTrue();
        assertThat(meta.contentLength()).isEqualTo(1024L * 1024L);
        assertThat(meta.contentType()).isEqualTo("image/png");

        ArgumentCaptor<HeadObjectRequest> captor = ArgumentCaptor.forClass(HeadObjectRequest.class);
        verify(s3Client).headObject(captor.capture());
        assertThat(captor.getValue().bucket()).isEqualTo("listing-images");
        assertThat(captor.getValue().key()).isEqualTo(path);
    }

    @Test
    void inspect_whenObjectNotFound_returnsNotFound() {
        String path = "listings/user-1/listing-2/missing.jpg";
        given(s3Client.headObject(any(HeadObjectRequest.class)))
                .willThrow(NoSuchKeyException.builder().message("Object not found").build());

        ImageObjectMetadata meta = r2StorageService.inspect(path);

        assertThat(meta.exists()).isFalse();
        assertThat(meta.contentLength()).isNull();
        assertThat(meta.contentType()).isNull();
    }

    @Test
    void inspect_whenS3404Error_returnsNotFound() {
        String path = "listings/user-1/listing-2/missing.jpg";
        given(s3Client.headObject(any(HeadObjectRequest.class)))
                .willThrow(S3Exception.builder().statusCode(404).message("Not Found").build());

        ImageObjectMetadata meta = r2StorageService.inspect(path);

        assertThat(meta.exists()).isFalse();
    }

    @Test
    void inspect_handlesExternalPath() {
        String path = "external:https://cdn.external.com/photo.jpg";
        ImageObjectMetadata meta = r2StorageService.inspect(path);
        assertThat(meta.exists()).isTrue();
        verify(s3Client, never()).headObject(any(HeadObjectRequest.class));
    }

    @Test
    void deleteObjectBestEffort_deletesObjectInR2() {
        String path = "listings/user-1/listing-2/photo.jpg";

        r2StorageService.deleteObjectBestEffort(path);

        ArgumentCaptor<DeleteObjectRequest> captor = ArgumentCaptor.forClass(DeleteObjectRequest.class);
        verify(s3Client).deleteObject(captor.capture());
        assertThat(captor.getValue().bucket()).isEqualTo("listing-images");
        assertThat(captor.getValue().key()).isEqualTo(path);
    }

    @Test
    void deleteObjectBestEffort_ignoresExternalPath() {
        String path = "external:https://cdn.external.com/photo.jpg";

        r2StorageService.deleteObjectBestEffort(path);

        verify(s3Client, never()).deleteObject(any(DeleteObjectRequest.class));
    }
}
