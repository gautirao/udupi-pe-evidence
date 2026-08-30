package com.example.realestate.discover;

/**
 * Pure validator + normaliser for the {@code area_key} 4-segment pipe format
 * ({@code "IN|KA|<District>|<AreaName>"}) used throughout {@code areas} (#1887 PR1).
 *
 * <p>This is deliberately NOT a key generator — it never invents a new area_key for a candidate
 * that lacks one; it only validates the shape of a supplied key and normalises its district
 * segment for reliable comparison against existing canonical keys.
 *
 * <p>{@link #normaliseDistrictToken} ports, verbatim, the district-normalisation {@code CASE}
 * rules already used by V79 ({@code schools} backfill) and V80 ({@code assign_school_area_key}
 * trigger): {@code bengaluru urban|bangalore urban|bangalore -> bengaluru} and
 * {@code dakshina kannada|mangaluru -> mangalore}, case-insensitively, trimmed. Any other
 * district passes through lower-cased and trimmed.
 */
final class AreaKeyFormat {

    private static final int REQUIRED_SEGMENTS = 4;
    private static final int DISTRICT_SEGMENT_INDEX = 2;

    private AreaKeyFormat() {
    }

    /**
     * True iff {@code areaKey} splits into exactly {@value #REQUIRED_SEGMENTS} pipe-delimited
     * segments, none of which is blank after trimming. Mirrors the SQL guard
     * {@code array_length(string_to_array(area_key, '|'), 1) = 4} used elsewhere (e.g.
     * CityRegionOnboardingService's CLASSIFICATIONS_SQL eligibility filter).
     */
    static boolean isValidFourSegment(String areaKey) {
        if (areaKey == null) {
            return false;
        }
        // -1 limit keeps trailing empty segments (e.g. a trailing "|") so they correctly fail
        // the non-blank check below, instead of being silently dropped by String.split.
        String[] segments = areaKey.split("\\|", -1);
        if (segments.length != REQUIRED_SEGMENTS) {
            return false;
        }
        for (String segment : segments) {
            if (segment == null || segment.trim().isEmpty()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Normalises a valid 4-segment area_key for comparison: trims every segment and
     * district-normalises + title-cases segment 2 (e.g. {@code "IN|KA|Bangalore Urban|Whitefield"}
     * -&gt; {@code "IN|KA|Bengaluru|Whitefield"}). Callers MUST check {@link #isValidFourSegment}
     * first — this method throws {@link IllegalArgumentException} on a malformed key rather than
     * guessing a shape for it.
     */
    static String normalise(String areaKey) {
        if (!isValidFourSegment(areaKey)) {
            throw new IllegalArgumentException("area_key is not a valid 4-segment key: " + areaKey);
        }
        String[] segments = areaKey.split("\\|", -1);
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) {
                result.append('|');
            }
            String trimmed = segments[i].trim();
            result.append(i == DISTRICT_SEGMENT_INDEX ? titleCase(normaliseDistrictToken(trimmed)) : trimmed);
        }
        return result.toString();
    }

    /**
     * Ports V79/V80's district CASE rules verbatim. Returns a lower-cased, comparison-ready
     * token — NOT title-cased (see {@link #titleCase} for the display form used by
     * {@link #normalise}).
     */
    static String normaliseDistrictToken(String rawDistrict) {
        if (rawDistrict == null) {
            return null;
        }
        String normalised = rawDistrict.trim().toLowerCase();
        return switch (normalised) {
            case "bengaluru urban", "bangalore urban", "bangalore" -> "bengaluru";
            case "dakshina kannada", "mangaluru" -> "mangalore";
            default -> normalised;
        };
    }

    private static String titleCase(String token) {
        if (token == null || token.isEmpty()) {
            return token;
        }
        return Character.toUpperCase(token.charAt(0)) + token.substring(1);
    }
}
