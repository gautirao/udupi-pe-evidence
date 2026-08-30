package com.example.realestate.discover.navigation;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Deterministic {@code node_key} derivation (#1955 D5). Pure string helpers only — derived purely
 * from geography+policy outputs, never from a surrogate id, listing data, or iteration order.
 */
public final class NavigationKeys {

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    private NavigationKeys() {
    }

    /** Lower-cases, collapses runs of non [a-z0-9] characters to a single '-', trims edge dashes. */
    public static String slug(String value) {
        if (value == null) {
            return "";
        }
        String lower = value.toLowerCase(Locale.ROOT);
        String replaced = NON_ALNUM.matcher(lower).replaceAll("-");
        int start = 0;
        int end = replaced.length();
        while (start < end && replaced.charAt(start) == '-') {
            start++;
        }
        while (end > start && replaced.charAt(end - 1) == '-') {
            end--;
        }
        return replaced.substring(start, end);
    }

    /** D5: AREA node_key = "a:" + area_key. */
    public static String areaNodeKey(String areaKey) {
        return "a:" + areaKey;
    }

    /**
     * #1956 D1: DIRECTION node_key = "d:" + slug(region_key). A pure function of geography (the
     * region_key alone) — no surrogate id, no listing data, no iteration order — mirroring the
     * same determinism contract as {@link #areaNodeKey} and {@link #clusterNodeKeyBase}. Region
     * keys are unique per city, so unlike cluster keys this never needs collision disambiguation.
     */
    public static String directionNodeKey(String regionKey) {
        return "d:" + slug(regionKey);
    }

    /**
     * D5 base recipe (pre-collision-disambiguation):
     * {@code c:} + slug(region_key) + {@code :} + slug(sorted(representative_area_keys).join("-")).
     * Callers are responsible for passing an already-sorted representative list and for
     * disambiguating a collision by extending it (see {@link NavigationTreeGenerator}).
     */
    public static String clusterNodeKeyBase(String regionKey, List<String> sortedRepresentativeAreaKeys) {
        String joined = String.join("-", sortedRepresentativeAreaKeys);
        return "c:" + slug(regionKey) + ":" + slug(joined);
    }
}
