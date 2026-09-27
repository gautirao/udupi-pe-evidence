/**
 * School journey panels — anonymous radius-scope limitation note REMOVED (Issue #1261).
 *
 * History: Issue #1193 added an additive note ("Showing homes in this area only…")
 * because the anonymous school-radius listing set was area-scoped (single areaKey +
 * client haversine) and could not deliver the cross-area proximity result the
 * authenticated path got.
 *
 * Issue #1261 wires the anonymous path to the PUBLIC /school-radius-listings endpoint,
 * which performs the same cross-area ST_DWithin query. The radius circle and the
 * listing set are now consistent for anonymous users, so the limitation note is no
 * longer truthful and has been REMOVED.
 *
 * This spec is the AC2 guard: the note must NOT render in any state — anonymous or
 * authenticated, radius > 0, null, or 0 — for either school-first panel.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SchoolSelectedPanel, AreaSchoolCombinedPanel } from '../SchoolJourneyPanels';
import { DiscoverProvider } from '@/features/discover/context/DiscoverContext';
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
        <DiscoverProvider>
          <SchoolSelectedPanel
            view={{
              chrome: {},
              viewer: { isAuthenticated: props.isAuthenticated },
              school: mockSchool,
              radius: { km: props.radiusKm },
              listings: { data: [], loading: false },
              propertyFilters: {},
              boundedSearch: {},
            }}
            commands={{
              chrome: {},
              radius: { change: vi.fn() },
              listings: {},
              propertyFilters: {},
            }}
          />
        </DiscoverProvider>
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
        <DiscoverProvider>
          <AreaSchoolCombinedPanel
            view={{
              chrome: {},
              viewer: { isAuthenticated: props.isAuthenticated },
              area: mockArea,
              school: mockSchool,
              radius: { km: props.radiusKm },
              listings: { data: [], loading: false },
              propertyFilters: {},
            }}
            commands={{
              chrome: {},
              radius: { change: vi.fn() },
              listings: {},
              propertyFilters: {},
              school: { clear: vi.fn() },
            }}
          />
        </DiscoverProvider>
      </QueryClientProvider>
    </BrowserRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SchoolJourneyPanels — anon radius-scope note removed (Issue #1261)', () => {
  describe('SchoolSelectedPanel', () => {
    it('does NOT render the note for anon users with radiusKm > 0 (cross-area now supported)', () => {
      renderSchoolSelected({ radiusKm: 3, isAuthenticated: false });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('does NOT render the note when radiusKm is null', () => {
      renderSchoolSelected({ radiusKm: null, isAuthenticated: false });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('does NOT render the note when radiusKm is 0', () => {
      renderSchoolSelected({ radiusKm: 0, isAuthenticated: false });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('does NOT render the note for authenticated users', () => {
      renderSchoolSelected({ radiusKm: 3, isAuthenticated: true });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });
  });

  describe('AreaSchoolCombinedPanel', () => {
    it('does NOT render the note for anon users with radiusKm > 0', () => {
      renderCombined({ radiusKm: 3, isAuthenticated: false });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('does NOT render the note when radiusKm is null', () => {
      renderCombined({ radiusKm: null, isAuthenticated: false });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('does NOT render the note when radiusKm is 0', () => {
      renderCombined({ radiusKm: 0, isAuthenticated: false });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });

    it('does NOT render the note for authenticated users', () => {
      renderCombined({ radiusKm: 3, isAuthenticated: true });
      expect(screen.queryByTestId(NOTE_TESTID)).not.toBeInTheDocument();
    });
  });
});
