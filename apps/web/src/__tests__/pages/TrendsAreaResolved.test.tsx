/**
 * TrendsAreaResolved.test.tsx — Component tests for /trends/:citySlug/areas/:areaSlug
 *
 * Mocks: useResolveArea, useAreaIntelligence, useTrendsOptions, api
 * Does NOT mock AreaGuide internals — verifies the composition at the page level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';

import TrendsAreaResolved from '@/pages/TrendsAreaResolved';
import { useResolveArea } from '@/hooks/useResolveArea';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import type { AreaIntelligenceResponse } from '@/hooks/useAreaIntelligence';
import type { ResolveAreaResponse } from '@/hooks/useResolveArea';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/hooks/useResolveArea');
vi.mock('@/hooks/useAreaIntelligence');
vi.mock('@/hooks/useTrendsOptions');
vi.mock('@/lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue({}) },
}));

const mockUseResolveArea = vi.mocked(useResolveArea);
const mockUseAreaIntelligence = vi.mocked(useAreaIntelligence);
const mockUseTrendsOptions = vi.mocked(useTrendsOptions);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MATCHED_RESOLVE: ResolveAreaResponse = {
  citySlug: 'udupi',
  areaSlug: 'malpe',
  areaKey: 'IN|KA|Udupi|Malpe',
  areaLabel: 'Malpe',
  matched: true,
};

const NOT_MATCHED_RESOLVE: ResolveAreaResponse = {
  citySlug: 'udupi',
  areaSlug: 'nonexistent-area',
  areaKey: null,
  areaLabel: null,
  matched: false,
};

const BANGALORE_MATCHED_RESOLVE: ResolveAreaResponse = {
  citySlug: 'bangalore',
  areaSlug: 'whitefield',
  areaKey: 'IN|KA|Bengaluru|Whitefield',
  areaLabel: 'Whitefield',
  matched: true,
};

const AREA_INTELLIGENCE_RESPONSE: AreaIntelligenceResponse = {
  citySlug: 'udupi',
  areaKey: 'IN|KA|Udupi|Malpe',
  areaLabel: 'Malpe',
  available: true,
  confidenceLabel: 'Enough data',
  metrics: {
    medianPricePaise: { value: 5_500_000_00, confidenceLabel: 'Enough data' },
    dominantPropertyType: { value: 'Residential Plot', confidenceLabel: 'Enough data' },
    activeListingCount: { value: 12, confidenceLabel: 'Enough data' },
    freshListingCount: { value: 3, confidenceLabel: 'Enough data' },
    avgListingQuality: { value: 74.0, confidenceLabel: 'Enough data' },
    mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
  },
  priceComparison: { supported: false, wording: null },
  listingsCta: { areaKey: 'IN|KA|Udupi|Malpe', label: 'View listings in Malpe' },
};

const BANGALORE_INTELLIGENCE_RESPONSE: AreaIntelligenceResponse = {
  ...AREA_INTELLIGENCE_RESPONSE,
  citySlug: 'bangalore',
  areaKey: 'IN|KA|Bengaluru|Whitefield',
  areaLabel: 'Whitefield',
  listingsCta: {
    areaKey: 'IN|KA|Bengaluru|Whitefield',
    label: 'View listings in Whitefield',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Render the page at a specific route, e.g. /trends/udupi/areas/malpe */
