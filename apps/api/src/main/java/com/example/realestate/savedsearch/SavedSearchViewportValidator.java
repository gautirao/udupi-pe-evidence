package com.example.realestate.savedsearch;

import com.example.realestate.discover.BboxParser;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Validates a saved search's VIEWPORT scope bounds. Operates on four already-discrete
 * {@code Double} fields (the saved-search request body carries them as separate JSON
 * fields, not a single comma-separated query string), so the "all 4 present" precondition
 * is checked locally, then the actual bound-checking algorithm is delegated to the shared
 * {@code com.example.realestate.discover.BboxParser} (#2019 Slice A review ruling —
 * narrowest-widening reuse rather than a duplicated copy of the range/ordering rules).
 *
 * <p>{@code BboxParser}'s {@code bbox_*} reason codes are remapped to this API's
 * documented {@code saved_search_viewport_*}-prefixed vocabulary so the two error
 * domains never collide in the saved-search response contract.
 */
final class SavedSearchViewportValidator {

    private SavedSearchViewportValidator() {
    }

    static void validate(Double south, Double west, Double north, Double east) {
        if (south == null || west == null || north == null || east == null) {
            throw reject("saved_search_viewport_must_have_4_values");
        }
        try {
            BboxParser.parse(south + "," + west + "," + north + "," + east);
        } catch (ResponseStatusException e) {
            String bboxReason = e.getReason();
            String remapped = bboxReason == null
                    ? "saved_search_viewport_invalid"
                    : "saved_search_viewport_" + bboxReason.replaceFirst("^bbox_", "");
            throw reject(remapped);
        }
    }

    private static ResponseStatusException reject(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}
