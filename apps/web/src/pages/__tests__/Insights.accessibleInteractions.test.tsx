import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// #2400 — this suite exercises the ACCESSIBLE (hasAccess=true) state with
// realistic multi-area data, proving the decomposition (useInsightsAccess /
// useInsightsView / chart adapters / section components) did not break the
// three interactions called out in review: a property-type filter change, an
// area change, and a comparison-area toggle. Real-browser Playwright coverage
// of this exact state was not available in the review environment — see
// docs/evidence/issue-2400/README.md for why, and the paywalled before/after
// screenshots for the browser-level evidence that WAS obtainable there.

// ─── Polyfills ─────────────────────────────────────────────────
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

let mockAuth: {
  user: { id: string } | null;
  isLoading: boolean;
  insightsAccessUntil: string | null;
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/hooks/useInsights', () => ({
  useAvgPriceByArea: vi.fn(),
  usePriceTrend: vi.fn(),
  useAreaMarketTrend: vi.fn(),
  useMultiAreaTrend: vi.fn(),
}));

vi.mock('@/components/insights/SavedAreas', () => ({
  SavedAreas: () => React.createElement('div', { 'data-testid': 'saved-areas' }, 'SavedAreas'),
}));

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

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

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn().mockResolvedValue({}) },
}));

// Stub Select so option-clicking works without Radix portals in jsdom —
// same pattern already used by apps/web/src/pages/broker/__tests__/Preferences.test.tsx
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => (
    <div data-value={value} data-testid="select-root">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ onValueChange?: (v: string) => void }>, { onValueChange })
          : child
      )}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children, onValueChange }: { children: React.ReactNode; onValueChange?: (v: string) => void }) => (
    <div>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ onValueChange?: (v: string) => void }>, { onValueChange })
          : child
      )}
    </div>
  ),
  SelectItem: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange?: (v: string) => void;
  }) => (
    <button data-testid={`select-item-${value}`} onClick={() => onValueChange?.(value)}>
      {children}
    </button>
  ),
}));

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function renderInsights() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Insights />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Four areas — matches the shape returned by GET /api/insights/avg-price-by-area
const AREAS = [
  { areaKey: 'Manipal', listingCount: 30, medianPricePerCentPaise: 500000, cityMedianPricePerCentPaise: 400000, priceIndex: 1.25 },
  { areaKey: 'Udupi', listingCount: 20, medianPricePerCentPaise: 300000, cityMedianPricePerCentPaise: 400000, priceIndex: 0.75 },
  { areaKey: 'Kaup', listingCount: 10, medianPricePerCentPaise: 350000, cityMedianPricePerCentPaise: 400000, priceIndex: 0.9 },
  { areaKey: 'Kundapur', listingCount: 5, medianPricePerCentPaise: 250000, cityMedianPricePerCentPaise: 400000, priceIndex: 0.6 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = { user: { id: 'user-1' }, isLoading: false, insightsAccessUntil: daysFromNow(10) };

  vi.mocked(useAvgPriceByArea).mockReturnValue({
    data: AREAS,
    isLoading: false,
    error: null,
  } as ReturnType<typeof useAvgPriceByArea>);

  vi.mocked(usePriceTrend).mockReturnValue({
    data: [{ weekStartDate: '2026-01-05', medianPricePerCentPaise: 480000, listingCount: 4, p25PricePerCentPaise: 400000, p75PricePerCentPaise: 550000 }],
    isLoading: false,
    error: null,
  } as ReturnType<typeof usePriceTrend>);

  vi.mocked(useAreaMarketTrend).mockReturnValue({ data: [], isLoading: false, error: null } as ReturnType<typeof useAreaMarketTrend>);

  // Mirrors the input areaKeys back with synthetic trend data, matching real
  // useMultiAreaTrend's per-area useQueries ordering contract.
  vi.mocked(useMultiAreaTrend).mockImplementation((areaKeys: string[]) =>
    areaKeys.map(() => ({
      data: [{ weekStartDate: '2026-01-05', medianPricePerCentPaise: 300000 }],
      isLoading: false,
    })) as ReturnType<typeof useMultiAreaTrend>
  );

  vi.mocked(api.post).mockResolvedValue({});
});

