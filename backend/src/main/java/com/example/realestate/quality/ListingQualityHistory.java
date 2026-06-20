package com.example.realestate.quality;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only audit log of every listing quality score computation.
 *
 * <p>Mapped to {@code listing_quality_history} (created in V92). Rows are only ever
 * inserted — never updated or deleted — except when the parent listing is hard-deleted
 * (ON DELETE CASCADE handles that automatically).
 *
 * <p>The {@code breakdown} column stores the canonical JSON produced by
 * {@link QualityScoreService#toCanonicalJson} for a sufficient computation, or an
 * insufficient-data diagnostic JSON for an INSUFFICIENT result.
 *
 * <p>Row insertion is guarded by {@link QualityHistoryPolicy#isMaterial}: a row is only
 * appended when the new breakdown differs materially from the prior row for the same
 * listing.
 */
@Entity
@Table(name = "listing_quality_history", schema = "public")
public class ListingQualityHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /** Overall score in [0, 100]; null when the result is INSUFFICIENT (honest-null). */
    @Column(name = "score")
    private Short score;

    /**
     * Canonical JSON breakdown. Either the full QualityScore JSON or an
     * insufficient-data diagnostic: {@code {"status":"insufficient_data","missing":[...]}}.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "breakdown", columnDefinition = "jsonb")
    private String breakdown;

    @Column(name = "computed_at", nullable = false)
    private Instant computedAt;

    // Getters and setters

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getListingId() {
        return listingId;
    }

    public void setListingId(UUID listingId) {
        this.listingId = listingId;
    }

    public Short getScore() {
        return score;
    }

    public void setScore(Short score) {
        this.score = score;
    }

    public String getBreakdown() {
        return breakdown;
    }

    public void setBreakdown(String breakdown) {
        this.breakdown = breakdown;
    }

    public Instant getComputedAt() {
        return computedAt;
    }

    public void setComputedAt(Instant computedAt) {
        this.computedAt = computedAt;
    }
}
