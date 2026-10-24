/**
 * #2859 B7 (issue 285907) WEB slice B1 — discover-bounded-listing-2087, assertions 2087-2 / 2087-3 (R_control form).
 *
 * The existing NavigationLevelPanel.test.tsx proves the Browse-all CTA eligibility bound in SEPARATE its: the
 * 15-in positive lives in one it, and each negative ("16 is ineligible", "never at the city ROOT") in another, so
 * the negatives have no same-it positive control (R_control). This file puts the positive control and both
 * negatives in ONE it, using the SAME real component, so a CTA that never renders (or is absent for an unrelated
 * reason) cannot satisfy the negatives.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationLevelPanel } from '../NavigationLevelPanel';
import type { UseAreasNavigationJourneyResult } from '@/features/discover/navigation/useAreasNavigationJourney';
import type { NavigationNodeResponse } from '@/features/discover/navigation/types';

function makeNode(overrides: Partial<NavigationNodeResponse> = {}): NavigationNodeResponse {
  return {
    nodeKey: 'd:n',
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

function makeJourney(
  overrides: Partial<UseAreasNavigationJourneyResult> = {},
): Pick<
  UseAreasNavigationJourneyResult,
  'node' | 'levelKind' | 'children' | 'resolutionNotice' | 'nodeCount' | 'selectNode'
> {
  return {
    node: makeNode(),
    levelKind: 'directions',
    children: [],
    resolutionNotice: null,
    nodeCount: { listingCount: 999, schoolCount: 5, matchingAreaCount: 42 },
    selectNode: vi.fn(),
    ...overrides,
  };
}

const CTA = 'browse-node-listings-cta';

describe('#2859 B7 2087-2/2087-3 — Browse-all CTA eligibility bound, positive control + both negatives in one it', () => {
  it('the CTA shows at 15 descendant areas (control), is absent at 16, and is absent at the city ROOT even with 10 descendant areas', () => {
    // CONTROL (positive): exactly 15 descendant areas on a non-root node -> the CTA is rendered by this component.
    const at15 = render(
      <NavigationLevelPanel
        journey={makeJourney({ node: makeNode({ descendantAreaKeys: new Array(15).fill('a') }) })}
        onBrowseListings={vi.fn()}
      />,
    );
    expect(screen.getByTestId(CTA)).toBeInTheDocument();
    at15.unmount();

    // NEGATIVE 1: 16 descendant areas exceeds the bound -> same component, same props shape, no CTA.
    const at16 = render(
      <NavigationLevelPanel
        journey={makeJourney({ node: makeNode({ descendantAreaKeys: new Array(16).fill('a') }) })}
        onBrowseListings={vi.fn()}
      />,
    );
    // the panel itself rendered (it is the 16-area node, not a blank render)
    expect(screen.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', 'd:n');
    expect(screen.queryByTestId(CTA)).not.toBeInTheDocument();
    at16.unmount();

    // NEGATIVE 2: the synthetic city ROOT with only 10 descendant areas (inside the bound) -> no CTA.
    render(
      <NavigationLevelPanel
        journey={makeJourney({
          node: makeNode({ nodeKey: 'root', nodeType: 'ROOT', descendantAreaKeys: new Array(10).fill('a') }),
        })}
        onBrowseListings={vi.fn()}
      />,
    );
    expect(screen.getByTestId('navigation-level-panel')).toHaveAttribute('data-node-key', 'root');
    expect(screen.queryByTestId(CTA)).not.toBeInTheDocument();
  });
});
