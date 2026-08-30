/**
 * Escapes a value for safe insertion into HTML strings.
 * Handles string, number, null, and undefined inputs.
 * Returns an empty string for null/undefined.
 *
 * Addresses SEC-3: Stored XSS vulnerability — centralised utility so all
 * HTML-string templates in the app share a single, tested escape path.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
