package com.example.realestate.poi;

import java.util.Optional;

/** Thin seam around HTTP POST to an Overpass endpoint — injectable for testing. */
@FunctionalInterface
interface OverpassHttpClient {
    Optional<String> post(String url, String queryBody);
}
