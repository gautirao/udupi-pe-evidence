package com.example.realestate.ingestion;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class RawPostService {

    private final RawPostRepository rawPostRepository;

    public RawPostService(RawPostRepository rawPostRepository) {
        this.rawPostRepository = rawPostRepository;
    }

    public List<RawPost> findUnprocessed(int batchSize) {
        return rawPostRepository.findUnprocessed(batchSize);
    }

    public List<RawPost> findUnprocessedByFeedRunId(UUID feedRunId, int batchSize) {
        return rawPostRepository.findUnprocessedByFeedRunId(feedRunId, batchSize);
    }

    @Transactional
    public void markProcessing(UUID postId) {
        rawPostRepository.markProcessing(postId);
    }

    @Transactional
    public void markProcessed(UUID postId) {
        rawPostRepository.markProcessed(postId);
    }

    public RawPost save(RawPost rawPost) {
        return rawPostRepository.save(rawPost);
    }
}
