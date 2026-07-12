import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarkerSelection } from './useMarkerSelection';
import type { DiscoverUrlActions, DiscoverUrlState } from '@/hooks/useDiscoverUrlState';
import type { PropertyListingWithImages } from '@/components/map/PropertyMap';

// DiscoverUrlActions has a large surface (city/journey/area/school/filter writers);
// the hook only reads setSelectedListing + clearSelectedListing off it. Casting a
// minimal fixture keeps these tests focused on the marker-selection contract without
// hand-authoring ~20 unrelated no-op methods. (Unavoidable cast — noted per CLAUDE.md.)
function makeUrlActions(overrides: Partial<DiscoverUrlActions> = {}): DiscoverUrlActions {
  return {
    setSelectedListing: vi.fn(),
    clearSelectedListing: vi.fn(),
    ...overrides,
  } as unknown as DiscoverUrlActions;
}

// DiscoverUrlState has several required fields unrelated to marker selection
// (city/viewport/filters/q/intent/etc.); fill them with harmless defaults and let
// callers override the fields the hook actually reads.
function makeUrlState(overrides: Partial<DiscoverUrlState> = {}): DiscoverUrlState {
  return {
    city: 'bangalore',
    areaKey: null,
    viewport: null,
    filters: {},
    schoolId: null,
    radiusKm: null,
    q: '',
    journey: null,
    groupId: null,
    selectedGroup: null,
    intent: 'buy',
    ...overrides,
  };
}

function makeListing(id: string): PropertyListingWithImages {
  return { id } as unknown as PropertyListingWithImages;
}

