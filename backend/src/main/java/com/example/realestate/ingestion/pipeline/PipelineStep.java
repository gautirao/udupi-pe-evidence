package com.example.realestate.ingestion.pipeline;

import com.example.realestate.ingestion.RawPost;

/**
 * A single step in the ingestion processing pipeline.
 * Each step is idempotent and retryable.
 */
public interface PipelineStep<I, O> {

    String name();

    O process(RawPost post, I input);
}
