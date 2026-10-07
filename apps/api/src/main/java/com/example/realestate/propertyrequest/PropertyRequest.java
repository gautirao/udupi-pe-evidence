package com.example.realestate.propertyrequest;

import com.example.realestate.trust.PhoneEncryptionConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * A buyer's "request this property" submission (#1793), mapped to {@code public.property_requests}
 * (V146). Contains PII: {@code phone} is encrypted at rest via {@link PhoneEncryptionConverter}
 * (column {@code phone_enc}); {@code phoneHash} is a keyed HMAC used only for rate limiting.
 */
@Entity
@Table(name = "property_requests", schema = "public")
public class PropertyRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "city", nullable = false)
    private String city;

    @Column(name = "area_key")
    private String areaKey;

    @Column(name = "area_label")
    private String areaLabel;

    @Column(name = "journey", nullable = false)
    private String journey;

    @Column(name = "intent", nullable = false)
    private String intent;

    @Column(name = "requirement")
    private String requirement;

    @Column(name = "budget_min")
    private Long budgetMin;

    @Column(name = "budget_max")
    private Long budgetMax;

    @Convert(converter = TolerantPhoneConverter.class)
    @Column(name = "phone_enc", nullable = false)
    private String phone;

    @Column(name = "phone_hash", nullable = false)
    private String phoneHash;

    @Column(name = "contact_via", nullable = false)
    private String contactVia;

    @Column(name = "consent_version", nullable = false)
    private String consentVersion;

    @Column(name = "consented_at", nullable = false)
    private OffsetDateTime consentedAt;

    @Column(name = "status", nullable = false)
    private String status = "RECEIVED";

    // created_at and retain_until are DB defaults (single source: retain_until = created_at + 12 months,
    // both evaluated from the same now() in one INSERT). Hibernate reads them back after insert.
    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    /** Retention deadline (DB default, 12 months). Internal only: never exposed in an API response. */
    @Generated(event = EventType.INSERT)
    @Column(name = "retain_until", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime retainUntil;

    protected PropertyRequest() {
        // JPA
    }

    public PropertyRequest(String city, String areaKey, String areaLabel, String journey, String intent,
                           String requirement, Long budgetMin, Long budgetMax, String phone,
                           String phoneHash, String contactVia, String consentVersion,
                           OffsetDateTime consentedAt) {
        this.city = city;
        this.areaKey = areaKey;
        this.areaLabel = areaLabel;
        this.journey = journey;
        this.intent = intent;
        this.requirement = requirement;
        this.budgetMin = budgetMin;
        this.budgetMax = budgetMax;
        this.phone = phone;
        this.phoneHash = phoneHash;
        this.contactVia = contactVia;
        this.consentVersion = consentVersion;
        this.consentedAt = consentedAt;
    }

    public UUID getId() { return id; }
    public String getCity() { return city; }
    public String getAreaKey() { return areaKey; }
    public String getAreaLabel() { return areaLabel; }
    public String getJourney() { return journey; }
    public String getIntent() { return intent; }
    public String getRequirement() { return requirement; }
    public Long getBudgetMin() { return budgetMin; }
    public Long getBudgetMax() { return budgetMax; }
    /** Plaintext phone (decrypted by the converter). Never expose in an API response or log. */
    public String getPhone() { return phone; }
    public String getPhoneHash() { return phoneHash; }
    public String getContactVia() { return contactVia; }
    public String getConsentVersion() { return consentVersion; }
    public OffsetDateTime getConsentedAt() { return consentedAt; }
    public String getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public OffsetDateTime getRetainUntil() { return retainUntil; }
}
