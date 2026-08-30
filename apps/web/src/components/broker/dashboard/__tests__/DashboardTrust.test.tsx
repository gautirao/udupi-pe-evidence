import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTrustBanner } from '../DashboardTrust';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe('useTrustBanner', () => {
  it('shows an available badge and persists dismissal', () => {
    const storage = createStorage();
    const { result } = renderHook(() =>
      useTrustBanner('listing-1', true, { storage }),
    );

    expect(result.current.showBanner).toBe(true);

    act(() => result.current.dismiss());

    expect(storage.setItem).toHaveBeenCalledWith(
      'trust-banner-dismissed-listing-1',
      'true',
    );
    expect(result.current.showBanner).toBe(false);
  });

  it('honours a previously persisted dismissal', () => {
    const storage = createStorage({
      'trust-banner-dismissed-listing-1': 'true',
    });

    const { result } = renderHook(() =>
      useTrustBanner('listing-1', true, { storage }),
    );

    expect(result.current.showBanner).toBe(false);
  });

  it('does not show without a listing or an available badge', () => {
    const storage = createStorage();
    const noListing = renderHook(() => useTrustBanner(undefined, true, { storage }));
    const noBadge = renderHook(() => useTrustBanner('listing-1', false, { storage }));

    expect(noListing.result.current.showBanner).toBe(false);
    expect(noBadge.result.current.showBanner).toBe(false);
  });

  it('uses the injected scrolling behaviour', () => {
    const scrollToTrustProgress = vi.fn();
    const { result } = renderHook(() =>
      useTrustBanner('listing-1', true, {
        storage: createStorage(),
        scrollToTrustProgress,
      }),
    );

    act(() => result.current.viewProgress());

    expect(scrollToTrustProgress).toHaveBeenCalledOnce();
  });

  it('still dismisses in memory when storage throws', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('storage unavailable');
      }),
    };
    const { result } = renderHook(() =>
      useTrustBanner('listing-1', true, { storage }),
    );

    act(() => result.current.dismiss());

    expect(result.current.showBanner).toBe(false);
  });
});
