/**
 * areaSlug.ts — Frontend mirror of the Java AreaSlug utility.
 *
 * Algorithm is SHARED with the backend (AreaSlug.java). Any change to these
 * steps must be reflected in the backend and the shared test vectors (SV-01…SV-10).
 */

/**
 * Convert a human-readable area label into a URL slug.
 *
 * Steps (must match Java AreaSlug.slugify exactly):
 *  1. NFKD normalisation — decomposes ligatures (ﬁ→fi) and separates
 *     combining diacritical marks from their base characters.
 *  2. Strip Unicode Mark characters (\p{M}) — removes combining accents/diacritics.
 *  3. Lowercase — uses the default JS locale which matches Java Locale.ROOT for A-Z.
 *  4. Replace runs of non-alphanumeric characters with a single hyphen.
 *  5. Trim leading/trailing hyphens.
 */
export function slugify(label: string): string {
  return label
    .normalize('NFKD')
    // \p{M} matches Unicode Mark characters (combining accents etc.)
    // The `u` flag is REQUIRED for \p{} Unicode property escapes.
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a slug from a full pipe-delimited area key when the area label is
 * unavailable. Takes the last pipe-separated segment and slugifies it.
 *
 * Example: "IN|KA|Udupi|Malpe" → "malpe"
 * Example: "IN|KA|Udupi|Udupi Town" → "udupi-town"
 */
export function slugifyFromAreaKey(areaKey: string): string {
  const segments = areaKey.split('|');
  const lastSegment = segments[segments.length - 1] ?? '';
  return slugify(lastSegment);
}
