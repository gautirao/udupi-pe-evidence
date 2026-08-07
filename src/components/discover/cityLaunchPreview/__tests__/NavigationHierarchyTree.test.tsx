/**
 * Issue #1955 (Areas PR A) item 2/5 — NavigationHierarchyTree.
 *
 * Covers: loading/error/empty/success states, depth-flattened row rendering
 * built client-side from the FLAT `nodes` list (NavigationPreviewTreeResponse),
 * and the informational listing-count merge from useDiscoverAreas (keyed by
 * the AREA node's `areaKey`, not `nodeKey` — the node key is "a:" + areaKey).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationHierarchyTree } from '../NavigationHierarchyTree';

const mockUseNavigationTree = vi.hoisted(() => vi.fn());
const mockUseDiscoverAreas = vi.hoisted(() => vi.fn());

import { navigationTreeResponseSchema } from '@/lib/schemas/navigationHierarchy';

vi.mock('@/hooks/useCityLaunchNavigation', () => ({
  useNavigationTree: () => mockUseNavigationTree(),
}));

vi.mock('@/hooks/useDiscoverAreas', () => ({
  useDiscoverAreas: () => mockUseDiscoverAreas(),
}));

// Shaped exactly like NavigationPreviewTreeResponse — a flat `nodes` list,
// not a nested {cityId, root}.
const TREE = {
  revisionId: 42,
  validationStatus: 'VALID',
  validationErrors: [] as string[],
  nodes: [
    {
      nodeKey: 'c:north:manipal',
      nodeType: 'CLUSTER' as const,
      parentNodeKey: null,
      regionKey: 'north',
      areaKey: null,
      displayLabel: 'Udupi',
      depth: 0,
      ancestorKeys: [] as string[],
      representativeAreaKeys: [] as string[],
      displayOrder: 0,
      descendantAreaCount: 1,
      bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.3, minLon: 74.7, maxLat: 13.4, maxLon: 74.8 },
    },
    {
      // Real node keys are "a:" + areaKey, never the bare areaKey.
      nodeKey: 'a:IN|KA|Udupi|Manipal',
      nodeType: 'AREA' as const,
      parentNodeKey: 'c:north:manipal',
      regionKey: 'north',
      areaKey: 'IN|KA|Udupi|Manipal',
      displayLabel: 'Manipal',
      depth: 1,
      ancestorKeys: ['c:north:manipal'],
      representativeAreaKeys: ['IN|KA|Udupi|Manipal'],
      displayOrder: 0,
      descendantAreaCount: 0,
      bounds: { centreLat: 13.351, centreLon: 74.791, minLat: 13.341, minLon: 74.781, maxLat: 13.361, maxLon: 74.801 },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDiscoverAreas.mockReturnValue({ data: undefined, isLoading: false });
});

describe('NavigationHierarchyTree', () => {
  it('renders a skeleton while loading', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    expect(screen.queryByTestId('navigation-hierarchy-tree')).not.toBeInTheDocument();
  });

  it('renders an error state with retry on failure', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    expect(screen.getByText(/failed to load the hierarchy tree/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders every node flattened, built client-side from the flat nodes list', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    expect(screen.getByTestId('nav-node-c:north:manipal')).toBeInTheDocument();
    const areaRow = screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal');
    expect(areaRow).toHaveTextContent('Manipal');
    expect(screen.getByText('AREA')).toBeInTheDocument();
  });

  it('renders a bounds cell for every node', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    expect(screen.getByTestId('nav-node-bounds-c:north:manipal')).toHaveTextContent('13.300, 74.700 — 13.400, 74.800');
    expect(screen.getByTestId('nav-node-bounds-a:IN|KA|Udupi|Manipal')).toHaveTextContent(
      '13.341, 74.781 — 13.361, 74.801',
    );
  });

  it('shows the revision-level validation status banner', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    expect(screen.getByText('VALID')).toBeInTheDocument();
  });

  it('merges the informational listing count onto the matching AREA node, joined on areaKey', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
    mockUseDiscoverAreas.mockReturnValue({
      data: { city: 'x', areas: [{ areaKey: 'IN|KA|Udupi|Manipal', listingCount: 17 } as never] },
      isLoading: false,
    });
    render(<NavigationHierarchyTree />);
    const areaRow = screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal');
    expect(areaRow).toHaveTextContent('17');
  });

  it('shows a dash for the CLUSTER root row (no listing count applies to clusters)', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    const clusterRow = screen.getByTestId('nav-node-c:north:manipal');
    expect(clusterRow).toHaveTextContent('—');
  });

  it('shows the empty state when there are no nodes', () => {
    mockUseNavigationTree.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { ...TREE, nodes: [] },
      refetch: vi.fn(),
    });
    render(<NavigationHierarchyTree />);
    expect(screen.getByText(/no navigation nodes yet/i)).toBeInTheDocument();
  });

  describe('Full recursive hierarchy (Direction -> Local Destination -> Area)', () => {
    const RECURSIVE_TREE = {
      revisionId: 42,
      validationStatus: 'VALID',
      validationErrors: [],
      nodes: [
        {
          nodeKey: 'd:north',
          nodeType: 'DIRECTION' as const,
          parentNodeKey: null,
          regionKey: 'north',
          areaKey: null,
          displayLabel: 'North',
          depth: 0,
          ancestorKeys: [],
          representativeAreaKeys: [],
          displayOrder: 1,
          descendantAreaCount: 2,
          bounds: { centreLat: 13.3, centreLon: 74.7, minLat: 13.0, minLon: 74.0, maxLat: 13.5, maxLon: 75.0 },
        },
        {
          nodeKey: 'c:north:manipal',
          nodeType: 'CLUSTER' as const,
          parentNodeKey: 'd:north',
          regionKey: 'north',
          areaKey: null,
          displayLabel: 'Manipal Area',
          depth: 1,
          ancestorKeys: ['d:north'],
          representativeAreaKeys: [],
          displayOrder: 1,
          descendantAreaCount: 1,
          bounds: { centreLat: 13.35, centreLon: 74.79, minLat: 13.3, minLon: 74.7, maxLat: 13.4, maxLon: 74.8 },
        },
        {
          nodeKey: 'a:IN|KA|Udupi|Manipal',
          nodeType: 'AREA' as const,
          parentNodeKey: 'c:north:manipal',
          regionKey: 'north',
          areaKey: 'IN|KA|Udupi|Manipal',
          displayLabel: 'Manipal',
          depth: 2,
          ancestorKeys: ['d:north', 'c:north:manipal'],
          representativeAreaKeys: ['IN|KA|Udupi|Manipal'],
          displayOrder: 1,
          descendantAreaCount: 0,
          bounds: { centreLat: 13.351, centreLon: 74.791, minLat: 13.341, minLon: 74.781, maxLat: 13.361, maxLon: 74.801 },
        },
      ],
    };

    it('renders the complete hierarchy without schema or build errors', () => {
      // Prove navigationTreeResponseSchema parses it successfully
      expect(() => navigationTreeResponseSchema.parse(RECURSIVE_TREE)).not.toThrow();

      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);
      
      expect(screen.getByTestId('nav-node-d:north')).toBeInTheDocument();
      expect(screen.getByTestId('nav-node-c:north:manipal')).toBeInTheDocument();
      expect(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();
      
      // Proves it renders rows instead of error state
      expect(screen.queryByText(/failed to load the hierarchy tree/i)).not.toBeInTheDocument();
    });
  });
});
