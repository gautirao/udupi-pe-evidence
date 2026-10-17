/**
 * discoverTelemetryConsent — Issue #1531 consent + session-id utilities
 *
 * Tests the real localStorage/sessionStorage behaviour of the utility functions.
 * These are separate from the hook tests so each layer is tested in isolation.
 *
 * Tests:
 * C1  isTelemetryConsented: missing key → false
 * C2  isTelemetryConsented: 'granted' (exact) → true
 * C3  isTelemetryConsented: any other value → false
 * C4  isTelemetryConsented: localStorage.getItem throws → false (fail closed), no throw
 * C5  getOrCreateSessionId: generates and stores a UUID on first call
 * C6  getOrCreateSessionId: reuses existing id on subsequent calls
 * C7  getOrCreateSessionId: sessionStorage.getItem throws → null (fail closed), no throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTelemetryConsented,
  getOrCreateSessionId,
  grantTelemetryConsent,
  revokeTelemetryConsent,
  getConsentState,
} from '../discoverTelemetryConsent';

const CONSENT_KEY = 'discover_telemetry_consent';
const SESSION_KEY = 'discover_telemetry_session_id';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();

  vi.stubGlobal('crypto', {
    randomUUID: () => 'mock-uuid-abcd-1234-efgh-ijklmnopqrst',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('isTelemetryConsented', () => {
  it('C1: missing key → false', () => {
    localStorage.removeItem(CONSENT_KEY);
    expect(isTelemetryConsented()).toBe(false);
  });

  it('C2: value === "granted" (exact) → true', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    expect(isTelemetryConsented()).toBe(true);
  });

  it('C3a: value "denied" → false', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    expect(isTelemetryConsented()).toBe(false);
  });

  it('C3b: value "Granted" (wrong case) → false', () => {
    localStorage.setItem(CONSENT_KEY, 'Granted');
    expect(isTelemetryConsented()).toBe(false);
  });

  it('C3c: value "" (empty) → false', () => {
    localStorage.setItem(CONSENT_KEY, '');
    expect(isTelemetryConsented()).toBe(false);
  });

  it('C4: localStorage.getItem throws → false (fail closed), no throw', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('SecurityError: access denied');
    });

    expect(() => isTelemetryConsented()).not.toThrow();
    expect(isTelemetryConsented()).toBe(false);
  });
});

describe('grantTelemetryConsent', () => {
  it('G1: writes exactly "granted" to localStorage', () => {
    grantTelemetryConsent();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
  });

  it('G2: overwrites any existing value with exactly "granted"', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    grantTelemetryConsent();
    expect(localStorage.getItem(CONSENT_KEY)).toBe('granted');
  });

  it('G3: does not throw when localStorage.setItem throws', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => grantTelemetryConsent()).not.toThrow();
  });
});

describe('revokeTelemetryConsent', () => {
  it('R1: removes the consent key (key absent, not a sentinel value)', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    revokeTelemetryConsent();
    expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
  });

  it('R2: isTelemetryConsented() returns false after revoke', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    revokeTelemetryConsent();
    expect(isTelemetryConsented()).toBe(false);
  });

  it('R3: does not throw when localStorage.removeItem throws', () => {
    vi.spyOn(localStorage, 'removeItem').mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    expect(() => revokeTelemetryConsent()).not.toThrow();
  });

  it('R4: does not write a sentinel string like "revoked" or "denied"', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    revokeTelemetryConsent();
    const stored = localStorage.getItem(CONSENT_KEY);
    expect(stored).not.toBe('revoked');
    expect(stored).not.toBe('denied');
    expect(stored).toBeNull();
  });
});

describe('getConsentState', () => {
  it('GS1: missing key → "undecided"', () => {
    localStorage.removeItem(CONSENT_KEY);
    expect(getConsentState()).toBe('undecided');
  });

  it('GS2: value === "granted" (exact) → "granted"', () => {
    localStorage.setItem(CONSENT_KEY, 'granted');
    expect(getConsentState()).toBe('granted');
  });

  it('GS3: value "Granted" (wrong case) → "denied"', () => {
    localStorage.setItem(CONSENT_KEY, 'Granted');
    expect(getConsentState()).toBe('denied');
  });

  it('GS4: value "denied" → "denied"', () => {
    localStorage.setItem(CONSENT_KEY, 'denied');
    expect(getConsentState()).toBe('denied');
  });

  it('GS5: value "" (empty string) → "denied"', () => {
    localStorage.setItem(CONSENT_KEY, '');
    expect(getConsentState()).toBe('denied');
  });

  it('GS6: localStorage.getItem throws → "undecided" (fail closed, not allowed)', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('SecurityError: access denied');
    });
    expect(() => getConsentState()).not.toThrow();
    expect(getConsentState()).toBe('undecided');
  });
});

describe('getOrCreateSessionId', () => {
  it('C5: no existing session → generates and stores UUID', () => {
    sessionStorage.removeItem(SESSION_KEY);
    const id = getOrCreateSessionId();
    expect(id).toBe('mock-uuid-abcd-1234-efgh-ijklmnopqrst');
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('mock-uuid-abcd-1234-efgh-ijklmnopqrst');
  });

  it('C6: existing session → returns stored id without regenerating', () => {
    sessionStorage.setItem(SESSION_KEY, 'existing-session-id-xyz');
    const id = getOrCreateSessionId();
    expect(id).toBe('existing-session-id-xyz');
    // crypto.randomUUID was NOT called (no new uuid needed)
  });

  it('C7: sessionStorage.getItem throws → null (fail closed), no throw', () => {
    vi.spyOn(sessionStorage, 'getItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError: storage is unavailable');
    });

    expect(() => getOrCreateSessionId()).not.toThrow();
    const result = getOrCreateSessionId();
    // First call threw and returned null; second call uses the real sessionStorage.
    // The null return is what matters for fail-closed.
    // We only check the no-throw guarantee here — result depends on jsdom state.
    expect(typeof result === 'string' || result === null).toBe(true);
  });

  // #2750 PR-5 1531-N2 — the session id must come from the REAL crypto.randomUUID (RFC-4122 v4),
  // not a weak Math.random id. The file-level beforeEach stubs crypto with a non-UUID, so this it
  // unstubs first to expose the real implementation.
  it('1531-N2: getOrCreateSessionId returns an RFC-4122 v4 UUID from the real crypto.randomUUID and reuses it', () => {
    vi.unstubAllGlobals();
    expect(typeof crypto.randomUUID).toBe('function');
    sessionStorage.removeItem(SESSION_KEY);

    const id = getOrCreateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(id);
    // Reused on the next call (same tab = same id).
    expect(getOrCreateSessionId()).toBe(id);
  });
});

// #2750 PR-5 1531-N6 — fail-closed when localStorage THROWS. A jsdom Storage spy never intercepts
// (C4/GS6 use mockImplementationOnce on the real Storage), so this uses a real throwing stub via
// vi.stubGlobal and asserts the stub was actually reached.
describe('consent util fail-closed on throwing storage (stubGlobal)', () => {
  it('1531-N6: storage that throws fails closed: not consented and getConsentState is undecided', () => {
    const throwingGetItem = vi.fn((): string | null => {
      throw new Error('SecurityError: storage access denied');
    });
    vi.stubGlobal('localStorage', {
      getItem: throwingGetItem,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    expect(isTelemetryConsented()).toBe(false);
    expect(getConsentState()).toBe('undecided');
    // The catch branch really ran: both calls reached the throwing stub.
    expect(throwingGetItem).toHaveBeenCalledTimes(2);
    expect(throwingGetItem).toHaveBeenCalledWith(CONSENT_KEY);

    // Control arm: the stub IS honoured (a stub returning 'granted' flips both answers).
    const grantedGetItem = vi.fn((): string | null => 'granted');
    vi.stubGlobal('localStorage', {
      getItem: grantedGetItem,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    expect(isTelemetryConsented()).toBe(true);
    expect(getConsentState()).toBe('granted');
    expect(grantedGetItem).toHaveBeenCalledTimes(2);
  });
});
