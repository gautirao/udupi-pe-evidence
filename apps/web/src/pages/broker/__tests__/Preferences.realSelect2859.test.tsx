/**
 * #2859 B1 — BP4-c: ONE test that picks Kadri / Apartment / For Rent through the REAL Radix Select (no ui/select mock)
 * and proves the picked values reach the POST body. Isolated in its own file because opening the real Select is slow in
 * jsdom (Preferences.pageHttp.test.tsx header: ~13 s per open). Drive = synchronous keyboard events on the trigger and
 * the option (precedent BrokerDemandGaps.pageHttp.test.tsx 'DG6a'), per-test timeout 90 s.
 * Seams: `@/lib/api` stateful fake, `@/contexts/AuthContext`, `@/components/layout/AppLayout` (as the pageHttp file).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return { api: mockApi, ApiError: MockApiError };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isBroker: true, isAdmin: false, isLoading: false, user: { id: 'broker-uid-2859' } }),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// jsdom lacks the pointer-capture / scrollIntoView APIs Radix Select calls.
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import BrokerPreferences from '../Preferences';

const PATH = '/api/broker/market-focus';

describe('BrokerPreferences real Radix Select pick (#2859 B1, BP4-c)', () => {
  it('BP4-c: picking Kadri, Mangalore / Apartment / For Rent through the REAL Select enables Add and the POST body carries exactly the picked values', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path !== PATH) throw new Error(`fake api: unexpected GET ${path}`);
      return [];
    });
    mockApi.post.mockImplementation(async (path: string) => {
      if (path !== PATH) throw new Error(`fake api: unexpected POST ${path}`);
      return undefined;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/broker/preferences']}>
          <Routes>
            <Route path="/broker/preferences" element={<BrokerPreferences />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByTestId('empty-state-description');

    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled(); // before: nothing picked

    const picks: Array<[string, string]> = [
      ['Select area', 'Kadri, Mangalore'],
      ['Select property type', 'Apartment'],
      ['Select listing purpose', 'For Rent'],
    ];
    for (const [trigger, option] of picks) {
      fireEvent.keyDown(screen.getByRole('combobox', { name: trigger }), { key: 'Enter' });
      fireEvent.keyDown(screen.getByRole('option', { name: option }), { key: 'Enter' });
      expect(screen.getByRole('combobox', { name: trigger })).toHaveTextContent(option); // the trigger shows the pick
    }

    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled(); // after: all three picked
    expect(mockApi.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1), { timeout: 60_000 });
    expect(mockApi.post.mock.calls).toEqual([
      [PATH, { areaKey: 'IN|KA|Mangalore|Kadri', propertyType: 'apartment', listingPurpose: 'rent' }],
    ]);
  }, 90_000);
});
