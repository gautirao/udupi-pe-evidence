package com.example.realestate.ai;

import java.util.UUID;

/**
 * Port interface for AI classification.
 * Allows mocking in tests without bytecode manipulation issues on Java 21+.
 */
public interface AiClientPort {

    /**
     * Call the AI API to classify post content.
     *
     * @param postId      used for logging only
     * @param postContent the raw text to classify
     * @return parsed ClassificationResult from the AI response
     * @throws ClassificationException on API error or malformed response
     */
    ClassificationResult classify(UUID postId, String postContent);

    /**
     * @return the model identifier used for classification
     */
    String getModel();
}
