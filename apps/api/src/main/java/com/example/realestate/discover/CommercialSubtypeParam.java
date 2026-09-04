package com.example.realestate.discover;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Boundary validation for the {@code commercialSubtypes} query param (#2431), shared verbatim by
 * {@link DiscoverListingsController} and {@link DiscoverMarkersController}.
 *
 * <p><b>Why one class rather than two copies.</b> The issue's contract is that cards and map
 * markers return the SAME membership for the same request. Two hand-written validators would be
 * two places for the accepted vocabulary to drift, and a divergence there is exactly the
 * count-vs-list class of defect {@link DiscoverFilterNormalizer} was created to close. One
 * {@code validate} call on both endpoints makes the agreement structural.
 *
 * <p><b>Why this rejects unknown values when {@code propertyTypes} preserves them.</b>
 * {@link DiscoverFilterNormalizer}'s javadoc explains that an unrecognised {@code propertyTypes}
 * value is PRESERVED rather than 400'd, because that param predates the allowlist and the frontend
 * may already emit URL shapes containing one — inventing a 400 there would break live links.
 * {@code commercialSubtypes} is brand new in this change: no client emits it, no saved URL contains
 * it, and the issue states the contract explicitly ("unknown values fail deterministically"). A
 * loud 400 is therefore strictly better here — it tells an integrator they typed {@code Shop123}
 * instead of silently returning an empty result they would have to debug.
 *
 * <p>The normaliser still treats an unrecognised value as unsatisfiable (matching nothing) as a
 * fail-closed backstop for any non-controller caller — see
 * {@link DiscoverFilterNormalizer#normalizeCommercialSubtypes}.
 */
final class CommercialSubtypeParam {

    private CommercialSubtypeParam() {
    }

    /**
     * Validates a raw {@code commercialSubtypes} param and returns it unchanged when acceptable.
     *
     * <p>Canonicalisation is deliberately NOT done here — it belongs to
     * {@link DiscoverFilterNormalizer}, invoked from inside
     * {@link DiscoverListingPredicateBuilder#build}, where no caller can bypass it. Doing it in
     * both places would create a second source of truth for the vocabulary.
     *
     * @param raw the repeated query param values, or {@code null} when the param was absent
     * @return {@code raw}, unmodified
     * @throws ResponseStatusException 400 when the list is present-but-empty, exceeds the
     *         repetition cap, or contains a value outside {SHOP, OFFICE} (case-insensitive)
     */
    static List<String> validate(List<String> raw) {
        if (raw == null) {
            return null;
        }
        // Present-but-empty is a client bug, not "no filter" — same treatment as areaKeys.
        if (raw.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "commercial_subtypes_must_not_be_empty");
        }
        // Repetition cap: these are public unauthenticated endpoints and the param is repeatable,
        // so an unbounded ?commercialSubtypes=a&commercialSubtypes=b&... would mint one cache key
        // per distinct list. Mirrors the propertyTypes/sellerTypes caps (#1956 PR1 AC1.15 #5).
        if (raw.size() > DiscoverFilterNormalizer.MAX_COMMERCIAL_SUBTYPE_VALUES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "commercial_subtypes_exceeds_max_values");
        }
        for (String value : raw) {
            if (value == null || value.isBlank()
                    || DiscoverFilterNormalizer.ALLOWED_COMMERCIAL_SUBTYPES.stream()
                            .noneMatch(allowed -> allowed.equalsIgnoreCase(value.trim()))) {
                // The rejected value is NOT echoed into the reason phrase: it is unvalidated
                // client input on a public endpoint, and the allowed set alone tells the caller
                // everything needed to fix the request.
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "commercial_subtypes_invalid_value");
            }
        }
        return raw;
    }
}