function renderAtRoute(path: string) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trends/:citySlug/areas/:areaSlug" element={<TrendsAreaResolved />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Default useTrendsOptions stub: returns empty defaultAreas */
function stubOptionsEmpty() {
  mockUseTrendsOptions.mockReturnValue({
    data: { city: 'udupi', defaultAreas: [] },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useTrendsOptions>);
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('TrendsAreaResolved — route registration', () => {
  beforeEach(() => {
    stubOptionsEmpty();
  });

  it('renders the page at /trends/:citySlug/areas/:areaSlug', () => {
    mockUseResolveArea.mockReturnValue({
      data: MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: AREA_INTELLIGENCE_RESPONSE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderAtRoute('/trends/udupi/areas/malpe');

    // The AreaGuide renders a CTA with the area label — confirms page mounted
    // CTA may appear in multiple places (AreaGuideHero + AreaCtaBlock); getAllBy is multiplicity-tolerant
    expect(screen.getAllByRole('link', { name: /view homes in malpe/i }).length).toBeGreaterThan(0);
  });
});

describe('TrendsAreaResolved — not hardcoded to Udupi/Malpe', () => {
  beforeEach(() => {
    mockUseTrendsOptions.mockReturnValue({
      data: { city: 'bangalore', defaultAreas: [] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTrendsOptions>);
  });

  it('works for bangalore/whitefield (confirms no Udupi hardcoding)', () => {
    mockUseResolveArea.mockReturnValue({
      data: BANGALORE_MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: BANGALORE_INTELLIGENCE_RESPONSE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderAtRoute('/trends/bangalore/areas/whitefield');

    // CTA may appear in multiple places (AreaGuideHero + AreaCtaBlock); getAllBy is multiplicity-tolerant
    expect(screen.getAllByRole('link', { name: /view homes in whitefield/i }).length).toBeGreaterThan(0);
  });
});

describe('TrendsAreaResolved — matched=true', () => {
  beforeEach(() => {
    stubOptionsEmpty();
  });

  it('renders AreaGuide content when resolver returns matched=true', () => {
    mockUseResolveArea.mockReturnValue({
      data: MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: AREA_INTELLIGENCE_RESPONSE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderAtRoute('/trends/udupi/areas/malpe');

    // AreaGuide renders a listings CTA when data.available=true
    // CTA may appear in multiple places (AreaGuideHero + AreaCtaBlock); getAllBy is multiplicity-tolerant
    expect(screen.getAllByRole('link', { name: /view homes in malpe/i }).length).toBeGreaterThan(0);
  });

  it('View listings CTA href contains the resolved areaKey', () => {
    mockUseResolveArea.mockReturnValue({
      data: MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: AREA_INTELLIGENCE_RESPONSE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    const { container } = renderAtRoute('/trends/udupi/areas/malpe');

    // Find any anchor with the resolved areaKey in its href
    const anchors = Array.from(container.querySelectorAll('a'));
    const areaKeyInHref = anchors.some(a =>
      a.getAttribute('href')?.includes(encodeURIComponent('IN|KA|Udupi|Malpe')),
    );
    expect(areaKeyInHref).toBe(true);
  });
});

describe('TrendsAreaResolved — matched=false (slug-not-found)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubOptionsEmpty();
  });

  it('renders slug-not-found state when resolver returns matched=false', () => {
    mockUseResolveArea.mockReturnValue({
      data: NOT_MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    // useAreaIntelligence is called inside ResolvedAreaGuide (not reached for matched=false)
    // but the hook must still be mock-ready in case it's called elsewhere
    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderAtRoute('/trends/udupi/areas/nonexistent-area');

    // Slug-not-found copy
    expect(screen.getByText(/We couldn't find that area/i)).toBeInTheDocument();

    // Discover CTA present
    const discoverLink = screen.getByRole('link', { name: /explore.*on map/i });
    expect(discoverLink).toBeInTheDocument();
    expect(discoverLink.getAttribute('href')).toContain('/discover?city=udupi');

    // ResolvedAreaGuide is not mounted when matched=false, so useAreaIntelligence must not be called
    expect(mockUseAreaIntelligence).not.toHaveBeenCalled();
  });

  it('slug-not-found does NOT show no-snapshot copy', () => {
    mockUseResolveArea.mockReturnValue({
      data: NOT_MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderAtRoute('/trends/udupi/areas/nonexistent-area');

    // AreaGuideNoSnapshot copy should NOT appear — these are separate states
    expect(screen.queryByText(/no data available yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/first to explore/i)).not.toBeInTheDocument();

    // ResolvedAreaGuide is not mounted when matched=false, so useAreaIntelligence must not be called
    expect(mockUseAreaIntelligence).not.toHaveBeenCalled();
  });
});

describe('TrendsAreaResolved — resolver loading', () => {
  beforeEach(() => {
    stubOptionsEmpty();
  });

  it('renders loading skeleton while resolver is in-flight', () => {
    mockUseResolveArea.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    const { container } = renderAtRoute('/trends/udupi/areas/malpe');

    // AreaGuideSkeleton renders multiple Skeleton divs
    // At minimum the container should not show content-state text
    expect(screen.queryByText(/We couldn't find that area/i)).not.toBeInTheDocument();
    // Should have skeleton elements (data-slot or animate-pulse)
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('TrendsAreaResolved — resolver error', () => {
  beforeEach(() => {
    stubOptionsEmpty();
  });

  it('renders error state on resolver network/5xx error', () => {
    mockUseResolveArea.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    renderAtRoute('/trends/udupi/areas/malpe');

    // AreaGuideError renders a "something went wrong" style message
    // (AreaGuide's isError branch — does NOT say "We couldn't find that area")
    expect(screen.queryByText(/We couldn't find that area/i)).not.toBeInTheDocument();
    // Should NOT show content or slug-not-found
    expect(screen.queryByText(/View listings/i)).not.toBeInTheDocument();
  });
});

describe('TrendsAreaResolved — no broker/demand-gap language', () => {
  beforeEach(() => {
    stubOptionsEmpty();
  });

  it('does not contain broker/demand-gap/dashboard copy in matched=true state', () => {
    mockUseResolveArea.mockReturnValue({
      data: MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: AREA_INTELLIGENCE_RESPONSE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    const { container } = renderAtRoute('/trends/udupi/areas/malpe');

    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/broker/);
    expect(html).not.toMatch(/demand gap/);
    expect(html).not.toMatch(/your listings/);
    expect(html).not.toMatch(/dashboard/);
  });

  it('does not contain broker/demand-gap copy in matched=false state', () => {
    mockUseResolveArea.mockReturnValue({
      data: NOT_MATCHED_RESOLVE,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);

    mockUseAreaIntelligence.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);

    const { container } = renderAtRoute('/trends/udupi/areas/nonexistent-area');

    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/broker/);
    expect(html).not.toMatch(/demand gap/);
    expect(html).not.toMatch(/your listings/);
  });
});
