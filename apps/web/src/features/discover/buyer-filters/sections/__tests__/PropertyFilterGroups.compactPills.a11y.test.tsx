/**
 * Issue #2729 §4 (D3 fix) — sibling to `PropertyFilterGroups.compactPills.test.tsx`.
 *
 * That file mocks `@radix-ui/react-popover` (see the `vi.mock` comment there for the measured
 * root cause: opening a REAL Radix Popover stalls the vitest worker for ~15s via an RPC
 * timeout/retry cascade — a Radix/jsdom/vitest interaction, not a product leak). Its mock sets
 * `aria-haspopup`/`aria-expanded` itself, so an assertion on those attributes in that file would
 * be tautological — it could never fail regardless of what CompactFilterToolbar/FilterPill
 * actually render.
 *
 * This file asserts that real accessibility contract instead, using the REAL, unmocked
 * `@radix-ui/react-popover`. It stays on the fast path the other file's `--cpu-prof` profiling
 * found: rendering closed pills is cheap (a handful of milliseconds) — the ~15s stall is
 * specifically tied to OPENING a popover, so this file must never call `.click()` on a trigger.
 * Real open/focus/dismiss interaction is covered end-to-end by the Playwright spec
 * `e2e/discover-results-reskin-2729.spec.ts`, which clicks `filter-pill-*` triggers in a real
 * browser.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PropertyFilterGroups, type PropertyFilterGroupsProps } from '../PropertyFilterGroups';
import type { UsePropertyFilterGroupsResult } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';

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

describe('#2729 §4 D3 — compact toolbar pill triggers, REAL @radix-ui/react-popover (closed only)', () => {
  // One assertion per pill present in the default residential/capability-off render (Type, BHK,
  // Budget, Area) — a check against only one pill could pass even if the others were plain
  // non-interactive `<div>`s, so each is asserted independently.
  it.each([
    ['filter-pill-type', 'Type'],
    ['filter-pill-bhk', 'BHK'],
    ['filter-pill-budget', 'Budget'],
    ['filter-pill-area', 'Area'],
  ])('%s (%s) is a real, closed, keyboard-accessible BUTTON trigger', (testId) => {
    renderCompact();
    const pill = screen.getByTestId(testId);
    expect(pill.tagName).toBe('BUTTON');
    expect(pill).toHaveAttribute('aria-haspopup', 'dialog');
    expect(pill).toHaveAttribute('aria-expanded', 'false');
  });
});
