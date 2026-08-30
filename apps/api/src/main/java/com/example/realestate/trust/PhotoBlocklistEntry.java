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
 * One row per blocked perceptual hash in the {@code photo_hash_blocklist} table.
 * Populated by admins to flag known stock or duplicate images.
 */
@Entity
@Table(name = "photo_hash_blocklist", schema = "public")
public class PhotoBlocklistEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** 64-bit DCT-based perceptual hash of the blocked image. */
    @Column(name = "phash", nullable = false)
    private long phash;

    @Column(name = "description", length = 255)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public UUID getId() { return id; }
    public long getPhash() { return phash; }
    public void setPhash(long phash) { this.phash = phash; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
