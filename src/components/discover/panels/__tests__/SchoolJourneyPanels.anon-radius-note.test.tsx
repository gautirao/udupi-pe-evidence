/**
 * School journey panels — anonymous radius-scope limitation note (Issue #1193).
 *
 * Bug: anonymous users in school-first Discover see a radius circle implying a
 * cross-area search, but the anon listing set is area-scoped (single areaKey +
 * client haversine) because anon cannot hit the auth-only ST_DWithin
 * /api/discover/markers query. The additive note honestly communicates the
 * area-scope constraint.
 *
 * Gate (verbatim): !isAuthenticated && radiusKm != null && radiusKm > 0
 *  - anon + radiusKm > 0 → note renders ("within {radiusKm} km")
 *  - radiusKm null       → absent (default not yet resolved)
 *  - radiusKm 0          → absent (#1210 edge — must not read "within 0 km")
 *  - authenticated       → absent (auth path performs the real cross-area query)
 *
 * The note is derived from existing props only — no new query/effect/network.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import type { SchoolResult } from '@/hooks/useSchoolSearch';
import type { AreaPoint } from '@/components/map/AreaMarkerLayer';

// ── Fixtures ────────────────────────────────────────────────────────────────

const mockSchool: SchoolResult = {
  id: 'sch-1',
  name: 'Manipal Public School',
  board: 'CBSE',
  boardType: null,
  latitude: 13.35,
  longitude: 74.79,
  address: 'Manipal',
  distanceKm: 0.5,
  areaKey: 'IN|KA|Udupi|Manipal',
};

const mockArea: AreaPoint = {
  areaKey: 'IN|KA|Udupi|Manipal',
  areaLabel: 'Manipal',
  geo_center_lat: 13.35,
  geo_center_lon: 74.79,
  bbox: null,
};

const NOTE_TESTID = 'anon-school-radius-limit-note';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderSchoolSelected(
  props: { radiusKm: number | null; isAuthenticated?: boolean },
) {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={makeQC()}>
        <SchoolSelectedPanel
          school={mockSchool}
          listings={[]}
          isLoadingListings={false}
          radiusKm={props.radiusKm}
          onRadiusChange={vi.fn()}
          isAuthenticated={props.isAuthenticated}
        />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

function renderCombined(
  props: { radiusKm: number | null; isAuthenticated?: boolean },
) {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={makeQC()}>
        <AreaSchoolCombinedPanel
          selectedArea={mockArea}
          selectedSchool={mockSchool}
          listings={[]}
          isLoadingListings={false}
          radiusKm={props.radiusKm}
          onRadiusChange={vi.fn()}
          onClearSchool={vi.fn()}
          onClearArea={vi.fn()}
          isAuthenticated={props.isAuthenticated}
        />
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchoolJourneyPanels — anon radius-scope note (Issue #1193)', () => {
  describe('SchoolSelectedPanel', () => {
    it('renders the note for anon users with radiusKm > 0', () => {
      renderSchoolSelected({ radiusKm: 3, isAuthenticated: false });

      const note = screen.getByTestId(NOTE_TESTID);
      expect(note).toBeInTheDocument();
      expect(note).toHaveTextContent('3 km');
    });

    it('omits the note when radiusKm is null (default not yet resolved)', () => {
      renderSchoolSelected({ radiusKm: null, isAuthenticated: false });

      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('omits the note when radiusKm is 0 (#1210 edge — never "within 0 km")', () => {
      renderSchoolSelected({ radiusKm: 0, isAuthenticated: false });

      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('omits the note for authenticated users (auth path does the real query)', () => {
      renderSchoolSelected({ radiusKm: 3, isAuthenticated: true });

      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });
  });

  describe('AreaSchoolCombinedPanel', () => {
    it('renders the note for anon users with radiusKm > 0', () => {
      renderCombined({ radiusKm: 3, isAuthenticated: false });

      const note = screen.getByTestId(NOTE_TESTID);
      expect(note).toBeInTheDocument();
      expect(note).toHaveTextContent('3 km');
    });

    it('omits the note when radiusKm is null (default not yet resolved)', () => {
      renderCombined({ radiusKm: null, isAuthenticated: false });

      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('omits the note when radiusKm is 0 (#1210 edge — never "within 0 km")', () => {
      renderCombined({ radiusKm: 0, isAuthenticated: false });

      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('omits the note for authenticated users', () => {
      renderCombined({ radiusKm: 3, isAuthenticated: true });

      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });
  });
});
