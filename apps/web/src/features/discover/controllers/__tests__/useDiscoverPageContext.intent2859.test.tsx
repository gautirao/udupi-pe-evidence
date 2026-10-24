/**
 * #2859 B6 (handoff 285906) AC9(b) — L120 S2-7.purpose / S2-16.purpose, the producer half:
 * useDiscoverPageContext.ts:107 maps the URL intent to the backend listingPurpose
 * ('rent' -> 'rent'; 'buy', absent or invalid -> 'sale'; never 'buy' on the wire).
 *
 * Mock set mirrors useDiscoverPageContext.commercialSubtype2531.test.tsx:36-67 (replicated, not
 * imported), with `nav.intent` made variable. The URL `intent=` parse -> nav.intent is NOT exercised
 * here (RETAIN, AC9(c)); this pins only the nav.intent -> intentListingPurpose mapping.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

let mockIntent: unknown = 'buy';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock('@/features/discover/selectors/mapLayerCategory', () => ({
  computeDiscoverLayer: () => ({ kind: 'city' }),
  toLayerInput: (x: unknown) => x,
}));
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    city: 'udupi',
    q: '',
    intent: mockIntent,
    journey: 'area-first' as const,
    filters: {},
  }),
  useDiscoverViewport: () => null,
  useDiscoverActions: () => ({}),
  useDiscoverShell: () => ({
    mobileView: 'LIST',
    isMobileShell: false,
    setMobileView: vi.fn(),
    isAreaSetDraftOpen: false,
  }),
}));

import { useDiscoverPageContext } from '../useDiscoverPageContext';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(MemoryRouter, null, children),
  );
}

function purposeFor(intent: unknown): string {
  mockIntent = intent;
  const { result, unmount } = renderHook(() => useDiscoverPageContext(), { wrapper });
  const p = result.current.intentListingPurpose;
  unmount();
  return p;
}

describe('#2859 B6 AC9(b) useDiscoverPageContext intent -> intentListingPurpose', () => {
  it("S2-7.purpose / S2-16.purpose (L120): intent 'rent' -> 'rent'; controls in the same it: 'buy' -> 'sale', absent -> 'sale', invalid -> 'sale' (never 'buy')", () => {
    expect(purposeFor('rent')).toBe('rent');
    expect(purposeFor('buy')).toBe('sale');
    expect(purposeFor(undefined)).toBe('sale');
    expect(purposeFor('lease-nonsense')).toBe('sale');
    for (const i of ['rent', 'buy', undefined, 'lease-nonsense']) {
      expect(purposeFor(i)).not.toBe('buy');
    }
  });
});
