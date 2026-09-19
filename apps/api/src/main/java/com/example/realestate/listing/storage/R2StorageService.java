package com.example.realestate.listing.storage;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Cloudflare R2 image storage service implementation (#2630).
 *
 * <p>Uses S3-compatible AWS SDK v2 client and presigner targeted at Cloudflare R2 endpoint
 * {@code https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com}.
 */
@Service
public class R2StorageService implements ListingImageStorage {

    private static final Logger log = LoggerFactory.getLogger(R2StorageService.class);

    public enum StatusReason {
        ENABLED("enabled"),
        DISABLED_BY_PROVIDER("disabled-by-provider"),
        MISSING_CREDENTIALS("missing-credentials");

        private final String value;
        StatusReason(String value) { this.value = value; }
        public String value() { return value; }
    }

    private final String configuredProvider;
    private final String accountId;
    private final String accessKeyId;
    private final String secretAccessKey;
    private final String bucket;
    private final String publicBaseUrl;
    private final int uploadUrlTtlSeconds;
    private final LocalDevStorageService localDevStorageService;

    private S3Client s3Client;
    private S3Presigner s3Presigner;
    private boolean enabled;
    private StatusReason statusReason = StatusReason.DISABLED_BY_PROVIDER;

    @org.springframework.beans.factory.annotation.Autowired
    public R2StorageService(
            @Value("${listing.images.storage.provider:supabase}") String configuredProvider,
            @Value("${r2.account-id:}") String accountId,
            @Value("${r2.access-key-id:}") String accessKeyId,
            @Value("${r2.secret-access-key:}") String secretAccessKey,
            @Value("${r2.listing-image-bucket:listing-images}") String bucket,
            @Value("${r2.public-base-url:https://img.propertysignal.in}") String publicBaseUrl,
            @Value("${r2.upload-url-ttl-seconds:300}") int uploadUrlTtlSeconds,
            LocalDevStorageService localDevStorageService) {
        this(configuredProvider, accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl,
                uploadUrlTtlSeconds, localDevStorageService, null, null);
    }

    public R2StorageService(
            String configuredProvider,
            String accountId,
            String accessKeyId,
            String secretAccessKey,
            String bucket,
            String publicBaseUrl,
            int uploadUrlTtlSeconds,
            LocalDevStorageService localDevStorageService,
            S3Client s3Client,
            S3Presigner s3Presigner) {
        this.configuredProvider = configuredProvider != null ? configuredProvider.trim().toLowerCase() : "supabase";
        this.accountId = accountId != null ? accountId.trim() : "";
        this.accessKeyId = accessKeyId != null ? accessKeyId.trim() : "";
        this.secretAccessKey = secretAccessKey != null ? secretAccessKey.trim() : "";
        this.bucket = (bucket != null && !bucket.isBlank()) ? bucket.trim() : "listing-images";
        this.publicBaseUrl = (publicBaseUrl != null && !publicBaseUrl.isBlank()) ? publicBaseUrl.trim() : "https://img.propertysignal.in";
        this.uploadUrlTtlSeconds = uploadUrlTtlSeconds > 0 ? uploadUrlTtlSeconds : 300;
        this.localDevStorageService = localDevStorageService;
        this.s3Client = s3Client;
        this.s3Presigner = s3Presigner;
        validate();
    }

    @PostConstruct
    public void validate() {
        if (!"r2".equalsIgnoreCase(configuredProvider)) {
            this.enabled = false;
            this.statusReason = StatusReason.DISABLED_BY_PROVIDER;
            log.info("R2StorageService: disabled (listing.images.storage.provider is '{}')", configuredProvider);
            return;
        }

        boolean accMissing = accountId.isBlank();
        boolean keyMissing = accessKeyId.isBlank();
        boolean secMissing = secretAccessKey.isBlank();
        if (accMissing || keyMissing || secMissing) {
            this.enabled = false;
            this.statusReason = StatusReason.MISSING_CREDENTIALS;
            log.warn("R2StorageService: listing.images.storage.provider=r2 but required config is missing. "
                    + "AccountID missing: {}, AccessKeyID missing: {}, SecretAccessKey missing: {}. "
                    + "Service will run in disabled mode (failing closed safely).",
                    accMissing, keyMissing, secMissing);
            return;
        }

        if (s3Client == null || s3Presigner == null) {
            try {
                String endpointUrl = "https://" + accountId + ".r2.cloudflarestorage.com";
                AwsBasicCredentials creds = AwsBasicCredentials.create(accessKeyId, secretAccessKey);
                StaticCredentialsProvider credProvider = StaticCredentialsProvider.create(creds);

                if (this.s3Client == null) {
                    this.s3Client = S3Client.builder()
                            .endpointOverride(URI.create(endpointUrl))
                            .region(Region.of("auto"))
                            .credentialsProvider(credProvider)
                            .build();
                }
                if (this.s3Presigner == null) {
                    this.s3Presigner = S3Presigner.builder()
                            .endpointOverride(URI.create(endpointUrl))
                            .region(Region.of("auto"))
                            .credentialsProvider(credProvider)
                            .build();
                }
            } catch (Exception e) {
                this.enabled = false;
                this.statusReason = StatusReason.MISSING_CREDENTIALS;
                log.warn("R2StorageService: failed to initialize S3 client/presigner for R2 — error={}", e.getMessage());
                return;
            }
        }

        this.enabled = true;
        this.statusReason = StatusReason.ENABLED;
        log.info("R2StorageService: enabled — bucket={} publicBaseUrl={}", bucket, publicBaseUrl);
    }

    @PreDestroy
    public void close() {
        if (s3Presigner != null) {
            try { s3Presigner.close(); } catch (Exception ignored) {}
        }
        if (s3Client != null) {
            try { s3Client.close(); } catch (Exception ignored) {}
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getStatusReason() {
        return statusReason.value();
    }

    public String getBucket() {
        return bucket;
    }

    public String getPublicBaseUrl() {
        return publicBaseUrl;
    }

    @Override
    public String getPublicUrl(String storageBucket, String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            return "";
        }
        if (storagePath.startsWith("external:")) {
            return storagePath.substring("external:".length());
        }
        if (localDevStorageService != null && localDevStorageService.isEnabled()) {
            return localDevStorageService.getPublicUrl(storageBucket, storagePath).orElse("");
        }
        String cleanPath = storagePath.startsWith("/") ? storagePath.substring(1) : storagePath;
        String base = publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        return base + "/" + cleanPath;
    }

    @Override
    public Optional<UploadTarget> createUploadTarget(String storageBucket, String storagePath, String contentType) {
        if (!enabled) {
            if (localDevStorageService != null && localDevStorageService.isEnabled()) {
                return localDevStorageService.createSignedUploadUrl(storageBucket, storagePath)
                        .map(url -> new UploadTarget(url, storagePath, null, Map.of()));
            }
            log.debug("R2 upload target skipped (disabled/unconfigured): path={}", storagePath);
            return Optional.empty();
        }
        if (storagePath == null || storagePath.isBlank() || storagePath.contains("..")) {
            log.warn("R2 upload target rejected — unsafe path: path={}", storagePath);
            return Optional.empty();
        }

        String cleanPath = storagePath.startsWith("/") ? storagePath.substring(1) : storagePath;

        try {
            PutObjectRequest.Builder putBuilder = PutObjectRequest.builder()
                    .bucket(this.bucket)
                    .key(cleanPath)
                    .cacheControl("public, max-age=31536000, immutable");

            if (contentType != null && !contentType.isBlank()) {
                putBuilder.contentType(contentType);
            }

            PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                    .signatureDuration(Duration.ofSeconds(uploadUrlTtlSeconds))
                    .putObjectRequest(putBuilder.build())
                    .build();

            PresignedPutObjectRequest presignedRequest = s3Presigner.presignPutObject(presignRequest);
            String signedUrl = presignedRequest.url().toString();
            Instant expiresAt = presignedRequest.expiration();

            Map<String, String> requiredHeaders = new LinkedHashMap<>();
            if (contentType != null && !contentType.isBlank()) {
                requiredHeaders.put("Content-Type", contentType);
            }
            requiredHeaders.put("Cache-Control", "public, max-age=31536000, immutable");

            log.debug("R2 upload target created: path={} ttl={}s", cleanPath, uploadUrlTtlSeconds);
            return Optional.of(new UploadTarget(signedUrl, storagePath, expiresAt, requiredHeaders));
        } catch (Exception e) {
            log.warn("R2 createUploadTarget failed — path={} error={}", storagePath, e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    @Override
    public void deleteObjectBestEffort(String storagePath) {
        if (storagePath == null || storagePath.startsWith("external:")) {
            log.debug("R2 storage delete skipped (external or null): path={}", storagePath);
            return;
        }
        if (!enabled) {
            log.debug("R2 storage delete skipped (disabled): path={}", storagePath);
            return;
        }
        if (storagePath.contains("..")) {
            log.warn("R2 storage delete rejected — unsafe path: path={}", storagePath);
            return;
        }

        String cleanPath = storagePath.startsWith("/") ? storagePath.substring(1) : storagePath;

        try {
            DeleteObjectRequest deleteRequest = DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(cleanPath)
                    .build();

            s3Client.deleteObject(deleteRequest);
            log.info("R2 storage object deleted: path={}", storagePath);
        } catch (Exception e) {
            log.warn("Best-effort R2 delete failed — path={} error={}", storagePath, e.getClass().getSimpleName());
        }
    }

    @Override
    public ImageObjectMetadata inspect(String storagePath) {
        if (storagePath == null || storagePath.isBlank()) {
            return ImageObjectMetadata.notFound();
        }
        if (storagePath.startsWith("external:")) {
            return new ImageObjectMetadata(true, null, null);
        }
        if (!enabled) {
            if (localDevStorageService != null && localDevStorageService.isEnabled()) {
                return new ImageObjectMetadata(true, null, null);
            }
            return ImageObjectMetadata.notFound();
        }
        if (storagePath.contains("..")) {
            return ImageObjectMetadata.notFound();
        }

        String cleanPath = storagePath.startsWith("/") ? storagePath.substring(1) : storagePath;

        try {
            HeadObjectRequest headRequest = HeadObjectRequest.builder()
                    .bucket(bucket)
                    .key(cleanPath)
                    .build();

            HeadObjectResponse response = s3Client.headObject(headRequest);
            return new ImageObjectMetadata(true, response.contentLength(), response.contentType());
        } catch (NoSuchKeyException e) {
            log.debug("R2 object inspect not found (NoSuchKey): path={}", storagePath);
            return ImageObjectMetadata.notFound();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                log.debug("R2 object inspect not found (404): path={}", storagePath);
                return ImageObjectMetadata.notFound();
            }
            log.warn("R2 inspect failed for path={}: status={} msg={}", storagePath, e.statusCode(), e.getMessage());
            return ImageObjectMetadata.notFound();
        } catch (Exception e) {
            log.warn("R2 inspect failed for path={}: error={}", storagePath, e.getClass().getSimpleName());
            return ImageObjectMetadata.notFound();
        }
    }
}
