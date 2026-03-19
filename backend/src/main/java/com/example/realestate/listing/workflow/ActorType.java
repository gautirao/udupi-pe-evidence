package com.example.realestate.listing.workflow;

/**
 * Identifies who performed a listing status transition.
 * Maps to the {@code actor_type} CHECK constraint in V43 migration:
 * {@code actor_type IN ('ADMIN', 'SYSTEM', 'BROKER')}.
 */
public enum ActorType {
    BROKER, ADMIN, SYSTEM;

    /** Returns the uppercase name stored in DB (matches V43 actor_type CHECK constraint). */
    public String toDbValue() {
        return name();
    }

    /** Converts a DB value (uppercase) to ActorType. Throws IllegalArgumentException for unknown values. */
    public static ActorType fromDbValue(String v) {
        return valueOf(v.toUpperCase());
    }
}
