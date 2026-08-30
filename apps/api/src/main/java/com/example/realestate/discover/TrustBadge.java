package com.example.realestate.discover;

/**
 * Pure deterministic public-safe projection of the internal trust tier letter grade
 * ({@code property_listings.trust_tier}, one of {@code A/B/C/D}) to a public badge word.
 *
 * <p>This is the ONLY place in the codebase where a letter tier maps to a public word.
 * Callers must never invent a badge outside this allow-list, and must never let the raw
 * letter grade (or internal scoring) reach a public API response.
 *
 * <p>Mapping (allow-list; anything not explicitly listed yields {@code null}):
 * <pre>
 *   "A" → "verified"
 *   "B" → "trusted"
 *   "C" → "listed"
 *   "D" → null   (lowest tier — no badge shown)
 *   null, unknown, or any other value → null (never fabricated)
 * </pre>
 *
 * <p>The public badge is identical for anonymous and authenticated callers — unlike price,
 * there is no auth-branching here.
 */
public final class TrustBadge {

    static final String TIER_A = "A";
    static final String TIER_B = "B";
    static final String TIER_C = "C";

    static final String BADGE_VERIFIED = "verified";
    static final String BADGE_TRUSTED = "trusted";
    static final String BADGE_LISTED = "listed";

    private TrustBadge() {}

    /**
     * Returns the public-safe badge word for {@code rawTier}, or {@code null} when the tier
     * is {@code D}, absent, or not a recognized letter grade.
     *
     * <p>Pure function: same input always produces same output, no side effects, no I/O.
     *
     * @param rawTier internal trust tier letter grade (A/B/C/D), or {@code null}
     * @return public badge word ({@code "verified"}/{@code "trusted"}/{@code "listed"}), or
     *         {@code null} if no badge should be shown
     */
    public static String publicBadge(String rawTier) {
        if (rawTier == null) {
            return null;
        }
        return switch (rawTier) {
            case TIER_A -> BADGE_VERIFIED;
            case TIER_B -> BADGE_TRUSTED;
            case TIER_C -> BADGE_LISTED;
            default -> null; // D, lowercase, unknown letters, or any other value — never fabricated
        };
    }
}
