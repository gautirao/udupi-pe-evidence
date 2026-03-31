package com.example.realestate.profile;

import com.example.realestate.trust.PhoneEncryptionConverter;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity mapping to the existing {@code public.profiles} table.
 *
 * <p>The {@code updated_at} column is managed exclusively by the
 * {@code update_profiles_updated_at} DB trigger (V0 migration).
 * It is therefore marked {@code insertable=false, updatable=false} so that
 * Hibernate never writes to it — the trigger keeps it consistent.
 *
 * <p>No {@code role} field: the profiles table has no role column.
 * Roles are stored in {@code public.user_roles}.
 */
@Entity
@Table(name = "profiles", schema = "public")
public class Profile {

    @Id
    @Column(insertable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(name = "email")
    private String email;

    @Column(name = "full_name")
    private String fullName;

    @Convert(converter = PhoneEncryptionConverter.class)
    @Column(name = "phone")
    private String phone;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "phone_verified", nullable = false)
    private boolean phoneVerified;

    @Column(name = "org_name", length = 200)
    private String orgName;

    @Column(name = "rera_broker_id", length = 100)
    private String reraBrokerId;

    @Column(name = "reputation_score", nullable = false)
    private int reputationScore;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    /**
     * Managed by the {@code update_profiles_updated_at} DB trigger.
     * Hibernate never writes this column — it is read-only from the JPA side.
     */
    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    // --- Getters and setters ---

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public boolean isPhoneVerified() {
        return phoneVerified;
    }

    public void setPhoneVerified(boolean phoneVerified) {
        this.phoneVerified = phoneVerified;
    }

    public String getOrgName() {
        return orgName;
    }

    public void setOrgName(String orgName) {
        this.orgName = orgName;
    }

    public String getReraBrokerId() {
        return reraBrokerId;
    }

    public void setReraBrokerId(String reraBrokerId) {
        this.reraBrokerId = reraBrokerId;
    }

    public int getReputationScore() {
        return reputationScore;
    }

    public void setReputationScore(int reputationScore) {
        this.reputationScore = reputationScore;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
