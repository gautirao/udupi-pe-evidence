package com.example.realestate.geo;

/**
 * Shared coordinate-coarsening utility for public/buyer-facing listing surfaces (#1726).
 *
 * <p>Extracted from the previously-duplicated {@code coarsen()} helpers in
 * {@code ListingResponseMapper} and {@code DiscoverAgriMapListingsService} (#1454) — the
 * algorithm MUST remain identical to what those two call sites already shipped, since parity
 * across anonymous-facing surfaces is itself a security requirement (a caller must not be able
 * to distinguish surfaces by precision).
 */
public final class GeoCoarsener {

    /**
     * Number of decimal places to which a public-facing coordinate is truncated.
     * 2 dp ≈ 1.1 km granularity — markers still render approximately, but the exact
     * pin never leaves the server for anonymous/non-owner callers.
     */
    public static final int PUBLIC_COORD_DECIMALS = 2;

    private GeoCoarsener() {
        // static utility only
    }

    /**
     * Coarsens a coordinate to {@value #PUBLIC_COORD_DECIMALS} decimal places by truncating
     * toward zero (sign-correct: magnitude is truncated, sign preserved). Null-guarded so a
     * null coordinate stays null — never coerced to 0.0 (would place a marker at (0,0)).
     */
    public static Double coarsen(Double coord) {
        if (coord == null) {
            return null;
        }
        double factor = Math.pow(10, PUBLIC_COORD_DECIMALS);
        // Truncate toward zero so the sign is preserved symmetrically for +/- values.
        return (coord < 0 ? Math.ceil(coord * factor) : Math.floor(coord * factor)) / factor;
    }
}
