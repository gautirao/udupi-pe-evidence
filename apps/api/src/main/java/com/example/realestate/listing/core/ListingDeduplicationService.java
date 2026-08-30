package com.example.realestate.listing.core;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Encapsulates deduplication hash computation and duplicate flagging logic.
 * Shared by {@link com.example.realestate.listing.crud.ListingCrudService} and
 * {@link com.example.realestate.listing.ingestion.ListingIngestionService}.
 */
@Component
public class ListingDeduplicationService {

    private static final Logger log = LoggerFactory.getLogger(ListingDeduplicationService.class);

    private final ListingRepository listingRepository;

    public ListingDeduplicationService(ListingRepository listingRepository) {
        this.listingRepository = listingRepository;
    }

    /**
     * Compute dedupe hash from normalized (description + locality + price).
     * Returns SHA-256 hex string, or null if all components are empty.
     */
    public String computeDedupeHash(String description, String locality, BigDecimal price) {
        String normalizedDesc = normalizeString(description);
        String normalizedLocality = normalizeString(locality);
        String normalizedPrice = price != null ? price.toPlainString() : "";

        // If all components are empty, no meaningful hash
        if (normalizedDesc.isEmpty() && normalizedLocality.isEmpty() && normalizedPrice.isEmpty()) {
            return null;
        }

        String input = normalizedDesc + "|" + normalizedLocality + "|" + normalizedPrice;

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed to be available
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private String normalizeString(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().toLowerCase();
    }

    /**
     * Compute dedupe hash from the listing's description, locality, and price,
     * and set it on the listing entity.
     */
    public void computeAndSetDedupeHash(Listing listing, String description, String locality, BigDecimal price) {
        String hash = computeDedupeHash(description, locality, price);
        listing.setDedupeHash(hash);
    }

    /**
     * Check if a listing with the same dedupe hash already exists.
     * If so, mark this listing as a duplicate.
     * For new listings (no ID yet), any existing match counts.
     */
    public void checkAndMarkDuplicate(Listing listing) {
        String hash = listing.getDedupeHash();
        if (hash != null && listingRepository.existsByDedupeHash(hash)) {
            listing.setDuplicate(true);
            long priorCount = listingRepository.countByDedupeHash(hash);
            listing.setRepostCount((int) priorCount);
            log.info("Duplicate detected in draft: hash={} repostCount={}", hash, priorCount);
        }
    }

    /**
     * Check if a listing with the same dedupe hash already exists, excluding self.
     * Used during updates to avoid self-matching.
     */
    public void checkAndMarkDuplicateExcludingSelf(Listing listing) {
        String hash = listing.getDedupeHash();
        if (hash != null) {
            long matchCount = listingRepository.countByDedupeHashAndIdNot(hash, listing.getId());
            if (matchCount > 0) {
                listing.setDuplicate(true);
                listing.setRepostCount((int) matchCount);
                log.info("Duplicate detected in update: hash={} repostCount={} listingId={}",
                        hash, matchCount, listing.getId());
            } else {
                listing.setDuplicate(false);
                listing.setRepostCount(0);
            }
        } else {
            listing.setDuplicate(false);
            listing.setRepostCount(0);
        }
    }
}
