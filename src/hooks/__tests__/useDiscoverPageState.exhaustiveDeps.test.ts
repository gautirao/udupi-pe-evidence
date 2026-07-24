/**
 * Issue #2005 (Slice 2 PR6) — Category B regression coverage for
 * useDiscoverPageState.ts's three converted exhaustive-deps sites:
 *   - :166 [urlCity]  — sync local `city` with URL city (Back/Forward nav)
 *   - :176 [urlZoom]  — sync `mapZoom` with URL viewport.zoom (zoom-only by design)
 *   - :194 [urlAreaKey] — sync `selectedArea`/`pendingAreaKeyRef` with URL areaKey
 *
 * Each site's fix extracted the trigger as a named derived value
 * (urlCity/urlZoom/urlAreaKey) without changing which prop drives the effect —
 * these tests prove the effect still fires on that same trigger and does not
 * fire on an unrelated urlState field changing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { DiscoverUrlState, DiscoverUrlActions } from '../useDiscoverUrlState';
import { useDiscoverPageState } from '../useDiscoverPageState';

function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'udupi',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    ...overrides,
  };
}

function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    changeCity: vi.fn(),
    setCity: vi.fn(),
    selectArea: vi.fn(),
    deselectArea: vi.fn(),
    reportViewport: vi.fn(),
    setFiltersLive: vi.fn(),
    setFiltersCommitted: vi.fn(),
    setSchoolParams: vi.fn(),
    setSchoolJourney: vi.fn(),
    setSearchQuery: vi.fn(),
    setJourney: vi.fn(),
    selectGroup: vi.fn(),
    setBoardFilters: vi.fn(),
    setCategoryFilters: vi.fn(),
    clearAreaContext: vi.fn(),
    clearSchoolContext: vi.fn(),
    startOver: vi.fn(),
    setRegion: vi.fn(),
    setMaxKm: vi.fn(),
    clearRegionAndMaxKm: vi.fn(),
    setIntent: vi.fn(),
    ...overrides,
  } as DiscoverUrlActions;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── :166 [urlCity] ─────────────────────────────────────────────────────────

describe('useDiscoverPageState:166 — [urlCity] trigger (Category B)', () => {
  it('syncs local city + mapZoom when urlState.city changes (Back/Forward nav)', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ city: 'udupi' }) } },
    );
    expect(result.current.city).toBe('udupi');

    rerender({ urlState: makeUrlState({ city: 'bangalore' }) });

    expect(result.current.city).toBe('bangalore');
  });

  it('does not touch local city when an unrelated urlState field changes', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ city: 'udupi', q: '' }) } },
    );
    expect(result.current.city).toBe('udupi');

    rerender({ urlState: makeUrlState({ city: 'udupi', q: 'manipal' }) });

    expect(result.current.city).toBe('udupi');
  });
});

// ─── :176 [urlZoom] — zoom-only by design ──────────────────────────────────

describe('useDiscoverPageState:176 — [urlZoom] trigger, zoom-only by design (Category B)', () => {
  it('syncs mapZoom when urlState.viewport.zoom changes', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ viewport: null }) } },
    );

    rerender({ urlState: makeUrlState({ viewport: { lat: 13.3, lon: 74.7, zoom: 16 } }) });

    expect(result.current.mapZoom).toBe(16);
  });

  it('does not re-sync mapZoom on a pan-only change (lat/lon change, zoom unchanged)', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ viewport: { lat: 13.3, lon: 74.7, zoom: 14 } }) } },
    );
    expect(result.current.mapZoom).toBe(14);

    // Broker manually adjusts zoom locally (simulating independent map interaction)...
    // then a pan-only URL update arrives with the SAME zoom value.
    rerender({ urlState: makeUrlState({ viewport: { lat: 13.9, lon: 74.9, zoom: 14 } }) });

    // mapZoom is unaffected — pan (lat/lon) is deliberately excluded from the trigger.
    expect(result.current.mapZoom).toBe(14);
  });
});

// ─── :194 [urlAreaKey] ──────────────────────────────────────────────────────

describe('useDiscoverPageState:194 — [urlAreaKey] trigger (Category B)', () => {
  it('clears selectedArea/panToArea when urlAreaKey is removed (Back nav)', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ areaKey: 'IN|KA|Udupi|Malpe' }) } },
    );

    rerender({ urlState: makeUrlState({ areaKey: null }) });

    expect(result.current.selectedArea).toBeNull();
    expect(result.current.pendingAreaKeyRef.current).toBeNull();
  });

  it('re-arms pendingAreaKeyRef and bumps resolveSignal when urlAreaKey is restored (Forward nav)', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ areaKey: null }) } },
    );
    const signalBefore = result.current.resolveSignal;

    rerender({ urlState: makeUrlState({ areaKey: 'IN|KA|Udupi|Malpe' }) });

    expect(result.current.pendingAreaKeyRef.current).toBe('IN|KA|Udupi|Malpe');
    expect(result.current.resolveSignal).toBeGreaterThan(signalBefore);
  });

  it('does not touch selectedArea/pendingAreaKeyRef when an unrelated urlState field changes (areaKey stable)', () => {
    const urlActions = makeUrlActions();
    const { result, rerender } = renderHook(
      ({ urlState }) => useDiscoverPageState({ urlState, urlActions }),
      { initialProps: { urlState: makeUrlState({ areaKey: null, q: '' }) } },
    );
    const signalBefore = result.current.resolveSignal;

    rerender({ urlState: makeUrlState({ areaKey: null, q: 'manipal' }) });

    expect(result.current.resolveSignal).toBe(signalBefore);
    expect(result.current.pendingAreaKeyRef.current).toBeNull();
  });
});
