import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import Insights from '../Insights';
import {
  useAvgPriceByArea,
  usePriceTrend,
  useAreaMarketTrend,
  useMultiAreaTrend,
} from '@/hooks/useInsights';
import { api } from '@/lib/api';

// ─── Polyfills ─────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// ─── Hoisted mock handles ──────────────────────────────────────
const mockNavigate = vi.hoisted(() => vi.fn());

// ─── Mutable auth state ───────────────────────────────────────
let mockAuth: {
  user: { id: string } | null;
  isLoading: boolean;
  insightsAccessUntil: string | null;
};

// ─── Mocks ────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/hooks/useInsights', () => ({
  useAvgPriceByArea: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  usePriceTrend: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  useAreaMarketTrend: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  useMultiAreaTrend: vi.fn(() => []),
}));

vi.mock('@/components/insights/SavedAreas', () => ({
  SavedAreas: () => React.createElement('div', { 'data-testid': 'saved-areas' }, 'SavedAreas'),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Prevent recharts from crashing in jsdom (no SVG layout engine)
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  BarChart: () => null,
  Bar: () => null,
  LineChart: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// PaywallCard's dependencies (we do NOT mock PaywallCard itself — tests verify its content)
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
}));

// ─── Helpers ──────────────────────────────────────────────────
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function renderInsights() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Insights />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = {
    user: { id: 'user-1' },
    isLoading: false,
    insightsAccessUntil: null,
  };
  // Re-apply default return values cleared by clearAllMocks
  vi.mocked(useAvgPriceByArea).mockReturnValue({ data: [], isLoading: false, error: null } as ReturnType<typeof useAvgPriceByArea>);
  vi.mocked(usePriceTrend).mockReturnValue({ data: [], isLoading: false, error: null } as ReturnType<typeof usePriceTrend>);
  vi.mocked(useAreaMarketTrend).mockReturnValue({ data: [], isLoading: false, error: null } as ReturnType<typeof useAreaMarketTrend>);
  vi.mocked(useMultiAreaTrend).mockReturnValue([]);
  vi.mocked(api.post).mockResolvedValue({});
});

describe('Insights page — access gating', () => {
  it('shows PaywallCard ("Insights Access Required") when hasAccess=false', () => {
    mockAuth.insightsAccessUntil = null;
    renderInsights();
    expect(screen.getByText('Insights Access Required')).toBeInTheDocument();
  });

  it('does not show PaywallCard when hasAccess=true', () => {
    mockAuth.insightsAccessUntil = daysFromNow(10);
    renderInsights();
    expect(screen.queryByText('Insights Access Required')).not.toBeInTheDocument();
  });

  it('shows TrialBanner with correct days when daysRemaining ≤ 3', () => {
    mockAuth.insightsAccessUntil = daysFromNow(2);
    renderInsights();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/2 days/)).toBeInTheDocument();
  });

  it('does not show TrialBanner when daysRemaining > 3', () => {
    mockAuth.insightsAccessUntil = daysFromNow(10);
    renderInsights();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls useAvgPriceByArea with enabled=false when hasAccess=false', () => {
    mockAuth.insightsAccessUntil = null;
    renderInsights();
    expect(vi.mocked(useAvgPriceByArea)).toHaveBeenCalledWith('all', 0, { enabled: false });
    // usePriceTrend(selectedArea, propertyType, bedrooms, enabled): selectedArea=null, default type='land'
    expect(vi.mocked(usePriceTrend)).toHaveBeenCalledWith(null, 'land', 0, false);
  });

  it('calls useAvgPriceByArea with enabled=true when hasAccess=true', () => {
    mockAuth.insightsAccessUntil = daysFromNow(10);
    renderInsights();
    expect(vi.mocked(useAvgPriceByArea)).toHaveBeenCalledWith('all', 0, { enabled: true });
  });

  it('always renders SavedAreas regardless of access state', () => {
    // With access
    mockAuth.insightsAccessUntil = daysFromNow(10);
    const { unmount } = renderInsights();
    expect(screen.getByTestId('saved-areas')).toBeInTheDocument();
    unmount();

    // Without access
    mockAuth.insightsAccessUntil = null;
    renderInsights();
    expect(screen.getByTestId('saved-areas')).toBeInTheDocument();
  });

  it('suppresses PaywallCard when authLoading=true (showPaywall = !authLoading && !hasAccess)', () => {
    mockAuth.isLoading = true;
    mockAuth.insightsAccessUntil = null;
    renderInsights();
    // showPaywall = !true && !false = false → PaywallCard should not render
    expect(screen.queryByText('Insights Access Required')).not.toBeInTheDocument();
  });
});

describe('Insights page — type selector (PR-11.9)', () => {
  it('calls useAreaMarketTrend on every render (even with disabled=false)', () => {
    mockAuth.insightsAccessUntil = daysFromNow(10);
    renderInsights();
    // Default selectedPriceType='land', selectedArea=null
    // propertyType arg: 'land' === 'apartment' ? 'apartment' : 'house' → 'house'
    // enabled: hasAccess && !!selectedArea && selectedPriceType !== 'land' → false
    expect(vi.mocked(useAreaMarketTrend)).toHaveBeenCalledWith(
      null,
      'house',
      false,
    );
  });

  it('calls useAreaMarketTrend with enabled=false when hasAccess=false', () => {
    mockAuth.insightsAccessUntil = null;
    renderInsights();
    expect(vi.mocked(useAreaMarketTrend)).toHaveBeenCalledWith(
      null,
      'house',
      false,
    );
  });

  it('calls useMultiAreaTrend with empty array when no avgPriceData', () => {
    mockAuth.insightsAccessUntil = daysFromNow(10);
    renderInsights();
    // selectedCompareAreas starts empty; initialised by useEffect once avgPriceData loads
    expect(vi.mocked(useMultiAreaTrend)).toHaveBeenCalledWith([], false);
  });
});
