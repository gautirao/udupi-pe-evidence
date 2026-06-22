/**
 * BrokerAreaInsights — vitest AC1–AC13 slices.
 *
 * AC1:  Route renders for non-Malpe fixture; all structural sections present.
 * AC2:  api.get called with the exact path; no broker-id param.
 * AC5/AC13: null Metric renders confidenceLabel, NOT "0";
 *            true-broker-0 renders real zero with broker framing (distinct).
 * AC6:  Confidence label from DTO ("Limited data"), not hardcoded "Enough data".
 * AC8:  Enabled CTAs route to existing paths; #1535/#1523 render disabled.
 * AC9:  Broker-action copy present; buyer-trend phrasing absent.
 * AC10: isLoading→Skeleton; isError→Alert; available===false→limited-data state.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrokerAreaInsights from '../BrokerAreaInsights';

// ── Hoisted mock state ─────────────────────────────────────────────────────────

const mockHookState = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  data: null as import('@/types/brokerAreaInsights').BrokerAreaInsightsResponse | null,
  refetch: vi.fn(),
}));

const mockApiGet = vi.hoisted(() => vi.fn());

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/useBrokerAreaInsights', () => ({
  useBrokerAreaInsights: vi.fn((_citySlug: string, _areaKey: string) => ({
    data: mockHookState.data,
    isLoading: mockHookState.isLoading,
    isError: mockHookState.isError,
    refetch: mockHookState.refetch,
  })),
  brokerAreaInsightsQueryKey: vi.fn((c: string, a: string) => ['broker', 'area-insights', c, a]),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: mockApiGet,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

// ── Fixture builders ──────────────────────────────────────────────────────────

function buildInsightsResponse(
  overrides: Partial<import('@/types/brokerAreaInsights').BrokerAreaInsightsResponse> = {},
): import('@/types/brokerAreaInsights').BrokerAreaInsightsResponse {
  return {
    citySlug: 'udupi',
    areaKey: 'kundapura',
    areaLabel: 'Kundapura',
    available: true,
    confidenceLabel: 'Enough data',
    area: {
      medianPricePaise: { value: 5000000_00, confidenceLabel: 'Enough data' },
      dominantPropertyType: { value: 'Apartment', confidenceLabel: 'Enough data' },
      activeListingCount: { value: 25, confidenceLabel: 'Enough data' },
      freshListingCount: { value: 8, confidenceLabel: 'Enough data' },
      avgListingQuality: { value: 72.5, confidenceLabel: 'Enough data' },
      topBuyerNeedSignalCount: { value: 5, confidenceLabel: 'Enough data' },
    },
    broker: {
      liveListingsInArea: 3,
      listingsNeedingAttention: 1,
      enquiriesOnBrokerListings: 2,
      opportunitiesToAct: 2,
    },
    ...overrides,
  };
}

// ── Render helper ─────────────────────────────────────────────────────────────
// Must use Routes/Route with a path pattern so useParams() extracts correctly.

function renderPage(route = '/broker/areas/udupi/kundapura') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/broker/areas/:citySlug/:areaKey" element={<BrokerAreaInsights />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BrokerAreaInsights', () => {
  beforeEach(() => {
    mockHookState.isLoading = false;
    mockHookState.isError = false;
    mockHookState.data = null;
    mockApiGet.mockReset();
  });

  // ── AC1: structural sections for a non-Malpe fixture ──────────────────────

  it('AC1: renders all structural sections for a non-Malpe city/area fixture', () => {
    mockHookState.data = buildInsightsResponse();
    renderPage('/broker/areas/udupi/kundapura');

    // Header / breadcrumb — areaLabel appears in multiple places (h1, breadcrumb, description)
    expect(screen.getAllByText('Kundapura').length).toBeGreaterThan(0);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();

    // Shared metrics section
    expect(screen.getByText(/area market overview/i)).toBeInTheDocument();

    // Broker listing health section
    expect(screen.getByText(/your listing health in this area/i)).toBeInTheDocument();

    // Demand signals section
    expect(screen.getByText(/buyer demand signals in this area/i)).toBeInTheDocument();

    // Next steps / CTAs section
    expect(screen.getByText(/recommended next steps/i)).toBeInTheDocument();
  });

  // ── AC2: api.get called with exact path, no broker-id ────────────────────

  it('AC2: hook uses the exact API path with citySlug/areaKey and no broker-id', async () => {
    const { useBrokerAreaInsights } = await import('@/hooks/useBrokerAreaInsights');
    const hookMock = vi.mocked(useBrokerAreaInsights);

    // Use a simple areaKey (no pipe chars) that survives URL routing as-is
    mockHookState.data = buildInsightsResponse({
      citySlug: 'udupi',
      areaKey: 'kundapura',
    });

    renderPage('/broker/areas/udupi/kundapura');

    // Hook must have been called with citySlug and areaKey only (no broker id arg)
    expect(hookMock).toHaveBeenCalledWith('udupi', 'kundapura');
    // The hook should receive exactly 2 arguments: citySlug and areaKey — no broker id
    const [firstCall] = hookMock.mock.calls;
    expect(firstCall).toHaveLength(2);
  });

  // ── AC5 + AC13: null Metric renders label NOT "0"; true-broker-0 distinct ─

  it('AC5/AC13: null Metric renders confidence label and NEVER 0; true-broker-0 renders real zero with broker framing — distinct', () => {
    mockHookState.data = buildInsightsResponse({
      area: {
        medianPricePaise: { value: null, confidenceLabel: 'Limited data' },
        dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
        activeListingCount: { value: null, confidenceLabel: 'Limited data' },
        freshListingCount: { value: null, confidenceLabel: 'Limited data' },
        avgListingQuality: { value: null, confidenceLabel: 'Limited data' },
        topBuyerNeedSignalCount: { value: null, confidenceLabel: 'Not enough data yet' },
      },
      broker: {
        liveListingsInArea: 0,       // TRUE zero — real broker zero, not suppressed
        listingsNeedingAttention: 0,
        enquiriesOnBrokerListings: 0,
        opportunitiesToAct: 0,
      },
    });

    renderPage();

    // (a) Suppressed Metric<T> — render the label, NEVER "0"
    //     "Limited data" should appear for the suppressed shared metrics
    expect(screen.getAllByText('Limited data').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not enough data yet').length).toBeGreaterThan(0);

    // NEVER render "0" as a text node for a null Metric
    const suppressedCards = screen.queryAllByTestId('suppressed-metric-label');
    expect(suppressedCards.length).toBeGreaterThan(0);
    suppressedCards.forEach((card) => {
      expect(card.textContent).not.toBe('0');
      expect(card.textContent?.trim()).not.toBe('0');
    });

    // (b) True-broker-0 — render the NUMERAL 0 prominently + broker-action sub-label.
    // This is DISTINCT from a suppressed-null SharedMetricCard which shows NO number.
    const brokerZeroCards = screen.queryAllByTestId('broker-true-zero');
    expect(brokerZeroCards.length).toBeGreaterThan(0);
    const zeroTexts = brokerZeroCards.map((el) => el.textContent ?? '');
    // The numeral '0' must appear inside the broker-zero element
    expect(zeroTexts.some((t) => t.includes('0'))).toBe(true);
    // Broker-action sub-label must also be present
    expect(zeroTexts.some((t) => /no live listings here yet/i.test(t))).toBe(true);

    // Suppressed-null cards must NOT contain the numeral '0' (they show the label only)
    suppressedCards.forEach((card) => {
      expect(card.textContent?.trim()).not.toBe('0');
      expect(card.textContent).not.toMatch(/^0$/);
    });

    // The two states must NOT look the same (text content differs)
    const suppressedTexts = suppressedCards.map((el) => el.textContent ?? '');
    zeroTexts.forEach((zeroText) => {
      suppressedTexts.forEach((suppressedText) => {
        expect(zeroText).not.toBe(suppressedText);
      });
    });
  });

  // ── AC6: confidence label from DTO, not hardcoded ────────────────────────

  it('AC6: shows DTO confidence label "Limited data" (not "Enough data") over null values', () => {
    mockHookState.data = buildInsightsResponse({
      available: false,
      confidenceLabel: 'Limited data',
      area: {
        medianPricePaise: { value: null, confidenceLabel: 'Limited data' },
        dominantPropertyType: { value: null, confidenceLabel: 'Limited data' },
        activeListingCount: { value: null, confidenceLabel: 'Limited data' },
        freshListingCount: { value: null, confidenceLabel: 'Limited data' },
        avgListingQuality: { value: null, confidenceLabel: 'Limited data' },
        topBuyerNeedSignalCount: { value: null, confidenceLabel: 'Limited data' },
      },
      broker: {
        liveListingsInArea: 1,
        listingsNeedingAttention: 0,
        enquiriesOnBrokerListings: 0,
        opportunitiesToAct: 0,
      },
    });

    renderPage();

    // "Limited data" must appear from the DTO
    expect(screen.getAllByText('Limited data').length).toBeGreaterThan(0);

    // "Enough data" must NOT appear when all values are null
    expect(screen.queryByText('Enough data')).not.toBeInTheDocument();
  });

  // ── AC8: CTA routing — existing routes linked; #1535/#1523 disabled ───────

  it('AC8: enabled CTAs have correct hrefs to existing routes; demand-gaps and compare-areas render disabled', () => {
    mockHookState.data = buildInsightsResponse({
      citySlug: 'udupi',
      areaKey: 'kundapura',
    });

    renderPage('/broker/areas/udupi/kundapura');

    // "View public area page" → /trends?city=...&areaKey=...
    const publicAreaLink = screen.getByTestId('cta-view-public-area');
    expect(publicAreaLink.getAttribute('href')).toMatch(/\/trends\?city=udupi/);
    expect(publicAreaLink.getAttribute('href')).toMatch(/areaKey=/);

    // "Add listing in this area" → /broker/listings/new
    const addListingLink = screen.getByTestId('cta-add-listing');
    expect(addListingLink.getAttribute('href')).toBe('/broker/listings/new');

    // "Open listing quality" → /broker/listing-quality
    const qualityLink = screen.getByTestId('cta-listing-quality');
    expect(qualityLink.getAttribute('href')).toBe('/broker/listing-quality');

    // "View demand gaps" (#1535) → disabled, no href
    const demandGapsBtn = screen.getByTestId('cta-demand-gaps-disabled');
    expect(demandGapsBtn).toBeDisabled();
    expect(demandGapsBtn.tagName).toBe('BUTTON');
    expect(demandGapsBtn).not.toHaveAttribute('href');

    // "Compare areas" (#1523) → disabled, no href
    const compareBtn = screen.getByTestId('cta-compare-areas-disabled');
    expect(compareBtn).toBeDisabled();
    expect(compareBtn.tagName).toBe('BUTTON');
    expect(compareBtn).not.toHaveAttribute('href');
  });

  // ── AC9: broker-action language; no buyer-trend copy ─────────────────────

  it('AC9: broker-action language present; buyer-trend phrasing absent', () => {
    mockHookState.data = buildInsightsResponse();
    renderPage();

    const body = document.body.textContent ?? '';

    // Broker-action copy
    expect(body).toMatch(/your listing/i);
    expect(body).toMatch(/add listing/i);

    // Must NOT contain buyer-facing trend phrasing
    expect(body).not.toMatch(/buyer trend/i);
    expect(body).not.toMatch(/market trend for buyers/i);
    expect(body).not.toMatch(/what buyers are searching/i);
  });

  // ── AC10: isLoading → Skeleton ────────────────────────────────────────────

  it('AC10: renders loading skeleton while isLoading=true', () => {
    mockHookState.isLoading = true;
    mockHookState.data = null;
    renderPage();

    // No section headings should be visible
    expect(screen.queryByText(/area market overview/i)).not.toBeInTheDocument();
    // AppLayout still present, skeleton elements present
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
  });

  // ── AC10: isError → Alert ─────────────────────────────────────────────────

  it('AC10: renders error Alert when isError=true', () => {
    mockHookState.isError = true;
    mockHookState.data = null;
    renderPage();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/could not load area insights/i)).toBeInTheDocument();
    expect(screen.getByText(/retry/i)).toBeInTheDocument();
  });

  // ── AC10: available===false → limited-data state, no fabricated zeros ─────

  it('AC10: shows limited-data state when available===false; null areaLabel humanized from last pipe-segment; no fabricated zeros', () => {
    // areaLabel: null is what the backend returns on the unavailable path.
    // The page must humanize the areaKey's last pipe-segment ("Manipal") rather than showing
    // the raw pipe-delimited string or a blank title.
    mockHookState.data = buildInsightsResponse({
      available: false,
      areaLabel: null,   // backend buildUnavailableResponse returns null
      confidenceLabel: 'Not enough data yet',
      area: {
        medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
        dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
        activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
        freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
        avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
        topBuyerNeedSignalCount: { value: null, confidenceLabel: 'Not enough data yet' },
      },
      broker: {
        liveListingsInArea: 0,
        listingsNeedingAttention: 0,
        enquiriesOnBrokerListings: 0,
        opportunitiesToAct: 0,
      },
    });

    // Use a pipe-delimited areaKey in the route (URL-encoded).
    // React Router decodes %7C → '|', so useParams gives 'IN|KA|Udupi|Manipal'.
    // The page must extract the last segment "Manipal" — never show the raw key or blank.
    renderPage('/broker/areas/udupi/IN%7CKA%7CUdupi%7CManipal');

    // Limited data notice must appear
    expect(screen.getByTestId('limited-data-state')).toBeInTheDocument();

    // H1 must show the humanized last segment, not the raw pipe string or blank
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent?.trim()).toBe('Manipal');
    expect(h1.textContent).not.toContain('|');

    // Suppressed metrics must NOT render "0"
    const suppressedLabels = screen.queryAllByTestId('suppressed-metric-label');
    suppressedLabels.forEach((el) => {
      expect(el.textContent?.trim()).not.toBe('0');
    });
  });
});
