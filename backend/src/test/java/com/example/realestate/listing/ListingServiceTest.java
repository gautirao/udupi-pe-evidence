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

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ListingServiceTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private RawPostRepository rawPostRepository;

    @Mock
    private GeocodingPort geocodingPort;

    private ListingService listingService;

    @BeforeEach
    void setUp() {
        listingService = new ListingService(listingRepository, rawPostRepository, geocodingPort, new ObjectMapper());
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
                false, PropertyType.OTHER, null, null,
                null, null, null, null, null,
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
                true, PropertyType.HOUSE, null, null,
                "Udupi", null, null, null, null,
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
                true, PropertyType.LAND, new BigDecimal("1000000"), "INR",
                "Manipal", null, null, new BigDecimal("2400"), "sqft",
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
                true, PropertyType.HOUSE, new BigDecimal("5000000"), "INR",
                "Udupi", 3, 2, new BigDecimal("1200"), "sqft",
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
                true, PropertyType.HOUSE, null, "INR",
                "Udupi", null, null, null, null,
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
                true, PropertyType.APARTMENT, new BigDecimal("3000000"), "INR",
                "Mangalore", 2, 1, null, null,
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
                true, PropertyType.LAND, null, null,
                "Udupi", null, null, null, null,
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
                true, PropertyType.HOUSE, null, "INR",
                "Udupi", null, null, null, null,
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
                true, PropertyType.COMMERCIAL, new BigDecimal("15000000"), "USD",
                "Bangalore", null, null, new BigDecimal("5000"), "sqft",
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
        assertThat(listing.getPriceUnit()).isEqualTo("USD");
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
                true, PropertyType.HOUSE, null, null,
                null, null, null, null, null,
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
                true, PropertyType.HOUSE, new BigDecimal("5000000"), "INR",
                "Udupi", 3, 2, null, null,
                null, null, null, null, "House in Udupi", 80
        );

        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(geocodingPort.geocode("Udupi")).thenReturn(
                new GeocodingService.GeoResult(13.3409, 74.7421, "Udupi, Karnataka"));
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
                true, PropertyType.LAND, null, "INR",
                "Unknown Place", null, null, null, null,
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
                true, PropertyType.HOUSE, null, "INR",
                null, null, null, null, null,
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
                true, PropertyType.HOUSE, null, "INR",
                "   ", null, null, null, null,
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
                true, PropertyType.COMMERCIAL, new BigDecimal("10000000"), "INR",
                "Mangalore", null, null, null, null,
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
}
