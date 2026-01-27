package com.example.realestate.ingestion.pipeline;

import com.example.realestate.ingestion.RawPost;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Normalizes raw post text: trims whitespace, collapses multiple whitespace characters.
 * Input: raw content string. Output: normalized content string.
 */
@Component
public class TextNormalizationStep implements PipelineStep<String, String> {

    private static final Logger log = LoggerFactory.getLogger(TextNormalizationStep.class);

    @Override
    public String name() {
        return "text-normalization";
    }

    @Override
    public String process(RawPost post, String content) {
        if (content == null || content.isBlank()) {
            log.warn("Empty content for post postId={}, step={}", post.getId(), name());
            return "";
        }
        String normalized = content.strip().replaceAll("\\s+", " ");
        log.debug("Normalized text postId={} step={} originalLength={} normalizedLength={}",
                post.getId(), name(), content.length(), normalized.length());
        return normalized;
    }
}
