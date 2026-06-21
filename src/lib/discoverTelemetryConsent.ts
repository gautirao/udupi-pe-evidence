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
 * IMPORTANT: No user-facing consent UI is provided here. A real user-visible consent
 * mechanism (banner / toggle) is a SEPARATE dependency tracked in issue #1576 and is
 * NOT implemented in this file. Do NOT assume a user-facing consent mechanism exists
 * until #1576 ships.
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
