package com.example.realestate.discover.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * JPA entity for the {@code discover_event} table (V93).
 *
 * <p>Append-only. No UPDATE path. PII-free by schema design:
 * session_id is client-generated and NOT a FK to auth.users.
 */
@Entity
@Table(name = "discover_event")
public class DiscoverEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private UUID sessionId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "area_key")
    private String areaKey;

    @Column(name = "property_type")
    private String propertyType;

    @Column(name = "listing_purpose")
    private String listingPurpose;

    @Column(name = "price_band")
    private String priceBand;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "filters_jsonb", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> filtersJsonb;

    @Column(name = "ts", nullable = false)
    private OffsetDateTime ts;

    // ── Constructors ──────────────────────────────────────────────────────────

    protected DiscoverEvent() {}

    public DiscoverEvent(UUID sessionId,
                         String eventType,
                         String areaKey,
                         String propertyType,
                         String listingPurpose,
                         String priceBand,
                         Map<String, Object> filtersJsonb,
                         OffsetDateTime ts) {
        this.sessionId = sessionId;
        this.eventType = eventType;
        this.areaKey = areaKey;
        this.propertyType = propertyType;
        this.listingPurpose = listingPurpose;
        this.priceBand = priceBand;
        this.filtersJsonb = filtersJsonb;
        this.ts = ts;
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public UUID getSessionId() { return sessionId; }
    public String getEventType() { return eventType; }
    public String getAreaKey() { return areaKey; }
    public String getPropertyType() { return propertyType; }
    public String getListingPurpose() { return listingPurpose; }
    public String getPriceBand() { return priceBand; }
    public Map<String, Object> getFiltersJsonb() { return filtersJsonb; }
    public OffsetDateTime getTs() { return ts; }
}
