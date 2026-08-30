// Issue #1838 (slice-1-value-mappers) — extracted verbatim from EditListing.tsx.
// Pure value-mapping helpers used by the EditListing wizard. No React/hooks,
// no broker-specific imports — keep this module dependency-free to avoid
// import cycles with EditListing.tsx.

const VIDEO_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|instagram\.com\/(reel|p)\/)[^\s]+/;

export { VIDEO_URL_REGEX };

export function extractYouTubeId(url: string): string | null {
  const shortMatch = url.match(/youtu\.be\/([^?&\s]+)/);
  if (shortMatch) return shortMatch[1];
  const longMatch = url.match(/[?&]v=([^&\s]+)/);
  return longMatch ? longMatch[1] : null;
}

export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(reel|p)\//.test(url);
}

/**
 * M38-13A (#1626) — tri-state boolean → Select string, matching the existing
 * farmhouseAvailable/fencingDone convention. `null`/`undefined` (unknown) map to
 * '' (neutral/unset) — distinct from an explicit `false`, which maps to 'false'.
 * Never defaults an unknown value to "No".
 */
export function boolToTriState(value: boolean | null | undefined): string {
  return value === true ? 'true' : value === false ? 'false' : '';
}

/** Inverse of boolToTriState for building the update payload. '' → undefined (omit; no change). */
export function triStateToBool(value: string): boolean | undefined {
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

/**
 * Issue #1838 — pure extraction of the inline validation check from
 * handleVideoUrlChange. Returns null when the input is empty or matches
 * VIDEO_URL_REGEX, otherwise the same error string the inline check produced.
 */
export function validateVideoUrl(url: string): string | null {
  if (url && !VIDEO_URL_REGEX.test(url)) {
    return 'Please enter a YouTube or Instagram Reel URL';
  }
  return null;
}
