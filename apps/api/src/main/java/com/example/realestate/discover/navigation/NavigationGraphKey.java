package com.example.realestate.discover.navigation;

/**
 * Cache key for {@link NavigationGraphCache}'s Caffeine caches: a city's slug plus the specific
 * revision id the cached {@link NavigationGraph} was built from (#1955 Areas PR A, SLICE 2d).
 * Production and preview namespaces never share a key (see {@link NavigationGraphCache}'s
 * preview-isolation javadoc) — a preview key's {@code citySlug} is prefixed distinctly by the
 * caller, never colliding with a real city slug.
 */
public record NavigationGraphKey(String citySlug, long revisionId) {

    @Override
    public String toString() {
        return citySlug + ":" + revisionId;
    }
}
