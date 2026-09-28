import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';
import { useBuyerFamilyController } from '../useBuyerFamilyController';

/**
 * Issue #2658 (C2) — differential test for useBuyerFamilyController against
 * the live hook (which, after this commit, delegates its family-state
 * management to this exact controller — so this test also doubles as a
 * regression guard on that delegation).
 */

type Filters = PropertyFilters;

const renderController = (
  filters: Filters,
  isCommercialSubtypeSupported = true,
) => renderHook((props: { filters: Filters }) =>
  useBuyerFamilyController(props.filters, isCommercialSubtypeSupported),
  { initialProps: { filters } },
);

const renderLiveHook = (initialFilters: Filters = {}) => {
  let filters = initialFilters;
  const onFiltersChange = vi.fn((next: Filters) => {
    filters = next;
  });
  const utils = renderHook(
    (props: { filters: Filters }) =>
      usePropertyFilterGroups({
        filters: props.filters,
        onFiltersChange,
        isCommercialSubtypeSupported: true,
        isReadyToMoveSupported: true,
      }),
    { initialProps: { filters } },
  );
  const rerenderWithLatestFilters = () => utils.rerender({ filters });
  return { ...utils, onFiltersChange, rerenderWithLatestFilters, getFilters: () => filters };
};

describe('#2658 C2 — useBuyerFamilyController vs. the live hook', () => {
  it('activeFamily/commercialFromFilters match the live hook for a subtype-only selection', () => {
    const filters: Filters = { commercialSubtypes: ['SHOP'] };
    const controller = renderController(filters);
    const live = renderLiveHook(filters);
    expect(controller.result.current.activeFamily).toBe(live.result.current.activeFamily);
    expect(controller.result.current.commercialFromFilters).toBe(
      live.result.current.commercialFromFilters,
    );
  });

  it('commit(commercial) returns the same patch the live hook emits, and matches after applying it', () => {
    const filters: Filters = { propertyTypes: ['apartment', 'villa'] };
    const controller = renderController(filters);
    const live = renderLiveHook(filters);
    live.rerenderWithLatestFilters();

    let patch: Filters | null = null;
    act(() => {
      patch = controller.result.current.commit('commercial');
    });
    act(() => live.result.current.handleSelectFamily('commercial'));

    expect(patch).toEqual(live.getFilters());
  });

  it('commit(residential) after a Commercial entry matches the live hook, restoring the same memory', () => {
    const filters: Filters = { commercialSubtypes: ['SHOP'] };
    const controller = renderController(filters);
    const live = renderLiveHook(filters);
    live.rerenderWithLatestFilters();

    act(() => live.result.current.handleSelectFamily('residential'));
    live.rerenderWithLatestFilters();

    let patch: Filters | null = null;
    act(() => {
      patch = controller.result.current.commit('residential');
    });

    expect(patch).toEqual(live.getFilters());
  });

  it('commit is a no-op (returns null) when the capability is off, matching the live hook no-op', () => {
    const filters: Filters = {};
    const controller = renderController(filters, false);
    let patch: Filters | null = { propertyTypes: ['apartment'] };
    act(() => {
      patch = controller.result.current.commit('commercial');
    });
    expect(patch).toBeNull();
  });

  it('resetForClear followed by a fresh commit(commercial) matches the live hook post-clear re-entry', () => {
    const filters: Filters = { commercialSubtypes: ['SHOP'] };
    const controller = renderController(filters);
    const live = renderLiveHook(filters);
    live.rerenderWithLatestFilters();

    act(() => controller.result.current.resetForClear());
    act(() => live.result.current.handleClearPropertyFilters());
    live.rerenderWithLatestFilters();

    let patch: Filters | null = null;
    act(() => {
      patch = controller.result.current.commit('commercial');
    });
    act(() => live.result.current.handleSelectFamily('commercial'));

    expect(patch).toEqual(live.getFilters());
  });
});
