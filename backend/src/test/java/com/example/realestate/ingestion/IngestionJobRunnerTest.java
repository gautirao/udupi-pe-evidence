package com.example.realestate.ingestion;

import com.example.realestate.ai.ClassificationException;
import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ingestion.pipeline.ClassificationStep;
import com.example.realestate.ingestion.pipeline.ListingAssemblyStep;
import com.example.realestate.ingestion.pipeline.TextNormalizationStep;
import com.example.realestate.listing.Listing;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IngestionJobRunnerTest {

    @Mock
    private RawPostService rawPostService;
    @Mock
    private TextNormalizationStep textNormalizationStep;
    @Mock
    private ClassificationStep classificationStep;
    @Mock
    private ListingAssemblyStep listingAssemblyStep;
    @Mock
    private JdbcTemplate jdbcTemplate;

    private IngestionJobRunner jobRunner;

    @BeforeEach
    void setUp() {
        jobRunner = new IngestionJobRunner(
                rawPostService, textNormalizationStep, classificationStep,
                listingAssemblyStep, jdbcTemplate, 10);
    }

    private RawPost makePost(String content) {
        RawPost post = new RawPost();
        post.setId(UUID.randomUUID());
        post.setContent(content);
        post.setCreatedAt(OffsetDateTime.now());
        return post;
    }

    @Test
    void processBatch_realEstatePost_createsListingAndMarksProcessed() {
        RawPost post = makePost("3BHK house for sale in Udupi");
        ClassificationResult classification = new ClassificationResult(
                true, "house", new BigDecimal("5000000"), "INR",
                "Udupi", 3, 2, null, null, null, null,
                null, null, "3BHK house", 85
        );

        when(textNormalizationStep.process(eq(post), any())).thenReturn("3BHK house for sale in Udupi");
        when(classificationStep.process(eq(post), any())).thenReturn(classification);
        when(listingAssemblyStep.process(eq(post), eq(classification))).thenReturn(new Listing());

        IngestionJobRunner.ProcessingResult result = jobRunner.processBatch(List.of(post), null);

        assertThat(result.processed()).isEqualTo(1);
        assertThat(result.listingsCreated()).isEqualTo(1);
        assertThat(result.failed()).isEqualTo(0);
        verify(rawPostService).markProcessed(post.getId());
    }

    @Test
    void processBatch_notRealEstate_marksProcessedNoListing() {
        RawPost post = makePost("Selling old furniture cheap");
        ClassificationResult classification = new ClassificationResult(
                false, "other", null, null,
                null, null, null, null, null, null, null,
                null, null, null, 10
        );

        when(textNormalizationStep.process(eq(post), any())).thenReturn("Selling old furniture cheap");
        when(classificationStep.process(eq(post), any())).thenReturn(classification);
        when(listingAssemblyStep.process(eq(post), eq(classification))).thenReturn(null);

        IngestionJobRunner.ProcessingResult result = jobRunner.processBatch(List.of(post), null);

        assertThat(result.processed()).isEqualTo(1);
        assertThat(result.listingsCreated()).isEqualTo(0);
        verify(rawPostService).markProcessed(post.getId());
    }

    @Test
    void processBatch_aiFails_doesNotMarkProcessed() {
        RawPost post = makePost("Some post content");

        when(textNormalizationStep.process(eq(post), any())).thenReturn("Some post content");
        when(classificationStep.process(eq(post), any()))
                .thenThrow(new ClassificationException("AI API error"));

        IngestionJobRunner.ProcessingResult result = jobRunner.processBatch(List.of(post), null);

        assertThat(result.processed()).isEqualTo(0);
        assertThat(result.failed()).isEqualTo(1);
        verify(rawPostService, never()).markProcessed(post.getId());
    }

    @Test
    void processBatch_listingInsertFails_doesNotMarkProcessed() {
        RawPost post = makePost("House for sale");
        ClassificationResult classification = new ClassificationResult(
                true, "house", null, null, null, null, null,
                null, null, null, null, null, null, "House", 80
        );

        when(textNormalizationStep.process(eq(post), any())).thenReturn("House for sale");
        when(classificationStep.process(eq(post), any())).thenReturn(classification);
        when(listingAssemblyStep.process(eq(post), eq(classification)))
                .thenThrow(new RuntimeException("DB insert failed"));

        IngestionJobRunner.ProcessingResult result = jobRunner.processBatch(List.of(post), null);

        assertThat(result.processed()).isEqualTo(0);
        assertThat(result.failed()).isEqualTo(1);
        // Critical: post must NOT be marked processed when listing insert fails
        verify(rawPostService, never()).markProcessed(post.getId());
    }

    @Test
    void processBatch_emptyContent_marksProcessedNoListing() {
        RawPost post = makePost("");

        when(textNormalizationStep.process(eq(post), any())).thenReturn("");

        IngestionJobRunner.ProcessingResult result = jobRunner.processBatch(List.of(post), null);

        assertThat(result.processed()).isEqualTo(1);
        assertThat(result.listingsCreated()).isEqualTo(0);
        verify(rawPostService).markProcessed(post.getId());
        verify(classificationStep, never()).process(any(), any());
    }

    @Test
    void processBatch_withFeedRunId_updatesFeedRunStats() {
        UUID feedRunId = UUID.randomUUID();
        RawPost post = makePost("Land for sale");
        ClassificationResult classification = new ClassificationResult(
                true, "land", null, null, null, null, null,
                null, null, null, null, null, null, "Land", 75
        );

        when(textNormalizationStep.process(eq(post), any())).thenReturn("Land for sale");
        when(classificationStep.process(eq(post), any())).thenReturn(classification);
        when(listingAssemblyStep.process(eq(post), eq(classification))).thenReturn(new Listing());

        jobRunner.processBatch(List.of(post), feedRunId);

        verify(jdbcTemplate).update(
                eq("UPDATE public.feed_runs SET posts_parsed = ?, posts_failed = ? WHERE id = ?"),
                eq(1), eq(0), eq(feedRunId));
    }

    @Test
    void processBatch_mixedResults_countsCorrectly() {
        RawPost post1 = makePost("House for sale");
        RawPost post2 = makePost("Furniture for sale");
        RawPost post3 = makePost("Land near beach");

        ClassificationResult realEstate = new ClassificationResult(
                true, "house", null, null, null, null, null,
                null, null, null, null, null, null, "House", 80
        );
        ClassificationResult notRealEstate = new ClassificationResult(
                false, "other", null, null, null, null, null,
                null, null, null, null, null, null, null, 10
        );

        when(textNormalizationStep.process(any(), any())).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            return p.getContent();
        });
        when(classificationStep.process(eq(post1), any())).thenReturn(realEstate);
        when(classificationStep.process(eq(post2), any())).thenReturn(notRealEstate);
        when(classificationStep.process(eq(post3), any()))
                .thenThrow(new ClassificationException("timeout"));

        when(listingAssemblyStep.process(eq(post1), eq(realEstate))).thenReturn(new Listing());
        when(listingAssemblyStep.process(eq(post2), eq(notRealEstate))).thenReturn(null);

        IngestionJobRunner.ProcessingResult result =
                jobRunner.processBatch(List.of(post1, post2, post3), null);

        assertThat(result.processed()).isEqualTo(2);
        assertThat(result.listingsCreated()).isEqualTo(1);
        assertThat(result.failed()).isEqualTo(1);

        verify(rawPostService).markProcessed(post1.getId());
        verify(rawPostService).markProcessed(post2.getId());
        verify(rawPostService, never()).markProcessed(post3.getId());
    }
}
