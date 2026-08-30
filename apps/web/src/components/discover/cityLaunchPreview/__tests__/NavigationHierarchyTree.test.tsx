/**
 * Issue #2121 — NavigationHierarchyTree, reworked from a fully-flattened
 * table into an expandable/collapsible tree inspector.
 *
 * Covers: loading/error/empty states (retained from #1955), the default
 * conservative expansion policy, expand/collapse (single node + all),
 * label search with ancestor auto-expansion, inline metadata, the
 * technical-details popover, and the retained Table view. Both views are
 * built from the SAME `buildNavigationForest` result — no duplicated
 * parent/child derivation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
// not a nested {cityId, root}. A 2-level tree: default expansion (depth 0)
// exposes the AREA child without any interaction.
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

// A 3-level tree (Direction -> Cluster -> Area) — under the default
// (depth-0-only) expansion policy, only the DIRECTION starts open.
const RECURSIVE_TREE = {
  revisionId: 42,
  validationStatus: 'VALID',
  validationErrors: [] as string[],
  nodes: [
    {
      nodeKey: 'd:north',
      nodeType: 'DIRECTION' as const,
      parentNodeKey: null,
      regionKey: 'north',
      areaKey: null,
      displayLabel: 'North',
      depth: 0,
      ancestorKeys: [] as string[],
      representativeAreaKeys: [] as string[],
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
      representativeAreaKeys: [] as string[],
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

  it('shows the revision-level validation status banner', () => {
    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);
    expect(screen.getByText('VALID')).toBeInTheDocument();
  });

  describe('default expansion policy', () => {
    it('starts a depth-0 parent expanded, revealing its direct child', () => {
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);
      const root = screen.getByTestId('nav-node-c:north:manipal');
      expect(root).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();
    });

    it('starts a deeper (depth-1) parent collapsed, hiding its descendants', () => {
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);
      expect(screen.getByTestId('nav-node-d:north')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('nav-node-c:north:manipal')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('nav-node-a:IN|KA|Udupi|Manipal')).not.toBeInTheDocument();
    });
  });

  describe('expand / collapse interaction', () => {
    it('expanding a node reveals its direct children; collapsing hides descendants again', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      expect(screen.queryByTestId('nav-node-a:IN|KA|Udupi|Manipal')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('nav-node-toggle-c:north:manipal'));
      expect(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();

      await user.click(screen.getByTestId('nav-node-toggle-c:north:manipal'));
      expect(screen.queryByTestId('nav-node-a:IN|KA|Udupi|Manipal')).not.toBeInTheDocument();
    });

    it('is keyboard-operable: Enter on a focused toggle button expands the node', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      const toggle = screen.getByTestId('nav-node-toggle-c:north:manipal');
      toggle.focus();
      expect(toggle).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();
    });

    it('Expand all reveals every descendant; Collapse all hides them again', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      await user.click(screen.getByTestId('hierarchy-expand-all'));
      expect(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();

      await user.click(screen.getByTestId('hierarchy-collapse-all'));
      expect(screen.queryByTestId('nav-node-c:north:manipal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('nav-node-a:IN|KA|Udupi|Manipal')).not.toBeInTheDocument();
      expect(screen.getByTestId('nav-node-d:north')).toBeInTheDocument();
    });
  });

  describe('label search', () => {
    it('reveals a matching deep AREA with its ancestry auto-expanded', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      expect(screen.queryByTestId('nav-node-a:IN|KA|Udupi|Manipal')).not.toBeInTheDocument();

      await user.type(screen.getByTestId('hierarchy-search-input'), 'Manipal');

      expect(screen.getByTestId('nav-node-c:north:manipal')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();
    });
  });

  describe('node metadata', () => {
    it('renders node type, direct child count, and descendant area count', () => {
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);
      const root = screen.getByTestId('nav-node-c:north:manipal');
      expect(within(root).getByText('CLUSTER')).toBeInTheDocument();
      expect(within(root).getByText(/1 child/)).toBeInTheDocument();
      expect(within(root).getByText(/1 area/)).toBeInTheDocument();
    });

    it('merges the informational listing count onto the matching AREA node, joined on areaKey', () => {
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      mockUseDiscoverAreas.mockReturnValue({
        data: { city: 'x', areas: [{ areaKey: 'IN|KA|Udupi|Manipal', listingCount: 17 } as never] },
        isLoading: false,
      });
      render(<NavigationHierarchyTree />);
      const areaNode = screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal');
      expect(within(areaNode).getByText(/17 listings?/)).toBeInTheDocument();
    });
  });

  describe('technical details popover', () => {
    it('keeps node key / bounds / representatives out of the row, shown via the details control', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      const root = screen.getByTestId('nav-node-c:north:manipal');
      expect(within(root).queryByText('c:north:manipal')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('nav-node-details-c:north:manipal'));
      expect(await screen.findByText('c:north:manipal')).toBeInTheDocument();
      expect(screen.getByTestId('nav-node-bounds-c:north:manipal')).toHaveTextContent(
        '13.300, 74.700 — 13.400, 74.800',
      );
    });

    it('renders dashes safely when optional fields are omitted or null', async () => {
      const user = userEvent.setup();
      const NULLISH_TREE = {
        revisionId: 42,
        validationStatus: 'VALID',
        validationErrors: [] as string[],
        nodes: [
          {
            nodeKey: 'c:missing',
            nodeType: 'CLUSTER' as const,
            displayLabel: 'Missing Fields Node',
            depth: 0,
            displayOrder: 0,
            descendantAreaCount: 0,
            // Intentionally omitting optional fields
          },
        ],
      };
      expect(() => navigationTreeResponseSchema.parse(NULLISH_TREE)).not.toThrow();

      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: NULLISH_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      expect(screen.getByTestId('nav-node-c:missing')).toBeInTheDocument();
      await user.click(screen.getByTestId('nav-node-details-c:missing'));
      expect(await screen.findByTestId('nav-node-bounds-c:missing')).toHaveTextContent('—');
    });
  });

  describe('Table view', () => {
    it('switching to Table view renders the flattened technical table, and back', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      expect(screen.queryByTestId('navigation-hierarchy-table')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('hierarchy-view-table'));
      expect(screen.getByTestId('navigation-hierarchy-table')).toBeInTheDocument();
      // The table is a full flatten — every node renders regardless of tree expansion state.
      expect(screen.getByTestId('nav-table-row-a:IN|KA|Udupi|Manipal')).toBeInTheDocument();
      expect(screen.getByTestId('nav-table-bounds-d:north')).toHaveTextContent(
        '13.000, 74.000 — 13.500, 75.000',
      );

      await user.click(screen.getByTestId('hierarchy-view-tree'));
      expect(screen.queryByTestId('navigation-hierarchy-table')).not.toBeInTheDocument();
      expect(screen.getByTestId('navigation-hierarchy-tree-view')).toBeInTheDocument();
    });
  });

  it('parses and renders the full recursive hierarchy without schema or build errors', () => {
    expect(() => navigationTreeResponseSchema.parse(RECURSIVE_TREE)).not.toThrow();

    mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
    render(<NavigationHierarchyTree />);

    expect(screen.getByTestId('nav-node-d:north')).toBeInTheDocument();
    expect(screen.queryByText(/failed to load the hierarchy tree/i)).not.toBeInTheDocument();
  });

  // Issue #2207 — single-node selection, independent of expand/collapse.
  describe('node selection', () => {
    it('selecting a node does not expand/collapse it, and toggling expand does not change/clear selection', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      // c:north:manipal starts collapsed under the default expansion policy.
      await user.click(screen.getByTestId('nav-node-c:north:manipal'));
      expect(screen.getByTestId('nav-node-c:north:manipal')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('nav-node-c:north:manipal')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByTestId('hierarchy-selection-panel')).toBeInTheDocument();

      await user.click(screen.getByTestId('nav-node-toggle-c:north:manipal'));
      expect(screen.getByTestId('nav-node-c:north:manipal')).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByTestId('nav-node-c:north:manipal')).toHaveAttribute('aria-selected', 'true');
    });

    it('is keyboard-operable: Enter on a focused row selects it, with aria-selected on the same element that owns focus', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      const row = screen.getByTestId('nav-node-c:north:manipal');
      // Regression guard (code-review follow-up): aria-selected must live on
      // the SAME element that receives keyboard focus, not a nested one —
      // otherwise assistive tech never announces the "now selected" state.
      row.focus();
      expect(row).toHaveFocus();
      expect(row).toHaveAttribute('aria-selected', 'false');

      await user.keyboard('{Enter}');
      expect(row).toHaveFocus();
      expect(row).toHaveAttribute('aria-selected', 'true');
    });

    it('persists selection across search filtering, even once collapse hides the selected row', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: RECURSIVE_TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree />);

      await user.click(screen.getByTestId('hierarchy-expand-all'));
      await user.click(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal'));
      expect(screen.getByTestId('hierarchy-selection-label')).toHaveTextContent('Manipal');

      // Collapse-all hides the row (and the node itself never matches "xyz"),
      // but the selection — and its details panel — must survive.
      await user.click(screen.getByTestId('hierarchy-collapse-all'));
      await user.type(screen.getByTestId('hierarchy-search-input'), 'xyz');
      expect(screen.queryByTestId('nav-node-a:IN|KA|Udupi|Manipal')).not.toBeInTheDocument();
      expect(screen.getByTestId('hierarchy-selection-panel')).toBeInTheDocument();
      expect(screen.getByTestId('hierarchy-selection-label')).toHaveTextContent('Manipal');
    });

    it('clears the selection once the node structurally disappears after a refetch', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      const { rerender } = render(<NavigationHierarchyTree />);

      await user.click(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal'));
      expect(screen.getByTestId('hierarchy-selection-panel')).toBeInTheDocument();

      // Simulate a post-override refetch (useCreateNavigationOverride invalidates
      // the tree query) that dropped the selected AREA node entirely.
      const PRUNED_TREE = { ...TREE, nodes: TREE.nodes.filter((n) => n.nodeKey !== 'a:IN|KA|Udupi|Manipal') };
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: PRUNED_TREE, refetch: vi.fn() });
      rerender(<NavigationHierarchyTree />);

      expect(screen.queryByTestId('hierarchy-selection-panel')).not.toBeInTheDocument();
    });
  });

  // Issue #2207 — contextual override actions from the selection panel.
  describe('contextual override actions', () => {
    it('offers only Area-subject actions for an AREA node, and only Node-subject actions for a non-AREA node', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree overridesEditable />);

      await user.click(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal'));
      expect(screen.getByTestId('hierarchy-selection-action-EXCLUDE_AREA')).toBeInTheDocument();
      expect(screen.getByTestId('hierarchy-selection-action-REASSIGN_AREA_REGION')).toBeInTheDocument();
      expect(screen.getByTestId('hierarchy-selection-action-MOVE_AREA')).toBeInTheDocument();
      expect(screen.queryByTestId('hierarchy-selection-action-RELABEL')).not.toBeInTheDocument();
      expect(screen.queryByTestId('hierarchy-selection-action-SET_REPRESENTATIVES')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('nav-node-c:north:manipal'));
      expect(screen.getByTestId('hierarchy-selection-action-RELABEL')).toBeInTheDocument();
      expect(screen.getByTestId('hierarchy-selection-action-SET_REPRESENTATIVES')).toBeInTheDocument();
      expect(screen.queryByTestId('hierarchy-selection-action-EXCLUDE_AREA')).not.toBeInTheDocument();
      expect(screen.queryByTestId('hierarchy-selection-action-REASSIGN_AREA_REGION')).not.toBeInTheDocument();
      expect(screen.queryByTestId('hierarchy-selection-action-MOVE_AREA')).not.toBeInTheDocument();
    });

    it('calls onRequestOverride with the correct kind + subject key when an action is clicked', async () => {
      const user = userEvent.setup();
      const onRequestOverride = vi.fn();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      render(<NavigationHierarchyTree overridesEditable onRequestOverride={onRequestOverride} />);

      await user.click(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal'));
      await user.click(screen.getByTestId('hierarchy-selection-action-EXCLUDE_AREA'));
      expect(onRequestOverride).toHaveBeenCalledWith({
        kind: 'EXCLUDE_AREA',
        subjectAreaKey: 'IN|KA|Udupi|Manipal',
      });
    });

    it('disables override actions when the revision is not PREPARED (overridesEditable=false)', async () => {
      const user = userEvent.setup();
      mockUseNavigationTree.mockReturnValue({ isLoading: false, isError: false, data: TREE, refetch: vi.fn() });
      // overridesEditable defaults to false when omitted.
      render(<NavigationHierarchyTree />);

      await user.click(screen.getByTestId('nav-node-a:IN|KA|Udupi|Manipal'));
      expect(screen.getByTestId('hierarchy-selection-action-EXCLUDE_AREA')).toBeDisabled();
    });
  });
});
