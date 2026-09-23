package com.example.realestate.discover.citylaunch;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for {@code city_bootstrap_job} (V145, #2676 Slice A).
 *
 * <p>One row per "type a city name, Start launch" attempt. See {@link BootstrapJobStatus} for
 * the state machine and the table's javadoc comment (V145 migration) for why this is a
 * separate table from {@link CityLaunchRevision} rather than an extension of it.
 */
@Entity
@Table(name = "city_bootstrap_job", schema = "public")
public class CityBootstrapJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "requested_name", nullable = false)
    private String requestedName;

    @Column(name = "normalized_name", nullable = false)
    private String normalizedName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private BootstrapJobStatus status = BootstrapJobStatus.RESOLVING;

    @Column(name = "resolved_city_id")
    private Integer resolvedCityId;

    /** JSON-serialized {@code List<GeocodeCandidate>}; non-null only while DISAMBIGUATION_REQUIRED. */
    @Column(name = "candidates")
    private String candidates;

    @Column(name = "failure_code")
    private String failureCode;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "requested_by", nullable = false)
    private UUID requestedBy;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CityBootstrapJob() {}

    public CityBootstrapJob(String requestedName, String normalizedName, UUID requestedBy) {
        this.requestedName = requestedName;
        this.normalizedName = normalizedName;
        this.requestedBy = requestedBy;
        this.updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getRequestedName() { return requestedName; }
    public String getNormalizedName() { return normalizedName; }
    public BootstrapJobStatus getStatus() { return status; }
    public Integer getResolvedCityId() { return resolvedCityId; }
    public String getCandidates() { return candidates; }
    public String getFailureCode() { return failureCode; }
    public String getFailureReason() { return failureReason; }
    public UUID getRequestedBy() { return requestedBy; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void markDisambiguationRequired(String candidatesJson) {
        this.status = BootstrapJobStatus.DISAMBIGUATION_REQUIRED;
        this.candidates = candidatesJson;
        this.updatedAt = Instant.now();
    }

    public void markCityCreated(Integer resolvedCityId) {
        this.status = BootstrapJobStatus.CITY_CREATED;
        this.resolvedCityId = resolvedCityId;
        this.candidates = null;
        this.updatedAt = Instant.now();
    }

    public void markFailed(String failureCode, String failureReason) {
        this.status = BootstrapJobStatus.FAILED;
        this.failureCode = failureCode;
        this.failureReason = failureReason;
        this.updatedAt = Instant.now();
    }
}