describe('useMarkerSelection', () => {
  it('(i) initialises selectedMarkerListing and markerPixelPos to null', () => {
    const { result } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: makeUrlState() }),
    );

    expect(result.current.selectedMarkerListing).toBeNull();
    expect(result.current.markerPixelPos).toBeNull();
  });

  it('(ii) handleSelectMarkerListing: agri-first + selectedRegion + selectedMaxKm sets state and writes the URL', () => {
    const setSelectedListing = vi.fn();
    const urlActions = makeUrlActions({ setSelectedListing });
    const urlState = makeUrlState({ journey: 'agri-first', selectedRegion: 'NE', selectedMaxKm: 25 });
    const { result } = renderHook(() => useMarkerSelection({ urlActions, urlState }));

    const listing = makeListing('agri-1');
    act(() => {
      result.current.handleSelectMarkerListing(listing);
    });

    expect(result.current.selectedMarkerListing).toBe(listing);
    expect(setSelectedListing).toHaveBeenCalledWith('agri-1');
    expect(setSelectedListing).toHaveBeenCalledTimes(1);
  });

  it('(iii) handleSelectMarkerListing: area-first + areaKey + no school writes the URL', () => {
    const setSelectedListing = vi.fn();
    const urlActions = makeUrlActions({ setSelectedListing });
    const urlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });
    const { result } = renderHook(() => useMarkerSelection({ urlActions, urlState }));

    const listing = makeListing('area-1');
    act(() => {
      result.current.handleSelectMarkerListing(listing);
    });

    expect(result.current.selectedMarkerListing).toBe(listing);
    expect(setSelectedListing).toHaveBeenCalledWith('area-1');
  });

  it('(iv) handleSelectMarkerListing: school-first + schoolId + areaKey does NOT write the URL (#1738)', () => {
    const setSelectedListing = vi.fn();
    const urlActions = makeUrlActions({ setSelectedListing });
    const urlState = makeUrlState({ journey: 'school-first', areaKey: 'manipal', schoolId: 'school-1' });
    const { result } = renderHook(() => useMarkerSelection({ urlActions, urlState }));

    const listing = makeListing('school-1-listing');
    act(() => {
      result.current.handleSelectMarkerListing(listing);
    });

    // Local state still updates (agri-detail override etc. depend on it) — only
    // the URL write is excluded for school-first.
    expect(result.current.selectedMarkerListing).toBe(listing);
    expect(setSelectedListing).not.toHaveBeenCalled();
  });

  it('(v) handleMarkerClickWithPosition: sets markerPixelPos only when eligible, stays null otherwise', () => {
    const eligibleUrlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });
    const { result: eligible } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: eligibleUrlState }),
    );
    act(() => {
      eligible.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(eligible.current.markerPixelPos).toEqual({ x: 10, y: 20 });

    // Ineligible: school-first with a school selected.
    const ineligibleUrlState = makeUrlState({ journey: 'school-first', areaKey: 'manipal', schoolId: 'school-1' });
    const { result: ineligible } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: ineligibleUrlState }),
    );
    act(() => {
      ineligible.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(ineligible.current.markerPixelPos).toBeNull();
  });

  it('(vi) handlePopoverDismiss clears both local states and calls clearSelectedListing', () => {
    const setSelectedListing = vi.fn();
    const clearSelectedListing = vi.fn();
    const urlActions = makeUrlActions({ setSelectedListing, clearSelectedListing });
    const urlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });
    const { result } = renderHook(() => useMarkerSelection({ urlActions, urlState }));

    act(() => {
      result.current.handleSelectMarkerListing(makeListing('area-1'));
      result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
    });
    expect(result.current.selectedMarkerListing).not.toBeNull();
    expect(result.current.markerPixelPos).not.toBeNull();

    act(() => {
      result.current.handlePopoverDismiss();
    });

    expect(result.current.selectedMarkerListing).toBeNull();
    expect(result.current.markerPixelPos).toBeNull();
    expect(clearSelectedListing).toHaveBeenCalledTimes(1);
  });

  it('(vii) showMarkerInList clears local popover state, writes the URL, but does NOT clear it (asymmetry)', () => {
    const setSelectedListing = vi.fn();
    const clearSelectedListing = vi.fn();
    const urlActions = makeUrlActions({ setSelectedListing, clearSelectedListing });
    const urlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });
    const { result } = renderHook(() => useMarkerSelection({ urlActions, urlState }));

    act(() => {
      result.current.handleSelectMarkerListing(makeListing('area-1'));
      result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
    });

    act(() => {
      result.current.showMarkerInList('area-1');
    });

    expect(result.current.selectedMarkerListing).toBeNull();
    expect(result.current.markerPixelPos).toBeNull();
    expect(setSelectedListing).toHaveBeenLastCalledWith('area-1');
    expect(clearSelectedListing).not.toHaveBeenCalled();
  });

  it('(viii) selectMarkerSibling sets state and writes setSelectedListing(sibling.id)', () => {
    const setSelectedListing = vi.fn();
    const urlActions = makeUrlActions({ setSelectedListing });
    const { result } = renderHook(() =>
      useMarkerSelection({ urlActions, urlState: makeUrlState() }),
    );

    const sibling = makeListing('sibling-1');
    act(() => {
      result.current.selectMarkerSibling(sibling);
    });

    expect(result.current.selectedMarkerListing).toBe(sibling);
    expect(setSelectedListing).toHaveBeenCalledWith('sibling-1');
  });

  it('(ix) handler identity stays stable across a rerender with a brand-new urlActions object', () => {
    const { result, rerender } = renderHook(
      ({ urlActions, urlState }: { urlActions: DiscoverUrlActions; urlState: DiscoverUrlState }) =>
        useMarkerSelection({ urlActions, urlState }),
      { initialProps: { urlActions: makeUrlActions(), urlState: makeUrlState() } },
    );

    const p1 = result.current.handleSelectMarkerListing;
    const p2 = result.current.handleMarkerClickWithPosition;
    const p3 = result.current.handlePopoverDismiss;

    const freshUrlActions = makeUrlActions();
    rerender({ urlActions: freshUrlActions, urlState: makeUrlState() });

    expect(result.current.handleSelectMarkerListing).toBe(p1);
    expect(result.current.handleMarkerClickWithPosition).toBe(p2);
    expect(result.current.handlePopoverDismiss).toBe(p3);
  });

  it('(x) after a urlActions identity change, the stable handler still calls the NEW urlActions (freshness)', () => {
    const staleSetSelectedListing = vi.fn();
    const freshSetSelectedListing = vi.fn();
    const staleUrlActions = makeUrlActions({ setSelectedListing: staleSetSelectedListing });
    const freshUrlActions = makeUrlActions({ setSelectedListing: freshSetSelectedListing });
    const eligibleUrlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });

    const { result, rerender } = renderHook(
      ({ urlActions, urlState }: { urlActions: DiscoverUrlActions; urlState: DiscoverUrlState }) =>
        useMarkerSelection({ urlActions, urlState }),
      { initialProps: { urlActions: staleUrlActions, urlState: eligibleUrlState } },
    );

    rerender({ urlActions: freshUrlActions, urlState: eligibleUrlState });

    act(() => {
      result.current.handleSelectMarkerListing(makeListing('area-2'));
    });

    expect(freshSetSelectedListing).toHaveBeenCalledWith('area-2');
    expect(staleSetSelectedListing).not.toHaveBeenCalled();
  });
});
