package com.example.realestate.ingestion;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class IngestionControllerTest {

    @Mock
    private RawPostRepository rawPostRepository;

    private RawPostService rawPostService;
    private IngestionController controller;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        rawPostService = new RawPostService(rawPostRepository);
        objectMapper = new ObjectMapper();
        objectMapper.findAndRegisterModules();
        controller = new IngestionController(rawPostService, objectMapper);
    }

    private RawPost savedPostWithId(UUID id) {
        RawPost post = new RawPost();
        post.setId(id);
        return post;
    }

    @Test
    void ingestRawPost_validRequest_returns202Accepted() {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(invocation -> {
            RawPost post = invocation.getArgument(0);
            post.setId(postId);
            return post;
        });

        IngestionController.IngestRequest request = new IngestionController.IngestRequest(
                "FACEBOOK",
                "fb_123",
                "House for sale in Udupi",
                List.of(),
                "Test Author",
                OffsetDateTime.now()
        );

        ResponseEntity<Map<String, Object>> response = controller.ingestRawPost(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getBody()).containsEntry("success", true);
        assertThat(response.getBody()).containsEntry("rawPostId", postId.toString());
        assertThat(response.getBody()).containsEntry("message", "Raw post accepted for processing");
    }

    @Test
    void ingestRawPost_withImages_savesImagesAsJson() {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(invocation -> {
            RawPost post = invocation.getArgument(0);
            post.setId(postId);
            return post;
        });

        IngestionController.IngestRequest request = new IngestionController.IngestRequest(
                "FACEBOOK",
                "fb_456",
                "3 BHK apartment",
                List.of("https://example.com/img1.jpg", "https://example.com/img2.jpg"),
                "Agent",
                OffsetDateTime.now()
        );

        controller.ingestRawPost(request);

        ArgumentCaptor<RawPost> captor = ArgumentCaptor.forClass(RawPost.class);
        verify(rawPostRepository).save(captor.capture());

        RawPost savedPost = captor.getValue();
        assertThat(savedPost.getImages()).isEqualTo("[\"https://example.com/img1.jpg\",\"https://example.com/img2.jpg\"]");
    }

    @Test
    void ingestRawPost_withEmptyImages_savesEmptyJsonArray() {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(invocation -> {
            RawPost post = invocation.getArgument(0);
            post.setId(postId);
            return post;
        });

        IngestionController.IngestRequest request = new IngestionController.IngestRequest(
                "FACEBOOK",
                "fb_789",
                "Land for sale",
                List.of(),
                "Owner",
                OffsetDateTime.now()
        );

        controller.ingestRawPost(request);

        ArgumentCaptor<RawPost> captor = ArgumentCaptor.forClass(RawPost.class);
        verify(rawPostRepository).save(captor.capture());

        RawPost savedPost = captor.getValue();
        assertThat(savedPost.getImages()).isEqualTo("[]");
    }

    @Test
    void ingestRawPost_withNullImages_savesEmptyJsonArray() {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(invocation -> {
            RawPost post = invocation.getArgument(0);
            post.setId(postId);
            return post;
        });

        IngestionController.IngestRequest request = new IngestionController.IngestRequest(
                "FACEBOOK",
                "fb_null_images",
                "Commercial space",
                null,
                "Owner",
                OffsetDateTime.now()
        );

        controller.ingestRawPost(request);

        ArgumentCaptor<RawPost> captor = ArgumentCaptor.forClass(RawPost.class);
        verify(rawPostRepository).save(captor.capture());

        RawPost savedPost = captor.getValue();
        assertThat(savedPost.getImages()).isEqualTo("[]");
    }

    @Test
    void ingestRawPost_setsAllFieldsCorrectly() {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(invocation -> {
            RawPost post = invocation.getArgument(0);
            post.setId(postId);
            return post;
        });

        OffsetDateTime postedAt = OffsetDateTime.parse("2026-02-04T10:00:00Z");
        IngestionController.IngestRequest request = new IngestionController.IngestRequest(
                "FACEBOOK",
                "fb_full_test",
                "Beautiful property in Manipal",
                List.of("https://img.com/a.jpg"),
                "Real Estate Agent",
                postedAt
        );

        controller.ingestRawPost(request);

        ArgumentCaptor<RawPost> captor = ArgumentCaptor.forClass(RawPost.class);
        verify(rawPostRepository).save(captor.capture());

        RawPost savedPost = captor.getValue();
        assertThat(savedPost.getContent()).isEqualTo("Beautiful property in Manipal");
        assertThat(savedPost.getExternalPostId()).isEqualTo("fb_full_test");
        assertThat(savedPost.getAuthorName()).isEqualTo("Real Estate Agent");
        assertThat(savedPost.getPostedAt()).isEqualTo(postedAt);
        assertThat(savedPost.getCreatedAt()).isNotNull();
        assertThat(savedPost.isProcessed()).isFalse();
    }

    @Test
    void ingestBulk_multiplePosts_returnsCorrectCount() {
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(invocation -> {
            RawPost post = invocation.getArgument(0);
            post.setId(UUID.randomUUID());
            return post;
        });

        List<IngestionController.IngestRequest> posts = List.of(
                new IngestionController.IngestRequest("FACEBOOK", "bulk_1", "Post 1", List.of(), "Author1", OffsetDateTime.now()),
                new IngestionController.IngestRequest("FACEBOOK", "bulk_2", "Post 2", List.of(), "Author2", OffsetDateTime.now()),
                new IngestionController.IngestRequest("FACEBOOK", "bulk_3", "Post 3", List.of(), "Author3", OffsetDateTime.now())
        );

        IngestionController.BulkIngestRequest request = new IngestionController.BulkIngestRequest(posts);

        ResponseEntity<Map<String, Object>> response = controller.ingestBulk(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getBody()).containsEntry("success", true);
        assertThat(response.getBody()).containsEntry("imported", 3);

        verify(rawPostRepository, times(3)).save(any(RawPost.class));
    }

    @Test
    void ingestBulk_withFailures_continuesProcessingAndReportsPartialSuccess() {
        when(rawPostRepository.save(any(RawPost.class)))
                .thenAnswer(invocation -> {
                    RawPost post = invocation.getArgument(0);
                    post.setId(UUID.randomUUID());
                    return post;
                })
                .thenThrow(new RuntimeException("DB error"))
                .thenAnswer(invocation -> {
                    RawPost post = invocation.getArgument(0);
                    post.setId(UUID.randomUUID());
                    return post;
                });

        List<IngestionController.IngestRequest> posts = List.of(
                new IngestionController.IngestRequest("FACEBOOK", "bulk_ok_1", "Post 1", List.of(), "A1", OffsetDateTime.now()),
                new IngestionController.IngestRequest("FACEBOOK", "bulk_fail", "Post 2", List.of(), "A2", OffsetDateTime.now()),
                new IngestionController.IngestRequest("FACEBOOK", "bulk_ok_2", "Post 3", List.of(), "A3", OffsetDateTime.now())
        );

        IngestionController.BulkIngestRequest request = new IngestionController.BulkIngestRequest(posts);

        ResponseEntity<Map<String, Object>> response = controller.ingestBulk(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getBody()).containsEntry("imported", 2);

        verify(rawPostRepository, times(3)).save(any(RawPost.class));
    }

    @Test
    void ingestBulk_emptyList_returnsZeroImported() {
        IngestionController.BulkIngestRequest request = new IngestionController.BulkIngestRequest(List.of());

        ResponseEntity<Map<String, Object>> response = controller.ingestBulk(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(response.getBody()).containsEntry("imported", 0);

        verify(rawPostRepository, never()).save(any(RawPost.class));
    }
}
