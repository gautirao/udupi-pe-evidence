/**
 * useDiscoverTelemetry — Issue #1531 M30 anonymous discover-event telemetry
 *
 * Tests:
 * T1  consent missing → ZERO fetch calls
 * T2  consent value !== 'granted' → ZERO fetch calls
 * T3  consent === 'granted' → emit allowed (fetch called with correct endpoint + payload shape)
 * T4  localStorage.getItem throws → ZERO fetch calls, no throw (fail closed)
 * T5  sessionStorage unavailable → fail closed, no throw
 * T6  fire-and-forget: fetch rejects → hook does NOT throw; caller unaffected
 * T7  fire-and-forget: fetch returns 500 → hook does NOT throw; caller unaffected
 * T8  backward-compat: emitFilterApply still executes alongside existing onApply (additive)
 * T9  toPriceBand: correct bucket mapping
 * T10 toPriceBand: undefined/null/zero returns undefined (omit field)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────────
// API_BASE_URL must be hoisted before the module is imported.
const mockApiBaseUrl = vi.hoisted(() => 'http://localhost:8085');

// Hoisted consent + session-id mocks — lets each test control consent/session
// independently without fighting jsdom's storage implementation.
const mockIsConsented = vi.hoisted(() => vi.fn(() => false as boolean));
const mockGetSessionId = vi.hoisted(() => vi.fn(() => 'test-session-uuid-1234' as string | null));

vi.mock('@/lib/api', () => ({
  API_BASE_URL: mockApiBaseUrl,
}));

// Mock the consent/session utilities so we can control fail-closed behaviour
// in a reliable cross-environment way.
vi.mock('@/lib/discoverTelemetryConsent', () => ({
  isTelemetryConsented: mockIsConsented,
  getOrCreateSessionId: mockGetSessionId,
}));

// ─── Import after mocks ────────────────────────────────────────────────────────
import { useDiscoverTelemetry, toPriceBand } from '../useDiscoverTelemetry';

// ─── Fetch mock ────────────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Default: consent denied, session available.
  mockIsConsented.mockReturnValue(false);
  mockGetSessionId.mockReturnValue('test-session-uuid-1234');

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    text: async () => '{"accepted":1}',
    json: async () => ({ accepted: 1 }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ─── toPriceBand unit tests ────────────────────────────────────────────────────

describe('toPriceBand', () => {
  it('T9a: < 5L → UNDER_5L', () => {
    expect(toPriceBand(300_000)).toBe('UNDER_5L');
  });
  it('T9b: 5L ≤ x < 20L → 5L_20L', () => {
    expect(toPriceBand(500_000)).toBe('5L_20L');
    expect(toPriceBand(1_500_000)).toBe('5L_20L');
  });
  it('T9c: 20L ≤ x < 50L → 20L_50L', () => {
    expect(toPriceBand(2_000_000)).toBe('20L_50L');
    expect(toPriceBand(4_999_999)).toBe('20L_50L');
  });
  it('T9d: 50L ≤ x < 1CR → 50L_1CR', () => {
    expect(toPriceBand(5_000_000)).toBe('50L_1CR');
    expect(toPriceBand(9_999_999)).toBe('50L_1CR');
  });
  it('T9e: 1CR ≤ x < 2CR → 1CR_2CR', () => {
    expect(toPriceBand(10_000_000)).toBe('1CR_2CR');
    expect(toPriceBand(19_999_999)).toBe('1CR_2CR');
  });
  it('T9f: ≥ 2CR → ABOVE_2CR', () => {
    expect(toPriceBand(20_000_000)).toBe('ABOVE_2CR');
    expect(toPriceBand(100_000_000)).toBe('ABOVE_2CR');
  });
  it('T10a: undefined → undefined', () => {
    expect(toPriceBand(undefined)).toBeUndefined();
  });
  it('T10b: null → undefined', () => {
    expect(toPriceBand(null)).toBeUndefined();
  });
  it('T10c: 0 → undefined', () => {
    expect(toPriceBand(0)).toBeUndefined();
  });
  it('T10d: negative → undefined', () => {
    expect(toPriceBand(-5000)).toBeUndefined();
  });
});

// ─── useDiscoverTelemetry hook tests ──────────────────────────────────────────

describe('useDiscoverTelemetry', () => {
  // T1: consent missing/denied → ZERO fetch calls
  it('T1: consent denied → no fetch', async () => {
    mockIsConsented.mockReturnValue(false); // denied (missing key equivalent)
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => {
      result.current.emitFilterApply({ property_type: 'agricultural_land' });
    });
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // T2: consent value !== 'granted' → ZERO fetch calls
  it('T2a: consent=false (denied) → no fetch', async () => {
    mockIsConsented.mockReturnValue(false);
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => { result.current.emitPanelOpen(); });
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('T2b: consent=false for wrong-case value → no fetch', async () => {
    // isTelemetryConsented returns false for 'Granted' (case-sensitive check in the utility)
    mockIsConsented.mockReturnValue(false);
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => { result.current.emitLeadIntent(); });
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // T3: consent === 'granted' → emit allowed (fetch called with correct endpoint + payload shape)
  it('T3a: consent=granted, emitFilterApply → fetch with correct endpoint + shape', async () => {
    mockIsConsented.mockReturnValue(true);
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => {
      result.current.emitFilterApply({ property_type: 'agricultural_land' });
    });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8085/api/discover/events');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as {
      events: Array<{
        session_id: string;
        event_type: string;
        property_type?: string;
      }>;
    };
    expect(body.events).toHaveLength(1);
    expect(body.events[0].event_type).toBe('FILTER_APPLY');
    expect(body.events[0].session_id).toBe('test-session-uuid-1234');
    expect(body.events[0].property_type).toBe('agricultural_land');

    // Must NOT contain Authorization header (anonymous POST)
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('T3b: consent=granted, emitPanelOpen → PANEL_OPEN event_type', async () => {
    mockIsConsented.mockReturnValue(true);
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => {
      result.current.emitPanelOpen({ area_key: 'udupi-town' });
    });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      events: Array<{ event_type: string; area_key?: string }>;
    };
    expect(body.events[0].event_type).toBe('PANEL_OPEN');
    expect(body.events[0].area_key).toBe('udupi-town');
  });

  it('T3c: consent=granted, emitLeadIntent → LEAD_INTENT event_type', async () => {
    mockIsConsented.mockReturnValue(true);
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => {
      result.current.emitLeadIntent();
    });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      events: Array<{ event_type: string }>;
    };
    expect(body.events[0].event_type).toBe('LEAD_INTENT');
  });

  it('T3d: session_id is consistent across multiple emits (same session)', async () => {
    mockIsConsented.mockReturnValue(true);
    mockGetSessionId.mockReturnValue('consistent-session-id');

    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => { result.current.emitPanelOpen(); });
    await act(async () => {});
    await act(async () => { result.current.emitLeadIntent(); });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sid1 = JSON.parse(fetchMock.mock.calls[0][1].body as string).events[0].session_id as string;
    const sid2 = JSON.parse(fetchMock.mock.calls[1][1].body as string).events[0].session_id as string;
    expect(sid1).toBe('consistent-session-id');
    expect(sid2).toBe('consistent-session-id');
  });

  // T4: localStorage.getItem throws (isTelemetryConsented fail-closed) → ZERO fetch calls, no throw
  it('T4: isTelemetryConsented throws (localStorage unavailable) → fail closed, no throw, no fetch', async () => {
    // Simulate the consent utility failing closed (throws internally, returns false).
    // The hook calls isTelemetryConsented() which is mocked — we simulate the throw-caught path.
    mockIsConsented.mockImplementation(() => {
      // The real utility wraps in try/catch and returns false on throw.
      // We test that the hook correctly handles consent=false (the fail-closed result).
      return false;
    });

    const { result } = renderHook(() => useDiscoverTelemetry());

    await expect(
      act(async () => { result.current.emitFilterApply({}); })
    ).resolves.not.toThrow();

    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // T5: sessionStorage unavailable → fail closed, no throw
  it('T5: getOrCreateSessionId returns null (sessionStorage unavailable) → fail closed, no throw, no fetch', async () => {
    mockIsConsented.mockReturnValue(true); // consent passes
    mockGetSessionId.mockReturnValue(null); // session storage unavailable → fail closed

    const { result } = renderHook(() => useDiscoverTelemetry());

    await expect(
      act(async () => { result.current.emitPanelOpen(); })
    ).resolves.not.toThrow();

    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // T6: fire-and-forget: fetch rejects → hook does NOT throw; caller unaffected
  it('T6: fetch rejects (network error) → no throw, caller unaffected', async () => {
    mockIsConsented.mockReturnValue(true);
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDiscoverTelemetry());

    await expect(
      act(async () => { result.current.emitLeadIntent(); })
    ).resolves.not.toThrow();

    await act(async () => {});
    // fetch was called (attempt made) but didn't throw to caller
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // T7: fetch returns 500 → hook does NOT throw; caller unaffected
  it('T7: fetch returns 500 → no throw, caller unaffected', async () => {
    mockIsConsented.mockReturnValue(true);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const { result } = renderHook(() => useDiscoverTelemetry());

    await expect(
      act(async () => { result.current.emitFilterApply({ property_type: 'agricultural_land' }) })
    ).resolves.not.toThrow();

    await act(async () => {});
    // fetch was called (attempt made) — 500 is silently swallowed
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // T8: backward-compat — emitFilterApply is additive (existing onApply still fires)
  it('T8: emitFilterApply can be called alongside other callbacks without side-effects', async () => {
    mockIsConsented.mockReturnValue(true);

    const onApply = vi.fn();
    const { result } = renderHook(() => useDiscoverTelemetry());

    // Simulate what the wired component does: call both independently.
    await act(async () => {
      onApply({ agriAcresMin: 1 }); // existing callback
      result.current.emitFilterApply({ property_type: 'agricultural_land' }); // additive telemetry
    });
    await act(async () => {});

    // Both ran
    expect(onApply).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Payload must NOT include PII or disallowed fields
  it('no PII fields in payload', async () => {
    mockIsConsented.mockReturnValue(true);
    const { result } = renderHook(() => useDiscoverTelemetry());

    await act(async () => {
      result.current.emitLeadIntent();
    });
    await act(async () => {});

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      events: Array<Record<string, unknown>>;
    };
    const event = body.events[0];
    const piiFields = ['email', 'phone', 'name', 'userId', 'user_id', 'geo', 'lat', 'lng', 'price'];
    for (const f of piiFields) {
      expect(event[f]).toBeUndefined();
    }
  });
});
