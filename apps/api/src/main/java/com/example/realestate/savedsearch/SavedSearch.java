package com.example.realestate.savedsearch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * #2019 Slice A: a user's saved/alertable search. Exactly one of {@code areaKeys},
 * {@code polygon}, or the four {@code viewport*} fields is populated, matching
 * {@link #resultScopeKind}. That exclusivity is enforced in the service layer
 * (mirroring {@code com.example.realestate.discover.ResultScopeExclusivity}), not by a
 * database constraint.
 *
 * <p>Slice B (matcher/delivery) columns — {@link #alertFrequency}, {@link #alertStatus},
 * {@link #lastAlertedAt}, {@link #alertWatermark} — are present so Slice B needs no
 * further migration, but this slice never transitions {@code alertStatus} out of
 * {@link AlertStatus#IDLE}.
 */
@Entity
@Table(name = "saved_searches")
public class SavedSearch {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "city_slug", nullable = false, length = 64)
    private String citySlug;

    @Enumerated(EnumType.STRING)
    @Column(name = "result_scope_kind", nullable = false, length = 16)
    private ResultScopeKind resultScopeKind;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "area_keys", columnDefinition = "jsonb")
    private List<String> areaKeys;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "polygon", columnDefinition = "jsonb")
    private List<List<Double>> polygon;

    @Column(name = "viewport_south")
    private Double viewportSouth;

    @Column(name = "viewport_west")
    private Double viewportWest;

    @Column(name = "viewport_north")
    private Double viewportNorth;

    @Column(name = "viewport_east")
    private Double viewportEast;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "filters", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> filters;

    @Column(name = "fingerprint", nullable = false, length = 64)
    private String fingerprint;

    @Column(name = "label", length = 120)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private SavedSearchStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "alert_frequency", nullable = false, length = 16)
    private AlertFrequency alertFrequency;

    @Enumerated(EnumType.STRING)
    @Column(name = "alert_status", nullable = false, length = 16)
    private AlertStatus alertStatus;

    @Column(name = "last_alerted_at")
    private OffsetDateTime lastAlertedAt;

    @Column(name = "alert_watermark")
    private OffsetDateTime alertWatermark;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    protected SavedSearch() {
        // JPA
    }

    public SavedSearch(
            UUID id,
            UUID userId,
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> filters,
            String fingerprint,
            String label,
            SavedSearchStatus status,
            AlertFrequency alertFrequency,
            AlertStatus alertStatus,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {
        this.id = id;
        this.userId = userId;
        this.citySlug = citySlug;
        this.resultScopeKind = resultScopeKind;
        this.areaKeys = areaKeys;
        this.polygon = polygon;
        this.viewportSouth = viewportSouth;
        this.viewportWest = viewportWest;
        this.viewportNorth = viewportNorth;
        this.viewportEast = viewportEast;
        this.filters = filters;
        this.fingerprint = fingerprint;
        this.label = label;
        this.status = status;
        this.alertFrequency = alertFrequency;
        this.alertStatus = alertStatus;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getCitySlug() {
        return citySlug;
    }

    public ResultScopeKind getResultScopeKind() {
        return resultScopeKind;
    }

    public List<String> getAreaKeys() {
        return areaKeys;
    }

    public List<List<Double>> getPolygon() {
        return polygon;
    }

    public Double getViewportSouth() {
        return viewportSouth;
    }

    public Double getViewportWest() {
        return viewportWest;
    }

    public Double getViewportNorth() {
        return viewportNorth;
    }

    public Double getViewportEast() {
        return viewportEast;
    }

    public Map<String, Object> getFilters() {
        return filters;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public String getLabel() {
        return label;
    }

    public SavedSearchStatus getStatus() {
        return status;
    }

    public AlertFrequency getAlertFrequency() {
        return alertFrequency;
    }

    public AlertStatus getAlertStatus() {
        return alertStatus;
    }

    public OffsetDateTime getLastAlertedAt() {
        return lastAlertedAt;
    }

    public OffsetDateTime getAlertWatermark() {
        return alertWatermark;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void applyUpdate(
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> filters,
            String fingerprint,
            String label,
            AlertFrequency alertFrequency,
            OffsetDateTime updatedAt) {
        this.citySlug = citySlug;
        this.resultScopeKind = resultScopeKind;
        this.areaKeys = areaKeys;
        this.polygon = polygon;
        this.viewportSouth = viewportSouth;
        this.viewportWest = viewportWest;
        this.viewportNorth = viewportNorth;
        this.viewportEast = viewportEast;
        this.filters = filters;
        this.fingerprint = fingerprint;
        this.label = label;
        this.alertFrequency = alertFrequency;
        this.updatedAt = updatedAt;
        // Deterministic update semantics: any successful update resets the alert
        // watermark and returns the row to IDLE so Slice B's matcher re-evaluates the
        // new scope/filters from scratch rather than diffing against a stale watermark.
        this.alertWatermark = null;
        this.alertStatus = AlertStatus.IDLE;
    }

    public void setStatus(SavedSearchStatus status, OffsetDateTime updatedAt) {
        this.status = status;
        this.updatedAt = updatedAt;
    }
}
