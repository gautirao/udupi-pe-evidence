package com.example.realestate.trust;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One verification-dimension row per (listing, dimension_type) pair.
 * Maps to {@code public.listing_verification_dimension} (V47 migration).
 *
 * <p>No JPA relations — listingId is kept as a plain UUID to avoid
 * accidental eager loading of the parent listing.
 *
 * <p>{@code created_at} is set by the DB default and is therefore
 * declared {@code updatable = false}. {@code updated_at} is written
 * explicitly by the application layer.
 */
@Entity
@Table(name = "listing_verification_dimension", schema = "public")
public class ListingVerificationDimension {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Not a JPA relation — kept as a plain UUID to avoid accidental eager loading. */
    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /**
     * Verification dimension category.
     * Valid values: IDENTITY, LOCATION, PHOTOS, AUTHORITY, DOCUMENTS, FIELD.
     */
    @Column(name = "dimension_type", nullable = false, length = 20)
    private String dimensionType;

    /**
     * Current badge state for this dimension.
     * Valid values: AVAILABLE, PENDING, EARNED, EXPIRED, SUSPENDED, FAILED.
     * DB default: AVAILABLE.
     */
    @Column(name = "badge_state", nullable = false, length = 20)
    private String badgeState;

    @Column(name = "granted_at")
    private OffsetDateTime grantedAt;

    @Column(name = "expires_at")
    private OffsetDateTime expiresAt;

    @Column(name = "suspended_at")
    private OffsetDateTime suspendedAt;

    /** Set by DB default on INSERT; never updated by the application. */
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Written explicitly by the application layer on every mutation. */
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * Supabase Storage public URL of the uploaded verification asset
     * (photo, mandate document) for ops review. Nullable — rows created
     * before RE-163 do not have an asset URL.
     */
    @Column(name = "verification_asset_url", length = 2048)
    private String verificationAssetUrl;

    /**
     * Number of failed OTP verify attempts for this dimension since the last successful
     * {@code send} call. Reset to 0 whenever a new OTP is sent.
     * Added in V53 (CU-6 OTP lockout).
     */
    @Column(name = "otp_attempt_count", nullable = false)
    private int otpAttemptCount = 0;

    /**
     * When set to a future timestamp, new OTP requests and verify attempts are rejected
     * until this time has passed (24-hour lockout after MAX_ATTEMPTS failures).
     * Null means no active lockout.
     * Added in V53 (CU-6 OTP lockout).
     */
    @Column(name = "otp_locked_until")
    private OffsetDateTime otpLockedUntil;

    /**
     * Number of location-verify attempts made within the current 24-hour sliding window.
     * Reset to 0 when {@link #locationVerifyWindowStart} is older than 24 hours.
     * Added in V54 (CU-9 location rate limit).
     */
    @Column(name = "location_verify_attempts", nullable = false)
    private int locationVerifyAttempts = 0;

    /**
     * Timestamp of the first attempt in the current 24-hour window.
     * Null means no window is open (first-ever attempt will open one).
     * Added in V54 (CU-9 location rate limit).
     */
    @Column(name = "location_verify_window_start")
    private OffsetDateTime locationVerifyWindowStart;

    // Getters and setters

    public UUID getId() {
        return id;
    }

    public UUID getListingId() {
        return listingId;
    }

    public void setListingId(UUID listingId) {
        this.listingId = listingId;
    }

    public String getDimensionType() {
        return dimensionType;
    }

    public void setDimensionType(String dimensionType) {
        this.dimensionType = dimensionType;
    }

    public String getBadgeState() {
        return badgeState;
    }

    public void setBadgeState(String badgeState) {
        this.badgeState = badgeState;
    }

    public OffsetDateTime getGrantedAt() {
        return grantedAt;
    }

    public void setGrantedAt(OffsetDateTime grantedAt) {
        this.grantedAt = grantedAt;
    }

    public OffsetDateTime getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(OffsetDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    public OffsetDateTime getSuspendedAt() {
        return suspendedAt;
    }

    public void setSuspendedAt(OffsetDateTime suspendedAt) {
        this.suspendedAt = suspendedAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getVerificationAssetUrl() {
        return verificationAssetUrl;
    }

    public void setVerificationAssetUrl(String verificationAssetUrl) {
        this.verificationAssetUrl = verificationAssetUrl;
    }

    public int getOtpAttemptCount() {
        return otpAttemptCount;
    }

    public void setOtpAttemptCount(int otpAttemptCount) {
        this.otpAttemptCount = otpAttemptCount;
    }

    public OffsetDateTime getOtpLockedUntil() {
        return otpLockedUntil;
    }

    public void setOtpLockedUntil(OffsetDateTime otpLockedUntil) {
        this.otpLockedUntil = otpLockedUntil;
    }

    public int getLocationVerifyAttempts() {
        return locationVerifyAttempts;
    }

    public void setLocationVerifyAttempts(int locationVerifyAttempts) {
        this.locationVerifyAttempts = locationVerifyAttempts;
    }

    public OffsetDateTime getLocationVerifyWindowStart() {
        return locationVerifyWindowStart;
    }

    public void setLocationVerifyWindowStart(OffsetDateTime locationVerifyWindowStart) {
        this.locationVerifyWindowStart = locationVerifyWindowStart;
    }
}
