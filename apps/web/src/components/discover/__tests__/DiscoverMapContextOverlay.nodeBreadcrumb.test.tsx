/**
 * DiscoverMapContextOverlay — Issue #1956 PR 2 (Slice 5).
 *
 * Covers the new `canonicalNavigationNode` branch (renders
 * `AreasBreadcrumbTrail`, takes priority over every legacy branch) and the
 * MV-1 regression fix (the legacy `map-group-breadcrumb` branch now carries a
 * bounded `containerClassName`). JSDOM cannot prove real clipping — this
 * suite asserts the class is present, not rendered width; AC5.14's true
 * no-clip claim needs the real-browser pass.
 */
import type { ComponentProps } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverMapContextOverlay } from '../DiscoverMapContextOverlay';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'd:north',
    nodeType: 'DIRECTION',
    displayLabel: 'North Bangalore',
    depth: 0,
    regionKey: 'north',
    ancestry: [{ nodeKey: 'root', nodeType: 'ROOT', displayLabel: 'Bangalore', displayOrder: 0 }],
    nextLevelType: 'AREA',
    children: [],
    revisionId: 1,
    bounds: null,
    descendantAreaKeys: null,
    areaKey: null,
    ...overrides,
  };
}

const BASE_PROPS = {
  isAreaFirstCityLanding: false,
  showSchoolBreadcrumb: false,
  areaJourneySegments: [],
  schoolJourneySegments: [],
  selectedArea: null,
  focusedGroup: null,
  city: 'bangalore',
};

const renderOverlay = (props: Partial<ComponentProps<typeof DiscoverMapContextOverlay>> = {}) =>
  render(
    <MemoryRouter>
      <DiscoverMapContextOverlay {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  );

describe('DiscoverMapContextOverlay — canonicalNavigationNode branch (Slice 5)', () => {
  it('renders AreasBreadcrumbTrail when canonicalNavigationNode is resolved', () => {
    renderOverlay({ canonicalNavigationNode: makeNode(), buildNavigationNodeHref: (k) => `?node=${k}` });
    expect(screen.getByTestId('areas-breadcrumb-trail')).toBeInTheDocument();
    expect(screen.queryByTestId('map-group-breadcrumb')).not.toBeInTheDocument();
  });

  it('takes priority over isAreaFirstCityLanding (closes the overlay-vs-panel breadcrumb defect)', () => {
    renderOverlay({
      isAreaFirstCityLanding: true,
      canonicalNavigationNode: makeNode(),
      buildNavigationNodeHref: (k) => `?node=${k}`,
    });
    expect(screen.getByTestId('areas-breadcrumb-trail')).toBeInTheDocument();
    expect(screen.queryByTestId('area-first-landing-breadcrumb')).not.toBeInTheDocument();
  });

  it('takes priority over showSchoolBreadcrumb', () => {
    renderOverlay({
      showSchoolBreadcrumb: true,
      schoolJourneySegments: [{ key: 'city', label: 'Bangalore' }],
      canonicalNavigationNode: makeNode(),
      buildNavigationNodeHref: (k) => `?node=${k}`,
    });
    expect(screen.getByTestId('areas-breadcrumb-trail')).toBeInTheDocument();
    expect(screen.queryByTestId('school-journey-breadcrumb')).not.toBeInTheDocument();
  });

  it('takes priority over the legacy areaJourneySegments fallback', () => {
    renderOverlay({
      areaJourneySegments: [
        { key: 'home', label: 'Home' },
        { key: 'city', label: 'Bangalore' },
        { key: 'areas', label: 'Areas', current: true },
      ],
      canonicalNavigationNode: makeNode(),
      buildNavigationNodeHref: (k) => `?node=${k}`,
    });
    expect(screen.getByTestId('areas-breadcrumb-trail')).toBeInTheDocument();
    expect(screen.queryByTestId('map-group-breadcrumb')).not.toBeInTheDocument();
  });

  it('falls back to legacy behaviour, unaffected, when canonicalNavigationNode is null', () => {
    renderOverlay({
      areaJourneySegments: [
        { key: 'home', label: 'Home' },
        { key: 'city', label: 'Bangalore' },
      ],
      canonicalNavigationNode: null,
    });
    expect(screen.queryByTestId('areas-breadcrumb-trail')).not.toBeInTheDocument();
    expect(screen.getByTestId('map-group-breadcrumb')).toBeInTheDocument();
  });
});

describe('DiscoverMapContextOverlay — MV-1 regression fix (AC5.14)', () => {
  it('the legacy map-group-breadcrumb branch now carries a bounded containerClassName', () => {
    renderOverlay({
      areaJourneySegments: [
        { key: 'home', label: 'Home' },
        { key: 'city', label: 'Bangalore' },
      ],
    });
    const nav = screen.getByTestId('map-group-breadcrumb');
    expect(nav.className).toMatch(/max-w-\[min\(88vw,520px\)\]/);
  });
});
