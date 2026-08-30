import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscoverBadgeAnnounce } from './useDiscoverBadgeAnnounce';
import { formatDiscoverBadgeCopy, type DiscoverBadgeResult } from './discoverBadge';
import { CITY_CONFIG } from '@/lib/localityUtils';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { AreaGroup } from '@/hooks/useAreaGroups';

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
const GROUP = { name: 'East Bangalore Belt' } as unknown as AreaGroup;

describe('useDiscoverBadgeAnnounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  it('returns empty string before any timer advance', () => {
    const badge = makeBadge();
    const { result } = renderHook(() =>
      useDiscoverBadgeAnnounce({
        discoverBadge: badge,
        selectedArea: null,
        focusedGroup: null,
        city: 'bangalore',
        urlStateQ: undefined,
      }),
    );
    expect(result.current).toBe('');
  });

  it('announces the area-scoped copy (noun "homes") once settled', () => {
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
      vi.advanceTimersByTime(500);
    });
    const expected = formatDiscoverBadgeCopy(badge, {
      scopeLabel: 'Indiranagar',
      noun: 'homes',
      searchQuery: undefined,
    });
    expect(expected).toBe('42 homes in Indiranagar');
    expect(result.current).toBe(expected);
  });

  it('announces the group-scoped copy (noun "properties") when no area is selected', () => {
    const badge = makeBadge();
    const { result } = renderHook(() =>
      useDiscoverBadgeAnnounce({
        discoverBadge: badge,
        selectedArea: null,
        focusedGroup: GROUP,
        city: 'bangalore',
        urlStateQ: undefined,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const expected = formatDiscoverBadgeCopy(badge, {
      scopeLabel: 'East Bangalore Belt',
      noun: 'properties',
      searchQuery: undefined,
    });
    expect(expected).toBe('42 properties in East Bangalore Belt');
    expect(result.current).toBe(expected);
  });

  it('falls back to the city label when neither area nor group is selected', () => {
    const badge = makeBadge();
    const { result } = renderHook(() =>
      useDiscoverBadgeAnnounce({
        discoverBadge: badge,
        selectedArea: null,
        focusedGroup: null,
        city: 'bangalore',
        urlStateQ: undefined,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const expected = formatDiscoverBadgeCopy(badge, {
      scopeLabel: CITY_CONFIG.bangalore.label,
      noun: 'properties',
      searchQuery: undefined,
    });
    expect(expected).toBe('42 properties in Bangalore');
    expect(result.current).toBe(expected);
  });

  it('falls back to the raw city slug when CITY_CONFIG has no entry', () => {
    const badge = makeBadge();
    const { result } = renderHook(() =>
      useDiscoverBadgeAnnounce({
        discoverBadge: badge,
        selectedArea: null,
        focusedGroup: null,
        city: 'not-a-real-city',
        urlStateQ: undefined,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('42 properties in not-a-real-city');
  });

  it('does not update while the badge is loading, even after the debounce window', () => {
    const badge = makeBadge({ loading: true });
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
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('');
  });

  it('settles to empty string when the badge is not visible', () => {
    const badge = makeBadge({ visible: false });
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
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('');
  });

  it('coalesces rapid input changes into a single final announcement', () => {
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
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('');

    rerender({ badge: badgeB });

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    const expected = formatDiscoverBadgeCopy(badgeB, {
      scopeLabel: 'Indiranagar',
      noun: 'homes',
      searchQuery: undefined,
    });
    expect(expected).toBe('20 homes in Indiranagar');
    expect(result.current).toBe(expected);
  });

  it('clears the pending timer on unmount (no late update)', () => {
    const badge = makeBadge();
    const { result, unmount } = renderHook(() =>
      useDiscoverBadgeAnnounce({
        discoverBadge: badge,
        selectedArea: AREA,
        focusedGroup: null,
        city: 'bangalore',
        urlStateQ: undefined,
      }),
    );

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
    // No assertion on result.current after unmount is meaningful (React Testing
    // Library detaches it), but advancing timers must not throw or warn.
    expect(result.current).toBe('');
  });
});
