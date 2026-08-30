package com.example.realestate.discover;

/**
 * Outcome of {@link AreaResolutionService#resolve}: whether a listing's geocoded area could be
 * matched to a canonical {@code areas} row at ingestion time, and by which method (#1887 PR3).
 *
 * @param status            RESOLVED or UNRESOLVED — never any other value.
 * @param method            which step produced the match; null iff {@code status == UNRESOLVED}.
 * @param canonicalAreaKey  the matched canonical {@code areas.area_key}; null iff
 *                          {@code status == UNRESOLVED}.
 */
public record AreaResolution(Status status, Method method, String canonicalAreaKey) {

    public enum Status {
        RESOLVED,
        UNRESOLVED
    }

    public enum Method {
        PROVIDER_ID,
        CANONICAL_KEY,
        ALIAS
    }

    public static AreaResolution resolved(Method method, String canonicalAreaKey) {
        return new AreaResolution(Status.RESOLVED, method, canonicalAreaKey);
    }

    public static AreaResolution unresolved() {
        return new AreaResolution(Status.UNRESOLVED, null, null);
    }

    public boolean isResolved() {
        return status == Status.RESOLVED;
    }
}
