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

    /** Rent/lease listingPurpose values whose amount component is monthlyRent, not price. */
    private static final java.util.Set<String> RENTAL_PURPOSES = java.util.Set.of("rent", "lease");

    /**
     * Compute dedupe hash from normalized (description + locality + price), assuming a sale
     * listing (listingPurpose="sale", no monthlyRent).
     *
     * <p>Not deprecated: this is the intentional, permanent signature for {@link
     * com.example.realestate.listing.ingestion.ListingIngestionService}, which has no
     * listingPurpose/monthlyRent concept (organic scraped posts are sale-only) and is a live,
     * ongoing caller — not a callsite scheduled for migration to the 5-arg overload. Any OTHER
     * caller that has a listingPurpose/monthlyRent to supply should prefer {@link
     * #computeDedupeHash(String, String, String, BigDecimal, Long)}.
     */
    public String computeDedupeHash(String description, String locality, BigDecimal price) {
        return computeDedupeHash(description, locality, "sale", price, null);
    }

    /**
     * Compute dedupe hash from normalized (description + locality + listingPurpose + amount),
     * where amount is monthlyRent for a rent/lease listing and price for a sale listing.
     * Returns SHA-256 hex string, or null if all components are empty.
     *
     * <p>#2519: listingPurpose participates in the hash so a sale listing never collides with a
     * rent/lease listing on locality+description alone, and the amount component reads
     * monthlyRent (not the always-null price) for rent/lease listings.
     */
    public String computeDedupeHash(String description, String locality, String listingPurpose,
                                     BigDecimal price, Long monthlyRent) {
        String normalizedDesc = normalizeString(description);
        String normalizedLocality = normalizeString(locality);
        String normalizedPurpose = normalizeString(listingPurpose);
        boolean isRental = RENTAL_PURPOSES.contains(normalizedPurpose);
        String normalizedAmount = isRental
                ? (monthlyRent != null ? monthlyRent.toString() : "")
                : (price != null ? price.toPlainString() : "");

        // If description/locality/amount are all empty, no meaningful hash. listingPurpose is
        // deliberately EXCLUDED from this check: it defaults to "sale" everywhere (non-null,
        // non-blank — see Listing.java's NOT NULL column and this class's own 3-arg overload),
        // so including it here would make the guard permanently unsatisfiable, letting every
        // content-less listing collapse onto the same constant hash sha256("||sale|") and
        // falsely flag the second one as a duplicate — reintroducing #2519's own failure mode.
        // listingPurpose still participates in the HASH INPUT below; it is just not part of the
        // "is there anything here worth hashing" emptiness check.
        if (normalizedDesc.isEmpty() && normalizedLocality.isEmpty() && normalizedAmount.isEmpty()) {
            return null;
        }

        String input = normalizedDesc + "|" + normalizedLocality + "|" + normalizedPurpose + "|" + normalizedAmount;

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
     * Compute dedupe hash from the listing's description, locality, listingPurpose, price, and
     * monthlyRent, reading all five directly off the entity, and set it on the listing.
     *
     * <p>Callers (createDraft, updateListing) must have already applied any incoming
     * description/locality/listingPurpose/price/monthlyRent changes to the entity before calling
     * this, since it reads current entity state rather than taking explicit parameters.
     */
    public void computeAndSetDedupeHash(Listing listing) {
        String hash = computeDedupeHash(
                listing.getDescription(), listing.getLocality(), listing.getListingPurpose(),
                listing.getPrice(), listing.getMonthlyRent());
        listing.setDedupeHash(hash);
    }

    /**
     * Check if a listing with the same dedupe hash already exists.
     * If so, mark this listing as a duplicate.
     * For new listings (no ID yet), any existing match counts.
     */
    public void checkAndMarkDuplicate(Listing listing) {
        String hash = listing.getDedupeHash();
        if (hash != null && listingRepository.existsActiveByDedupeHash(hash)) {
            listing.setDuplicate(true);
            long priorCount = listingRepository.countActiveByDedupeHash(hash);
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
            long matchCount = listingRepository.countActiveByDedupeHashAndIdNot(hash, listing.getId());
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
