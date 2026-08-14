package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for the {@code city_launch_revision} table (V118, #1911 PR1).
 *
 * <p>One row per city launch/re-launch lifecycle attempt. Owns the
 * PREPARING -&gt; PREPARED -&gt; VALIDATED -&gt; PROMOTING -&gt; PROMOTED -&gt; SUPERSEDED/FAILED
 * state machine. PR1 ships persistence only — no service invokes a lifecycle transition; the
 * only UPDATE surface is the guarded query methods on {@link CityLaunchRevisionRepository}.
 */
@Entity
@Table(name = "city_launch_revision", schema = "public")
public class CityLaunchRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "city_id", nullable = false)
    private Integer cityId;

    @Column(name = "revision_number", nullable = false)
    private Integer revisionNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "lifecycle_status", nullable = false)
    private LifecycleStatus lifecycleStatus = LifecycleStatus.PREPARING;

    @Column(name = "source_batch_id")
    private Long sourceBatchId;

    @Column(name = "dataset_id")
    private String datasetId;

    @Column(name = "dataset_version")
    private String datasetVersion;

    @Column(name = "source_artifact_checksum")
    private String sourceArtifactChecksum;

    @Column(name = "region_model")
    private String regionModel;

    @Column(name = "central_radius_km")
    private BigDecimal centralRadiusKm;

    @Column(name = "prep_stage", nullable = false)
    private short prepStage;

    @Enumerated(EnumType.STRING)
    @Column(name = "prep_state", nullable = false)
    private PrepState prepState = PrepState.PENDING;

    @Column(name = "validation_status")
    private String validationStatus;

    @Column(name = "persisted_revision_checksum")
    private String persistedRevisionChecksum;

    @Column(name = "applied_revision_checksum")
    private String appliedRevisionChecksum;

    @Column(name = "created_by")
    private UUID createdBy;

    /** Set by DB default (now()) on INSERT; never written by the application. */
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "prepared_at")
    private Instant preparedAt;

    @Column(name = "promoted_at")
    private Instant promotedAt;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "superseded_by")
    private Long supersededBy;

    // ── Validation checklist (V120, #1911 PR4) ──────────────────────────────────────────────────
    // Written ONLY via CityLaunchRevisionRepository's guarded @Modifying queries — never via
    // save() — so these fields intentionally have NO public setters (see class javadoc).

    @Column(name = "landing_validated", nullable = false)
    private boolean landingValidated;

    @Column(name = "regions_validated", nullable = false)
    private boolean regionsValidated;

    @Column(name = "area_groups_validated", nullable = false)
    private boolean areaGroupsValidated;

    @Column(name = "areas_validated", nullable = false)
    private boolean areasValidated;

    @Column(name = "listing_validated", nullable = false)
    private boolean listingValidated;

    // ── Validation checklist, 6th column (V125, #2151 PR A) — same no-public-setter discipline. ──

    @Column(name = "agri_validated", nullable = false)
    private boolean agriValidated;

    @Column(name = "validated_at")
    private Instant validatedAt;

    // ── Constructors ─────────────────────────────────────────────────────────────────────────

    protected CityLaunchRevision() {}

    public CityLaunchRevision(Integer cityId, Integer revisionNumber, UUID createdBy) {
        this.cityId = cityId;
        this.revisionNumber = revisionNumber;
        this.createdBy = createdBy;
    }

    // ── Getters ──────────────────────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Integer getCityId() { return cityId; }
    public Integer getRevisionNumber() { return revisionNumber; }
    public LifecycleStatus getLifecycleStatus() { return lifecycleStatus; }
    public Long getSourceBatchId() { return sourceBatchId; }
    public String getDatasetId() { return datasetId; }
    public String getDatasetVersion() { return datasetVersion; }
    public String getSourceArtifactChecksum() { return sourceArtifactChecksum; }
    public String getRegionModel() { return regionModel; }
    public BigDecimal getCentralRadiusKm() { return centralRadiusKm; }
    public short getPrepStage() { return prepStage; }
    public PrepState getPrepState() { return prepState; }
    public String getValidationStatus() { return validationStatus; }
    public String getPersistedRevisionChecksum() { return persistedRevisionChecksum; }
    public String getAppliedRevisionChecksum() { return appliedRevisionChecksum; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getPreparedAt() { return preparedAt; }
    public Instant getPromotedAt() { return promotedAt; }
    public String getFailureReason() { return failureReason; }
    public Long getSupersededBy() { return supersededBy; }
    public boolean isLandingValidated() { return landingValidated; }
    public boolean isRegionsValidated() { return regionsValidated; }
    public boolean isAreaGroupsValidated() { return areaGroupsValidated; }
    public boolean isAreasValidated() { return areasValidated; }
    public boolean isListingValidated() { return listingValidated; }
    public boolean isAgriValidated() { return agriValidated; }
    public Instant getValidatedAt() { return validatedAt; }

    // ── Setters (in-memory only; PR1 has no persisted UPDATE path via save()) ──────────────────

    public void setLifecycleStatus(LifecycleStatus lifecycleStatus) { this.lifecycleStatus = lifecycleStatus; }
    public void setSourceBatchId(Long sourceBatchId) { this.sourceBatchId = sourceBatchId; }
    public void setDatasetId(String datasetId) { this.datasetId = datasetId; }
    public void setDatasetVersion(String datasetVersion) { this.datasetVersion = datasetVersion; }
    public void setSourceArtifactChecksum(String sourceArtifactChecksum) { this.sourceArtifactChecksum = sourceArtifactChecksum; }
    public void setRegionModel(String regionModel) { this.regionModel = regionModel; }
    public void setCentralRadiusKm(BigDecimal centralRadiusKm) { this.centralRadiusKm = centralRadiusKm; }
    public void setPrepStage(short prepStage) { this.prepStage = prepStage; }
    public void setPrepState(PrepState prepState) { this.prepState = prepState; }
    public void setValidationStatus(String validationStatus) { this.validationStatus = validationStatus; }
    public void setPersistedRevisionChecksum(String persistedRevisionChecksum) { this.persistedRevisionChecksum = persistedRevisionChecksum; }
    public void setAppliedRevisionChecksum(String appliedRevisionChecksum) { this.appliedRevisionChecksum = appliedRevisionChecksum; }
    public void setPreparedAt(Instant preparedAt) { this.preparedAt = preparedAt; }
    public void setPromotedAt(Instant promotedAt) { this.promotedAt = promotedAt; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
    public void setSupersededBy(Long supersededBy) { this.supersededBy = supersededBy; }
}
