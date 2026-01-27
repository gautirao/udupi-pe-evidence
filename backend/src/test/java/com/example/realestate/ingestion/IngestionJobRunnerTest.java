package com.example.realestate.ingestion;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IngestionJobRunnerTest {

    @Mock
    private RawPostService rawPostService;

    private IngestionJobRunner jobRunner;

    @BeforeEach
    void setUp() {
        jobRunner = new IngestionJobRunner(rawPostService, 10);
    }

    private RawPost makePost(String content) {
        RawPost post = new RawPost();
        post.setId(UUID.randomUUID());
        post.setContent(content);
        post.setCreatedAt(OffsetDateTime.now());
        return post;
    }

    @Test
    void pollUnprocessedPosts_noPosts_doesNothing() {
        when(rawPostService.findUnprocessed(10)).thenReturn(List.of());

        jobRunner.pollUnprocessedPosts();

        verify(rawPostService, never()).markProcessing(any());
    }

    @Test
    void pollUnprocessedPosts_withPosts_marksEachAsProcessing() {
        RawPost post1 = makePost("House for sale in Udupi");
        RawPost post2 = makePost("Land near Manipal");

        when(rawPostService.findUnprocessed(10)).thenReturn(List.of(post1, post2));

        jobRunner.pollUnprocessedPosts();

        verify(rawPostService).markProcessing(post1.getId());
        verify(rawPostService).markProcessing(post2.getId());
        // Must NOT call markProcessed — skeleton only marks as processing
        verify(rawPostService, never()).markProcessed(any());
    }

    @Test
    void pollUnprocessedPosts_singlePost_marksAsProcessing() {
        RawPost post = makePost("Commercial space available");

        when(rawPostService.findUnprocessed(10)).thenReturn(List.of(post));

        jobRunner.pollUnprocessedPosts();

        verify(rawPostService).markProcessing(post.getId());
        verify(rawPostService, never()).markProcessed(any());
    }
}
