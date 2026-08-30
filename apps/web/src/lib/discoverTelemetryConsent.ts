/**
 * discoverTelemetryConsent — PII-free anonymous discover-event telemetry consent utilities.
 *
 * CONSENT CONTRACT (DEFAULT-DENY):
 *   Telemetry is emitted ONLY when localStorage key 'discover_telemetry_consent' === 'granted'
 *   (exact string, case-sensitive).
 *   - Missing key        → denied → emit nothing.
 *   - Any other value    → denied → emit nothing.
 *   - localStorage throws (private mode / quota / unavailable) → FAIL CLOSED → emit nothing.
 *
 * The consent check MUST happen BEFORE any network request is built or sent.
 *
 * A user-facing consent banner and toggle are provided by DiscoverConsentBanner and
 * DiscoverPrivacyToggle (added in #1576); they call the grant/revoke/getConsentState
 * helpers below. No user-facing UI logic lives in this file — it contains only the
 * storage primitives that those components rely on.
 *
 * SESSION ID CONTRACT:
 *   A client-generated UUID stored in sessionStorage (cleared on tab close).
 *   Generated once per tab; reused across all events in that tab.
 *   If sessionStorage is unavailable or throws, returns null (fail closed — emit nothing).
 */

const CONSENT_KEY = 'discover_telemetry_consent';
const SESSION_KEY = 'discover_telemetry_session_id';
const GRANTED = 'granted';

/**
 * Returns true iff localStorage contains exactly 'granted' for the consent key.
 * Fails closed (returns false) on any exception.
 */
export function isTelemetryConsented(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === GRANTED;
  } catch {
    // Private browsing, quota exceeded, or other storage errors → fail closed.
    return false;
  }
}

/**
 * Grants telemetry consent by writing the GRANTED sentinel to localStorage.
 * Fails silently on any exception (never throws to the UI).
 */
export function grantTelemetryConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, GRANTED);
  } catch {
    // Private browsing, quota exceeded, or other storage errors → fail silently.
  }
}

/**
 * Revokes telemetry consent by removing the consent key from localStorage.
 * MUST call removeItem (not write a sentinel like 'revoked') so the key is
 * absent rather than present-with-bad-value.
 * Fails silently on any exception (never throws to the UI).
 */
export function revokeTelemetryConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Private browsing, quota exceeded, or other storage errors → fail silently.
  }
}

/**
 * Returns a three-way consent state:
 *   'granted'   — localStorage value is exactly GRANTED (telemetry may emit)
 *   'undecided' — key is absent (null) OR localStorage throws (fail closed)
 *   'denied'    — key is present but value is not GRANTED
 *
 * Callers MUST treat anything other than 'granted' as no-emit.
 */
export function getConsentState(): 'granted' | 'denied' | 'undecided' {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    if (value === null) return 'undecided';
    if (value === GRANTED) return 'granted';
    return 'denied';
  } catch {
    // Storage unavailable → fail closed — treat as no-emit (same as undecided)
    return 'undecided';
  }
}

/**
 * Returns the per-tab session UUID from sessionStorage, generating one on first call.
 * Returns null if sessionStorage is unavailable or throws (fail closed — caller must
 * skip emission when null is returned).
 */
export function getOrCreateSessionId(): string | null {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    // crypto.randomUUID() is available in all modern browsers (Chrome 92+, Firefox 95+,
    // Safari 15.4+). Vite targets modern browsers so no polyfill is needed.
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // sessionStorage unavailable (e.g. private mode, security restrictions) → fail closed.
    return null;
  }
}
