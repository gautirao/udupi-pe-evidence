package com.example.realestate.savedsearch;

import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Enforces the exact set of filter keys a saved search may persist. Mirrors the
 * vocabulary defined by {@code com.example.realestate.discover.DiscoverFilterNormalizer}
 * (#1956 PR1 AC1.16), which is the single canonical source of truth for Discover's
 * filter vocabulary — but deliberately re-implemented as an allowlist-and-reject
 * validator here rather than reused directly, because the normalizer's job is
 * normalizing values for querying, not rejecting unknown keys outright.
 *
 * <p>Any key outside this allowlist is rejected with 400
 * {@code saved_search_unsupported_filter} — never silently dropped or broadened. This
 * explicitly excludes free-text {@code q}: saved searches never persist arbitrary query
 * text, so a {@code q} key is rejected the same as any other unsupported key.
 *
 * <p>Public only so the Slice B matcher seam ({@code SavedSearchFiltersMapper}) can apply the
 * SAME allowlist to already-stored rows via {@link #unsupportedKeys(Map)}: a row persisted while
 * a key was still accepted must never be matched as if that key were absent (silent broadening).
 */
public final class SavedSearchFilterAllowlist {

    /**
     * Package-private (not {@code private}) so {@code SavedSearchFilterAllowlistParityTest}
     * can bind this set to Discover's two authoritative sources (#2019 Slice A review
     * ruling 2): every key must be a {@code DiscoverListingPredicateBuilder.Filters} record
     * component, the union of this set and the explicit non-alertable set must be exactly
     * those components, and {@code DiscoverFilterNormalizer.VOCABULARY_FILTER_KEYS} (the
     * fields whose values the normaliser canonicalises) must be a subset of this set. A new
     * Discover field or a newly-normalised field therefore fails a test instead of silently
     * becoming (or failing to become) alertable.
     */
    static final Set<String> SUPPORTED_KEYS =
            Set.of(
                    "listingPurpose",
                    "propertyTypes",
                    "bedrooms",
                    "sellerTypes",
                    "commercialSubtypes",
                    "priceMinPaise",
                    "priceMaxPaise",
                    "backOnMarket",
                    "newToMarket",
                    "reraRegistered",
                    "readyToMove");
    // NOTE (#2019 Slice B ruling): "excludePropertyTypes" is deliberately NOT alertable. It has
    // no representation in the #2016 restore-link URL contract (filters.ts), so a saved search
    // carrying it could not be restored exactly from an alert link. It is rejected at save time
    // with the same machine-readable saved_search_unsupported_filter:excludePropertyTypes reason
    // as any other unsupported key — never silently dropped.

    private SavedSearchFilterAllowlist() {
    }

    /**
     * Validates that every key in {@code rawFilters} is supported and returns a
     * canonical (key-sorted, defensively-copied) filter map. Never mutates or returns
     * the input map.
     */
    static Map<String, Object> validate(Map<String, Object> rawFilters) {
        if (rawFilters == null || rawFilters.isEmpty()) {
            return Map.of();
        }
        Set<String> unsupported = unsupportedKeys(rawFilters);
        if (!unsupported.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "saved_search_unsupported_filter:" + unsupported.iterator().next());
        }
        return new TreeMap<>(rawFilters);
    }

    /**
     * The keys of {@code filters} that are NOT in {@link #SUPPORTED_KEYS}, in sorted order
     * (empty when every key is alertable or the map is null/empty). Applied at save time by
     * {@link #validate(Map)} and again at match time to stored rows.
     */
    public static Set<String> unsupportedKeys(Map<String, Object> filters) {
        if (filters == null || filters.isEmpty()) {
            return Set.of();
        }
        Set<String> unsupported = new TreeSet<>();
        for (String key : filters.keySet()) {
            if (!SUPPORTED_KEYS.contains(key)) {
                unsupported.add(key);
            }
        }
        return unsupported;
    }
}
