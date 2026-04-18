/**
 * Builds the raw area key matching the backend contract in AreaOverviewController.
 * Format: IN|KA|{district}|{locality}
 *
 * IN  = country code (India — only supported value for this project)
 * KA  = state code (Karnataka — only supported value for this project)
 *
 * IMPORTANT: This returns the RAW (unencoded) string.
 * Callers MUST wrap with encodeURIComponent() before inserting into a URL.
 * Example:
 *   `/trends?areaKey=${encodeURIComponent(buildAreaKey(district, locality))}`
 *
 * Note: district and locality must not contain the pipe character (|).
 * Values from reverse-geocoding (Nominatim) are safe — they do not produce pipes.
 *
 * Note: Do NOT use this helper to decode or relay an `areaKey` field that
 * already arrives from the API response (e.g. area.areaKey, listing.areaKey).
 * Those values are pre-formed by the backend and should be used directly.
 * This helper is only for constructing an areaKey from separate
 * {district, locality} fields (e.g. from geocoding or address picker output).
 */
export function buildAreaKey(district: string | null | undefined, locality: string | null | undefined): string {
  const d = (district ?? '').trim();
  const l = (locality ?? '').trim();

  if (!d || !l) {
    return '';
  }

  return `IN|KA|${d}|${l}`;
}
