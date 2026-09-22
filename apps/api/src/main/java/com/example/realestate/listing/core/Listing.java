package com.example.realestate.listing.core;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import com.example.realestate.listing.pricing.PriceParser;
import com.example.realestate.listing.workflow.ActorType;
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

    @Column(name = "property_type", nullable = false, length = 30)
    private String propertyType = "other";

    /**
     * Typed listing family discriminator — RESIDENTIAL, COMMERCIAL, or AGRICULTURAL.
     * Nullable: legacy rows (property_type='land', 'other', or NULL) have no family.
     * Populated by V102 backfill and by the dual-write path introduced in M38-FU2.
     * Read-only from API consumers; written only by the listing service layer.
     */
    @Column(name = "listing_family")
    private String listingFamily;

    @Column(name = "status", nullable = false, length = 30)
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

    /**
     * #2606 — explicit price semantics: {@code NUMERIC} (default; {@link #price}/
     * {@link #pricePaise} carry a real asking price) or {@code ON_REQUEST} (the source
     * explicitly declined to state a price; {@link #price}/{@link #pricePaise} are null by
     * {@code chk_listing_price_status_on_request}). Never infer Price on Request from a null
     * price alone — a {@code NUMERIC} row can also carry a null price for unrelated legacy
     * reasons. Read this column, not {@code pricePaise == null}, to know whether a listing is
     * Price on Request.
     */
    @Column(name = "price_status", nullable = false, length = 20)
    private String priceStatus = "NUMERIC";

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

    /**
     * Whether this listing's {@link #areaKey} was resolved against canonical areas/area_alias at
     * ingestion time (#1887 PR3). Defaults to {@code "RESOLVED"} to match the V117 DB default —
     * every pre-existing row and any listing whose geocoded area matched a canonical area.
     * {@code "UNRESOLVED"} means the geocoded area_key was kept as-is because no canonical match
     * was found. Written only by {@code ListingIngestionService} via {@code AreaResolutionService}.
     */
    @Column(name = "area_resolution_status", nullable = false, length = 20)
    private String areaResolutionStatus = "RESOLVED";

    /**
     * Which resolution step produced a RESOLVED {@link #areaResolutionStatus}: one of
     * {@code PROVIDER_ID}, {@code CANONICAL_KEY}, {@code ALIAS}. Null when
     * {@link #areaResolutionStatus} is {@code UNRESOLVED}, or for pre-existing rows.
     */
    @Column(name = "area_resolution_method", length = 20)
    private String areaResolutionMethod;

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

    // --- Agricultural land fields ---

    @Column(name = "water_source", length = 64)
    private String waterSource;

    @Column(name = "soil_type", length = 64)
    private String soilType;

    @Column(name = "road_access", length = 64)
    private String roadAccess;

    @Column(name = "cultivation_status", length = 64)
    private String cultivationStatus;

    @Column(name = "ownership_type", length = 64)
    private String ownershipType;

    @Column(name = "survey_number", length = 64)
    private String surveyNumber;

    @Column(name = "land_category", length = 32)
    private String landCategory;

    @Column(name = "agri_conversion_status", length = 32)
    private String agriConversionStatus;

    @Column(name = "farmhouse_available")
    private Boolean farmhouseAvailable;

    @Column(name = "fencing_done")
    private Boolean fencingDone;

    // --- Residential typed listing fields (M38-13A / #1626) ---
    // All nullable, no default. Honest-null: null means "not declared" and must
    // never be defaulted to false/empty at the mapper or entity level.

    @Column(name = "balconies")
    private Integer balconies;

    @Column(name = "facing", length = 20)
    private String facing;

    @Column(name = "availability_timeline", length = 30)
    private String availabilityTimeline;

    @Column(name = "super_built_area")
    private BigDecimal superBuiltArea;

    @Column(name = "super_built_area_unit", length = 20)
    private String superBuiltAreaUnit;

    @Column(name = "property_age", length = 30)
    private String propertyAge;

    @Column(name = "residential_water_source", length = 30)
    private String residentialWaterSource;

    @Column(name = "parking_2w_count")
    private Integer parking2wCount;

    @Column(name = "parking_4w_count")
    private Integer parking4wCount;

    @Column(name = "road_width_ft")
    private BigDecimal roadWidthFt;

    @Column(name = "plot_dimensions", length = 100)
    private String plotDimensions;

    @Column(name = "conversion_status", length = 30)
    private String conversionStatus;

    @Column(name = "khata_number", length = 100)
    private String khataNumber;

    @Column(name = "property_tax_pid", length = 100)
    private String propertyTaxPid;

    @Column(name = "approving_authority", length = 100)
    private String approvingAuthority;

    @Column(name = "project_name")
    private String projectName;

    @Column(name = "builder_name")
    private String builderName;

    /** Monthly maintenance in paise (sale listings only). */
    @Column(name = "maintenance_paise")
    private Long maintenancePaise;

    @Column(name = "has_lift")
    private Boolean hasLift;

    @Column(name = "has_power_backup")
    private Boolean hasPowerBackup;

    @Column(name = "is_gated")
    private Boolean isGated;

    @Column(name = "has_garden")
    private Boolean hasGarden;

    @Column(name = "has_terrace")
    private Boolean hasTerrace;

    @Column(name = "has_compound")
    private Boolean hasCompound;

    @Column(name = "has_servant_room")
    private Boolean hasServantRoom;

    @Column(name = "is_corner_plot")
    private Boolean isCornerPlot;

    @Column(name = "has_boundary_wall")
    private Boolean hasBoundaryWall;

    @Column(name = "is_gated_layout")
    private Boolean isGatedLayout;

    @Column(name = "has_water_connection")
    private Boolean hasWaterConnection;

    @Column(name = "has_electricity_connection")
    private Boolean hasElectricityConnection;

    @Column(name = "has_drainage")
    private Boolean hasDrainage;

    @Column(name = "price_negotiable")
    private Boolean priceNegotiable;

    @Column(name = "rent_negotiable")
    private Boolean rentNegotiable;

    @Column(name = "pets_allowed")
    private Boolean petsAllowed;

    @Column(name = "maintenance_included")
    private Boolean maintenanceIncluded;

    // --- Commercial typed listing fields (M38-FU2 / #1730) ---
    // Nullable, honest-null: a null field means "not declared" — never defaulted.
    // commercial_subtype is nullable because legacy commercial rows (V102 backfill)
    // have no subtype; only newly-written typed listings get a non-null value.

    @Column(name = "commercial_subtype")
    private String commercialSubtype;

    @Column(name = "floor_choice")
    private String floorChoice;

    @Column(name = "floor_mode")
    private String floorMode;

    @Column(name = "hub_type")
    private String hubType;

    @Column(name = "washrooms_public")
    private Integer washroomsPublic;

    @Column(name = "washrooms_private")
    private Integer washroomsPrivate;

    @Column(name = "parking_public_count")
    private Integer parkingPublicCount;

    @Column(name = "parking_private_count")
    private Integer parkingPrivateCount;

    @Column(name = "office_seats")
    private Integer officeSeats;

    @Column(name = "office_cabins")
    private Integer officeCabins;

    @Column(name = "office_meeting_rooms")
    private Integer officeMeetingRooms;

    @Column(name = "occupancy_status")
    private String occupancyStatus;

    @Column(name = "power_load_kva")
    private BigDecimal powerLoadKva;

    @Column(name = "warehouse_clear_height_ft")
    private BigDecimal warehouseClearHeightFt;

    @Column(name = "warehouse_loading_bays")
    private Integer warehouseLoadingBays;

    @Column(name = "warehouse_truck_access")
    private Boolean warehouseTruckAccess;

    @Column(name = "warehouse_flooring")
    private String warehouseFlooring;

    @Column(name = "commercial_zoning")
    private String commercialZoning;

    @Column(name = "commercial_ownership")
    private String commercialOwnership;

    @Column(name = "commercial_approvals")
    private String commercialApprovals;

    @Column(name = "expected_rental_yield_pct")
    private BigDecimal expectedRentalYieldPct;

    /** Current monthly income in paise (investment-yield context; sale listings only). */
    @Column(name = "current_monthly_income_paise")
    private Long currentMonthlyIncomePaise;

    @Column(name = "lease_term_months")
    private Integer leaseTermMonths;

    @Column(name = "lease_escalation_pct")
    private BigDecimal leaseEscalationPct;

    @Column(name = "commercial_furnishing_status")
    private String commercialFurnishingStatus;

    @Column(name = "commercial_availability")
    private String commercialAvailability;

    @Column(name = "commercial_area_unit")
    private String commercialAreaUnit;

    // --- Trust tier and ranking (RE-142 / Phase 3.1) ---

    /**
     * Computed trust tier for this listing (A/B/C/D).
     * Default 'D' — lowest tier — until TrustTierCalculator (RE-148) upgrades it.
     * Read-only from broker/client perspective; written only by the trust pipeline.
     */
    @Column(name = "trust_tier", nullable = false, length = 1)
    private String trustTier = "D";

    // --- Listing quality score (#1521) ---

    /**
     * Weighted quality score in [0, 100]. Null until the #1521 backfill or a
     * recompute hook populates it. Never write 0 as a fabricated score — null
     * means "not yet computed"; use honest-null protocol when insufficient data.
     * Written only by {@code QualityRecomputeService}; never accepted from broker PUT.
     */
    @Column(name = "quality_score")
    private Short qualityScore;

    /**
     * JSONB breakdown of the quality computation. Either the full canonical JSON
     * (from {@code QualityScoreService.toCanonicalJson}) or an insufficient-data
     * diagnostic: {@code {"status":"insufficient_data","missing":[...]}}.
     * Null until first computation. Written only by {@code QualityRecomputeService}.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "quality_breakdown", columnDefinition = "jsonb")
    private String qualityBreakdown;

    /**
     * Timestamp of the last quality score computation. Non-null after first
     * computation, regardless of whether the result is a score or insufficient_data.
     * Written only by {@code QualityRecomputeService}.
     */
    @Column(name = "quality_computed_at")
    private Instant qualityComputedAt;

    /**
     * Integer ranking score used for search result ordering.
     * Default 0. Computation deferred to RE-148 / TrustTierCalculator.
     * Read-only from broker/client perspective; written only by the trust pipeline.
     */
    @Column(name = "ranking_score", nullable = false)
    private int rankingScore = 0;

    // --- Soft delete ---

    /**
     * When non-null, the listing has been soft-deleted (archived).
     * Archived listings are hidden from broker/owner views but preserved for history.
     * Set by {@code deleteListing()} and {@code bulkDeleteListings()}; cleared by admin restore.
     */
    @Column(name = "archived_at")
    private Instant archivedAt;

    // --- Seller type ---

    @Column(name = "seller_type", nullable = false, length = 10)
    private String sellerType = "broker";

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

    /**
     * Snapshot of the listing's content at the moment it was last approved (LIVE).
     * Used by Phase 2 fast-restore guard and Phase 5 trust badge invalidation.
     * Null means the listing has never been approved under the snapshot scheme.
     * Written only by the approval workflow; never accepted from broker PUT requests.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "last_approved_snapshot", columnDefinition = "jsonb")
    private String lastApprovedSnapshot;

    // --- Lifecycle / status-tracking fields (V43) ---

    @Column(name = "status_changed_at")
    private Instant statusChangedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status_changed_by_actor_type", length = 20)
    private ActorType statusChangedByActorType;

    @Column(name = "status_changed_by_actor_id")
    private UUID statusChangedByActorId;

    @Column(name = "status_reason_code", length = 100)
    private String statusReasonCode;

    @Column(name = "status_reason_note", columnDefinition = "TEXT")
    private String statusReasonNote;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "rejected_at")
    private Instant rejectedAt;

    @Column(name = "submission_count", nullable = false)
    private int submissionCount = 0;

    @Column(name = "review_submitted_at")
    private Instant reviewSubmittedAt;

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
     * Set to the transition timestamp every time the listing enters LIVE status (publish or
     * reconfirm). NULL until first confirmed after this column was introduced — never
     * backfilled for pre-existing rows (#1794 Phase 1).
     */
    @Column(name = "last_confirmed_at")
    private OffsetDateTime lastConfirmedAt;

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

    public String getListingFamily() {
        return listingFamily;
    }

    public void setListingFamily(String listingFamily) {
        this.listingFamily = listingFamily;
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

    public String getPriceStatus() {
        return priceStatus;
    }

    public void setPriceStatus(String priceStatus) {
        this.priceStatus = priceStatus;
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

    public String getAreaResolutionStatus() {
        return areaResolutionStatus;
    }

    public void setAreaResolutionStatus(String areaResolutionStatus) {
        this.areaResolutionStatus = areaResolutionStatus;
    }

    public String getAreaResolutionMethod() {
        return areaResolutionMethod;
    }

    public void setAreaResolutionMethod(String areaResolutionMethod) {
        this.areaResolutionMethod = areaResolutionMethod;
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

    public String getLastApprovedSnapshot() {
        return lastApprovedSnapshot;
    }

    /**
     * Sets the last-approved snapshot. Called only by the approval workflow service;
     * must never be invoked from broker-facing PUT request mapping code.
     */
    public void setLastApprovedSnapshot(String lastApprovedSnapshot) {
        this.lastApprovedSnapshot = lastApprovedSnapshot;
    }

    // --- Lifecycle / status-tracking getters/setters (V43) ---

    public Instant getStatusChangedAt() {
        return statusChangedAt;
    }

    public void setStatusChangedAt(Instant statusChangedAt) {
        this.statusChangedAt = statusChangedAt;
    }

    public ActorType getStatusChangedByActorType() {
        return statusChangedByActorType;
    }

    public void setStatusChangedByActorType(ActorType statusChangedByActorType) {
        this.statusChangedByActorType = statusChangedByActorType;
    }

    public UUID getStatusChangedByActorId() {
        return statusChangedByActorId;
    }

    public void setStatusChangedByActorId(UUID statusChangedByActorId) {
        this.statusChangedByActorId = statusChangedByActorId;
    }

    public String getStatusReasonCode() {
        return statusReasonCode;
    }

    public void setStatusReasonCode(String statusReasonCode) {
        this.statusReasonCode = statusReasonCode;
    }

    public String getStatusReasonNote() {
        return statusReasonNote;
    }

    public void setStatusReasonNote(String statusReasonNote) {
        this.statusReasonNote = statusReasonNote;
    }

    public Instant getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(Instant approvedAt) {
        this.approvedAt = approvedAt;
    }

    public Instant getRejectedAt() {
        return rejectedAt;
    }

    public void setRejectedAt(Instant rejectedAt) {
        this.rejectedAt = rejectedAt;
    }

    public int getSubmissionCount() {
        return submissionCount;
    }

    public void setSubmissionCount(int submissionCount) {
        this.submissionCount = submissionCount;
    }

    public Instant getReviewSubmittedAt() {
        return reviewSubmittedAt;
    }

    public void setReviewSubmittedAt(Instant reviewSubmittedAt) {
        this.reviewSubmittedAt = reviewSubmittedAt;
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

    public OffsetDateTime getLastConfirmedAt() {
        return lastConfirmedAt;
    }

    public void setLastConfirmedAt(OffsetDateTime lastConfirmedAt) {
        this.lastConfirmedAt = lastConfirmedAt;
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

    // --- Agricultural land getters/setters ---

    public String getWaterSource() {
        return waterSource;
    }

    public void setWaterSource(String waterSource) {
        this.waterSource = waterSource;
    }

    public String getSoilType() {
        return soilType;
    }

    public void setSoilType(String soilType) {
        this.soilType = soilType;
    }

    public String getRoadAccess() {
        return roadAccess;
    }

    public void setRoadAccess(String roadAccess) {
        this.roadAccess = roadAccess;
    }

    public String getCultivationStatus() {
        return cultivationStatus;
    }

    public void setCultivationStatus(String cultivationStatus) {
        this.cultivationStatus = cultivationStatus;
    }

    public String getOwnershipType() {
        return ownershipType;
    }

    public void setOwnershipType(String ownershipType) {
        this.ownershipType = ownershipType;
    }

    public String getSurveyNumber() {
        return surveyNumber;
    }

    public void setSurveyNumber(String surveyNumber) {
        this.surveyNumber = surveyNumber;
    }

    public String getLandCategory() {
        return landCategory;
    }

    public void setLandCategory(String landCategory) {
        this.landCategory = landCategory;
    }

    public String getAgriConversionStatus() {
        return agriConversionStatus;
    }

    public void setAgriConversionStatus(String agriConversionStatus) {
        this.agriConversionStatus = agriConversionStatus;
    }

    public Boolean getFarmhouseAvailable() {
        return farmhouseAvailable;
    }

    public void setFarmhouseAvailable(Boolean farmhouseAvailable) {
        this.farmhouseAvailable = farmhouseAvailable;
    }

    public Boolean getFencingDone() {
        return fencingDone;
    }

    public void setFencingDone(Boolean fencingDone) {
        this.fencingDone = fencingDone;
    }

    // --- Residential typed listing getters/setters (M38-13A / #1626) ---

    public Integer getBalconies() { return balconies; }
    public void setBalconies(Integer balconies) { this.balconies = balconies; }

    public String getFacing() { return facing; }
    public void setFacing(String facing) { this.facing = facing; }

    public String getAvailabilityTimeline() { return availabilityTimeline; }
    public void setAvailabilityTimeline(String availabilityTimeline) { this.availabilityTimeline = availabilityTimeline; }

    public BigDecimal getSuperBuiltArea() { return superBuiltArea; }
    public void setSuperBuiltArea(BigDecimal superBuiltArea) { this.superBuiltArea = superBuiltArea; }

    public String getSuperBuiltAreaUnit() { return superBuiltAreaUnit; }
    public void setSuperBuiltAreaUnit(String superBuiltAreaUnit) { this.superBuiltAreaUnit = superBuiltAreaUnit; }

    public String getPropertyAge() { return propertyAge; }
    public void setPropertyAge(String propertyAge) { this.propertyAge = propertyAge; }

    public String getResidentialWaterSource() { return residentialWaterSource; }
    public void setResidentialWaterSource(String residentialWaterSource) { this.residentialWaterSource = residentialWaterSource; }

    public Integer getParking2wCount() { return parking2wCount; }
    public void setParking2wCount(Integer parking2wCount) { this.parking2wCount = parking2wCount; }

    public Integer getParking4wCount() { return parking4wCount; }
    public void setParking4wCount(Integer parking4wCount) { this.parking4wCount = parking4wCount; }

    public BigDecimal getRoadWidthFt() { return roadWidthFt; }
    public void setRoadWidthFt(BigDecimal roadWidthFt) { this.roadWidthFt = roadWidthFt; }

    public String getPlotDimensions() { return plotDimensions; }
    public void setPlotDimensions(String plotDimensions) { this.plotDimensions = plotDimensions; }

    public String getConversionStatus() { return conversionStatus; }
    public void setConversionStatus(String conversionStatus) { this.conversionStatus = conversionStatus; }

    public String getKhataNumber() { return khataNumber; }
    public void setKhataNumber(String khataNumber) { this.khataNumber = khataNumber; }

    public String getPropertyTaxPid() { return propertyTaxPid; }
    public void setPropertyTaxPid(String propertyTaxPid) { this.propertyTaxPid = propertyTaxPid; }

    public String getApprovingAuthority() { return approvingAuthority; }
    public void setApprovingAuthority(String approvingAuthority) { this.approvingAuthority = approvingAuthority; }

    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }

    public String getBuilderName() { return builderName; }
    public void setBuilderName(String builderName) { this.builderName = builderName; }

    public Long getMaintenancePaise() { return maintenancePaise; }
    public void setMaintenancePaise(Long maintenancePaise) { this.maintenancePaise = maintenancePaise; }

    public Boolean getHasLift() { return hasLift; }
    public void setHasLift(Boolean hasLift) { this.hasLift = hasLift; }

    public Boolean getHasPowerBackup() { return hasPowerBackup; }
    public void setHasPowerBackup(Boolean hasPowerBackup) { this.hasPowerBackup = hasPowerBackup; }

    public Boolean getIsGated() { return isGated; }
    public void setIsGated(Boolean isGated) { this.isGated = isGated; }

    public Boolean getHasGarden() { return hasGarden; }
    public void setHasGarden(Boolean hasGarden) { this.hasGarden = hasGarden; }

    public Boolean getHasTerrace() { return hasTerrace; }
    public void setHasTerrace(Boolean hasTerrace) { this.hasTerrace = hasTerrace; }

    public Boolean getHasCompound() { return hasCompound; }
    public void setHasCompound(Boolean hasCompound) { this.hasCompound = hasCompound; }

    public Boolean getHasServantRoom() { return hasServantRoom; }
    public void setHasServantRoom(Boolean hasServantRoom) { this.hasServantRoom = hasServantRoom; }

    public Boolean getIsCornerPlot() { return isCornerPlot; }
    public void setIsCornerPlot(Boolean isCornerPlot) { this.isCornerPlot = isCornerPlot; }

    public Boolean getHasBoundaryWall() { return hasBoundaryWall; }
    public void setHasBoundaryWall(Boolean hasBoundaryWall) { this.hasBoundaryWall = hasBoundaryWall; }

    public Boolean getIsGatedLayout() { return isGatedLayout; }
    public void setIsGatedLayout(Boolean isGatedLayout) { this.isGatedLayout = isGatedLayout; }

    public Boolean getHasWaterConnection() { return hasWaterConnection; }
    public void setHasWaterConnection(Boolean hasWaterConnection) { this.hasWaterConnection = hasWaterConnection; }

    public Boolean getHasElectricityConnection() { return hasElectricityConnection; }
    public void setHasElectricityConnection(Boolean hasElectricityConnection) { this.hasElectricityConnection = hasElectricityConnection; }

    public Boolean getHasDrainage() { return hasDrainage; }
    public void setHasDrainage(Boolean hasDrainage) { this.hasDrainage = hasDrainage; }

    public Boolean getPriceNegotiable() { return priceNegotiable; }
    public void setPriceNegotiable(Boolean priceNegotiable) { this.priceNegotiable = priceNegotiable; }

    public Boolean getRentNegotiable() { return rentNegotiable; }
    public void setRentNegotiable(Boolean rentNegotiable) { this.rentNegotiable = rentNegotiable; }

    public Boolean getPetsAllowed() { return petsAllowed; }
    public void setPetsAllowed(Boolean petsAllowed) { this.petsAllowed = petsAllowed; }

    public Boolean getMaintenanceIncluded() { return maintenanceIncluded; }
    public void setMaintenanceIncluded(Boolean maintenanceIncluded) { this.maintenanceIncluded = maintenanceIncluded; }

    // --- Commercial typed listing getters/setters (M38-FU2 / #1730) ---

    public String getCommercialSubtype() { return commercialSubtype; }
    public void setCommercialSubtype(String commercialSubtype) { this.commercialSubtype = commercialSubtype; }

    public String getFloorChoice() { return floorChoice; }
    public void setFloorChoice(String floorChoice) { this.floorChoice = floorChoice; }

    public String getFloorMode() { return floorMode; }
    public void setFloorMode(String floorMode) { this.floorMode = floorMode; }

    public String getHubType() { return hubType; }
    public void setHubType(String hubType) { this.hubType = hubType; }

    public Integer getWashroomsPublic() { return washroomsPublic; }
    public void setWashroomsPublic(Integer washroomsPublic) { this.washroomsPublic = washroomsPublic; }

    public Integer getWashroomsPrivate() { return washroomsPrivate; }
    public void setWashroomsPrivate(Integer washroomsPrivate) { this.washroomsPrivate = washroomsPrivate; }

    public Integer getParkingPublicCount() { return parkingPublicCount; }
    public void setParkingPublicCount(Integer parkingPublicCount) { this.parkingPublicCount = parkingPublicCount; }

    public Integer getParkingPrivateCount() { return parkingPrivateCount; }
    public void setParkingPrivateCount(Integer parkingPrivateCount) { this.parkingPrivateCount = parkingPrivateCount; }

    public Integer getOfficeSeats() { return officeSeats; }
    public void setOfficeSeats(Integer officeSeats) { this.officeSeats = officeSeats; }

    public Integer getOfficeCabins() { return officeCabins; }
    public void setOfficeCabins(Integer officeCabins) { this.officeCabins = officeCabins; }

    public Integer getOfficeMeetingRooms() { return officeMeetingRooms; }
    public void setOfficeMeetingRooms(Integer officeMeetingRooms) { this.officeMeetingRooms = officeMeetingRooms; }

    public String getOccupancyStatus() { return occupancyStatus; }
    public void setOccupancyStatus(String occupancyStatus) { this.occupancyStatus = occupancyStatus; }

    public BigDecimal getPowerLoadKva() { return powerLoadKva; }
    public void setPowerLoadKva(BigDecimal powerLoadKva) { this.powerLoadKva = powerLoadKva; }

    public BigDecimal getWarehouseClearHeightFt() { return warehouseClearHeightFt; }
    public void setWarehouseClearHeightFt(BigDecimal warehouseClearHeightFt) { this.warehouseClearHeightFt = warehouseClearHeightFt; }

    public Integer getWarehouseLoadingBays() { return warehouseLoadingBays; }
    public void setWarehouseLoadingBays(Integer warehouseLoadingBays) { this.warehouseLoadingBays = warehouseLoadingBays; }

    public Boolean getWarehouseTruckAccess() { return warehouseTruckAccess; }
    public void setWarehouseTruckAccess(Boolean warehouseTruckAccess) { this.warehouseTruckAccess = warehouseTruckAccess; }

    public String getWarehouseFlooring() { return warehouseFlooring; }
    public void setWarehouseFlooring(String warehouseFlooring) { this.warehouseFlooring = warehouseFlooring; }

    public String getCommercialZoning() { return commercialZoning; }
    public void setCommercialZoning(String commercialZoning) { this.commercialZoning = commercialZoning; }

    public String getCommercialOwnership() { return commercialOwnership; }
    public void setCommercialOwnership(String commercialOwnership) { this.commercialOwnership = commercialOwnership; }

    public String getCommercialApprovals() { return commercialApprovals; }
    public void setCommercialApprovals(String commercialApprovals) { this.commercialApprovals = commercialApprovals; }

    public BigDecimal getExpectedRentalYieldPct() { return expectedRentalYieldPct; }
    public void setExpectedRentalYieldPct(BigDecimal expectedRentalYieldPct) { this.expectedRentalYieldPct = expectedRentalYieldPct; }

    public Long getCurrentMonthlyIncomePaise() { return currentMonthlyIncomePaise; }
    public void setCurrentMonthlyIncomePaise(Long currentMonthlyIncomePaise) { this.currentMonthlyIncomePaise = currentMonthlyIncomePaise; }

    public Integer getLeaseTermMonths() { return leaseTermMonths; }
    public void setLeaseTermMonths(Integer leaseTermMonths) { this.leaseTermMonths = leaseTermMonths; }

    public BigDecimal getLeaseEscalationPct() { return leaseEscalationPct; }
    public void setLeaseEscalationPct(BigDecimal leaseEscalationPct) { this.leaseEscalationPct = leaseEscalationPct; }

    public String getCommercialFurnishingStatus() { return commercialFurnishingStatus; }
    public void setCommercialFurnishingStatus(String commercialFurnishingStatus) { this.commercialFurnishingStatus = commercialFurnishingStatus; }

    public String getCommercialAvailability() { return commercialAvailability; }
    public void setCommercialAvailability(String commercialAvailability) { this.commercialAvailability = commercialAvailability; }

    public String getCommercialAreaUnit() { return commercialAreaUnit; }
    public void setCommercialAreaUnit(String commercialAreaUnit) { this.commercialAreaUnit = commercialAreaUnit; }

    // --- Polygon boundary (transient — written/read via native SQL) ---

    /**
     * GeoJSON string representation of the agricultural plot boundary.
     * Not persisted by JPA — written via ListingRepository.updateBoundary (ST_GeomFromGeoJSON)
     * and populated by ListingResponseMapper via ListingRepository.findBoundaryGeoJson (ST_AsGeoJSON).
     * Only valid for property_type = 'agricultural_land'.
     */
    @Transient
    private String boundaryGeoJson;

    public String getBoundaryGeoJson() {
        return boundaryGeoJson;
    }

    public void setBoundaryGeoJson(String boundaryGeoJson) {
        this.boundaryGeoJson = boundaryGeoJson;
    }

    // --- Soft delete getter/setter ---

    public Instant getArchivedAt() {
        return archivedAt;
    }

    public void setArchivedAt(Instant archivedAt) {
        this.archivedAt = archivedAt;
    }

    // --- Trust tier and ranking getters/setters (RE-142) ---

    public String getTrustTier() {
        return trustTier;
    }

    public void setTrustTier(String trustTier) {
        this.trustTier = trustTier;
    }

    public int getRankingScore() {
        return rankingScore;
    }

    public void setRankingScore(int rankingScore) {
        this.rankingScore = rankingScore;
    }

    // --- Seller type getter/setter ---

    public String getSellerType() {
        return sellerType;
    }

    public void setSellerType(String sellerType) {
        this.sellerType = sellerType;
    }

    // --- Quality score getters/setters (#1521) ---

    public Short getQualityScore() {
        return qualityScore;
    }

    public void setQualityScore(Short qualityScore) {
        this.qualityScore = qualityScore;
    }

    public String getQualityBreakdown() {
        return qualityBreakdown;
    }

    public void setQualityBreakdown(String qualityBreakdown) {
        this.qualityBreakdown = qualityBreakdown;
    }

    public Instant getQualityComputedAt() {
        return qualityComputedAt;
    }

    public void setQualityComputedAt(Instant qualityComputedAt) {
        this.qualityComputedAt = qualityComputedAt;
    }

    @PrePersist
    void prePersist() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (price != null && pricePaise == null) {
            this.pricePaise = PriceParser.rupeesToPaise(price);
        }
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = OffsetDateTime.now();
        if (price != null) {
            this.pricePaise = PriceParser.rupeesToPaise(price);
        }
    }
}
