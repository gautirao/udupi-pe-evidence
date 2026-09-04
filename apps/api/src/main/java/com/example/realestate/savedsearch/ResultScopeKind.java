package com.example.realestate.savedsearch;

/**
 * Discriminator for a saved search's geographic result scope. Mirrors the mutually
 * exclusive AREA_SET / POLYGON / VIEWPORT scopes established for Discover by #2016 —
 * see {@code com.example.realestate.discover.ResultScopeExclusivity}. {@code bbox} is
 * deliberately not represented here: it is Discover's always-on render/perf prefilter,
 * not a persisted saved-search scope.
 */
public enum ResultScopeKind {
    AREA_SET,
    POLYGON,
    VIEWPORT
}
