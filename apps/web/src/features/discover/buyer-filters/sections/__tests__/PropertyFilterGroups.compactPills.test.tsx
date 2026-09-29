/**
 * Issue #2729 §4 (D3 fix) — the compact desktop toolbar must be a TRUE single row. A first
 * revision rendered the STACKED row components (each internally multi-chip/`flex-wrap`) inline,
 * which real-browser verification measured at 123px / 3 lines, not one row. Every group is now
 * its own ~34px pill that opens a Popover containing the group's existing, UNMODIFIED row
 * component — jsdom cannot measure real pixel height, so these tests assert the STRUCTURAL
 * properties that make a single row possible: `flex-nowrap` (not `flex-wrap`) on the toolbar,
 * every group's interactive chips mounted ONLY inside a closed-by-default Popover (never inline),
 * and exactly one compact trigger button per group.
 */
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PropertyFilterGroups, type PropertyFilterGroupsProps } from '../PropertyFilterGroups';
import type { UsePropertyFilterGroupsResult } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';

// ROOT CAUSE (measured, not guessed): opening a real `@radix-ui/react-popover` Popover in this
// suite stalls the vitest worker's event loop for ~15s PER popover-opening test — confirmed via
// `node --cpu-prof` on the worker process: the gap is >99% "(idle)" (not a busy CPU loop), broken
// into 3 discrete waits of ~5s each, exactly matching vitest/birpc's own RPC retry/timeout
// cascade ("[vitest-worker]: Timeout calling onTaskUpdate" — the very error this suite always
// exits 1 on). The wait is inert real macrotask work, so faking `setTimeout`/`requestAnimationFrame`
// (both tried) changes nothing, which is consistent with this being the RPC channel's own
// real-timer retry loop, not a leaked application timer.
//
// Bisection (each step verified with `node --cpu-prof`, not assumed): mocking
// `@floating-ui/react-dom`'s `autoUpdate`, `@floating-ui/core`'s `computePosition`,
// `@radix-ui/react-dismissable-layer`, `@radix-ui/react-focus-scope`, `@radix-ui/react-presence`,
// and `@radix-ui/react-popper` INDIVIDUALLY — one dependency at a time — left the ~15s stall
// COMPLETELY UNCHANGED every time. Only replacing the top-level `@radix-ui/react-popover` package
// itself removed it. That rules out CompactFilterToolbar/FilterPill (`../CompactFilterToolbar.tsx`,
// `../PropertyFilterGroups.tsx`) as the source — neither calls a timer, an observer, or anything
// async; this is a Radix/jsdom/vitest interaction confined to node_modules, not a product leak.
//
// FIX: replace the real `@radix-ui/react-popover` with a minimal, faithful stand-in scoped to
// THIS FILE — same shape as the repo's existing `ResizeObserver` stub in `src/test/setup.ts`
// (jsdom has no real layout engine, so Radix's floating-ui positioning machinery is unusable here
// regardless; this just stops paying for it). It preserves every DOM contract this file's own
// structural assertions check: opens on click (the existing `openPopover` pointerdown/pointerup/
// click sequence still works — `click` is still in the mock's supported open path), content
// mounts ONLY while open (the "closed popover renders no chips" assertions still hold), and
// `data-testid`/`className`/children pass through unchanged.
//
// NOTE — why real Radix `aria-haspopup`/`aria-expanded` behavior is NOT asserted here: this mock
// sets those attributes itself, so a test in THIS file asserting them would be tautological (it
// could never fail). That coverage lives in the sibling `PropertyFilterGroups.compactPills.a11y.
// test.tsx`, which renders with the REAL `@radix-ui/react-popover` — safe because it never opens
// a popover, which this file's own `--cpu-prof` profiling showed is the fast, non-stalling path —
// plus the Playwright E2E spec for real interactive/focus behavior.
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
    // `align`/`sideOffset` are floating-ui placement knobs the real primitive consumes — not
    // valid DOM attributes, so they're dropped rather than spread onto the `div`.
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

