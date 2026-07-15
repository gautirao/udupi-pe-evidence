package com.example.realestate.ingestion;

import com.example.realestate.ai.AiClientPort;
import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.ClassificationService;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.discover.AreaResolutionService;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.ingestion.ListingIngestionService;
import com.example.realestate.quality.QualityRecomputeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcOperations;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IngestionJobRunnerTest {

    @Mock
    private RawPostRepository rawPostRepository;

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private AiClientPort aiClient;

    @Mock
    private GeocodingPort geocodingPort;

    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    @Mock
    private QualityRecomputeService qualityRecomputeService;

    @Mock
    private AreaResolutionService areaResolutionService;

    @Mock
    private JdbcOperations jdbcOperations;

    private RawPostService rawPostService;
    private ClassificationService classificationService;
    private ListingIngestionService listingIngestionService;
    private IngestionJobRunner jobRunner;

    @BeforeEach
    void setUp() {
        rawPostService = new RawPostService(rawPostRepository);
        classificationService = new ClassificationService(aiClient);
        ListingDeduplicationService deduplicationService =
                new ListingDeduplicationService(listingRepository);
        listingIngestionService = new ListingIngestionService(
                listingRepository, rawPostRepository, geocodingPort,
                new ObjectMapper(), applicationEventPublisher,
                deduplicationService, qualityRecomputeService,
                areaResolutionService, jdbcOperations, new SimpleMeterRegistry());
        jobRunner = new IngestionJobRunner(rawPostService, classificationService, listingIngestionService, 10);
    }

    private RawPost makePost(String content) {
        RawPost post = new RawPost();
        post.setId(UUID.randomUUID());
        post.setContent(content);
        post.setCreatedAt(OffsetDateTime.now());
        return post;
    }

    private ClassificationResult makeRealEstateResult(int confidence) {
        return new ClassificationResult(
                true, PropertyType.HOUSE, null,
                "Udupi", null, null, null,
                null, null, null, null, "Test listing", confidence
        );
    }

    private ClassificationResult makeNotRealEstateResult() {
        return new ClassificationResult(
                false, PropertyType.OTHER, null,
                null, null, null, null,
                null, null, null, null, null, 20
        );
    }

    @Test
    void pollUnprocessedPosts_noPosts_doesNothing() {
        when(rawPostRepository.findUnprocessed(10)).thenReturn(List.of());

        jobRunner.pollUnprocessedPosts();

        verify(rawPostRepository, never()).markProcessing(any());
        verify(aiClient, never()).classify(any(), any());
    }

    @Test
    void pollUnprocessedPosts_withRealEstatePost_createsListing() {
        RawPost post = makePost("House for sale in Udupi");
        ClassificationResult result = makeRealEstateResult(85);

        when(rawPostRepository.findUnprocessed(10)).thenReturn(List.of(post));
        when(aiClient.classify(eq(post.getId()), eq(post.getContent()))).thenReturn(result);
        when(aiClient.getModel()).thenReturn("test-model");
        when(listingRepository.existsByRawPostId(post.getId())).thenReturn(false);
        when(listingRepository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));

        jobRunner.pollUnprocessedPosts();

        verify(rawPostRepository).markProcessing(post.getId());
        verify(aiClient).classify(post.getId(), post.getContent());
        verify(listingRepository).save(any(Listing.class));
        verify(rawPostRepository).markProcessed(post.getId());
    }

    @Test
    void pollUnprocessedPosts_withNonRealEstatePost_noListingCreated() {
        RawPost post = makePost("Selling furniture");
        ClassificationResult result = makeNotRealEstateResult();

        when(rawPostRepository.findUnprocessed(10)).thenReturn(List.of(post));
        when(aiClient.classify(eq(post.getId()), eq(post.getContent()))).thenReturn(result);
        when(aiClient.getModel()).thenReturn("test-model");

        jobRunner.pollUnprocessedPosts();

        verify(rawPostRepository).markProcessing(post.getId());
        verify(aiClient).classify(post.getId(), post.getContent());
        verify(listingRepository, never()).save(any());
        verify(rawPostRepository).markProcessed(post.getId());
    }

    @Test
    void pollUnprocessedPosts_emptyContent_skipsClassification() {
        RawPost post = makePost("");

        when(rawPostRepository.findUnprocessed(10)).thenReturn(List.of(post));

        jobRunner.pollUnprocessedPosts();

        verify(rawPostRepository).markProcessing(post.getId());
        verify(aiClient, never()).classify(any(), any());
        verify(rawPostRepository).markProcessed(post.getId());
    }

    @Test
    void pollUnprocessedPosts_multiplePosts_processesAll() {
        RawPost post1 = makePost("House for sale");
        RawPost post2 = makePost("Land available");
        ClassificationResult result = makeRealEstateResult(80);

        when(rawPostRepository.findUnprocessed(10)).thenReturn(List.of(post1, post2));
        when(aiClient.classify(any(), any())).thenReturn(result);
        when(aiClient.getModel()).thenReturn("test-model");
        when(listingRepository.existsByRawPostId(any())).thenReturn(false);
        when(listingRepository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));

        jobRunner.pollUnprocessedPosts();

        verify(rawPostRepository).markProcessing(post1.getId());
        verify(rawPostRepository).markProcessing(post2.getId());
        verify(aiClient, times(2)).classify(any(), any());
        verify(listingRepository, times(2)).save(any(Listing.class));
    }
}