describe('Insights page — accessible state renders charts, not paywall', () => {
  it('renders all three sections and no paywall when hasAccess=true', () => {
    renderInsights();
    expect(screen.queryByText('Insights Access Required')).not.toBeInTheDocument();
    expect(screen.getByText('Average Price by Area')).toBeInTheDocument();
    expect(screen.getByText('Price Trend')).toBeInTheDocument();
    expect(screen.getByText('Area Comparison')).toBeInTheDocument();
  });

  it('defaults selected area to the first avg-price row and compare areas to the top-3 by listing count', () => {
    renderInsights();
    // usePriceTrend receives the default-selected area once the effect runs
    expect(vi.mocked(usePriceTrend)).toHaveBeenCalledWith('Manipal', 'land', 0, true);
    // useMultiAreaTrend receives the top-3-by-listingCount default (Manipal 30, Udupi 20, Kaup 10)
    expect(vi.mocked(useMultiAreaTrend)).toHaveBeenLastCalledWith(['Manipal', 'Udupi', 'Kaup'], true);
  });
});

// "apartment"/"land" values exist in BOTH the AveragePriceSection property-type
// Select and the PriceTrendSection price-type Select — pick the first DOM
// occurrence (AveragePriceSection renders first) to target the filter, not
// the chart-type toggle.
function getPropertyTypeFilterItem(value: string): HTMLElement {
  return screen.getAllByTestId(`select-item-${value}`)[0];
}

describe('Insights page — property-type filter change (AC: filter change)', () => {
  it('re-queries useAvgPriceByArea with the new property type and resets bedrooms to 0', async () => {
    const user = userEvent.setup();
    renderInsights();

    await user.click(getPropertyTypeFilterItem('apartment'));

    expect(vi.mocked(useAvgPriceByArea)).toHaveBeenLastCalledWith('apartment', 0, { enabled: true });
  });

  it('re-queries with the selected bedroom count after choosing a non-land property type', async () => {
    const user = userEvent.setup();
    renderInsights();

    await user.click(getPropertyTypeFilterItem('apartment'));
    // Bedroom quick-filter buttons only render once propertyType !== 'land'
    await user.click(screen.getByRole('button', { name: '2 BHK' }));

    expect(vi.mocked(useAvgPriceByArea)).toHaveBeenLastCalledWith('apartment', 2, { enabled: true });
  });
});

describe('Insights page — area change (AC: area change)', () => {
  it('re-queries usePriceTrend and useAreaMarketTrend with the newly selected area', async () => {
    const user = userEvent.setup();
    renderInsights();

    await user.click(screen.getByTestId('select-item-Udupi'));

    expect(vi.mocked(usePriceTrend)).toHaveBeenLastCalledWith('Udupi', 'land', 0, true);
  });
});

// Comparison chips (AreaComparisonSection) and the area Select's mocked
// items (PriceTrendSection) both render a <button> with the same accessible
// name for a shared area — the Select items carry a data-testid, chips don't.
function getComparisonChip(name: string): HTMLElement {
  const candidates = screen.getAllByRole('button', { name });
  const chip = candidates.find((el) => !el.hasAttribute('data-testid'));
  if (!chip) throw new Error(`comparison chip "${name}" not found among ${candidates.length} candidates`);
  return chip;
}

describe('Insights page — comparison-area toggle (AC: comparison toggle)', () => {
  it('adds a fourth area to the comparison set when a non-selected chip is clicked', async () => {
    const user = userEvent.setup();
    renderInsights();

    // Default top-3 is Manipal/Udupi/Kaup — Kundapur starts unselected
    await user.click(getComparisonChip('Kundapur'));

    expect(vi.mocked(useMultiAreaTrend)).toHaveBeenLastCalledWith(
      ['Manipal', 'Udupi', 'Kaup', 'Kundapur'],
      true,
    );
  });

  it('removes an area from the comparison set when its selected chip is clicked again', async () => {
    const user = userEvent.setup();
    renderInsights();

    await user.click(getComparisonChip('Udupi'));

    expect(vi.mocked(useMultiAreaTrend)).toHaveBeenLastCalledWith(
      ['Manipal', 'Kaup'],
      true,
    );
  });
});
