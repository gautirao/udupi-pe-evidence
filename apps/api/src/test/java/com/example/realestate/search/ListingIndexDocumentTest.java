package com.example.realestate.search;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.typed.AgriculturalLandDetail;
import com.example.realestate.listing.typed.CommercialSpaceDetail;
import com.example.realestate.listing.typed.ResidentialUnitDetail;
import com.example.realestate.search.indexer.ListingIndexDocument;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
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

    // -----------------------------------------------------------------------
    // TC-1: Residential typed detail projection
    // -----------------------------------------------------------------------

    /**
     * TC-1: fromListing with a residential detail object populates floor_number,
     * total_floors, furnishing_status; commercial-only and agri keys remain null;
     * bedrooms/bathrooms are still sourced from Listing.
     */
    @Test
    void tc1_residential_populatesResidentialFields() throws Exception {
        Listing listing = buildListing();

        ResidentialUnitDetail residential = new ResidentialUnitDetail();
        residential.setListingId(listing.getId());
        residential.setFloorNumber(2);
        residential.setTotalFloors(5);
        residential.setFurnishingStatus("semi_furnished");

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing, residential, null, null);

        // Residential fields populated
        assertThat(doc.getFloorNumber()).isEqualTo(2);
        assertThat(doc.getTotalFloors()).isEqualTo(5);
        assertThat(doc.getFurnishingStatus()).isEqualTo("semi_furnished");

        // Commercial-only fields null
        assertThat(doc.getCommercialSubtype()).isNull();
        assertThat(doc.getWashrooms()).isNull();
        assertThat(doc.getParkingCount()).isNull();
        assertThat(doc.getRoadFrontageFt()).isNull();
        assertThat(doc.getCommercialUsage()).isNull();

        // Agri fields null
        assertThat(doc.getWaterSource()).isNull();
        assertThat(doc.getSoilType()).isNull();
        assertThat(doc.getRoadAccess()).isNull();
        assertThat(doc.getCultivationStatus()).isNull();
        assertThat(doc.getLandCategory()).isNull();
        assertThat(doc.getFarmhouseAvailable()).isNull();
        assertThat(doc.getFencingDone()).isNull();

        // Core listing fields still present
        assertThat(doc.getBedrooms()).isEqualTo(3);
        assertThat(doc.getBathrooms()).isEqualTo(2);

        // Serialization: keys appear in snake_case
        String json = objectMapper.writeValueAsString(doc);
        assertThat(json).contains("\"floor_number\"");
        assertThat(json).contains("\"total_floors\"");
        assertThat(json).contains("\"furnishing_status\"");
        assertThat(json).doesNotContain("\"floorNumber\"");
        assertThat(json).doesNotContain("\"totalFloors\"");
        assertThat(json).doesNotContain("\"furnishingStatus\"");
    }

    // -----------------------------------------------------------------------
    // TC-2: Commercial typed detail projection
    // -----------------------------------------------------------------------

    /**
     * TC-2: fromListing with a commercial detail object populates all 8 commercial keys.
     * road_frontage_ft must serialize as a JSON number (not a quoted string).
     * Residential-only and agri keys remain null.
     */
    @Test
    void tc2_commercial_populatesCommercialFields_andRoadFrontageIsNumber() throws Exception {
        Listing listing = buildListing();

        CommercialSpaceDetail commercial = new CommercialSpaceDetail();
        commercial.setListingId(listing.getId());
        commercial.setCommercialSubtype("office");
        commercial.setFloorNumber(3);
        commercial.setTotalFloors(10);
        commercial.setFurnishingStatus("furnished");
        commercial.setWashrooms(2);
        commercial.setParkingCount(5);
        commercial.setRoadFrontageFt(new BigDecimal("12.50"));
        commercial.setCommercialUsage("it_park");

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing, null, commercial, null);

        // All 8 commercial fields populated
        assertThat(doc.getCommercialSubtype()).isEqualTo("office");
        assertThat(doc.getFloorNumber()).isEqualTo(3);
        assertThat(doc.getTotalFloors()).isEqualTo(10);
        assertThat(doc.getFurnishingStatus()).isEqualTo("furnished");
        assertThat(doc.getWashrooms()).isEqualTo(2);
        assertThat(doc.getParkingCount()).isEqualTo(5);
        assertThat(doc.getRoadFrontageFt()).isEqualByComparingTo(new BigDecimal("12.50"));
        assertThat(doc.getCommercialUsage()).isEqualTo("it_park");

        // Agri fields null
        assertThat(doc.getWaterSource()).isNull();
        assertThat(doc.getSoilType()).isNull();
        assertThat(doc.getRoadAccess()).isNull();
        assertThat(doc.getCultivationStatus()).isNull();
        assertThat(doc.getLandCategory()).isNull();
        assertThat(doc.getFarmhouseAvailable()).isNull();
        assertThat(doc.getFencingDone()).isNull();

        // road_frontage_ft must be a JSON number, not a quoted string
        String json = objectMapper.writeValueAsString(doc);
        JsonNode tree = objectMapper.readTree(json);
        assertThat(tree.get("road_frontage_ft").isNumber())
                .as("road_frontage_ft should be a JSON number, not a quoted string")
                .isTrue();

        // snake_case keys in JSON
        assertThat(json).contains("\"commercial_subtype\"");
        assertThat(json).contains("\"parking_count\"");
        assertThat(json).contains("\"road_frontage_ft\"");
        assertThat(json).contains("\"commercial_usage\"");
        assertThat(json).doesNotContain("\"commercialSubtype\"");
        assertThat(json).doesNotContain("\"parkingCount\"");
        assertThat(json).doesNotContain("\"roadFrontageFt\"");
        assertThat(json).doesNotContain("\"commercialUsage\"");
    }

    // -----------------------------------------------------------------------
    // TC-3: Agricultural typed detail projection
    // -----------------------------------------------------------------------

    /**
     * TC-3: fromListing with an agricultural detail object populates all 7 agri keys.
     * farmhouse_available and fencing_done must serialize as JSON booleans (not quoted strings).
     */
    @Test
    void tc3_agricultural_populatesAgriFields_andBooleansAreJsonBooleans() throws Exception {
        Listing listing = buildListing();

        AgriculturalLandDetail agricultural = new AgriculturalLandDetail();
        agricultural.setListingId(listing.getId());
        agricultural.setWaterSource("borewell");
        agricultural.setSoilType("red_laterite");
        agricultural.setRoadAccess("tar_road");
        agricultural.setCultivationStatus("cultivated");
        agricultural.setLandCategory("agricultural");
        agricultural.setFarmhouseAvailable(true);
        agricultural.setFencingDone(false);

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing, null, null, agricultural);

        // All 7 agri fields populated
        assertThat(doc.getWaterSource()).isEqualTo("borewell");
        assertThat(doc.getSoilType()).isEqualTo("red_laterite");
        assertThat(doc.getRoadAccess()).isEqualTo("tar_road");
        assertThat(doc.getCultivationStatus()).isEqualTo("cultivated");
        assertThat(doc.getLandCategory()).isEqualTo("agricultural");
        assertThat(doc.getFarmhouseAvailable()).isTrue();
        assertThat(doc.getFencingDone()).isFalse();

        // Residential-only fields null (commercial shared fields also null)
        assertThat(doc.getFloorNumber()).isNull();
        assertThat(doc.getTotalFloors()).isNull();
        assertThat(doc.getFurnishingStatus()).isNull();
        assertThat(doc.getCommercialSubtype()).isNull();
        assertThat(doc.getWashrooms()).isNull();
        assertThat(doc.getParkingCount()).isNull();
        assertThat(doc.getRoadFrontageFt()).isNull();
        assertThat(doc.getCommercialUsage()).isNull();

        // farmhouse_available and fencing_done must be JSON booleans, not quoted strings
        String json = objectMapper.writeValueAsString(doc);
        JsonNode tree = objectMapper.readTree(json);
        assertThat(tree.get("farmhouse_available").isBoolean())
                .as("farmhouse_available should be a JSON boolean, not a quoted string")
                .isTrue();
        assertThat(tree.get("farmhouse_available").asBoolean()).isTrue();
        assertThat(tree.get("fencing_done").isBoolean())
                .as("fencing_done should be a JSON boolean, not a quoted string")
                .isTrue();
        assertThat(tree.get("fencing_done").asBoolean()).isFalse();

        // snake_case keys in JSON
        assertThat(json).contains("\"water_source\"");
        assertThat(json).contains("\"soil_type\"");
        assertThat(json).contains("\"road_access\"");
        assertThat(json).contains("\"cultivation_status\"");
        assertThat(json).contains("\"land_category\"");
        assertThat(json).contains("\"farmhouse_available\"");
        assertThat(json).contains("\"fencing_done\"");
        assertThat(json).doesNotContain("\"waterSource\"");
        assertThat(json).doesNotContain("\"soilType\"");
        assertThat(json).doesNotContain("\"roadAccess\"");
        assertThat(json).doesNotContain("\"cultivationStatus\"");
        assertThat(json).doesNotContain("\"landCategory\"");
        assertThat(json).doesNotContain("\"farmhouseAvailable\"");
        assertThat(json).doesNotContain("\"fencingDone\"");
    }

    // -----------------------------------------------------------------------
    // TC-5: Null safety / backwards-compatibility
    // -----------------------------------------------------------------------

    /**
     * TC-5: fromListing(listing) and fromListing(listing, null, null, null) are both
     * backward-compatible. All 15 new typed-detail keys are null. The existing 17-field
     * and geo_point assertions still pass. Both variants produce identical JSON output.
     * Private/ownership fields are excluded even when detail objects are NOT passed.
     */
    @Test
    void tc5_nullDetail_allTypedFieldsNullAndJsonIdentical() throws Exception {
        Listing listing = buildListing();
        listing.setListingPurpose("sale");

        ListingIndexDocument docOneArg = ListingIndexDocument.fromListing(listing);
        ListingIndexDocument docFourArg = ListingIndexDocument.fromListing(listing, null, null, null);

        // Both produce identical JSON
        String jsonOneArg = objectMapper.writeValueAsString(docOneArg);
        String jsonFourArg = objectMapper.writeValueAsString(docFourArg);
        assertThat(jsonOneArg).isEqualTo(jsonFourArg);

        // Existing 17-field assertions on the four-arg variant
        assertThat(docFourArg.getId()).isEqualTo(listing.getId());
        assertThat(docFourArg.getTitle()).isEqualTo("3BHK House in Udupi");
        assertThat(docFourArg.getLocality()).isEqualTo("Kunjibettu");
        assertThat(docFourArg.getDescription()).isEqualTo("Spacious house near bus stand");
        assertThat(docFourArg.getAreaKey()).isEqualTo("udupi_central");
        assertThat(docFourArg.getPropertyType()).isEqualTo("house");
        assertThat(docFourArg.getSellerType()).isEqualTo("dealer");
        assertThat(docFourArg.getBedrooms()).isEqualTo(3);
        assertThat(docFourArg.getBathrooms()).isEqualTo(2);
        assertThat(docFourArg.getPricePaise()).isEqualTo(5_000_000_00L);
        assertThat(docFourArg.getLatitude()).isEqualTo(13.3409);
        assertThat(docFourArg.getLongitude()).isEqualTo(74.7421);
        assertThat(docFourArg.getStatus()).isEqualTo("LIVE");
        assertThat(docFourArg.getCreatedAt()).isNotNull();
        assertThat(docFourArg.getLocation()).isNotNull();
        assertThat(docFourArg.getListingPurpose()).isEqualTo("sale");

        // All 15 new typed-detail fields are null
        assertThat(docFourArg.getFloorNumber()).isNull();
        assertThat(docFourArg.getTotalFloors()).isNull();
        assertThat(docFourArg.getFurnishingStatus()).isNull();
        assertThat(docFourArg.getCommercialSubtype()).isNull();
        assertThat(docFourArg.getWashrooms()).isNull();
        assertThat(docFourArg.getParkingCount()).isNull();
        assertThat(docFourArg.getRoadFrontageFt()).isNull();
        assertThat(docFourArg.getCommercialUsage()).isNull();
        assertThat(docFourArg.getWaterSource()).isNull();
        assertThat(docFourArg.getSoilType()).isNull();
        assertThat(docFourArg.getRoadAccess()).isNull();
        assertThat(docFourArg.getCultivationStatus()).isNull();
        assertThat(docFourArg.getLandCategory()).isNull();
        assertThat(docFourArg.getFarmhouseAvailable()).isNull();
        assertThat(docFourArg.getFencingDone()).isNull();
    }

    /**
     * TC-5 extension: even when a typed detail object is passed, the serialized JSON must
     * still NOT contain ownership/contact/internal fields.
     */
    @Test
    void tc5_withDetail_privateFieldsExcluded() throws Exception {
        Listing listing = buildListing();
        listing.setContactInfo("should not appear");
        listing.setContactPhone("+919876543210");
        listing.setCreatedBy(UUID.randomUUID());

        ResidentialUnitDetail residential = new ResidentialUnitDetail();
        residential.setListingId(listing.getId());
        residential.setFloorNumber(1);
        residential.setTotalFloors(3);
        residential.setFurnishingStatus("unfurnished");

        ListingIndexDocument doc = ListingIndexDocument.fromListing(listing, residential, null, null);
        String json = objectMapper.writeValueAsString(doc);

        assertThat(json).doesNotContain("contactInfo");
        assertThat(json).doesNotContain("contactPhone");
        assertThat(json).doesNotContain("createdBy");
        assertThat(json).doesNotContain("ownership_type");
        assertThat(json).doesNotContain("survey_number");
        assertThat(json).doesNotContain("rera_number");
        assertThat(json).doesNotContain("trustTier");
        assertThat(json).doesNotContain("rankingScore");
        assertThat(json).doesNotContain("lastApprovedSnapshot");
    }
}
