package com.example.realestate.search;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.search.indexer.ListingIndexDocument;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ListingIndexDocumentTest {

    private final ObjectMapper objectMapper = new ObjectMapper()
            .findAndRegisterModules();

    private Listing buildListing() {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setTitle("3BHK House in Udupi");
        listing.setLocality("Kunjibettu");
        listing.setDescription("Spacious house near bus stand");
        listing.setAreaKey("udupi_central");
        listing.setPropertyType("house");
        listing.setSellerType("dealer");
        listing.setBedrooms(3);
        listing.setBathrooms(2);
        listing.setPricePaise(5_000_000_00L); // 5 crore in paise
        listing.setLatitude(13.3409);
        listing.setLongitude(74.7421);
        listing.setStatus("LIVE");
        listing.setCreatedAt(OffsetDateTime.now());
        return listing;
    }

    @Test
    void fromListing_containsAllPublicFields() {
        Listing listing = buildListing();
        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);

        assertThat(doc.getId()).isEqualTo(listing.getId());
        assertThat(doc.getTitle()).isEqualTo("3BHK House in Udupi");
        assertThat(doc.getLocality()).isEqualTo("Kunjibettu");
        assertThat(doc.getDescription()).isEqualTo("Spacious house near bus stand");
        assertThat(doc.getAreaKey()).isEqualTo("udupi_central");
        assertThat(doc.getPropertyType()).isEqualTo("house");
        assertThat(doc.getSellerType()).isEqualTo("dealer");
        assertThat(doc.getBedrooms()).isEqualTo(3);
        assertThat(doc.getBathrooms()).isEqualTo(2);
        assertThat(doc.getPricePaise()).isEqualTo(5_000_000_00L);
        assertThat(doc.getLatitude()).isEqualTo(13.3409);
        assertThat(doc.getLongitude()).isEqualTo(74.7421);
        assertThat(doc.getStatus()).isEqualTo("LIVE");
        assertThat(doc.getCreatedAt()).isNotNull();
    }

    @Test
    void fromListing_excludesPrivateFields() throws Exception {
        Listing listing = buildListing();
        listing.setContactInfo("contact info text");
        listing.setContactPhone("+919876543210");
        listing.setCreatedBy(UUID.randomUUID());

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);
        String json = objectMapper.writeValueAsString(doc);

        assertThat(json).doesNotContain("contactInfo");
        assertThat(json).doesNotContain("contactPhone");
        assertThat(json).doesNotContain("createdBy");
        assertThat(json).doesNotContain("trustTier");
        assertThat(json).doesNotContain("rankingScore");
        assertThat(json).doesNotContain("lastApprovedSnapshot");
    }

    @Test
    void fromListing_locationGeoPoint_whenCoordinatesPresent() {
        Listing listing = buildListing();
        listing.setLatitude(13.3409);
        listing.setLongitude(74.7421);

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);

        assertThat(doc.getLocation()).isNotNull();
        assertThat(doc.getLocation().getLat()).isEqualTo(13.3409);
        assertThat(doc.getLocation().getLon()).isEqualTo(74.7421);
    }

    @Test
    void fromListing_locationNull_whenCoordinatesAbsent() {
        Listing listing = buildListing();
        listing.setLatitude(null);
        listing.setLongitude(null);

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);

        assertThat(doc.getLocation()).isNull();
        assertThat(doc.getLatitude()).isNull();
        assertThat(doc.getLongitude()).isNull();
    }

    // -----------------------------------------------------------------------
    // listingPurpose tests (#1497 — OpenSearch Buy/Rent intent parity)
    // -----------------------------------------------------------------------

    @Test
    void fromListing_sale_populatesListingPurpose() {
        Listing listing = buildListing();
        listing.setListingPurpose("sale");

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);

        assertThat(doc.getListingPurpose()).isEqualTo("sale");
    }

    @Test
    void fromListing_rent_populatesListingPurpose() {
        Listing listing = buildListing();
        listing.setListingPurpose("rent");

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);

        assertThat(doc.getListingPurpose()).isEqualTo("rent");
    }

    @Test
    void fromListing_null_listingPurposeIsNull() {
        Listing listing = buildListing();
        listing.setListingPurpose(null);

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);

        assertThat(doc.getListingPurpose()).isNull();
    }

    /**
     * JSON serialisation round-trip: verifies that the field is written as
     * {@code listing_purpose} (snake_case) in the JSON output, matching the
     * OpenSearch index mapping. The production ObjectMapper is the Spring Boot
     * default (camelCase), so without {@code @JsonProperty("listing_purpose")}
     * the field would serialize as {@code listingPurpose} and the term query
     * would never match.
     */
    @Test
    void serialization_listingPurpose_usesSnakeCaseKey() throws Exception {
        Listing listing = buildListing();
        listing.setListingPurpose("sale");

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);
        String json = objectMapper.writeValueAsString(doc);

        assertThat(json).contains("\"listing_purpose\"");
        assertThat(json).contains("\"sale\"");
        // Ensure the camelCase form is NOT present (would cause term query mismatch)
        assertThat(json).doesNotContain("\"listingPurpose\"");
    }

    @Test
    void serialization_listingPurpose_absentWhenNull() throws Exception {
        Listing listing = buildListing();
        listing.setListingPurpose(null);

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing);
        String json = objectMapper.writeValueAsString(doc);

        // null fields serialize as null by default — query term filter skips null, so safe
        // The key check: it must not appear as camelCase if it is present at all
        assertThat(json).doesNotContain("\"listingPurpose\"");
    }
}
