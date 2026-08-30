package com.example.realestate.listing.audit;

import com.example.realestate.listing.core.ListingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Service for normalizing locality names in property listings.
 *
 * Normalization rules:
 * - Trim leading/trailing whitespace
 * - Title-case each word (first letter upper, rest lower)
 *
 * Admin endpoints use this to:
 * 1. Discover candidate localities that differ from their normalized form
 * 2. Preview how many listings would be affected by a rename
 * 3. Apply a bulk rename (from → to)
 */
@Service
public class LocalityNormalizerService {

    private final ListingRepository listingRepository;

    public LocalityNormalizerService(ListingRepository listingRepository) {
        this.listingRepository = listingRepository;
    }

    /**
     * Suggests a canonical form for a raw locality string (trim + title-case).
     */
    public String suggestCanonical(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) return null;
        return toTitleCase(trimmed);
    }

    /**
     * Returns all distinct localities with listing counts and suggested canonical forms.
     * Entries where raw == suggested are included so the UI can display the full list.
     */
    public List<LocalityCandidate> getCandidates() {
        List<Object[]> rows = listingRepository.findLocalitiesWithCounts();
        return rows.stream()
                .map(row -> {
                    String raw = (String) row[0];
                    long count = ((Number) row[1]).longValue();
                    String suggested = suggestCanonical(raw);
                    boolean needsNormalization = !raw.equals(suggested);
                    return new LocalityCandidate(raw, suggested, count, needsNormalization);
                })
                .toList();
    }

    /**
     * Returns how many listings have the given locality value (for preview).
     */
    public long previewImpact(String locality) {
        return listingRepository.countListingsByLocality(locality);
    }

    /**
     * Bulk-renames listings from one locality value to another.
     *
     * @return number of rows updated
     */
    @Transactional
    public int apply(String from, String to) {
        return listingRepository.bulkUpdateLocality(from, to);
    }

    // ===== Helpers =====

    private static String toTitleCase(String s) {
        String[] words = s.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (!sb.isEmpty()) sb.append(' ');
            if (!word.isEmpty()) {
                sb.append(Character.toUpperCase(word.charAt(0)));
                sb.append(word.substring(1).toLowerCase());
            }
        }
        return sb.toString();
    }

    // ===== DTOs =====

    public record LocalityCandidate(
            String raw,
            String suggestedCanonical,
            long listingCount,
            boolean needsNormalization
    ) {}
}
