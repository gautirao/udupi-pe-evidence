package com.example.realestate.broker.demand;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * JPA entity for {@code broker_demand_gap_state}.
 *
 * <p>Persists ONLY the broker-specific lifecycle state (read_at, dismissed_at) for a
 * demand-gap bucket. The gap payload itself (gap_score, signal_type, demand counts) is
 * always DERIVED READ-ONLY from {@code area_demand_signal} at query time — it is never
 * stored here. This is PATH_C_MINIMAL (#1534); a broader broker_alert table is deferred
 * to #1589.
 *
 * <p><b>Idempotency key:</b> UNIQUE(broker_id, area_key, property_type, listing_purpose,
 * budget_band, week) — the five-column bucket-tuple plus the ISO week identifier.
 *
 * <p><b>Ownership:</b> broker_id is always the JWT-resolved userId. No client-supplied
 * broker_id is ever accepted. The repository enforces ownership at the SQL layer.
 *
 * <p><b>week:</b> ISO week Monday UTC (DATE_TRUNC to Monday, UTC). Computed consistently
 * in Java as {@code LocalDate.now(ZoneOffset.UTC).with(DayOfWeek.MONDAY)}.
 */
@Entity
@Table(name = "broker_demand_gap_state", schema = "public")
public class BrokerDemandGapState {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false)
    private UUID id;

    /** JWT-resolved broker UUID. Never client-supplied. */
    @Column(name = "broker_id", nullable = false)
    private UUID brokerId;

    @Column(name = "area_key", nullable = false)
    private String areaKey;

    @Column(name = "property_type", nullable = false)
    private String propertyType;

    @Column(name = "listing_purpose", nullable = false)
    private String listingPurpose;

    /**
     * Canonical budget band label (UNDER_5L / 5L_20L / 20L_50L / 50L_1CR / 1CR_2CR
     * / ABOVE_2CR / UNSPECIFIED). Matches the vocabulary in {@code area_demand_signal.budget_band}.
     */
    @Column(name = "budget_band", nullable = false)
    private String budgetBand;

    /**
     * ISO week Monday UTC. Identifies the demand-gap weekly bucket. Consistent with
     * {@code DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC')::date} in SQL.
     */
    @Column(name = "week", nullable = false)
    private LocalDate week;

    /**
     * Timestamp when the broker first marked this gap as read.
     * NULL until broker marks read — null is the canonical not-yet-read state.
     */
    @Column(name = "read_at")
    private Instant readAt;

    /**
     * Timestamp when the broker dismissed this gap.
     * NULL until broker dismisses — null is the canonical active state.
     * Dismissed gaps are suppressed from the demand-gaps page payload.
     */
    @Column(name = "dismissed_at")
    private Instant dismissedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** JPA no-arg constructor. */
    public BrokerDemandGapState() {
    }

    /**
     * Sets {@code createdAt} to now (UTC) if it has not been set explicitly.
     * Called by JPA before any INSERT. The native upsert queries ({@code upsertReadAt},
     * {@code upsertDismissedAt}) set {@code created_at} directly in SQL; this callback
     * guards the plain JPA save path for self-consistency.
     */
    @PrePersist
    void prePersist() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    // ── Getters and setters ──────────────────────────────────────────────────

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getBrokerId() { return brokerId; }
    public void setBrokerId(UUID brokerId) { this.brokerId = brokerId; }

    public String getAreaKey() { return areaKey; }
    public void setAreaKey(String areaKey) { this.areaKey = areaKey; }

    public String getPropertyType() { return propertyType; }
    public void setPropertyType(String propertyType) { this.propertyType = propertyType; }

    public String getListingPurpose() { return listingPurpose; }
    public void setListingPurpose(String listingPurpose) { this.listingPurpose = listingPurpose; }

    public String getBudgetBand() { return budgetBand; }
    public void setBudgetBand(String budgetBand) { this.budgetBand = budgetBand; }

    public LocalDate getWeek() { return week; }
    public void setWeek(LocalDate week) { this.week = week; }

    public Instant getReadAt() { return readAt; }
    public void setReadAt(Instant readAt) { this.readAt = readAt; }

    public Instant getDismissedAt() { return dismissedAt; }
    public void setDismissedAt(Instant dismissedAt) { this.dismissedAt = dismissedAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
