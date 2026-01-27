package com.example.realestate.ai;

import com.example.realestate.ingestion.RawPost;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClassificationServiceTest {

    @Mock
    private AiClient aiClient;

    private ClassificationService service;

    @BeforeEach
    void setUp() {
        service = new ClassificationService(aiClient);
    }

    private RawPost makePost(String content) {
        RawPost post = new RawPost();
        post.setId(UUID.randomUUID());
        post.setContent(content);
        return post;
    }

    @Test
    void classify_delegatesToAiClient() {
        RawPost post = makePost("3BHK house for sale in Udupi");
        ClassificationResult expected = new ClassificationResult(
                true, PropertyType.HOUSE, null, "INR",
                "Udupi", 3, 2, null, null, null, null,
                null, null, "3BHK house", 92
        );

        when(aiClient.classify(eq(post.getId()), eq(post.getContent()))).thenReturn(expected);
        when(aiClient.getModel()).thenReturn("test-model");

        ClassificationResult result = service.classify(post);

        assertThat(result).isSameAs(expected);
    }

    @Test
    void classify_emptyContent_throwsException() {
        RawPost post = makePost("");

        assertThatThrownBy(() -> service.classify(post))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("empty content");
    }

    @Test
    void classify_nullContent_throwsException() {
        RawPost post = makePost(null);

        assertThatThrownBy(() -> service.classify(post))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("empty content");
    }

    @Test
    void classify_blankContent_throwsException() {
        RawPost post = makePost("   ");

        assertThatThrownBy(() -> service.classify(post))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("empty content");
    }
}
