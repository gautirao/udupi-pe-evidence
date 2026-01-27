package com.example.realestate.ai;

import com.example.realestate.ingestion.RawPost;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Classifies raw posts using the AI gateway.
 * Accepts a RawPost, sends only its text content to the AI,
 * and returns a strictly-parsed ClassificationResult.
 * <p>
 * Does NOT write to the database or create listings.
 */
@Service
public class ClassificationService {

    private static final Logger log = LoggerFactory.getLogger(ClassificationService.class);

    private final AiClient aiClient;

    public ClassificationService(AiClient aiClient) {
        this.aiClient = aiClient;
    }

    /**
     * Classify a raw post's content.
     *
     * @param post the raw post to classify (only post.content is sent to AI)
     * @return classification result with property details and confidence score
     * @throws ClassificationException on AI API error or malformed response
     */
    public ClassificationResult classify(RawPost post) {
        if (post.getContent() == null || post.getContent().isBlank()) {
            throw new ClassificationException(
                    "Cannot classify post with empty content postId=" + post.getId());
        }

        log.info("Classifying post postId={} model={} promptVersion={}",
                post.getId(), aiClient.getModel(), PromptRegistry.PROMPT_VERSION);

        ClassificationResult result = aiClient.classify(post.getId(), post.getContent());

        log.info("Classification complete postId={} isRealEstate={} propertyType={} "
                        + "confidence={} promptVersion={}",
                post.getId(), result.isRealEstate(), result.propertyType(),
                result.confidenceScore(), PromptRegistry.PROMPT_VERSION);

        return result;
    }

    public String getModel() {
        return aiClient.getModel();
    }

    public String getPromptVersion() {
        return PromptRegistry.PROMPT_VERSION;
    }
}
