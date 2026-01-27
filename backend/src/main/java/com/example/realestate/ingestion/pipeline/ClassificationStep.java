package com.example.realestate.ingestion.pipeline;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.ClassificationService;
import com.example.realestate.ingestion.RawPost;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Calls the AI classification service to determine if a post is a real estate listing.
 * Input: normalized text (unused — classification reads from post.content directly).
 * Output: ClassificationResult from AI.
 */
@Component
public class ClassificationStep implements PipelineStep<String, ClassificationResult> {

    private static final Logger log = LoggerFactory.getLogger(ClassificationStep.class);

    private final ClassificationService classificationService;

    public ClassificationStep(ClassificationService classificationService) {
        this.classificationService = classificationService;
    }

    @Override
    public String name() {
        return "ai-classification";
    }

    @Override
    public ClassificationResult process(RawPost post, String normalizedText) {
        log.info("Starting AI classification postId={} step={}", post.getId(), name());
        ClassificationResult result = classificationService.classify(post);
        log.info("AI classification done postId={} step={} isRealEstate={} confidence={}",
                post.getId(), name(), result.isRealEstate(), result.confidenceScore());
        return result;
    }
}
