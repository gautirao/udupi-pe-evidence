package com.example.realestate.search.indexer;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.typed.AgriculturalLandDetail;
import com.example.realestate.listing.typed.CommercialSpaceDetail;
import com.example.realestate.listing.typed.ResidentialUnitDetail;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * OpenSearch index document for a listing.
 *
 * <p><b>EXPLICIT ALLOWLIST</b> — only the 32 fields listed below are included.
 * This is intentional: it prevents private fields (contactInfo, contactPhone,
 * createdBy, trustTier, rankingScore, lastApprovedSnapshot, parsedData,
 * dedupeHash, isSuspectedDuplicate, archivedAt, etc.) from leaking into the
 * search index. New fields must be added explicitly after review.
 *
 * <p>The first 17 fields are the core listing fields sourced from
 * {@link Listing}. The remaining 15 fields are physical typed attributes
 * sourced from the typed detail tables (residential, commercial, agricultural).
 * Because listing families are mutually exclusive, the shared flat fields
 * ({@code floor_number}, {@code total_floors}, {@code furnishing_status}) are
 * safe: only one family's block is ever populated per document.
 *
 * <p>{@link #citySlug} and {@link #heroImageUrl} are not present on the
 * {@link Listing} entity as of the time this class was written. They are
 * included as nullable fields so the document shape is forward-compatible
 * once those columns are added to the entity.
 */
public class ListingIndexDocument {

    // --- Core listing fields (17) ---

    private UUID id;
    private String title;
    private String locality;
    private String description;
    private String areaKey;
    /** Not yet present on Listing entity — always null until entity is extended. */
    private String citySlug;
    private String propertyType;
    private String sellerType;
    private Integer bedrooms;
    private Integer bathrooms;
    private Long pricePaise;
    private Double latitude;
    private Double longitude;
    /** OpenSearch geo_point field: {@code {"lat": ..., "lon": ...}}. Null when coordinates absent. */
    private GeoPoint location;
    private String status;
    private OffsetDateTime createdAt;
    /** Not yet present on Listing entity — always null until entity is extended. */
    private String heroImageUrl;
    /**
     * Listing intent: 'sale' or 'rent'. Maps to the {@code listing_purpose} OpenSearch field.
     * {@code @JsonProperty} is required because the default Spring Boot ObjectMapper uses
     * camelCase serialization — without it the field would serialize as {@code listingPurpose}
     * and the term query on {@code listing_purpose} would never match.
     */
    @JsonProperty("listing_purpose")
    private String listingPurpose;

    // --- Typed detail fields (15): RESIDENTIAL + COMMERCIAL shared ---

    /**
     * Floor number within the building. Populated for RESIDENTIAL and COMMERCIAL families.
     * Null for AGRICULTURAL and untyped listings.
     */
    @JsonProperty("floor_number")
    private Integer floorNumber;

    /**
     * Total floors in the building. Populated for RESIDENTIAL and COMMERCIAL families.
     * Null for AGRICULTURAL and untyped listings.
     */
    @JsonProperty("total_floors")
    private Integer totalFloors;

    /**
     * Furnishing status (e.g. "furnished", "semi_furnished", "unfurnished").
     * Populated for RESIDENTIAL and COMMERCIAL families. Null for AGRICULTURAL and untyped.
     * Values are stored verbatim (lowercase) from the typed detail table.
     */
    @JsonProperty("furnishing_status")
    private String furnishingStatus;

    // --- Typed detail fields: COMMERCIAL only ---

    /** Commercial property sub-type (e.g. "office", "shop", "warehouse"). */
    @JsonProperty("commercial_subtype")
    private String commercialSubtype;

    /** Number of washrooms. Null for non-COMMERCIAL families. */
    @JsonProperty("washrooms")
    private Integer washrooms;

    /** Number of parking spaces. Null for non-COMMERCIAL families. */
    @JsonProperty("parking_count")
    private Integer parkingCount;

    /**
     * Road frontage in feet. Serializes as a JSON number (BigDecimal → numeric).
     * Null for non-COMMERCIAL families.
     */
    @JsonProperty("road_frontage_ft")
    private BigDecimal roadFrontageFt;

    /** Commercial usage classification. Null for non-COMMERCIAL families. */
    @JsonProperty("commercial_usage")
    private String commercialUsage;

    // --- Typed detail fields: AGRICULTURAL only ---

    /** Water source description. Null for non-AGRICULTURAL families. */
    @JsonProperty("water_source")
    private String waterSource;

    /** Soil type classification. Null for non-AGRICULTURAL families. */
    @JsonProperty("soil_type")
    private String soilType;

    /** Road access description. Null for non-AGRICULTURAL families. */
    @JsonProperty("road_access")
    private String roadAccess;

    /** Cultivation status. Null for non-AGRICULTURAL families. */
    @JsonProperty("cultivation_status")
    private String cultivationStatus;

    /** Land category classification. Null for non-AGRICULTURAL families. */
    @JsonProperty("land_category")
    private String landCategory;

    /**
     * Whether a farmhouse structure is available on the land.
     * Serializes as a JSON boolean. Null for non-AGRICULTURAL families.
     */
    @JsonProperty("farmhouse_available")
    private Boolean farmhouseAvailable;

    /**
     * Whether fencing has been completed on the land.
     * Serializes as a JSON boolean. Null for non-AGRICULTURAL families.
     */
    @JsonProperty("fencing_done")
    private Boolean fencingDone;

    /**
     * Creates a {@link ListingIndexDocument} from a {@link Listing} entity with no
     * typed detail. Delegates to {@link #fromListing(Listing, ResidentialUnitDetail,
     * CommercialSpaceDetail, AgriculturalLandDetail)} with all detail arguments null.
     *
     * <p>All 15 typed detail fields will be null in the resulting document.
     */
    public static ListingIndexDocument fromListing(Listing listing) {
        return fromListing(listing, null, null, null);
    }

    /**
     * Creates a {@link ListingIndexDocument} from a {@link Listing} entity and optional
     * typed detail objects using an explicit field-by-field mapping.
     *
     * <p>Fields are mapped by name one by one — no reflection-based copying is used.
     * Fields absent from the entity ({@code citySlug}, {@code heroImageUrl}) are set
     * to null. At most one of {@code residential}, {@code commercial}, or
     * {@code agricultural} should be non-null per call (families are mutually exclusive).
     * A null detail argument means the corresponding typed fields remain null in the document.
     *
     * <p>Values are indexed verbatim — no casing normalisation is applied.
     *
     * @param listing     the core listing entity; must not be null
     * @param residential residential detail, or null if not applicable
     * @param commercial  commercial detail, or null if not applicable
     * @param agricultural agricultural detail, or null if not applicable
     * @return populated index document
     */
    public static ListingIndexDocument fromListing(
            Listing listing,
            ResidentialUnitDetail residential,
            CommercialSpaceDetail commercial,
            AgriculturalLandDetail agricultural) {

        ListingIndexDocument doc = new ListingIndexDocument();

        // --- Core listing fields (17) ---
        doc.id = listing.getId();
        doc.title = listing.getTitle();
        doc.locality = listing.getLocality();
        doc.description = listing.getDescription();
        doc.areaKey = listing.getAreaKey();
        doc.citySlug = null; // not present on Listing entity — forward-compatible null
        doc.propertyType = listing.getPropertyType();
        doc.sellerType = listing.getSellerType();
        doc.bedrooms = listing.getBedrooms();
        doc.bathrooms = listing.getBathrooms();
        doc.pricePaise = listing.getPricePaise();
        doc.latitude = listing.getLatitude();
        doc.longitude = listing.getLongitude();
        doc.location = (listing.getLatitude() != null && listing.getLongitude() != null)
                ? new GeoPoint(listing.getLatitude(), listing.getLongitude())
                : null;
        doc.status = listing.getStatus();
        doc.createdAt = listing.getCreatedAt();
        doc.heroImageUrl = null; // not present on Listing entity — forward-compatible null
        doc.listingPurpose = listing.getListingPurpose();

        // --- Residential typed detail fields ---
        if (residential != null) {
            doc.floorNumber = residential.getFloorNumber();
            doc.totalFloors = residential.getTotalFloors();
            doc.furnishingStatus = residential.getFurnishingStatus();
        }

        // --- Commercial typed detail fields ---
        if (commercial != null) {
            doc.commercialSubtype = commercial.getCommercialSubtype();
            doc.floorNumber = commercial.getFloorNumber();
            doc.totalFloors = commercial.getTotalFloors();
            doc.furnishingStatus = commercial.getFurnishingStatus();
            doc.washrooms = commercial.getWashrooms();
            doc.parkingCount = commercial.getParkingCount();
            doc.roadFrontageFt = commercial.getRoadFrontageFt();
            doc.commercialUsage = commercial.getCommercialUsage();
        }

        // --- Agricultural typed detail fields ---
        if (agricultural != null) {
            doc.waterSource = agricultural.getWaterSource();
            doc.soilType = agricultural.getSoilType();
            doc.roadAccess = agricultural.getRoadAccess();
            doc.cultivationStatus = agricultural.getCultivationStatus();
            doc.landCategory = agricultural.getLandCategory();
            doc.farmhouseAvailable = agricultural.getFarmhouseAvailable();
            doc.fencingDone = agricultural.getFencingDone();
        }

        return doc;
    }

    // --- Getters ---

    public UUID getId() { return id; }
    public String getTitle() { return title; }
    public String getLocality() { return locality; }
    public String getDescription() { return description; }
    public String getAreaKey() { return areaKey; }
    public String getCitySlug() { return citySlug; }
    public String getPropertyType() { return propertyType; }
    public String getSellerType() { return sellerType; }
    public Integer getBedrooms() { return bedrooms; }
    public Integer getBathrooms() { return bathrooms; }
    public Long getPricePaise() { return pricePaise; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public GeoPoint getLocation() { return location; }
    public String getStatus() { return status; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public String getHeroImageUrl() { return heroImageUrl; }

    @JsonProperty("listing_purpose")
    public String getListingPurpose() { return listingPurpose; }

    @JsonProperty("floor_number")
    public Integer getFloorNumber() { return floorNumber; }

    @JsonProperty("total_floors")
    public Integer getTotalFloors() { return totalFloors; }

    @JsonProperty("furnishing_status")
    public String getFurnishingStatus() { return furnishingStatus; }

    @JsonProperty("commercial_subtype")
    public String getCommercialSubtype() { return commercialSubtype; }

    @JsonProperty("washrooms")
    public Integer getWashrooms() { return washrooms; }

    @JsonProperty("parking_count")
    public Integer getParkingCount() { return parkingCount; }

    @JsonProperty("road_frontage_ft")
    public BigDecimal getRoadFrontageFt() { return roadFrontageFt; }

    @JsonProperty("commercial_usage")
    public String getCommercialUsage() { return commercialUsage; }

    @JsonProperty("water_source")
    public String getWaterSource() { return waterSource; }

    @JsonProperty("soil_type")
    public String getSoilType() { return soilType; }

    @JsonProperty("road_access")
    public String getRoadAccess() { return roadAccess; }

    @JsonProperty("cultivation_status")
    public String getCultivationStatus() { return cultivationStatus; }

    @JsonProperty("land_category")
    public String getLandCategory() { return landCategory; }

    @JsonProperty("farmhouse_available")
    public Boolean getFarmhouseAvailable() { return farmhouseAvailable; }

    @JsonProperty("fencing_done")
    public Boolean getFencingDone() { return fencingDone; }

    /**
     * OpenSearch geo_point representation.
     * Serializes as {@code {"lat": ..., "lon": ...}}.
     */
    public static class GeoPoint {
        private final double lat;
        private final double lon;

        public GeoPoint(double lat, double lon) {
            this.lat = lat;
            this.lon = lon;
        }

        public double getLat() { return lat; }
        public double getLon() { return lon; }
    }
}
