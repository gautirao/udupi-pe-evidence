import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseRegionGuideState = vi.hoisted(() => vi.fn());
const mockUseReducedMotion = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/state/useRegionGuideState', () => ({ useRegionGuideState: mockUseRegionGuideState }));
vi.mock('@/features/discover/state/useReducedMotion', () => ({ useReducedMotion: mockUseReducedMotion }));

import { useDiscoverRegionGuideController } from './useDiscoverRegionGuideController';

function mockGuideState(overrides: Record<string, unknown> = {}) {
  mockUseRegionGuideState.mockReturnValue({
    view: { regionSelectSource: null, regionSelectNonce: 0, regionGuideDismissed: false, ...overrides },
    commands: { armRegionSelect: vi.fn(), dismissRegionGuide: vi.fn() },
  });
}

/**
 * Issue #2142 (correction pass) — the #1808 deep-link-vs-pick rule used to be
 * two bare consts on MapDiscovery.tsx ~400 lines away from the state they
 * read, with no direct unit coverage. It now has exactly one owner and these
 * assertions.
 */
describe('useDiscoverRegionGuideController (#1808 sole owner)', () => {
  beforeEach(() => {
    mockUseRegionGuideState.mockReset();
    mockUseReducedMotion.mockReset().mockReturnValue(false);
    mockGuideState();
  });

  it('regionGuideVisible requires a region overview AND a non-dismissed guide', () => {
    mockGuideState();
    expect(
      renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: false })).result.current
        .regionGuideVisible,
    ).toBe(false);
    expect(
      renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: true })).result.current
        .regionGuideVisible,
    ).toBe(true);
    mockGuideState({ regionGuideDismissed: true });
    expect(
      renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: true })).result.current
        .regionGuideVisible,
    ).toBe(false);
  });

  it('regionGuideRingActive is suppressed for a deep-link-sourced region select (design §5/§9, AC5)', () => {
    mockGuideState({ regionSelectSource: 'deeplink' });
    const { result } = renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: true }));
    expect(result.current.regionGuideVisible).toBe(true);
    expect(result.current.regionGuideRingActive).toBe(false);
  });

  it('regionGuideRingActive fires for a genuine map/panel pick', () => {
    mockGuideState({ regionSelectSource: 'map' });
    expect(
      renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: true })).result.current
        .regionGuideRingActive,
    ).toBe(true);
    mockGuideState({ regionSelectSource: 'panel' });
    expect(
      renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: true })).result.current
        .regionGuideRingActive,
    ).toBe(true);
  });

  it('regionGuideRingActive can never be true while the guide itself is invisible', () => {
    mockGuideState({ regionSelectSource: 'map', regionGuideDismissed: true });
    const { result } = renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: true }));
    expect(result.current.regionGuideRingActive).toBe(false);
  });

  it('re-exports the guide state/commands and reduced-motion preference unchanged', () => {
    mockUseReducedMotion.mockReturnValue(true);
    mockGuideState({ regionSelectNonce: 7 });
    const { result } = renderHook(() => useDiscoverRegionGuideController({ isRegionOverview: false }));
    expect(result.current.regionSelectNonce).toBe(7);
    expect(result.current.prefersReducedMotion).toBe(true);
    expect(typeof result.current.armRegionSelect).toBe('function');
    expect(typeof result.current.dismissRegionGuide).toBe('function');
  });
});
