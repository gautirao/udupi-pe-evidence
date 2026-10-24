/**
 * #2859 batch B5 (umbrella #2750) — L20 BR8.wiring: App.tsx declares the public buyer area route
 * /trends/:citySlug/areas/:areaSlug as <AppLayout><TrendsAreaResolved /></AppLayout>, and the path string
 * App.tsx declares really matches the canonical slug URL the legacy e2e/buyer-area-route-1539.spec.ts
 * navigated to.
 *
 * Two links, one it each:
 *   (a) source text of App.tsx (via the shared appRouteWiring helpers): the <Route> whose element renders
 *       TrendsAreaResolved is declared once, with the exact path, wrapped in AppLayout, lazily imported.
 *   (b) the path value READ FROM App.tsx (not re-typed here) is mounted in a MemoryRouter: the real
 *       TrendsAreaResolved renders at /trends/udupi/areas/malpe; control in the same it: the misspelt
 *       /trends/udupi/areaz/malpe does not mount it (falls to the sibling catch-all).
 *
 * Seams (disclosed, R_injected): the real <App/> tree (providers, RouteErrorBoundary, React.lazy) is NOT
 * mounted; AppLayout is a marker stub; useResolveArea / useAreaIntelligence / useTrendsOptions are mocked
 * (the page's own behaviour is TrendsAreaResolved.test.tsx's job).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import { pathValuesIn, routeOpeningTags, stripComments } from './support/appRouteWiring';

vi.mock('@/components/layout/AppLayout', () => ({
  RoleAwareHeader: () => null,
  AppLayout: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'app-layout-stub' }, children),
}));
vi.mock('@/hooks/useResolveArea');
vi.mock('@/hooks/useAreaIntelligence');
vi.mock('@/hooks/useTrendsOptions');
vi.mock('@/lib/api', () => ({ api: { get: vi.fn().mockResolvedValue({}) } }));

import TrendsAreaResolved from '@/pages/TrendsAreaResolved';
import { AppLayout } from '@/components/layout/AppLayout';
import { useResolveArea } from '@/hooks/useResolveArea';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';

const APP_SRC = stripComments(readFileSync(fileURLToPath(new NodeURL('../App.tsx', import.meta.url)), 'utf-8'));
const EXPECTED_PATH = '/trends/:citySlug/areas/:areaSlug';

/** The opening tags of every <Route> whose element renders TrendsAreaResolved (located by ELEMENT, not by path). */
function trendsAreaRouteTags(): string[] {
  return routeOpeningTags(APP_SRC).filter((t) => /<TrendsAreaResolved\s*\/>/.test(t));
}

describe('App.tsx wiring of /trends/:citySlug/areas/:areaSlug (#2859 B5 L20 BR8.wiring)', () => {
  it('(a) declares the TrendsAreaResolved route once, at the exact path, wrapped in AppLayout, lazily imported', () => {
    // Non-vacuous scan: the helper really sees App.tsx.
    expect(pathValuesIn(APP_SRC).length).toBeGreaterThan(20);

    const tags = trendsAreaRouteTags();
    expect(tags).toHaveLength(1);
    expect(pathValuesIn(tags[0])).toEqual([EXPECTED_PATH]);
    expect(tags[0]).toMatch(/element\s*=\s*\{\s*<AppLayout>\s*<TrendsAreaResolved\s*\/>\s*<\/AppLayout>\s*\}/);
    expect(APP_SRC).toMatch(
      /const\s+TrendsAreaResolved\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*(["'`])\.\/pages\/TrendsAreaResolved\1\s*\)\s*\)/,
    );
  });

  it('(b) the path App.tsx declares mounts the real TrendsAreaResolved at /trends/udupi/areas/malpe; /trends/udupi/areaz/malpe does not', () => {
    const tags = trendsAreaRouteTags();
    expect(tags).toHaveLength(1);
    const declaredPath = pathValuesIn(tags[0])[0];

    vi.mocked(useResolveArea).mockReturnValue({
      data: { citySlug: 'udupi', areaSlug: 'malpe', areaKey: 'IN|KA|Udupi|Malpe', areaLabel: 'Malpe', matched: true },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useResolveArea>);
    vi.mocked(useAreaIntelligence).mockReturnValue({
      data: {
        citySlug: 'udupi',
        areaKey: 'IN|KA|Udupi|Malpe',
        areaLabel: 'Malpe',
        available: true,
        confidenceLabel: 'Enough data',
        metrics: {
          medianPricePaise: { value: null, confidenceLabel: 'Not enough data yet' },
          dominantPropertyType: { value: null, confidenceLabel: 'Not enough data yet' },
          activeListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
          freshListingCount: { value: null, confidenceLabel: 'Not enough data yet' },
          avgListingQuality: { value: null, confidenceLabel: 'Not enough data yet' },
          mostSearchedBudget: { value: null, confidenceLabel: 'Not enough data yet' },
        },
        priceComparison: { supported: false, wording: null },
        listingsCta: { areaKey: 'IN|KA|Udupi|Malpe', label: 'View listings in Malpe' },
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useAreaIntelligence>);
    vi.mocked(useTrendsOptions).mockReturnValue({
      data: { city: 'udupi', defaultAreas: [] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTrendsOptions>);

    const mount = (entry: string) =>
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path={declaredPath} element={<AppLayout><TrendsAreaResolved /></AppLayout>} />
              <Route path="*" element={<div data-testid="no-route-matched" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

    mount('/trends/udupi/areas/malpe');
    expect(screen.getByTestId('app-layout-stub')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Malpe' })).toBeInTheDocument();
    expect(screen.queryByTestId('no-route-matched')).not.toBeInTheDocument();
    // The page read :citySlug / :areaSlug from THIS route's params.
    expect(vi.mocked(useResolveArea)).toHaveBeenCalledWith('udupi', 'malpe');

    // Control: a near-miss URL is not this route.
    cleanup();
    mount('/trends/udupi/areaz/malpe');
    expect(screen.getByTestId('no-route-matched')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Malpe' })).not.toBeInTheDocument();
  });
});
