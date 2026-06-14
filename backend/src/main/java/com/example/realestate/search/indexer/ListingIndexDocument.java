package com.example.realestate.search.indexer;

import com.example.realestate.listing.core.Listing;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * OpenSearch index document for a listing.
 *
 * <p><b>EXPLICIT ALLOWLIST</b> — only the 17 fields listed below are included.
 * This is intentional: it prevents private fields (contactInfo, contactPhone,
 * createdBy, trustTier, rankingScore, lastApprovedSnapshot, parsedData,
 * dedupeHash, isSuspectedDuplicate, archivedAt, etc.) from leaking into the
 * search index. New fields must be added explicitly after review.
 *
 * <p>{@link #citySlug} and {@link #heroImageUrl} are not present on the
 * {@link Listing} entity as of the time this class was written.  They are
 * included as nullable fields so the document shape is forward-compatible
 * once those columns are added to the entity.
 */
public class ListingIndexDocument {

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

    /**
     * Creates a {@link ListingIndexDocument} from a {@link Listing} entity using an
     * explicit field-by-field mapping.
     *
     * <p>Fields are mapped by name one by one — no reflection-based copying is used.
     * Fields absent from the entity ({@code citySlug}, {@code heroImageUrl}) are set
     * to null.
     */
    public static ListingIndexDocument fromListing(Listing listing) {
        ListingIndexDocument doc = new ListingIndexDocument();
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
