/**
 * Issue #1064 AC3/AC4 — DiscoverRightPanel must distinguish three states when
 * the URL declares an areaKey but `selectedArea` is null:
 *  (a) areas still loading → skeleton/spinner panel
 *  (b) areas loaded → "Area not found" error panel
 *  (c) areaKey resolved → real selected-area / schools-in-area panel renders
 *
 * Previously, both (a) and (b) silently fell back to GuidedEntryPanel, which is
 * the user-visible symptom in the Malpe school-first deep-link bug.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverRightPanel } from '../DiscoverRightPanel';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';
import type { SchoolResult } from '@/hooks/useSchoolSearch';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// SchoolsInAreaPanel internally calls useDiscoverAreas (useQuery) — stub it.
vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: vi.fn(() => ({ data: { city: 'udupi', areas: [] }, isLoading: false })),
}));

const MALPE_AREA_KEY = 'IN|KA|Udupi|Malpe';

const makeArea = (areaKey: string, areaLabel: string): AreaPoint => ({
  areaKey,
  areaLabel,
  geo_center_lat: 13.35,
  geo_center_lon: 74.7,
  bbox: null,
  listingCount: 0,
});

const baseProps = {
  onStartOver: vi.fn(),
  onSelectJourney: vi.fn(),
};

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Issue #1953 (build step 2) — SchoolsInAreaPanel (rendered by DiscoverRightPanel
// for 'schools-in-area'/'area-selected' content) now consumes the DiscoverProvider
// facade instead of calling useDiscoverUrlState() directly, so the tree needs a
// real provider above it (inside the Router, since DiscoverProvider itself reads
// useSearchParams).
const renderPanel = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        <DiscoverProvider>{ui}</DiscoverProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('Issue #1064 — DiscoverRightPanel area hydration branches', () => {
  describe('area-selected route', () => {
    it('(a) renders hydration skeleton when urlAreaKey set, selectedArea null, isLoadingAreas=true', () => {
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="area-selected"
          areas={[]}
          selectedArea={null}
          urlAreaKey={MALPE_AREA_KEY}
          isLoadingAreas={true}
        />,
      );
      expect(screen.getByTestId('discover-area-hydrating')).toBeInTheDocument();
      // GuidedEntryPanel signature element must NOT render (regression guard).
      expect(screen.queryByTestId('guided-entry-panel')).not.toBeInTheDocument();
    });

    it('(b) renders "Area not found" when urlAreaKey set, selectedArea null, isLoadingAreas=false', () => {
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="area-selected"
          areas={[]}
          selectedArea={null}
          urlAreaKey={MALPE_AREA_KEY}
          isLoadingAreas={false}
        />,
      );
      const errBox = screen.getByTestId('discover-area-not-found');
      expect(errBox).toBeInTheDocument();
      expect(errBox).toHaveTextContent('Area not found');
      expect(errBox).toHaveTextContent(MALPE_AREA_KEY);
      expect(screen.getByRole('button', { name: /back to discover/i })).toBeInTheDocument();
      expect(screen.queryByTestId('guided-entry-panel')).not.toBeInTheDocument();
    });

    it('(c) renders selected-area panel when selectedArea resolves', () => {
      const area = makeArea(MALPE_AREA_KEY, 'Malpe');
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="area-selected"
          areas={[area]}
          selectedArea={area}
          urlAreaKey={MALPE_AREA_KEY}
          isLoadingAreas={false}
          areaListings={[]}
          isLoadingListings={false}
          journey="area-first"
        />,
      );
      // 'Malpe' appears in both the breadcrumb area crumb and the area heading (a4 redesign).
      expect(screen.getAllByText('Malpe').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId('discover-area-hydrating')).not.toBeInTheDocument();
      expect(screen.queryByTestId('discover-area-not-found')).not.toBeInTheDocument();
    });

    it('falls back to GuidedEntryPanel only when urlAreaKey is absent (no regression for empty state)', () => {
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="area-selected"
          areas={[]}
          selectedArea={null}
          urlAreaKey={null}
          isLoadingAreas={false}
        />,
      );
      expect(screen.getByTestId('guided-entry-panel')).toBeInTheDocument();
    });
  });

  describe('schools-in-area route', () => {
    const knownSchool: SchoolResult = {
      id: 's-1',
      name: 'Kodavoor School',
      latitude: 13.354,
      longitude: 74.708,
      board: 'STATE',
      category: 'PRIMARY',
      city: 'udupi',
      areaKey: MALPE_AREA_KEY,
    } as unknown as SchoolResult;

    it('(a) renders hydration skeleton when urlAreaKey set, selectedArea null, isLoadingAreas=true', () => {
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="schools-in-area"
          areas={[]}
          selectedArea={null}
          urlAreaKey={MALPE_AREA_KEY}
          isLoadingAreas={true}
          schools={[]}
          schoolsLoading={false}
          journey="school-first"
        />,
      );
      expect(screen.getByTestId('discover-area-hydrating')).toBeInTheDocument();
      expect(screen.queryByTestId('guided-entry-panel')).not.toBeInTheDocument();
    });

    it('(b) renders "Area not found" when urlAreaKey set, selectedArea null, isLoadingAreas=false', () => {
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="schools-in-area"
          areas={[]}
          selectedArea={null}
          urlAreaKey={MALPE_AREA_KEY}
          isLoadingAreas={false}
          schools={[]}
          schoolsLoading={false}
          journey="school-first"
        />,
      );
      expect(screen.getByTestId('discover-area-not-found')).toHaveTextContent(MALPE_AREA_KEY);
      expect(screen.queryByTestId('guided-entry-panel')).not.toBeInTheDocument();
    });

    it('(c) renders SchoolsInAreaPanel with school names when selectedArea resolves', () => {
      const area = makeArea(MALPE_AREA_KEY, 'Malpe');
      renderPanel(
        <DiscoverRightPanel
          {...baseProps}
          panelContent="schools-in-area"
          areas={[area]}
          selectedArea={area}
          urlAreaKey={MALPE_AREA_KEY}
          isLoadingAreas={false}
          schools={[knownSchool]}
          schoolsLoading={false}
          journey="school-first"
        />,
      );
      expect(screen.getByText('Kodavoor School')).toBeInTheDocument();
      expect(screen.queryByTestId('discover-area-hydrating')).not.toBeInTheDocument();
      expect(screen.queryByTestId('discover-area-not-found')).not.toBeInTheDocument();
    });
  });
});