const baseControllerResult: UsePropertyFilterGroupsResult = {
  activeFamily: 'residential',
  activePropertyTypes: new Set(),
  activeBedrooms: new Set(),
  activeCommercialSubtypes: new Set(),
  allTypesActive: true,
  activePriceMax: null,
  activeReadyToMove: false,
  showSubtypeRow: false,
  showBedroomsRow: true,
  activeBudgetBands: [],
  areaControl: { shortLabel: 'Carpet area', disclosure: null },
  areaControlLabel: 'Carpet area',
  activeAreaMin: null,
  budgetIntent: 'buy',
  possessionLabel: 'Ready to move',
  handleTogglePropertyType: vi.fn(),
  handleSelectAllTypes: vi.fn(),
  handleToggleBedroom: vi.fn(),
  handleSelectBudget: vi.fn(),
  handleToggleReadyToMove: vi.fn(),
  handleSelectFamily: vi.fn(),
  handleToggleSubtype: vi.fn(),
  handleSelectArea: vi.fn(),
  handleRemoveSubtype: vi.fn(),
  handleRemovePropertyType: vi.fn(),
  handleRemoveBudget: vi.fn(),
  handleRemoveArea: vi.fn(),
  handleRemoveBedroom: vi.fn(),
  handleRemoveReadyToMove: vi.fn(),
  setFamilyOverride: vi.fn(),
  hasPropertyFilters: false,
  handleClearPropertyFilters: vi.fn(),
  commercialFromFilters: false,
  residentialMemoryRef: { current: undefined },
  commercialMemoryRef: { current: undefined },
} as unknown as UsePropertyFilterGroupsResult;

const renderCompact = (over: Partial<PropertyFilterGroupsProps> = {}) => {
  const props: PropertyFilterGroupsProps = {
    filters: {},
    isCommercialSubtypeSupported: false,
    isReadyToMoveSupported: true,
    layout: 'compact',
    ...baseControllerResult,
    ...over,
  };
  return render(<PropertyFilterGroups {...props} />);
};

describe('#2729 §4 D3 — compact toolbar is a true single row of pills', () => {
  it('the toolbar row is flex-nowrap (never flex-wrap)', () => {
    renderCompact();
    const toolbar = screen.getByRole('toolbar', { name: 'Property filters' });
    expect(toolbar.className).toContain('flex-nowrap');
    expect(toolbar.className).not.toContain('flex-wrap');
  });

  it('residential, capability off: exactly Type / BHK / Budget / Area pills inline — no full chip rows visible by default', () => {
    renderCompact();
    expect(screen.getByTestId('filter-pill-type')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-bhk')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-budget')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-area')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-pill-family')).not.toBeInTheDocument();
    // The underlying row's own chips (e.g. "Apartments") are NOT in the DOM until the pill opens —
    // this is what actually keeps the row to one line (a closed Popover mounts nothing visible).
    expect(screen.queryByText('Apartments')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-chip-apartment')).not.toBeInTheDocument();
  });

  it('commercial-capable: Family pill AND Type/Subtype pill both render (two separate pills)', () => {
    renderCompact({ isCommercialSubtypeSupported: true });
    expect(screen.getByTestId('filter-pill-family')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-type')).toBeInTheDocument();
  });

  it('commercial family active + subtype-capable: Subtype pill replaces the Type pill, BHK pill absent', () => {
    renderCompact({
      isCommercialSubtypeSupported: true,
      activeFamily: 'commercial',
      showSubtypeRow: true,
      showBedroomsRow: false,
    });
    expect(screen.getByTestId('filter-pill-subtype')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-pill-type')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-pill-bhk')).not.toBeInTheDocument();
  });

  it('opening the Type pill reveals the EXISTING, unmodified ResidentialTypeRow inside the popover', () => {
    renderCompact();
    openPopover('filter-pill-type');
    const popover = screen.getByTestId('filter-pill-type-popover');
    expect(within(popover).getByTestId('quick-chip-apartment')).toBeInTheDocument();
  });

  it('opening the Budget pill reveals the existing BudgetRow; label reflects the active band', () => {
    renderCompact({
      activePriceMax: 8000000,
      activeBudgetBands: [{ label: '≤ ₹80L', max: 8000000 }],
    });
    expect(screen.getByTestId('filter-pill-budget')).toHaveTextContent('≤ ₹80L');
  });

  it('idle pill labels read "Any …", not a blank/undefined string', () => {
    renderCompact();
    expect(screen.getByTestId('filter-pill-budget')).toHaveTextContent('Any price');
    expect(screen.getByTestId('filter-pill-area')).toHaveTextContent(/Any/i);
    expect(screen.getByTestId('filter-pill-bhk')).toHaveTextContent('Any BHK');
  });

  // Issue #2729 R3 fix — the possession ("Ready to move"/"Ready to occupy") toggle ALWAYS lives
  // in "More filters" now, never embedded in the Family pill's own popover (real-browser
  // verification found the embedded placement hard to discover, and the DoD puts "Only show"
  // toggles under More filters). `FamilyRow.possession={null}` in compact mode — see that prop's
  // own doc comment — is what makes this possible without duplicating the toggle: exactly one
  // rendered instance either way, just relocated.
  it('"More filters" holds the Ready-to-move toggle, present whenever a possession toggle is supported at all — regardless of whether the Family pill exists', () => {
    renderCompact({ isCommercialSubtypeSupported: false });
    expect(screen.getByTestId('filter-toolbar-more-filters-trigger')).toBeInTheDocument();
    openPopover('filter-toolbar-more-filters-trigger');
    expect(screen.getByTestId('filter-toolbar-ready-to-move-toggle')).toBeInTheDocument();
  });

  it('"More filters" is ALSO present with commercial capability ON — the toggle is never embedded in the Family pill', () => {
    renderCompact({ isCommercialSubtypeSupported: true });
    expect(screen.getByTestId('filter-toolbar-more-filters-trigger')).toBeInTheDocument();
    // The Family pill's own popover carries ONLY the family-selection buttons now, never a
    // possession chip — proves there is exactly one rendered instance of the toggle, not two.
    openPopover('filter-pill-family');
    expect(within(screen.getByTestId('filter-pill-family-popover')).queryByTestId('quick-chip-ready-to-move')).not.toBeInTheDocument();
  });

  it('MUTATION CHECK: with isReadyToMoveSupported=false, "More filters" is ABSENT (nothing to put in it) — proves hasMoreFilters is a real gate, not a static true', () => {
    renderCompact({ isReadyToMoveSupported: false });
    expect(screen.queryByTestId('filter-toolbar-more-filters-trigger')).not.toBeInTheDocument();
  });

  it('R4: the active Family pill uses the filled style (solid accent background), not the tinted active style every other pill uses', () => {
    renderCompact({ isCommercialSubtypeSupported: true, activeFamily: 'residential' });
    const familyPill = screen.getByTestId('filter-pill-family');
    expect(familyPill.className).toContain('bg-copper');
    expect(familyPill.className).not.toContain('bg-copper-tint');
  });
});

