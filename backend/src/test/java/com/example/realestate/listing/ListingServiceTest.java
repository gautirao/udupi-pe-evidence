package com.example.realestate.listing;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ingestion.RawPost;
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
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingServiceTest {

    @Mock
    private ListingRepository listingRepository;

    private ListingService listingService;

    @BeforeEach
    void setUp() {
        listingService = new ListingService(listingRepository, new ObjectMapper());
    }

    private RawPost makePost() {
        RawPost post = new RawPost();
        post.setId(UUID.randomUUID());
        post.setContent("test content");
        return post;
    }

    @Test
    void createFromClassification_confidence70_isValidTrue() {
        ClassificationResult result = new ClassificationResult(
                true, "house", new BigDecimal("5000000"), "INR",
                "Udupi", 3, 2, new BigDecimal("1200"), "sqft",
                new BigDecimal("1800"), "sqft", "9876543210", "John",
                "3BHK house", 70
        );

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFromClassification(makePost(), result, "test-model");

        assertThat(listing.isValid()).isTrue();
        assertThat(listing.getConfidenceScore()).isEqualTo(70);
    }

    @Test
    void createFromClassification_confidence50_isValidFalse() {
        ClassificationResult result = new ClassificationResult(
                true, "land", new BigDecimal("1000000"), "INR",
                "Manipal", null, null, new BigDecimal("2400"), "sqft",
                null, null, null, null, "Land for sale", 50
        );

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFromClassification(makePost(), result, "test-model");

        assertThat(listing.isValid()).isFalse();
        assertThat(listing.getConfidenceScore()).isEqualTo(50);
    }

    @Test
    void createFromClassification_apartmentMappedToHouse() {
        ClassificationResult result = new ClassificationResult(
                true, "apartment", new BigDecimal("3000000"), "INR",
                "Mangalore", 2, 1, null, null,
                new BigDecimal("900"), "sqft", null, null,
                "2BHK apartment", 85
        );

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFromClassification(makePost(), result, "test-model");

        assertThat(listing.getPropertyType()).isEqualTo("house");
    }

    @Test
    void createFromClassification_nullPriceUnit_defaultsToINR() {
        ClassificationResult result = new ClassificationResult(
                true, "land", null, null,
                "Udupi", null, null, null, null,
                null, null, null, null, "Land", 60
        );

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        Listing listing = listingService.createFromClassification(makePost(), result, "test-model");

        assertThat(listing.getPriceUnit()).isEqualTo("INR");
    }

    @Test
    void createFromClassification_parsedDataIncludesModelAndVersion() {
        ClassificationResult result = new ClassificationResult(
                true, "house", null, "INR",
                "Udupi", null, null, null, null,
                null, null, null, null, "House", 75
        );

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        when(listingRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        listingService.createFromClassification(makePost(), result, "google/gemini-3-flash-preview");

        Listing saved = captor.getValue();
        assertThat(saved.getParsedData()).contains("\"model\":\"google/gemini-3-flash-preview\"");
        assertThat(saved.getParsedData()).contains("\"prompt_version\":\"v1\"");
    }
}
