package com.example.realestate.intelligence;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Canonical slug derivation for area labels.
 *
 * <p>The algorithm MUST match the frontend mirror (String.normalize('NFKD') + Unicode regex
 * + the same replacement steps) so that URL slugs round-trip correctly between the client
 * and the resolver endpoint.
 *
 * <p>Algorithm (applied in order):
 * <ol>
 *   <li>NFKD normalisation via {@link Normalizer} (decomposes ligatures, compatibility chars)</li>
 *   <li>Strip combining marks (Unicode category M)</li>
 *   <li>Lowercase with {@link Locale#ROOT} (locale-independent)</li>
 *   <li>Replace each run of non-[a-z0-9] with a single hyphen</li>
 *   <li>Trim leading/trailing hyphens; collapse any remaining repeated hyphens</li>
 * </ol>
 *
 * <p>Result is always lowercase ASCII letters, digits, and single hyphens, with no leading
 * or trailing hyphen. The empty string is a valid result for a label that contains only
 * non-alphanumeric characters.
 */
public final class AreaSlug {

    private AreaSlug() {
        // utility class
    }

    /**
     * Derive the canonical URL slug for an area label.
     *
     * @param label the area label (e.g. "Malpe Beach Road", "Udupi Town"); must not be null
     * @return the canonical slug (e.g. "malpe-beach-road", "udupi-town")
     * @throws NullPointerException if {@code label} is null
     */
    public static String slugify(String label) {
        // Step 1: NFKD normalisation — decomposes ligatures and compatibility chars
        String normalised = Normalizer.normalize(label, Normalizer.Form.NFKD);

        // Step 2: strip combining marks (Unicode category M: Mn, Mc, Me)
        String stripped = normalised.replaceAll("\\p{M}+", "");

        // Step 3: lowercase — locale-independent
        String lower = stripped.toLowerCase(Locale.ROOT);

        // Step 4: replace each run of non-[a-z0-9] with a single hyphen
        String hyphenated = lower.replaceAll("[^a-z0-9]+", "-");

        // Step 5: trim leading/trailing hyphens and collapse repeated hyphens
        //         (replaceAll in step 4 already collapses runs, but trim the edges)
        return hyphenated.replaceAll("^-+|-+$", "");
    }

    /**
     * Derive the canonical slug from an area key when the area label is absent.
     *
     * <p>Takes the last pipe-delimited segment of the area key. For example,
     * {@code "IN|KA|Udupi|Malpe"} yields {@code "malpe"}.
     *
     * @param areaKey pipe-delimited area key (e.g. "IN|KA|Udupi|Malpe"); must not be null
     * @return the canonical slug of the last segment
     */
    public static String slugifyFromAreaKey(String areaKey) {
        String[] parts = areaKey.split("\\|", -1);
        String lastSegment = parts[parts.length - 1];
        return slugify(lastSegment);
    }
}
