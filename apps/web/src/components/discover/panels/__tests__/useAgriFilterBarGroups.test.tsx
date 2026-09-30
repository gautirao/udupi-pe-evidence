/**
 * Issue #2762 PR-B — useAgriFilterBarGroups adapter coverage. Mirrors the mocking strategy
 * `PropertyFilterGroups.compactPills.test.tsx` (sibling suite) uses for `@radix-ui/react-popover`
 * — see that file's own header comment for why (opening a REAL Radix Popover stalls this
 * vitest-worker environment for ~15s per test).
 */
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CompactFilterBar } from '@/features/discover/buyer-filters/sections/CompactFilterBar';
import { useAgriFilterBarGroups } from '../useAgriFilterBarGroups';

vi.mock('@radix-ui/react-popover', async () => {
  const ReactActual = await vi.importActual<typeof import('react')>('react');
  const OpenCtx = ReactActual.createContext<{ open: boolean; setOpen: (next: boolean) => void }>({
    open: false,
    setOpen: () => {},
  });
  const Root = (props: { children?: React.ReactNode }) => {
    const [open, setOpen] = ReactActual.useState(false);
    return ReactActual.createElement(OpenCtx.Provider, { value: { open, setOpen } }, props.children);
  };
  const Trigger = ReactActual.forwardRef<HTMLElement, { asChild?: boolean; children: React.ReactElement }>(
    (props, ref) => {
      const ctx = ReactActual.useContext(OpenCtx);
      return ReactActual.cloneElement(props.children, {
        ref,
        onClick: (event: MouseEvent) => {
          (props.children.props as { onClick?: (e: MouseEvent) => void }).onClick?.(event);
          ctx.setOpen(!ctx.open);
        },
        'aria-haspopup': 'dialog',
        'aria-expanded': ctx.open,
      });
    },
  );
  const Portal = (props: { children?: React.ReactNode }) => props.children;
  const Content = ReactActual.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
    const ctx = ReactActual.useContext(OpenCtx);
    const { align: _align, sideOffset: _sideOffset, ...domProps } = props;
    if (!ctx.open) return null;
    return ReactActual.createElement('div', { ...domProps, ref, role: 'dialog' });
  });
  const Anchor = (props: { children?: React.ReactNode }) => props.children;
  const Close = (props: { children?: React.ReactNode }) => props.children;
  return { Root, Trigger, Portal, Content, Anchor, Close };
});

const openPopover = (testId: string) => {
  const trigger = screen.getByTestId(testId);
  fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
  fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' });
  fireEvent.click(trigger);
};

const baseParams = {
  isAuthenticated: true,
  onApply: vi.fn(),
  onClear: vi.fn(),
};

describe('#2762 PR-B — useAgriFilterBarGroups', () => {
  it('produces exactly one PINNED group (no collapsePriority) — the whole panel never collapses out of the row', () => {
    const groups = useAgriFilterBarGroupsForTest(baseParams);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('agri-filters');
    expect(groups[0].collapsePriority).toBeUndefined();
  });

  it('isActive is false with no committed agri filters, true when any one is set', () => {
    expect(useAgriFilterBarGroupsForTest(baseParams)[0].isActive).toBe(false);
    expect(useAgriFilterBarGroupsForTest({ ...baseParams, acresMin: 2 })[0].isActive).toBe(true);
    expect(useAgriFilterBarGroupsForTest({ ...baseParams, agriWaterSource: 'borewell' })[0].isActive).toBe(true);
  });

  function Harness(props: Partial<typeof baseParams> & Record<string, unknown>) {
    const groups = useAgriFilterBarGroups({ ...baseParams, ...props } as Parameters<typeof useAgriFilterBarGroups>[0]);
    return <CompactFilterBar accent="agri" groups={groups} />;
  }

  it('renders a single "Land filters" pill with data-accent="agri", and opening it reveals the real, UNMODIFIED AgriFiltersPanel form', () => {
    render(<Harness />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.closest('[data-accent]')).toHaveAttribute('data-accent', 'agri');
    expect(screen.getByTestId('filter-pill-agri-filters')).toHaveTextContent('Land filters');

    openPopover('filter-pill-agri-filters');
    const popover = screen.getByTestId('filter-pill-agri-filters-popover');
    // The SAME testid AgriFiltersPanel.tsx has always rendered — proves this is the real,
    // unmodified component mounted as a render slot, not a reimplementation.
    expect(within(popover).getByTestId('agri-filters-panel')).toBeInTheDocument();
    expect(within(popover).getByTestId('agri-acres-min')).toBeInTheDocument();
    expect(within(popover).getByTestId('agri-land-category-select')).toBeInTheDocument();
  });

  it('"More filters" is absent — a single non-collapsible group never triggers it', () => {
    render(<Harness />);
    expect(screen.queryByTestId('filter-toolbar-more-filters-trigger')).not.toBeInTheDocument();
  });

  it('calling onApply from inside the rendered panel still uses AgriFiltersPanel\'s own unmodified handler', () => {
    const onApply = vi.fn();
    render(<Harness onApply={onApply} acresMin={1} acresMax={5} />);
    openPopover('filter-pill-agri-filters');
    fireEvent.click(screen.getByTestId('agri-filters-apply'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ agriAcresMin: 1, agriAcresMax: 5 }),
    );
  });
});

// Small helper so the two pure-data assertions above don't need a full render.
function useAgriFilterBarGroupsForTest(params: Parameters<typeof useAgriFilterBarGroups>[0]) {
  let captured: ReturnType<typeof useAgriFilterBarGroups> = [];
  function Capture() {
    captured = useAgriFilterBarGroups(params);
    return null;
  }
  render(<Capture />);
  return captured;
}
