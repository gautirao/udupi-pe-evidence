package com.example.realestate.listing.duplicate;

/**
 * Lifecycle status for a {@link DuplicateCandidate} pair.
 *
 * <ul>
 *   <li>{@link #PENDING}   — awaiting admin review</li>
 *   <li>{@link #CONFIRMED} — admin confirmed as duplicate; {@code isDuplicate=true} set on newer listing</li>
 *   <li>{@link #DISMISSED} — admin dismissed; pair is not a duplicate</li>
 * </ul>
 *
 * Stored as a {@code VARCHAR(20)} column using {@code @Enumerated(EnumType.STRING)}.
 */
public enum DuplicateCandidateStatus {
    PENDING,
    CONFIRMED,
    DISMISSED
}
