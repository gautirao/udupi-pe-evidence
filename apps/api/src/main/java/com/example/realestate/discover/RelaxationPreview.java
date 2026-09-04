package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * One deterministic single-filter relaxation offer for the zero-result recovery panel (#2018).
 *
 * <p>Exactly ONE filter changes per preview — the issue's "propose one change at a time" rule.
 * {@link #kind} says which, and exactly one of the patch fields below is non-null and carries the
 * FULL resulting value for that filter (never a delta operation), so the client applies it
 * explicitly rather than inferring an edit:
 *
 * <ul>
 *   <li>{@code PRICE_MAX} → {@link #priceMax} — the new maximum, in RUPEES (same unit the
 *       {@code priceMax} request param uses, so the client can echo it straight back).</li>
 *   <li>{@code READY_TO_MOVE} → {@link #readyToMove} — always {@code false}; the constraint is
 *       dropped, never inverted.</li>
 *   <li>{@code BEDROOMS} → {@link #bedrooms} — the new bedroom set. An EMPTY list means "clear the
 *       bedroom filter entirely" (accept any); it never means "match nothing".</li>
 *   <li>{@code PROPERTY_TYPES} → {@link #propertyTypes} — the new property-type set. An EMPTY list
 *       means "clear the property-type filter entirely", with the same reading as above.</li>
 * </ul>
 *
 * <p>{@code purpose} (buy/rent), {@code city} and property category are structurally absent from
 * this record: the issue forbids relaxing them, so there is no field through which a future change
 * could accidentally start doing so.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RelaxationPreview(
        Kind kind,
        long resultingCount,
        Long priceMax,
        Boolean readyToMove,
        List<Integer> bedrooms,
        List<String> propertyTypes
) {

    /** The fixed relaxation vocabulary. Declaration order IS the response order — see
     *  {@link RelaxationPreviewsService}'s determinism contract. */
    public enum Kind {
        PRICE_MAX,
        READY_TO_MOVE,
        BEDROOMS,
        PROPERTY_TYPES
    }

    static RelaxationPreview priceMax(long rupees, long resultingCount) {
        return new RelaxationPreview(Kind.PRICE_MAX, resultingCount, rupees, null, null, null);
    }

    static RelaxationPreview readyToMove(long resultingCount) {
        return new RelaxationPreview(Kind.READY_TO_MOVE, resultingCount, null, Boolean.FALSE, null, null);
    }

    static RelaxationPreview bedrooms(List<Integer> next, long resultingCount) {
        return new RelaxationPreview(Kind.BEDROOMS, resultingCount, null, null, List.copyOf(next), null);
    }

    static RelaxationPreview propertyTypes(List<String> next, long resultingCount) {
        return new RelaxationPreview(Kind.PROPERTY_TYPES, resultingCount, null, null, null, List.copyOf(next));
    }
}
