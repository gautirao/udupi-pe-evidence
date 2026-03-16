package com.example.realestate.listing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "property_listings", schema = "public")
public class Listing {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "raw_post_id")
    private UUID rawPostId;

    @Column(name = "property_type", nullable = false, columnDefinition = "public.property_type")
    @ColumnTransformer(write = "?::public.property_type")
    private String propertyType = "other";

    @Column(name = "status", nullable = false, columnDefinition = "public.listing_status")
    @ColumnTransformer(write = "?::public.listing_status")
    private String status = ListingStatus.SCRAPED.toDbValue();

    @Column(name = "title")
    private String title;

    @Column(name = "locality")
    private String locality;

    /**
     * @deprecated Use {@link #pricePaise} instead. This field will be removed in a future version.
     */
    @Deprecated
    @Column(name = "price")
    private BigDecimal price;

    /**
     * Price in paise (1/100 of a rupee). This is the source of truth for price.
     * For display, convert to rupees using {@link PriceParser#paiseToRupees(Long)}.
     */
    @Column(name = "price_paise")
    private Long pricePaise;

    @Column(name = "price_unit")
    private String priceUnit = "INR";

    @Column(name = "land_area")
    private BigDecimal landArea;

    @Column(name = "land_area_unit")
    private String landAreaUnit;

    @Column(name = "built_area")
    private BigDecimal builtArea;

    @Column(name = "built_area_unit")
    private String builtAreaUnit;

    /**
     * Normalized land area in square meters (canonical unit).
     * Computed from landArea + landAreaUnit via {@link AreaNormalizer}.
     */
    @Column(name = "area_sqm", precision = 19, scale = 6)
    private BigDecimal areaSqm;

    /**
     * Normalized land area in square feet (derived).
     * Computed from landArea + landAreaUnit via {@link AreaNormalizer}.
     */
    @Column(name = "area_sqft", precision = 19, scale = 6)
    private BigDecimal areaSqft;

    /**
     * Normalized land area in cents (derived).
     * Computed from landArea + landAreaUnit via {@link AreaNormalizer}.
     * 1 cent = 435.6 sq ft.
     */
    @Column(name = "area_cent", precision = 19, scale = 6)
    private BigDecimal areaCent;

    /**
     * Price per cent in paise. Computed as pricePaise / areaCent.
     * Only populated when both pricePaise and areaCent are valid and positive.
     */
    @Column(name = "price_per_cent_paise")
    private Long pricePerCentPaise;

    @Column(name = "bedrooms")
    private Integer bedrooms;

    @Column(name = "bathrooms")
    private Integer bathrooms;

    @Column(name = "contact_info")
    private String contactInfo;

    @Column(name = "contact_phone")
    private String contactPhone;

    @Column(name = "description")
    private String description;

    @Column(name = "video_url", length = 500)
    private String videoUrl;

    @Column(name = "latitude")
    private Double latitude;

    @Column(name = "longitude")
    private Double longitude;

    @Column(name = "area_key")
    private String areaKey;

    @Column(name = "area_label")
    private String areaLabel;

    @Column(name = "confidence_score")
    private int confidenceScore = 0;

    @Column(name = "language_detected")
    private String languageDetected;

    @Column(name = "is_valid", nullable = false)
    private boolean isValid = true;

    @Column(name = "is_duplicate", nullable = false)
    private boolean isDuplicate = false;

    /**
     * True when the proximity-based duplicate-detection service has flagged this
     * listing as a likely duplicate of another nearby listing.  Unlike
     * {@link #isDuplicate} (which tracks exact-hash matches), this flag is set
     * asynchronously and requires admin review before any action is taken.
     */
    @Column(name = "is_suspected_duplicate", nullable = false)
    private boolean isSuspectedDuplicate = false;

    @Column(name = "dedupe_hash")
    private String dedupeHash;

    @Column(name = "repost_count", nullable = false)
    private int repostCount = 0;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "parsed_data", columnDefinition = "jsonb")
    private String parsedData;

    /**
     * Sequential listing number assigned by the database (via listing_number_seq).
     * Used to generate human-friendly display IDs like "PROP-00042".
     */
    @Column(name = "listing_number", insertable = false, updatable = false)
    private Integer listingNumber;

    // --- Commercial & Rent fields ---

    @Column(name = "listing_purpose", nullable = false, length = 10)
    private String listingPurpose = "sale";

    @Column(name = "carpet_area")
    private BigDecimal carpetArea;

    @Column(name = "carpet_area_unit", length = 20)
    private String carpetAreaUnit;

    @Column(name = "floor_number")
    private Integer floorNumber;

    @Column(name = "total_floors")
    private Integer totalFloors;

    @Column(name = "furnishing_status", length = 30)
    private String furnishingStatus;

    @Column(name = "washrooms")
    private Integer washrooms;

    @Column(name = "parking_count")
    private Integer parkingCount;

    @Column(name = "road_frontage_ft")
    private BigDecimal roadFrontageFt;

    @Column(name = "commercial_usage", length = 50)
    private String commercialUsage;

    @Column(name = "number_of_units")
    private Integer numberOfUnits;

    /**
     * Monthly rent in paise (1/100 of a rupee). Nullable — only set for rental listings.
     */
    @Column(name = "monthly_rent")
    private Long monthlyRent;

    @Column(name = "security_deposit_months")
    private Integer securityDepositMonths;

    @Column(name = "lock_in_months")
    private Integer lockInMonths;

    // --- Soft delete ---

    /**
     * When non-null, the listing has been soft-deleted (archived).
     * Archived listings are hidden from dealer/owner views but preserved for history.
     * Set by {@code deleteListing()} and {@code bulkDeleteListings()}; cleared by admin restore.
     */
    @Column(name = "archived_at")
    private Instant archivedAt;

    // --- Seller type ---

    @Column(name = "seller_type", nullable = false, length = 10)
    private String sellerType = "dealer";

    // --- Dealer workflow fields ---

    @Column(name = "rera_number", length = 80)
    private String reraNumber;

    @Column(name = "possession_status", length = 30)
    private String possessionStatus;

    @Column(name = "expected_possession_date")
    private java.time.LocalDate expectedPossessionDate;

    /** Stored as a JSON string; logical shape is {@code Map<String,Boolean>}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "approvals_declared", columnDefinition = "jsonb")
    private String approvalsDeclared;

    @Column(name = "address_confirmed", nullable = false)
    private boolean addressConfirmed = false;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "submitted_at")
    private OffsetDateTime submittedAt;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    // --- Transparency fields ---

    /** Set on first approval (PENDING_REVIEW -> LIVE). Never cleared. */
    @Column(name = "first_published_at")
    private OffsetDateTime firstPublishedAt;

    /** Updated every time the listing transitions to LIVE status. */
    @Column(name = "last_live_at")
    private OffsetDateTime lastLiveAt;

    /**
     * Set when the listing returns to LIVE after having been non-LIVE (future lifecycle PR).
     * NULL until that workflow is implemented.
     */
    @Column(name = "back_to_market_at")
    private OffsetDateTime backToMarketAt;

    /** Explicitly tracked last-updated timestamp for the transparency card. */
    @Column(name = "last_updated_at")
    private OffsetDateTime lastUpdatedAt;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "created_by")
    private UUID createdBy;

    // --- Metadata ---

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    // Getters and setters

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getRawPostId() {
        return rawPostId;
    }

    public void setRawPostId(UUID rawPostId) {
        this.rawPostId = rawPostId;
    }

    public String getPropertyType() {
        return propertyType;
    }

    public void setPropertyType(String propertyType) {
        this.propertyType = propertyType;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLocality() {
        return locality;
    }

    public void setLocality(String locality) {
        this.locality = locality;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public Long getPricePaise() {
        return pricePaise;
    }

    public void setPricePaise(Long pricePaise) {
        this.pricePaise = pricePaise;
    }

    public String getPriceUnit() {
        return priceUnit;
    }

    public void setPriceUnit(String priceUnit) {
        this.priceUnit = priceUnit;
    }

    public BigDecimal getLandArea() {
        return landArea;
    }

    public void setLandArea(BigDecimal landArea) {
        this.landArea = landArea;
    }

    public String getLandAreaUnit() {
        return landAreaUnit;
    }

    public void setLandAreaUnit(String landAreaUnit) {
        this.landAreaUnit = landAreaUnit;
    }

    public BigDecimal getAreaCent() {
        return areaCent;
    }

    public void setAreaCent(BigDecimal areaCent) {
        this.areaCent = areaCent;
    }

    public Long getPricePerCentPaise() {
        return pricePerCentPaise;
    }

    public void setPricePerCentPaise(Long pricePerCentPaise) {
        this.pricePerCentPaise = pricePerCentPaise;
    }

    public BigDecimal getBuiltArea() {
        return builtArea;
    }

    public void setBuiltArea(BigDecimal builtArea) {
        this.builtArea = builtArea;
    }

    public String getBuiltAreaUnit() {
        return builtAreaUnit;
    }

    public void setBuiltAreaUnit(String builtAreaUnit) {
        this.builtAreaUnit = builtAreaUnit;
    }

    public BigDecimal getAreaSqm() {
        return areaSqm;
    }

    public void setAreaSqm(BigDecimal areaSqm) {
        this.areaSqm = areaSqm;
    }

    public BigDecimal getAreaSqft() {
        return areaSqft;
    }

    public void setAreaSqft(BigDecimal areaSqft) {
        this.areaSqft = areaSqft;
    }

    public Integer getBedrooms() {
        return bedrooms;
    }

    public void setBedrooms(Integer bedrooms) {
        this.bedrooms = bedrooms;
    }

    public Integer getBathrooms() {
        return bathrooms;
    }

    public void setBathrooms(Integer bathrooms) {
        this.bathrooms = bathrooms;
    }

    public String getContactInfo() {
        return contactInfo;
    }

    public void setContactInfo(String contactInfo) {
        this.contactInfo = contactInfo;
    }

    public String getContactPhone() {
        return contactPhone;
    }

    public void setContactPhone(String contactPhone) {
        this.contactPhone = contactPhone;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getVideoUrl() {
        return videoUrl;
    }

    public void setVideoUrl(String videoUrl) {
        this.videoUrl = videoUrl;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public String getAreaKey() {
        return areaKey;
    }

    public void setAreaKey(String areaKey) {
        this.areaKey = areaKey;
    }

    public String getAreaLabel() {
        return areaLabel;
    }

    public void setAreaLabel(String areaLabel) {
        this.areaLabel = areaLabel;
    }

    public int getConfidenceScore() {
        return confidenceScore;
    }

    public void setConfidenceScore(int confidenceScore) {
        this.confidenceScore = confidenceScore;
    }

    public String getLanguageDetected() {
        return languageDetected;
    }

    public void setLanguageDetected(String languageDetected) {
        this.languageDetected = languageDetected;
    }

    public boolean isValid() {
        return isValid;
    }

    public void setValid(boolean valid) {
        isValid = valid;
    }

    public boolean isDuplicate() {
        return isDuplicate;
    }

    public void setDuplicate(boolean duplicate) {
        isDuplicate = duplicate;
    }

    public boolean isSuspectedDuplicate() {
        return isSuspectedDuplicate;
    }

    public void setSuspectedDuplicate(boolean suspectedDuplicate) {
        isSuspectedDuplicate = suspectedDuplicate;
    }

    public String getDedupeHash() {
        return dedupeHash;
    }

    public void setDedupeHash(String dedupeHash) {
        this.dedupeHash = dedupeHash;
    }

    public int getRepostCount() {
        return repostCount;
    }

    public void setRepostCount(int repostCount) {
        this.repostCount = repostCount;
    }

    public String getParsedData() {
        return parsedData;
    }

    public void setParsedData(String parsedData) {
        this.parsedData = parsedData;
    }

    public boolean isAddressConfirmed() {
        return addressConfirmed;
    }

    public void setAddressConfirmed(boolean addressConfirmed) {
        this.addressConfirmed = addressConfirmed;
    }

    public String getReraNumber() {
        return reraNumber;
    }

    public void setReraNumber(String reraNumber) {
        this.reraNumber = reraNumber;
    }

    public String getPossessionStatus() {
        return possessionStatus;
    }

    public void setPossessionStatus(String possessionStatus) {
        this.possessionStatus = possessionStatus;
    }

    public java.time.LocalDate getExpectedPossessionDate() {
        return expectedPossessionDate;
    }

    public void setExpectedPossessionDate(java.time.LocalDate expectedPossessionDate) {
        this.expectedPossessionDate = expectedPossessionDate;
    }

    public String getApprovalsDeclared() {
        return approvalsDeclared;
    }

    public void setApprovalsDeclared(String approvalsDeclared) {
        this.approvalsDeclared = approvalsDeclared;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public OffsetDateTime getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(OffsetDateTime submittedAt) {
        this.submittedAt = submittedAt;
    }

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(OffsetDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public UUID getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(UUID reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public OffsetDateTime getFirstPublishedAt() {
        return firstPublishedAt;
    }

    public void setFirstPublishedAt(OffsetDateTime firstPublishedAt) {
        this.firstPublishedAt = firstPublishedAt;
    }

    public OffsetDateTime getLastLiveAt() {
        return lastLiveAt;
    }

    public void setLastLiveAt(OffsetDateTime lastLiveAt) {
        this.lastLiveAt = lastLiveAt;
    }

    public OffsetDateTime getBackToMarketAt() {
        return backToMarketAt;
    }

    public void setBackToMarketAt(OffsetDateTime backToMarketAt) {
        this.backToMarketAt = backToMarketAt;
    }

    public OffsetDateTime getLastUpdatedAt() {
        return lastUpdatedAt;
    }

    public void setLastUpdatedAt(OffsetDateTime lastUpdatedAt) {
        this.lastUpdatedAt = lastUpdatedAt;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(UUID createdBy) {
        this.createdBy = createdBy;
    }

    public UUID getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(UUID updatedBy) {
        this.updatedBy = updatedBy;
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

    public Integer getListingNumber() {
        return listingNumber;
    }

    public void setListingNumber(Integer listingNumber) {
        this.listingNumber = listingNumber;
    }

    /**
     * Returns the human-friendly display ID in "PROP-XXXXX" format.
     * Returns null if listingNumber has not yet been assigned (pre-persist).
     */
    public String getDisplayId() {
        if (listingNumber == null) {
            return null;
        }
        return String.format("PROP-%05d", listingNumber);
    }

    // --- Commercial & Rent getters/setters ---

    public String getListingPurpose() {
        return listingPurpose;
    }

    public void setListingPurpose(String listingPurpose) {
        this.listingPurpose = listingPurpose;
    }

    public BigDecimal getCarpetArea() {
        return carpetArea;
    }

    public void setCarpetArea(BigDecimal carpetArea) {
        this.carpetArea = carpetArea;
    }

    public String getCarpetAreaUnit() {
        return carpetAreaUnit;
    }

    public void setCarpetAreaUnit(String carpetAreaUnit) {
        this.carpetAreaUnit = carpetAreaUnit;
    }

    public Integer getFloorNumber() {
        return floorNumber;
    }

    public void setFloorNumber(Integer floorNumber) {
        this.floorNumber = floorNumber;
    }

    public Integer getTotalFloors() {
        return totalFloors;
    }

    public void setTotalFloors(Integer totalFloors) {
        this.totalFloors = totalFloors;
    }

    public String getFurnishingStatus() {
        return furnishingStatus;
    }

    public void setFurnishingStatus(String furnishingStatus) {
        this.furnishingStatus = furnishingStatus;
    }

    public Integer getWashrooms() {
        return washrooms;
    }

    public void setWashrooms(Integer washrooms) {
        this.washrooms = washrooms;
    }

    public Integer getParkingCount() {
        return parkingCount;
    }

    public void setParkingCount(Integer parkingCount) {
        this.parkingCount = parkingCount;
    }

    public BigDecimal getRoadFrontageFt() {
        return roadFrontageFt;
    }

    public void setRoadFrontageFt(BigDecimal roadFrontageFt) {
        this.roadFrontageFt = roadFrontageFt;
    }

    public String getCommercialUsage() {
        return commercialUsage;
    }

    public void setCommercialUsage(String commercialUsage) {
        this.commercialUsage = commercialUsage;
    }

    public Integer getNumberOfUnits() {
        return numberOfUnits;
    }

    public void setNumberOfUnits(Integer numberOfUnits) {
        this.numberOfUnits = numberOfUnits;
    }

    public Long getMonthlyRent() {
        return monthlyRent;
    }

    public void setMonthlyRent(Long monthlyRent) {
        this.monthlyRent = monthlyRent;
    }

    public Integer getSecurityDepositMonths() {
        return securityDepositMonths;
    }

    public void setSecurityDepositMonths(Integer securityDepositMonths) {
        this.securityDepositMonths = securityDepositMonths;
    }

    public Integer getLockInMonths() {
        return lockInMonths;
    }

    public void setLockInMonths(Integer lockInMonths) {
        this.lockInMonths = lockInMonths;
    }

    // --- Soft delete getter/setter ---

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(Instant archivedAt) {
        this.archivedAt = archivedAt;
    }

    // --- Seller type getter/setter ---

    public String getSellerType() {
        return sellerType;
    }

    public void setSellerType(String sellerType) {
        this.sellerType = sellerType;
    }

    @PrePersist
    void prePersist() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
