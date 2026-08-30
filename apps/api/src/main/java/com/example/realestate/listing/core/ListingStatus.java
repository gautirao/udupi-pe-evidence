package com.example.realestate.listing.core;

/**
 * Listing lifecycle status values.
 * Maps to the {@code public.listing_status} PostgreSQL enum.
 *
 * <ul>
 *   <li>{@link #SCRAPED} — created by the ingestion pipeline</li>
 *   <li>{@link #DRAFT} — created by a broker, not yet submitted</li>
 *   <li>{@link #PENDING_REVIEW} — submitted by broker, awaiting admin approval</li>
 *   <li>{@link #LIVE} — approved by admin, visible to all users</li>
 *   <li>{@link #REJECTED} — rejected by admin, broker can edit and resubmit</li>
 *   <li>{@link #ARCHIVED} — soft-deleted by broker/admin; hidden from owner views but preserved for history</li>
 * </ul>
 */
public enum ListingStatus {
    SCRAPED,
    DRAFT,
    PENDING_REVIEW,
    LIVE,
    REJECTED,
    ARCHIVED;

    /**
     * Returns the database-compatible string value (matches PostgreSQL enum).
     */
    public String toDbValue() {
        return name();
    }

    /**
     * Parses a database string value to a {@link ListingStatus}.
     *
     * @throws IllegalArgumentException if the value doesn't match any status
     */
    public static ListingStatus fromDbValue(String value) {
        return valueOf(value);
    }
}