// Issue #2729 V1 fix — real-browser measurement (Playwright, exact 1366×768/1440×900) found the
// toolbar clipping "More filters" to "More" at the panel's right edge. `CompactFilterToolbar`
// (the extracted component this delegates to) now measures its own width via `ResizeObserver` and
// collapses Area, then BHK, into "More filters" as needed. jsdom has no real layout engine and no
// native `ResizeObserver`, so this stub captures the callback the component registers and lets
// these tests fire it manually with a chosen `contentRect.width` — the same technique this file's
// own `openPopover` helper uses to work around jsdom/Radix limitations elsewhere in this repo.
class ControllableResizeObserverStub {
  static instances: ControllableResizeObserverStub[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControllableResizeObserverStub.instances.push(this);
  }
  observe(target: Element) {
    // Fire synchronously with a fake contentRect so the component's effect can react immediately
    // (jsdom's `Element` has no real layout, so `contentRect.width` is caller-controlled below).
    this.target = target;
  }
  unobserve() {}
  disconnect() {}
  target: Element | null = null;
  fire(width: number) {
    this.callback(
      [{ contentRect: { width } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

describe('#2729 V1 — compact toolbar overflow collapse (ResizeObserver-driven)', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    ControllableResizeObserverStub.instances = [];
    globalThis.ResizeObserver = ControllableResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  const fireResize = (width: number) => {
    const instance = ControllableResizeObserverStub.instances[0];
    expect(instance).toBeTruthy();
    act(() => {
      instance.fire(width);
    });
  };

  it('wide container: nothing collapses — Area and BHK pills stay inline', () => {
    renderCompact();
    fireResize(2000);
    expect(screen.getByTestId('filter-pill-area')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-bhk')).toBeInTheDocument();
  });

  it('measured 1366×768-equivalent narrow width: Area collapses into "More filters" (a real, existing, unmodified AreaSizeRow with the SAME handler)', () => {
    const handleSelectArea = vi.fn();
    // Issue #2572 enables `isCommercialSubtypeSupported` on 2 of the 3 production render sites
    // (see DiscoverRightPanel.commercialCapability2596.test.tsx) — the Family pill IS present in
    // the real toolbar the reviewer measured at 1366×768 (scrollWidth 664 vs clientWidth 618),
    // matching toolbarOverflow.test.ts's hand-validated `familyLabel: 'Residential'` base case.
    renderCompact({ handleSelectArea, isCommercialSubtypeSupported: true });
    fireResize(618);
    expect(screen.queryByTestId('filter-pill-area')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-bhk')).toBeInTheDocument(); // BHK still fits
    expect(screen.getByTestId('filter-toolbar-more-filters-trigger')).toBeInTheDocument();
    openPopover('filter-toolbar-more-filters-trigger');
    const popover = screen.getByTestId('filter-toolbar-more-filters-popover');
    const areaPreset = within(popover).getByTestId('quick-chip-area-1000');
    fireEvent.click(areaPreset);
    expect(handleSelectArea).toHaveBeenCalledWith(1000);
  });

  it('very narrow width: BOTH Area and BHK collapse into "More filters", each with its own unmodified row + handler', () => {
    const handleToggleBedroom = vi.fn();
    renderCompact({ handleToggleBedroom });
    fireResize(300);
    expect(screen.queryByTestId('filter-pill-area')).not.toBeInTheDocument();
    expect(screen.queryByTestId('filter-pill-bhk')).not.toBeInTheDocument();
    openPopover('filter-toolbar-more-filters-trigger');
    const popover = screen.getByTestId('filter-toolbar-more-filters-popover');
    expect(within(popover).getByTestId('quick-chip-area-1000')).toBeInTheDocument();
    const bhkChip = within(popover).getByTestId('quick-chip-2-bhk');
    fireEvent.click(bhkChip);
    expect(handleToggleBedroom).toHaveBeenCalledWith(2);
  });

  it('Family, Type and Budget NEVER collapse, even at an extremely narrow width', () => {
    renderCompact({ isCommercialSubtypeSupported: true });
    fireResize(50);
    expect(screen.getByTestId('filter-pill-family')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-type')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-budget')).toBeInTheDocument();
  });

  it('"More filters" is always the LAST element in the row (never pushed off / never before a still-inline pill)', () => {
    renderCompact();
    fireResize(300);
    const toolbar = screen.getByRole('toolbar', { name: 'Property filters' });
    const children = Array.from(toolbar.children);
    const moreFiltersWrapper = screen.getByTestId('filter-toolbar-more-filters-trigger').closest('div');
    expect(children[children.length - 1]).toBe(moreFiltersWrapper);
  });

  it('the "More filters" badge counts a collapsed group with an active value', () => {
    // Same real-world condition as the measured-1366 test above — Family pill present.
    renderCompact({ activeAreaMin: 1000, isCommercialSubtypeSupported: true });
    fireResize(618);
    expect(screen.queryByTestId('filter-pill-area')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-toolbar-more-filters-count')).toHaveTextContent('1');
  });

  it('Commercial (no BHK pill at all) also collapses Area at a narrow width — V1 holds for Commercial too', () => {
    renderCompact({
      isCommercialSubtypeSupported: true,
      activeFamily: 'commercial',
      showSubtypeRow: true,
      showBedroomsRow: false,
    });
    fireResize(618);
    expect(screen.getByTestId('filter-pill-family')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-subtype')).toBeInTheDocument();
    expect(screen.getByTestId('filter-pill-budget')).toBeInTheDocument();
    expect(screen.queryByTestId('filter-pill-area')).not.toBeInTheDocument();
  });

  it('MUTATION CHECK: re-firing the observer with a WIDE width after a narrow one restores the inline pills — proves this is reactive, not a one-shot/static decision', () => {
    renderCompact();
    fireResize(300);
    expect(screen.queryByTestId('filter-pill-area')).not.toBeInTheDocument();
    fireResize(2000);
    expect(screen.getByTestId('filter-pill-area')).toBeInTheDocument();
  });
});
