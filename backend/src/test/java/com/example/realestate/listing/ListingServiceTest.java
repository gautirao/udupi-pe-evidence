package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.ingestion.RawPostRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ListingServiceTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private RawPostRepository rawPostRepository;

    @Mock
    private GeocodingPort geocodingPort;

    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    private ListingService listingService;

    @BeforeEach
    void setUp() {
        listingService = new ListingService(
                listingRepository, rawPostRepository, geocodingPort,
                new ObjectMapper(), applicationEventPublisher);
    }

    private RawPost makePost() {
        RawPost post = new RawPost();
        post.setId(UUID.randomUUID());
        post.setContent("test content");
        return post;
    }

    // --- Discard: not real estate ---

    @Test
    void createFrom_notRealEstate_discardsAndMarksProcessed() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                false, PropertyType.OTHER, null,
                null, null, null, null,
                null, null, null, null, null, 30
        );

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNull();
        verify(listingRepository, never()).save(any());
        verify(rawPostRepository).markProcessed(post.getId());
    }

    // --- Discard: confidence < 50 ---

    @Test
    void createFrom_confidence49_discardsAndMarksProcessed() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                "Udupi", null, null, null,
                null, null, null, null, "House for sale", 49
        );

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNull();
        verify(listingRepository, never()).save(any());
        verify(rawPostRepository).markProcessed(post.getId());
    }

    // --- Create: confidence == 50, is_valid = false ---

    @Test
    void createFrom_confidence50_createsListingWithIsValidFalse() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, new BigDecimal("1000000"),
                "Manipal", null, new BigDecimal("2400"), "sqft",
                null, null, null, null, "Land for sale", 50
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isValid()).isFalse();
        assertThat(listing.getConfidenceScore()).isEqualTo(50);
        verify(rawPostRepository).markProcessed(post.getId());
    }

    // --- Create: confidence == 70, is_valid = true ---

    @Test
    void createFrom_confidence70_createsListingWithIsValidTrue() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, new BigDecimal("1200"), "sqft",
                new BigDecimal("1800"), "sqft", "9876543210", "John",
                "3BHK house", 70
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isValid()).isTrue();
        assertThat(listing.getConfidenceScore()).isEqualTo(70);
        verify(rawPostRepository).markProcessed(post.getId());
    }

    // --- Idempotency: duplicate raw_post_id ---

    @Test
    void createFrom_duplicateRawPostId_discardsAndMarksProcessed() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                "Udupi", null, null, null,
                null, null, null, null, "House", 85
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(true);

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNull();
        verify(listingRepository, never()).save(any());
        verify(rawPostRepository).markProcessed(post.getId());
    }

    // --- Apartment mapped to house ---

    @Test
    void createFrom_apartmentMappedToHouse() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.APARTMENT, new BigDecimal("3000000"),
                "Mangalore", 2, null, null,
                new BigDecimal("900"), "sqft", null, null,
                "2BHK apartment", 85
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing.getPropertyType()).isEqualTo("house");
    }

    // --- Null price_unit defaults to INR ---

    @Test
    void createFrom_nullPriceUnit_defaultsToINR() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, null,
                "Udupi", null, null, null,
                null, null, null, null, "Land", 60
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing.getPriceUnit()).isEqualTo("INR");
    }

    // --- parsed_data includes model and prompt version ---

    @Test
    void createFrom_parsedDataIncludesModelAndVersion() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                "Udupi", null, null, null,
                null, null, null, null, "House", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        listingService.createFrom(post, result, "google/gemini-3-flash-preview");

        Listing saved = captor.getValue();
        assertThat(saved.getParsedData()).contains("\"model\":\"google/gemini-3-flash-preview\"");
        assertThat(saved.getParsedData()).contains("\"prompt_version\":\"v1\"");
    }

    // --- All fields mapped correctly ---

    @Test
    void createFrom_mapsAllFieldsFromClassification() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.COMMERCIAL, new BigDecimal("15000000"),
                "Bangalore", null, new BigDecimal("5000"), "sqft",
                new BigDecimal("4500"), "sqft", "555-1234", "broker@example.com",
                "Commercial space downtown", 95
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing.getRawPostId()).isEqualTo(post.getId());
        assertThat(listing.getPropertyType()).isEqualTo("commercial");
        assertThat(listing.getPrice()).isEqualByComparingTo("15000000");
        assertThat(listing.getPriceUnit()).isEqualTo("INR"); // price_unit dropped from schema; always INR
        assertThat(listing.getLocality()).isEqualTo("Bangalore");
        assertThat(listing.getLandArea()).isEqualByComparingTo("5000");
        assertThat(listing.getLandAreaUnit()).isEqualTo("sqft");
        assertThat(listing.getBuiltArea()).isEqualByComparingTo("4500");
        assertThat(listing.getBuiltAreaUnit()).isEqualTo("sqft");
        assertThat(listing.getContactPhone()).isEqualTo("555-1234");
        assertThat(listing.getContactInfo()).isEqualTo("broker@example.com");
        assertThat(listing.getDescription()).isEqualTo("Commercial space downtown");
        assertThat(listing.getConfidenceScore()).isEqualTo(95);
        assertThat(listing.isValid()).isTrue();
    }

    // --- Boundary: confidence 69 → is_valid = false ---

    @Test
    void createFrom_confidence69_isValidFalse() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                null, null, null, null,
                null, null, null, null, null, 69
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isValid()).isFalse();
    }

    // --- Geocoding tests ---

    @Test
    void createFrom_withLocality_callsGeocodingAndPersistsCoordinates() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "House in Udupi", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Udupi")).thenReturn(
                new GeocodingService.GeoResult(13.3409, 74.7421, "Udupi, Karnataka, India",
                        "India", "Karnataka", "Udupi", null, null));
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getLatitude()).isEqualTo(13.3409);
        assertThat(listing.getLongitude()).isEqualTo(74.7421);
        verify(geocodingPort).geocode("Udupi");
    }

    @Test
    void createFrom_geocodingReturnsNull_leavesLatLngNull() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, null,
                "Unknown Place", null, null, null,
                null, null, null, null, "Land somewhere", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Unknown Place")).thenReturn(null);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getLatitude()).isNull();
        assertThat(listing.getLongitude()).isNull();
        assertThat(listing.getLocality()).isEqualTo("Unknown Place");
        verify(geocodingPort).geocode("Unknown Place");
    }

    @Test
    void createFrom_nullLocality_doesNotCallGeocoding() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                null, null, null, null,
                null, null, null, null, "House", 70
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getLatitude()).isNull();
        assertThat(listing.getLongitude()).isNull();
        verify(geocodingPort, never()).geocode(any());
    }

    @Test
    void createFrom_blankLocality_doesNotCallGeocoding() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                "   ", null, null, null,
                null, null, null, null, "House", 70
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        verify(geocodingPort, never()).geocode(any());
    }

    @Test
    void createFrom_geocodingThrowsException_leavesLatLngNullButCreatesListing() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.COMMERCIAL, new BigDecimal("10000000"),
                "Mangalore", null, null, null,
                null, null, null, null, "Commercial space", 85
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Mangalore")).thenThrow(new RuntimeException("Geocoding API timeout"));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getLatitude()).isNull();
        assertThat(listing.getLongitude()).isNull();
        assertThat(listing.getLocality()).isEqualTo("Mangalore");
        assertThat(listing.getConfidenceScore()).isEqualTo(85);
        verify(listingRepository).save(any());
    }

    // --- Deduplication tests ---

    @Test
    void createFrom_sameDescriptionLocalityPrice_flagsAsDuplicate() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "3BHK house for sale", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        // Simulate existing listing with same hash
        when(listingRepository.existsByDedupeHash(any())).thenReturn(true);
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isDuplicate()).isTrue();
        assertThat(listing.getDedupeHash()).isNotNull();
    }

    @Test
    void createFrom_noDuplicateHash_notFlaggedAsDuplicate() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, new BigDecimal("2000000"),
                "Manipal", null, new BigDecimal("2400"), "sqft",
                null, null, null, null, "Land for sale", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isDuplicate()).isFalse();
        assertThat(listing.getDedupeHash()).isNotNull();
    }

    @Test
    void createFrom_differentDescription_notFlaggedAsDuplicate() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", null, null, null,
                null, null, null, null, "Different description", 70
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isDuplicate()).isFalse();
    }

    @Test
    void createFrom_differentLocality_notFlaggedAsDuplicate() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Mangalore", null, null, null,
                null, null, null, null, "3BHK house for sale", 70
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isDuplicate()).isFalse();
    }

    @Test
    void createFrom_differentPrice_notFlaggedAsDuplicate() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("6000000"),
                "Udupi", null, null, null,
                null, null, null, null, "3BHK house for sale", 70
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.isDuplicate()).isFalse();
    }

    @Test
    void createFrom_rerunIdempotent_existingRawPostIdPreventsCreation() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", null, null, null,
                null, null, null, null, "House", 80
        );

        // Listing already exists for this raw_post_id
        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(true);

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNull();
        verify(listingRepository, never()).save(any());
        verify(listingRepository, never()).existsByDedupeHash(any());
    }

    @Test
    void createFrom_nullDescriptionLocalityPrice_noHashComputed() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.OTHER, null,
                null, null, null, null,
                null, null, null, null, null, 60
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getDedupeHash()).isNull();
        assertThat(listing.isDuplicate()).isFalse();
        verify(listingRepository, never()).existsByDedupeHash(any());
    }

    @Test
    void computeDedupeHash_normalizesCaseAndWhitespace() {
        String hash1 = listingService.computeDedupeHash("  House FOR Sale  ", "  UDUPI  ", new BigDecimal("5000000"));
        String hash2 = listingService.computeDedupeHash("house for sale", "udupi", new BigDecimal("5000000"));

        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    void computeDedupeHash_differentInputsProduceDifferentHashes() {
        String hash1 = listingService.computeDedupeHash("House A", "Udupi", new BigDecimal("5000000"));
        String hash2 = listingService.computeDedupeHash("House B", "Udupi", new BigDecimal("5000000"));

        assertThat(hash1).isNotEqualTo(hash2);
    }

    // --- Area key and area label tests ---

    @Test
    void createFrom_geocodingSuccess_setsAreaKeyAndAreaLabel() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Ambalpady", 3, null, null,
                null, null, null, null, "House in Ambalpady", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Ambalpady")).thenReturn(
                new GeocodingService.GeoResult(13.35, 74.75, "Ambalpady, Udupi, Karnataka, India",
                        "India", "Karnataka", "Udupi", "Ambalpady", null));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing.getAreaKey()).isEqualTo("india|karnataka|udupi|ambalpady");
        assertThat(listing.getAreaLabel()).isEqualTo("Ambalpady, Udupi");
    }

    @Test
    void createFrom_geocodingReturnsNull_areaKeyAndLabelNull() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, null,
                "Unknown", null, null, null,
                null, null, null, null, "Land", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Unknown")).thenReturn(null);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing.getAreaKey()).isNull();
        assertThat(listing.getAreaLabel()).isNull();
    }

    @Test
    void createFrom_geocodingThrows_areaKeyAndLabelNull() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, null,
                "Mangalore", null, null, null,
                null, null, null, null, "House", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Mangalore")).thenThrow(new RuntimeException("API error"));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing.getAreaKey()).isNull();
        assertThat(listing.getAreaLabel()).isNull();
        // Listing is still created
        assertThat(listing.getLocality()).isEqualTo("Mangalore");
    }

    @Test
    void computeAreaKey_fullComponents_returnsNormalizedKey() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Udupi", "Ambalpady", null);

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isEqualTo("india|karnataka|udupi|ambalpady");
    }

    @Test
    void computeAreaKey_localityNull_fallsBackToNeighborhood() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Udupi", null, "Manipal");

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isEqualTo("india|karnataka|udupi|manipal");
    }

    @Test
    void computeAreaKey_localityAndNeighborhoodNull_fallsBackToCity() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Udupi", null, null);

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isEqualTo("india|karnataka|udupi|udupi");
    }

    @Test
    void computeAreaKey_normalizesSpacesToHyphens() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Tamil Nadu", "Chennai", "Anna Nagar East", null);

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isEqualTo("india|tamil-nadu|chennai|anna-nagar-east");
    }

    @Test
    void computeAreaKey_removesPunctuation() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Bengaluru", "M.G. Road", null);

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isEqualTo("india|karnataka|bengaluru|mg-road");
    }

    @Test
    void computeAreaKey_nullGeoResult_returnsNull() {
        String areaKey = listingService.computeAreaKey(null);

        assertThat(areaKey).isNull();
    }

    @Test
    void computeAreaKey_missingCountry_returnsNull() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                null, "Karnataka", "Udupi", "Ambalpady", null);

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isNull();
    }

    @Test
    void computeAreaKey_missingCity_returnsNull() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", null, "Ambalpady", null);

        String areaKey = listingService.computeAreaKey(geoResult);

        assertThat(areaKey).isNull();
    }

    @Test
    void computeAreaLabel_withLocality_returnsLocalityCommaCity() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Udupi", "Ambalpady", null);

        String areaLabel = listingService.computeAreaLabel(geoResult);

        assertThat(areaLabel).isEqualTo("Ambalpady, Udupi");
    }

    @Test
    void computeAreaLabel_localityNull_fallsBackToNeighborhood() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Udupi", null, "Manipal");

        String areaLabel = listingService.computeAreaLabel(geoResult);

        assertThat(areaLabel).isEqualTo("Manipal, Udupi");
    }

    @Test
    void computeAreaLabel_localityAndNeighborhoodNull_returnsCityOnly() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "Udupi", null, null);

        String areaLabel = listingService.computeAreaLabel(geoResult);

        assertThat(areaLabel).isEqualTo("Udupi");
    }

    @Test
    void computeAreaLabel_nullGeoResult_returnsNull() {
        String areaLabel = listingService.computeAreaLabel(null);

        assertThat(areaLabel).isNull();
    }

    @Test
    void computeAreaLabel_nullCity_returnsNull() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", null, "Ambalpady", null);

        String areaLabel = listingService.computeAreaLabel(geoResult);

        assertThat(areaLabel).isNull();
    }

    @Test
    void computeAreaLabel_trimsWhitespace() {
        GeocodingService.GeoResult geoResult = new GeocodingService.GeoResult(
                13.35, 74.75, "Display",
                "India", "Karnataka", "  Udupi  ", "  Ambalpady  ", null);

        String areaLabel = listingService.computeAreaLabel(geoResult);

        assertThat(areaLabel).isEqualTo("Ambalpady, Udupi");
    }

    // --- Area normalization tests ---

    @Test
    void createFrom_validLandAreaAndUnit_normalizesArea() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, new BigDecimal("5000000"),
                "Udupi", null, new BigDecimal("1000"), "sqft",
                null, null, null, null, "Land 1000 sqft", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        // Area should be normalized: 1000 sqft
        assertThat(listing.getAreaSqft()).isNotNull();
        assertThat(listing.getAreaSqft()).isEqualByComparingTo(new BigDecimal("1000"));
        assertThat(listing.getAreaSqm()).isNotNull();
        assertThat(listing.getAreaCent()).isNotNull();
        // 1000 sqft / 435.6 sqft/cent ≈ 2.2957 cents
        assertThat(listing.getAreaCent()).isBetween(
                new BigDecimal("2.29"), new BigDecimal("2.30"));
    }

    @Test
    void createFrom_unknownUnit_leavesNormalizedFieldsNull() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, new BigDecimal("5000000"),
                "Udupi", null, new BigDecimal("1"), "acre",
                null, null, null, null, "Land 1 acre", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        // Unknown unit "acre" should leave normalized fields null
        assertThat(listing.getLandArea()).isEqualByComparingTo(new BigDecimal("1"));
        assertThat(listing.getLandAreaUnit()).isEqualTo("acre");
        assertThat(listing.getAreaSqm()).isNull();
        assertThat(listing.getAreaSqft()).isNull();
        assertThat(listing.getAreaCent()).isNull();
    }

    @Test
    void createFrom_nullLandArea_leavesNormalizedFieldsNull() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                new BigDecimal("1200"), "sqft", null, null, "3BHK house", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        // No landArea means no normalization
        assertThat(listing.getAreaSqm()).isNull();
        assertThat(listing.getAreaSqft()).isNull();
        assertThat(listing.getAreaCent()).isNull();
    }

    // --- KNOWN ISSUE: pricePaise not populated from AI result ---
    // TODO(follow-up): Fix pricePaise population in ListingService
    // The AI returns price as BigDecimal in rupees, but it's not being
    // converted to pricePaise. This causes pricePerCentPaise to always be null.

    @Test
    void createFrom_priceInRupees_pricePaiseNotPopulated_KNOWN_ISSUE() {
        RawPost post = makePost();
        // AI returns price = 5000000 (rupees), which should become pricePaise = 500000000000L
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, new BigDecimal("5000000"),
                "Udupi", null, new BigDecimal("10"), "cent",
                null, null, null, null, "Land 10 cents", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        // KNOWN ISSUE: pricePaise is NOT being set from the AI result
        // This test documents the current (buggy) behavior
        assertThat(listing.getPrice()).isEqualByComparingTo(new BigDecimal("5000000"));
        assertThat(listing.getPricePaise()).isNull(); // BUG: Should be 500000000000L

        // Because pricePaise is null, pricePerCentPaise is also null
        assertThat(listing.getAreaCent()).isNotNull();
        assertThat(listing.getAreaCent()).isEqualByComparingTo(new BigDecimal("10"));
        assertThat(listing.getPricePerCentPaise()).isNull(); // Cannot compute without pricePaise
    }

    // --- Lifecycle signals: repost counting ---

    @Test
    void createFrom_firstOccurrence_repostCountIsZero() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "Unique house listing", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getRepostCount()).isEqualTo(0);
        assertThat(listing.isDuplicate()).isFalse();
    }

    @Test
    void createFrom_secondOccurrence_repostCountIsOne() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "Reposted house", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(true);
        when(listingRepository.countByDedupeHash(any())).thenReturn(1L);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getRepostCount()).isEqualTo(1);
        assertThat(listing.isDuplicate()).isTrue();
    }

    @Test
    void createFrom_thirdOccurrence_repostCountIsTwo() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "Reposted house again", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(true);
        when(listingRepository.countByDedupeHash(any())).thenReturn(2L);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getRepostCount()).isEqualTo(2);
        assertThat(listing.isDuplicate()).isTrue();
    }

    @Test
    void createFrom_nullDedupeHash_repostCountIsZero() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.OTHER, null,
                null, null, null, null,
                null, null, null, null, null, 60
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getRepostCount()).isEqualTo(0);
        assertThat(listing.isDuplicate()).isFalse();
        verify(listingRepository, never()).countByDedupeHash(any());
    }

    @Test
    void createFrom_repostDoesNotBreakExistingDuplicateFlag() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", null, null, null,
                null, null, null, null, "Repost test", 85
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(true);
        when(listingRepository.countByDedupeHash(any())).thenReturn(3L);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        // Both isDuplicate and repostCount are set correctly
        assertThat(listing.isDuplicate()).isTrue();
        assertThat(listing.getRepostCount()).isEqualTo(3);
    }

    @Test
    void createFrom_idempotencyGuard_doesNotInflateRepostCount() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "Reposted house", 80
        );

        // Listing already exists for this raw post — idempotency guard triggers
        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(true);

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNull();
        verify(listingRepository, never()).countByDedupeHash(any());
        verify(listingRepository, never()).save(any());
    }

    @Test
    void createFrom_firstOccurrence_doesNotCallCountByDedupeHash() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.LAND, new BigDecimal("3000000"),
                "Manipal", null, null, null,
                null, null, null, null, "Fresh land listing", 75
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getRepostCount()).isEqualTo(0);
        verify(listingRepository, never()).countByDedupeHash(any());
    }

    @Test
    void createFrom_duplicateWithHighCount_repostCountMatchesPriorCount() {
        RawPost post = makePost();
        ClassificationResult result = new ClassificationResult(
                true, PropertyType.HOUSE, new BigDecimal("5000000"),
                "Udupi", 3, null, null,
                null, null, null, null, "Heavily reposted house", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.existsByDedupeHash(any())).thenReturn(true);
        when(listingRepository.countByDedupeHash(any())).thenReturn(99L);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFrom(post, result, "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getRepostCount()).isEqualTo(99);
        assertThat(listing.isDuplicate()).isTrue();
    }

    // --- Notification decoupling tests ---

    @Test
    void approveListing_savesListingAndPublishesEvent_doesNotCallInsertNotification() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(ownerId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setTitle("Test Property");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        listingService.approveListing(listingId, adminId);

        // Listing must be saved with LIVE status
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());

        // Event must be published (notification is now async/decoupled)
        verify(applicationEventPublisher).publishEvent(any(ListingService.ListingApprovedEvent.class));

        // insertNotification must NEVER be called directly — this is the critical decoupling assertion
        verify(listingRepository, never()).insertNotification(any(), any(), any(), any(), any());
    }

    @Test
    void rejectListing_savesListingAndPublishesEvent_doesNotCallInsertNotification() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(ownerId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setTitle("Test Property");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        listingService.rejectListing(listingId, adminId, "Poor quality images");

        // Listing must be saved with REJECTED status
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());

        // Event must be published (notification is now async/decoupled)
        verify(applicationEventPublisher).publishEvent(any(ListingService.ListingRejectedEvent.class));

        // insertNotification must NEVER be called directly — this is the critical decoupling assertion
        verify(listingRepository, never()).insertNotification(any(), any(), any(), any(), any());
    }

    // --- RE-69: lat/lng persisted on location confirmation ---

    @Test
    void updateListing_latLonPresent_savedToListing() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setLatitude(12.0);
        existing.setLongitude(75.0);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                13.3409, 74.7421,
                null, null,
                null, false);

        assertThat(result.getLatitude()).isEqualTo(13.3409);
        assertThat(result.getLongitude()).isEqualTo(74.7421);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLatitude()).isEqualTo(13.3409);
        assertThat(captor.getValue().getLongitude()).isEqualTo(74.7421);
    }

    @Test
    void updateListing_latLonAbsent_existingCoordsPreserved() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // PUT with no lat/lon (null) — must not zero out existing coordinates
        Listing result = listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null,
                null, null,
                null, false);

        assertThat(result.getLatitude()).isEqualTo(13.3409);
        assertThat(result.getLongitude()).isEqualTo(74.7421);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLatitude()).isEqualTo(13.3409);
        assertThat(captor.getValue().getLongitude()).isEqualTo(74.7421);
    }

    // --- RE-67: landAreaUnit / builtAreaUnit persisted on update ---

    @Test
    void updateListing_areaUnitsPresent_savedToListing() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                new java.math.BigDecimal("10"), null, null, null,
                null, null,
                "cent", "sqft",
                null, false);

        assertThat(result.getLandAreaUnit()).isEqualTo("cent");
        assertThat(result.getBuiltAreaUnit()).isEqualTo("sqft");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLandAreaUnit()).isEqualTo("cent");
        assertThat(captor.getValue().getBuiltAreaUnit()).isEqualTo("sqft");
        // AreaNormalizer should have populated derived fields (10 cents = 4356 sqft)
        assertThat(captor.getValue().getAreaSqft()).isNotNull();
    }

    @Test
    void updateListing_areaUnitsAbsent_existingUnitsPreserved() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setLandAreaUnit("sqft");
        existing.setBuiltAreaUnit("sqm");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // PUT with no unit fields (null) — must not zero out existing units
        Listing result = listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null,
                null, null,
                null, false);

        assertThat(result.getLandAreaUnit()).isEqualTo("sqft");
        assertThat(result.getBuiltAreaUnit()).isEqualTo("sqm");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLandAreaUnit()).isEqualTo("sqft");
        assertThat(captor.getValue().getBuiltAreaUnit()).isEqualTo("sqm");
    }

    // --- RE-70: settlement enrichment event published on address confirmation ---

    @Test
    void updateListing_addressConfirmedWithCoordsAndLandType_publishesSettlementEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("land");
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, true,   // addressConfirmed = true
                null, null, null, null, null, false);

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(applicationEventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue())
                .isInstanceOf(ListingService.SettlementEnrichmentRequestedEvent.class);
        ListingService.SettlementEnrichmentRequestedEvent event =
                (ListingService.SettlementEnrichmentRequestedEvent) eventCaptor.getValue();
        assertThat(event.listingId()).isEqualTo(listingId);
        assertThat(event.propertyType()).isEqualTo("land");
    }

    @Test
    void updateListing_addressConfirmedButApartmentType_doesNotPublishSettlementEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("apartment");
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, true,   // addressConfirmed = true
                null, null, null, null, null, false);

        verify(applicationEventPublisher, never()).publishEvent(
                any(ListingService.SettlementEnrichmentRequestedEvent.class));
    }

    @Test
    void updateListing_addressNotConfirmed_doesNotPublishSettlementEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("land");
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // addressConfirmed = null (not set in this request)
        listingService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, false);

        verify(applicationEventPublisher, never()).publishEvent(
                any(ListingService.SettlementEnrichmentRequestedEvent.class));
    }
}
