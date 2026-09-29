import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiscoverHeaderHostsControls, DISCOVER_HEADER_HOSTS_CONTROLS_MIN_WIDTH } from '../useDiscoverHeaderHostsControls';
import { mockMatchMediaWidth } from '@/test-utils/mockMatchMediaWidth';

const N = DISCOVER_HEADER_HOSTS_CONTROLS_MIN_WIDTH;

describe('useDiscoverHeaderHostsControls', () => {
  let matchMediaMock: { restore: () => void } | undefined;
  afterEach(() => {
    matchMediaMock?.restore();
  });

  it(`is false just below N (${N - 1}px), desktop shell`, () => {
    matchMediaMock = mockMatchMediaWidth(N - 1);
    const { result } = renderHook(() => useDiscoverHeaderHostsControls(false));
    expect(result.current).toBe(false);
  });

  it(`is true at exactly N (${N}px), desktop shell`, () => {
    matchMediaMock = mockMatchMediaWidth(N);
    const { result } = renderHook(() => useDiscoverHeaderHostsControls(false));
    expect(result.current).toBe(true);
  });

  it('is false at N when isMobileShell is true, regardless of width', () => {
    matchMediaMock = mockMatchMediaWidth(N);
    const { result } = renderHook(() => useDiscoverHeaderHostsControls(true));
    expect(result.current).toBe(false);
  });

  it('is false well below N (mobile-range width) even with isMobileShell false', () => {
    matchMediaMock = mockMatchMediaWidth(900);
    const { result } = renderHook(() => useDiscoverHeaderHostsControls(false));
    expect(result.current).toBe(false);
  });
});
