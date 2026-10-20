/**
 * #2859 B4 (csv216, e2e/user-journeys.spec.ts U1) — /saved-areas renders its page, not the
 * app error boundary.
 *
 * The legacy spec asserted the Sentry error-boundary copy is absent and the "My Saved Areas"
 * heading is visible. Sentry's boundary lives in main.tsx and is not mounted in a unit test, so
 * this file wraps the page in a test-local boundary that renders the SAME copy: a page crash
 * would replace the heading with that copy, which is what the negative half detects. The heading
 * is the same-it positive control. api.get is mocked at the network boundary; the real page query
 * runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import SavedAreas from '../SavedAreas';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet, patch: vi.fn(), delete: vi.fn(), post: vi.fn() },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

const BOUNDARY_COPY = 'Something went wrong. Please refresh the page.';

class TestBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? <p>{BOUNDARY_COPY}</p> : this.props.children;
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TestBoundary>
          <SavedAreas />
        </TestBoundary>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApiGet.mockReset();
});

describe('SavedAreas page #2859 B4 (U1)', () => {
  it('U1: renders the "My Saved Areas" h1 and the saved rows, and not the error-boundary copy', async () => {
    mockApiGet.mockResolvedValue([
      { id: 'sa-2859-1', areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe', createdAt: null, alertsEnabled: false, priceThresholdRupees: null },
      { id: 'sa-2859-2', areaKey: 'IN|KA|Udupi|Kaup', areaLabel: null, createdAt: null, alertsEnabled: false, priceThresholdRupees: null },
    ]);

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'My Saved Areas' })).toBeInTheDocument();
    // Row label, and the areaKey fallback when the label is null.
    expect(screen.getByText('Malpe')).toBeInTheDocument();
    expect(screen.getByText('IN|KA|Udupi|Kaup')).toBeInTheDocument();
    expect(screen.queryByText(BOUNDARY_COPY)).not.toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith('/api/saved-areas');
  });

  it('U1: an empty list renders the h1 and the empty-state copy, and not the error-boundary copy', async () => {
    mockApiGet.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'My Saved Areas' })).toBeInTheDocument();
    expect(screen.getByText(/No saved areas yet/)).toBeInTheDocument();
    expect(screen.queryByText(BOUNDARY_COPY)).not.toBeInTheDocument();
  });
});
