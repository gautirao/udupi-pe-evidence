/**
 * Issue #2005 (Slice 2 PR6) — Category C (tests-only) regression coverage for
 * useDiscoverBadgeAnnounce.ts:57. ZERO production edits — the colocated
 * useDiscoverBadgeAnnounce.test.ts already thoroughly covers the copy
 * ladder, loading gate, and a "coalesces rapid input changes" debounce test.
 *
 * This file adds the ONE canonical assertion the plan calls out explicitly
 * for the site's intended behaviour (per its own comment: "updated ~500ms
 * after the badge SETTLES ... so screen-reader users hear one announcement
 * per fetch settle"): fires once after 500ms; a badge change mid-delay
 * cancels and restarts the timeout rather than stacking a second one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverBadgeAnnounce } from './useDiscoverBadgeAnnounce';
import { formatDiscoverBadgeCopy, type DiscoverBadgeResult } from './discoverBadge';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

function makeBadge(overrides: Partial<DiscoverBadgeResult> = {}): DiscoverBadgeResult {
  return {
    visible: true,
    count: 42,
    loading: false,
    n: 42,
    m: 42,
    hasActiveFilters: false,
    hasPropertyFilters: false,
    state: 'ok',
    ...overrides,
  };
}

const AREA = { areaLabel: 'Indiranagar' } as unknown as AreaPoint;

describe('useDiscoverBadgeAnnounce.ts:57 — Category C: fires once after 500ms; a mid-delay change cancels and restarts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'clearTimeout');
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires exactly once, 500ms after mount, for a single settled badge', () => {
    const badge = makeBadge();
    const { result } = renderHook(() =>
      useDiscoverBadgeAnnounce({
        discoverBadge: badge,
        selectedArea: AREA,
        focusedGroup: null,
        city: 'bangalore',
        urlStateQ: undefined,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const expected = formatDiscoverBadgeCopy(badge, {
      scopeLabel: 'Indiranagar',
      noun: 'homes',
      searchQuery: undefined,
    });
    expect(result.current).toBe(expected);
  });

  it('a badge change mid-delay CANCELS the pending timer (clearTimeout called) and restarts a fresh 500ms window — only the LATEST badge is ever announced', () => {
    const badgeA = makeBadge({ n: 10, m: 10 });
    const badgeB = makeBadge({ n: 20, m: 20 });
    const { result, rerender } = renderHook(
      (props: { badge: DiscoverBadgeResult }) =>
        useDiscoverBadgeAnnounce({
          discoverBadge: props.badge,
          selectedArea: AREA,
          focusedGroup: null,
          city: 'bangalore',
          urlStateQ: undefined,
        }),
      { initialProps: { badge: badgeA } },
    );

    act(() => {
      vi.advanceTimersByTime(300); // inside the first pending window
    });
    expect(result.current).toBe('');

    const clearTimeoutCallsBefore = vi.mocked(globalThis.clearTimeout).mock.calls.length;
    rerender({ badge: badgeB }); // change arrives mid-delay
    expect(vi.mocked(globalThis.clearTimeout).mock.calls.length).toBeGreaterThan(clearTimeoutCallsBefore);

    // The ORIGINAL timer's remaining time (200ms) elapses — must NOT have
    // fired (it was cancelled, not merely superseded).
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('');

    // The NEW 500ms window (restarted on the badgeB change) elapses.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const expectedB = formatDiscoverBadgeCopy(badgeB, {
      scopeLabel: 'Indiranagar',
      noun: 'homes',
      searchQuery: undefined,
    });
    expect(result.current).toBe(expectedB);
    // Never announced the stale badgeA value.
    expect(result.current).not.toBe(
      formatDiscoverBadgeCopy(badgeA, { scopeLabel: 'Indiranagar', noun: 'homes', searchQuery: undefined }),
    );
  });
});
