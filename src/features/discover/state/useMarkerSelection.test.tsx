import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    // Eligible: area-first, no school (unchanged baseline).
    const eligibleUrlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });
    const { result: eligible } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: eligibleUrlState }),
    );
    act(() => {
      eligible.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(eligible.current.markerPixelPos).toEqual({ x: 10, y: 20 });

    // Issue #1973 (updated — previously pinned ineligible): school-first with a school AND
    // areaKey selected is NOW eligible via the additive-OR branch.
    const schoolFirstWithAreaUrlState = makeUrlState({
      journey: 'school-first',
      areaKey: 'manipal',
      schoolId: 'school-1',
    });
    const { result: schoolFirstWithArea } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: schoolFirstWithAreaUrlState }),
    );
    act(() => {
      schoolFirstWithArea.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(schoolFirstWithArea.current.markerPixelPos).toEqual({ x: 10, y: 20 });

    // Issue #1973 — LOAD-BEARING: pure school-first radius search is cross-area, so
    // areaKey is null in the live state. Without this explicit areaKey==null fixture, a
    // naive clause-flip (swapping schoolId==null for schoolId!=null without adding an
    // areaKey-free OR branch) would still incorrectly report this ineligible.
    const schoolFirstNoAreaUrlState = makeUrlState({
      journey: 'school-first',
      areaKey: null,
      schoolId: 'school-1',
    });
    const { result: schoolFirstNoArea } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: schoolFirstNoAreaUrlState }),
    );
    act(() => {
      schoolFirstNoArea.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(schoolFirstNoArea.current.markerPixelPos).toEqual({ x: 10, y: 20 });

    // Ineligible: agri-first (excluded regardless of areaKey/schoolId).
    const agriUrlState = makeUrlState({ journey: 'agri-first', areaKey: 'manipal', schoolId: null });
    const { result: agri } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: agriUrlState }),
    );
    act(() => {
      agri.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(agri.current.markerPixelPos).toBeNull();

    // Ineligible: no journey, no areaKey, no schoolId — nothing to gate eligibility on.
    const journeylessNoAreaUrlState = makeUrlState({ journey: null, areaKey: null, schoolId: null });
    const { result: journeylessNoArea } = renderHook(() =>
      useMarkerSelection({ urlActions: makeUrlActions(), urlState: journeylessNoAreaUrlState }),
    );
    act(() => {
      journeylessNoArea.current.handleMarkerClickWithPosition({ x: 10, y: 20 });
    });
    expect(journeylessNoArea.current.markerPixelPos).toBeNull();
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

  describe('hydrateSelectedMarkerFromUrl (Issue #1939)', () => {
    // Minimal mapContainerRef fixture: querySelector resolves a marker element
    // whose getBoundingClientRect + the container's own getBoundingClientRect
    // drive the pixel-position math in the hook. A null-returning querySelector
    // simulates the DOM-miss (not-yet-painted / clustered / filtered) branch.
    function makeMapContainerRef(markerRect: DOMRect | null) {
      const containerRect = { left: 100, top: 200, width: 0, height: 0 } as DOMRect;
      const markerEl = markerRect
        ? ({ getBoundingClientRect: () => markerRect } as unknown as HTMLElement)
        : null;
      const container = {
        querySelector: vi.fn(() => markerEl),
        getBoundingClientRect: () => containerRect,
      } as unknown as HTMLDivElement;
      return { current: container };
    }

    it('(a) success path: sets selectedMarkerListing + markerPixelPos from the DOM marker rect', () => {
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeMapContainerRef(markerRect);
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });

      expect(result.current.selectedMarkerListing).toBe(listing);
      // (150 - 100) + 20/2 = 60 ; (250 - 200) + 20/2 = 60
      expect(result.current.markerPixelPos).toEqual({ x: 60, y: 60 });
    });

    it('(b) idempotent no-op: does not re-set state when the id is already selected', () => {
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeMapContainerRef(markerRect);
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });
      const firstPixelPos = result.current.markerPixelPos;

      // Re-fire with a brand-new listing object of the same id (mirrors a fresh
      // currentMapMarkerListings reference from a background refetch).
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });

      // Same pixel-pos object reference — the idempotent guard returned before
      // re-querying the DOM / calling setMarkerPixelPos again.
      expect(result.current.markerPixelPos).toBe(firstPixelPos);
      expect(mapContainerRef.current.querySelector).toHaveBeenCalledTimes(1);
    });

    it('(c) DOM-miss no-op: querySelector returns null — no state set, no throw', () => {
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const mapContainerRef = makeMapContainerRef(null);
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      expect(() => {
        act(() => {
          result.current.hydrateSelectedMarkerFromUrl(listing);
        });
      }).not.toThrow();

      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
    });

    it('(d) REGRESSION: after showMarkerInList dismisses the card, repeated hydrate re-fires for the SAME id stay suppressed (not just once)', () => {
      const setSelectedListing = vi.fn();
      const urlActions = makeUrlActions({ setSelectedListing });
      // Same id already in the URL — showMarkerInList intentionally re-drives
      // setSelectedListing(id) without clearing it (the #1547 asymmetry), so
      // urlState.selectedListing stays 'area-1' across every re-fire below.
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeMapContainerRef(markerRect);
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions, urlState, mapContainerRef }),
      );

      // Open the popover first (as a real marker click would).
      act(() => {
        result.current.handleSelectMarkerListing(makeListing('area-1'));
        result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
      });
      expect(result.current.selectedMarkerListing).not.toBeNull();

      // "Show in list" dismisses the card but deliberately keeps the URL id.
      act(() => {
        result.current.showMarkerInList('area-1');
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();

      // Simulate the bug scenario: hydrateSelectedMarkerFromUrl re-fires
      // MULTIPLE times for the same id (a fresh object each time, mirroring
      // resolveMarkerPopover's non-memoized currentMapMarkerListings on a
      // background refetch/mapZoom/filter recompute). None of these re-fires
      // should reopen the popover — this is the one-shot bug this fix closes.
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();

      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();

      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
    });

    it('(e) re-arms after urlState.selectedListing changes away, so a later return to the id opens normally', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeMapContainerRef(markerRect);
      const urlActions = makeUrlActions();

      const { result, rerender } = renderHook(
        ({ urlState }: { urlState: DiscoverUrlState }) =>
          useMarkerSelection({ urlActions, urlState, mapContainerRef }),
        {
          initialProps: {
            urlState: makeUrlState({
              journey: 'area-first',
              areaKey: 'manipal',
              schoolId: null,
              selectedListing: 'area-1',
            }),
          },
        },
      );

      act(() => {
        result.current.handleSelectMarkerListing(makeListing('area-1'));
        result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
      });

      act(() => {
        result.current.showMarkerInList('area-1');
      });
      expect(result.current.selectedMarkerListing).toBeNull();

      // Still suppressed while the URL id is unchanged.
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });
      expect(result.current.selectedMarkerListing).toBeNull();

      // The URL genuinely navigates away from 'area-1' (e.g. user clears the
      // selection or picks a different marker) — re-arms the suppression.
      rerender({
        urlState: makeUrlState({
          journey: 'area-first',
          areaKey: 'manipal',
          schoolId: null,
          selectedListing: null,
        }),
      });

      // ...and later the SAME id 'area-1' becomes the URL selection again
      // (e.g. Back/Forward, or a fresh deep link) — hydration must now open
      // it normally, since this is a genuine navigation, not the show-in-list
      // dismissal re-fire.
      rerender({
        urlState: makeUrlState({
          journey: 'area-first',
          areaKey: 'manipal',
          schoolId: null,
          selectedListing: 'area-1',
        }),
      });

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });

      expect(result.current.selectedMarkerListing).toBe(listing);
      expect(result.current.markerPixelPos).toEqual({ x: 60, y: 60 });
    });
  });

  describe('isMarkerPopoverUrlBacked (Issue #1973 rev-2 code-review — AC11 all close paths)', () => {
    // Minimal mapContainerRef fixture (mirrors the one inside the
    // hydrateSelectedMarkerFromUrl describe block above).
    function makeMapContainerRef(markerRect: DOMRect) {
      const containerRect = { left: 100, top: 200, width: 0, height: 0 } as DOMRect;
      const markerEl = { getBoundingClientRect: () => markerRect } as unknown as HTMLElement;
      const container = {
        querySelector: vi.fn(() => markerEl),
        getBoundingClientRect: () => containerRect,
      } as unknown as HTMLDivElement;
      return { current: container };
    }

    it('(u1) a school-first popover hydrated from the URL is url-backed, and remains clearable by the F1 close path (finding #2)', () => {
      // school-first + schoolId, deep-linked via `listing` in the URL — the
      // exact shape reviewer finding #2 asked to be proven closeable.
      const urlState = makeUrlState({
        journey: 'school-first',
        areaKey: null,
        schoolId: 'school-1',
        selectedListing: 'school-1-listing',
      });
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeMapContainerRef(markerRect);
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('school-1-listing');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });

      expect(result.current.selectedMarkerListing).toBe(listing);
      // The hydrated popover is URL-backed — a later Back/Forward that takes
      // the URL's `listing` param to null MUST be able to close it.
      expect(result.current.isMarkerPopoverUrlBacked()).toBe(true);

      // Simulate MapDiscovery's F1 reverse-sync clear firing because
      // isMarkerPopoverUrlBacked() reported true — the close precondition
      // this test exists to prove.
      act(() => {
        result.current.clearMarkerPopoverFromUrl();
      });

      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
      expect(result.current.isMarkerPopoverUrlBacked()).toBe(false);
    });

    it('(u2) handleSelectMarkerListing: pure school-first click (no URL write) stays NOT url-backed; an area-first click (URL write) IS url-backed (finding #1)', () => {
      // Pure school-first: journey='school-first', schoolId set, no areaKey —
      // matches handleSelectMarkerListing's own predicate for "does not write
      // the URL", so popoverSourceRef must stay 'click'.
      const schoolFirstUrlState = makeUrlState({
        journey: 'school-first',
        areaKey: null,
        schoolId: 'school-1',
      });
      const { result: schoolFirst } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState: schoolFirstUrlState }),
      );
      act(() => {
        schoolFirst.current.handleSelectMarkerListing(makeListing('school-1-listing'));
      });
      expect(schoolFirst.current.isMarkerPopoverUrlBacked()).toBe(false);

      // Area-first: writes the URL, so popoverSourceRef flips to 'url'.
      const areaFirstUrlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
      });
      const { result: areaFirst } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState: areaFirstUrlState }),
      );
      act(() => {
        areaFirst.current.handleSelectMarkerListing(makeListing('area-1'));
      });
      expect(areaFirst.current.isMarkerPopoverUrlBacked()).toBe(true);
    });
  });

  describe('clearMarkerPopoverFromUrl (code-review F1 — reverse sync)', () => {
    it('(f1-a) clears both selectedMarkerListing and markerPixelPos', () => {
      const urlState = makeUrlState({ journey: 'area-first', areaKey: 'manipal', schoolId: null });
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState }),
      );

      act(() => {
        result.current.handleSelectMarkerListing(makeListing('area-1'));
        result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
      });
      expect(result.current.selectedMarkerListing).not.toBeNull();
      expect(result.current.markerPixelPos).not.toBeNull();

      act(() => {
        result.current.clearMarkerPopoverFromUrl();
      });

      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
    });

    it('(f1-b) Show-in-list → Back → Forward: reverse-sync clearing does not leave the suppression ref stuck, so the SAME id reopens on Forward', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const containerRect = { left: 100, top: 200, width: 0, height: 0 } as DOMRect;
      const markerEl = { getBoundingClientRect: () => markerRect } as unknown as HTMLElement;
      const mapContainerRef = {
        current: {
          querySelector: vi.fn(() => markerEl),
          getBoundingClientRect: () => containerRect,
        } as unknown as HTMLDivElement,
      };
      const urlActions = makeUrlActions();

      const { result, rerender } = renderHook(
        ({ urlState }: { urlState: DiscoverUrlState }) =>
          useMarkerSelection({ urlActions, urlState, mapContainerRef }),
        {
          initialProps: {
            urlState: makeUrlState({
              journey: 'area-first',
              areaKey: 'manipal',
              schoolId: null,
              selectedListing: 'area-1',
            }),
          },
        },
      );

      // Click opens the popover.
      act(() => {
        result.current.handleSelectMarkerListing(makeListing('area-1'));
        result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
      });
      expect(result.current.selectedMarkerListing).not.toBeNull();

      // "Show in list" dismisses the card (arms suppression for 'area-1'); the
      // URL keeps the id (the #1547 asymmetry — no clearSelectedListing call).
      act(() => {
        result.current.showMarkerInList('area-1');
      });
      expect(result.current.selectedMarkerListing).toBeNull();

      // Back: URL loses the listing id entirely. MapDiscovery's reverse-sync
      // effect would call clearMarkerPopoverFromUrl (already-null local state,
      // idempotent) — the urlState.selectedListing-keyed effect (existing,
      // load-bearing) nulls listTransitionSuppressIdRef because the armed id
      // ('area-1') no longer equals the new selectedListing (null).
      rerender({
        urlState: makeUrlState({
          journey: 'area-first',
          areaKey: 'manipal',
          schoolId: null,
          selectedListing: null,
        }),
      });
      act(() => {
        result.current.clearMarkerPopoverFromUrl();
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();

      // Forward: URL regains the SAME id 'area-1'. Because the ref was
      // cleared above (genuine navigation away, not a same-id re-render),
      // hydration must now succeed instead of staying stuck closed.
      rerender({
        urlState: makeUrlState({
          journey: 'area-first',
          areaKey: 'manipal',
          schoolId: null,
          selectedListing: 'area-1',
        }),
      });

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });

      expect(result.current.selectedMarkerListing).toBe(listing);
      expect(result.current.markerPixelPos).toEqual({ x: 60, y: 60 });
    });
  });

  describe('hydrateSelectedMarkerFromUrl bounded rAF retry (code-review F2)', () => {
    // Manual requestAnimationFrame/cancelAnimationFrame queue so tests can
    // deterministically advance (or never advance) the retry loop instead of
    // depending on jsdom's real ~16ms timer-backed rAF implementation.
    let queue: Map<number, FrameRequestCallback>;
    let nextId: number;
    let rafSpy: ReturnType<typeof vi.fn>;
    let cafSpy: ReturnType<typeof vi.fn>;

    function flushOneFrame() {
      const entries = Array.from(queue.entries());
      queue.clear();
      entries.forEach(([, cb]) => cb(0));
    }

    beforeEach(() => {
      queue = new Map();
      nextId = 1;
      rafSpy = vi.fn((cb: FrameRequestCallback) => {
        const id = nextId++;
        queue.set(id, cb);
        return id;
      });
      cafSpy = vi.fn((id: number) => {
        queue.delete(id);
      });
      vi.stubGlobal('requestAnimationFrame', rafSpy);
      vi.stubGlobal('cancelAnimationFrame', cafSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function makeFlakyMapContainerRef(failCount: number, markerRect: DOMRect) {
      const containerRect = { left: 100, top: 200, width: 0, height: 0 } as DOMRect;
      const markerEl = { getBoundingClientRect: () => markerRect } as unknown as HTMLElement;
      let calls = 0;
      const querySelector = vi.fn(() => {
        calls += 1;
        return calls > failCount ? markerEl : null;
      });
      const container = {
        querySelector,
        getBoundingClientRect: () => containerRect,
      } as unknown as HTMLDivElement;
      return { current: container };
    }

    it('(f2-a) marker absent on first checks, appears after N rAF ticks — popover eventually restores', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeFlakyMapContainerRef(3, markerRect);
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });
      expect(result.current.selectedMarkerListing).toBeNull();

      // Drain retries until the marker resolves (fails 3x, succeeds on the 4th check).
      act(() => flushOneFrame());
      act(() => flushOneFrame());
      expect(result.current.selectedMarkerListing).toBeNull();
      act(() => flushOneFrame());

      expect(result.current.selectedMarkerListing).toBe(listing);
      expect(result.current.markerPixelPos).toEqual({ x: 60, y: 60 });
    });

    it('(f2-b) aborts cleanly when urlState.selectedListing changes to a different id mid-retry', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      // Never resolves on its own — abort must be what stops it.
      const mapContainerRef = makeFlakyMapContainerRef(Number.POSITIVE_INFINITY, markerRect);
      const urlActions = makeUrlActions();

      const { result, rerender } = renderHook(
        ({ urlState }: { urlState: DiscoverUrlState }) =>
          useMarkerSelection({ urlActions, urlState, mapContainerRef }),
        {
          initialProps: {
            urlState: makeUrlState({
              journey: 'area-first',
              areaKey: 'manipal',
              schoolId: null,
              selectedListing: 'area-1',
            }),
          },
        },
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });
      expect(rafSpy).toHaveBeenCalledTimes(1);

      // URL moves to a different id while the retry is in flight.
      rerender({
        urlState: makeUrlState({
          journey: 'area-first',
          areaKey: 'manipal',
          schoolId: null,
          selectedListing: 'area-2',
        }),
      });

      act(() => flushOneFrame());

      // Never hydrated the stale id — abort happened before setState.
      expect(result.current.selectedMarkerListing).toBeNull();
      // No further frame scheduled after the abort.
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it('(f2-c) cancels the pending rAF on unmount (no setState-after-unmount)', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeFlakyMapContainerRef(Number.POSITIVE_INFINITY, markerRect);
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const { result, unmount } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });
      expect(queue.size).toBe(1);

      unmount();

      expect(cafSpy).toHaveBeenCalledTimes(1);
      expect(queue.size).toBe(0);

      // Flushing after unmount is a no-op (nothing left in the queue) — no
      // React "setState on an unmounted component" warning is possible here
      // since there is nothing left to call.
      expect(() => flushOneFrame()).not.toThrow();
    });

    it('(f2-d) bounded cap: gives up silently after the max retry attempts if the marker never appears', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeFlakyMapContainerRef(Number.POSITIVE_INFINITY, markerRect);
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });

      // Drain every scheduled retry (bounded — 30 rAF frames per the hook's cap).
      for (let i = 0; i < 30; i += 1) {
        act(() => flushOneFrame());
      }

      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
      // 1 initial synchronous check + 30 retried checks = 31 total attempts,
      // and no 31st frame gets scheduled once the cap is hit.
      expect(mapContainerRef.current.querySelector).toHaveBeenCalledTimes(31);
      expect(rafSpy).toHaveBeenCalledTimes(30);
      expect(queue.size).toBe(0);

      // No throw, no toast, no URL clear — just silence (LEAVE_PARAM_NO_POPOVER).
      expect(() => flushOneFrame()).not.toThrow();
    });

    it('(f2-e) suppression armed via showMarkerInList WHILE a retry is in flight aborts the retry and does not reopen the dismissed card', () => {
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      // Marker DOM node absent on every check (never resolves on its own) —
      // the retry loop must be stopped by suppression, not by finding the marker.
      const mapContainerRef = makeFlakyMapContainerRef(Number.POSITIVE_INFINITY, markerRect);
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      const listing = makeListing('area-1');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listing);
      });
      // First synchronous check misses the marker — a retry frame is scheduled.
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(rafSpy).toHaveBeenCalledTimes(1);

      // While that retry is still pending (no frame flushed yet), the user
      // dismisses via "Show in list" for the SAME id — arms
      // listTransitionSuppressIdRef for 'area-1' mid-retry (distinct from the
      // existing tests, which arm suppression either before the first
      // hydrate call or via a urlState.selectedListing change).
      act(() => {
        result.current.showMarkerInList('area-1');
      });
      expect(result.current.selectedMarkerListing).toBeNull();

      // The in-flight retry's next frame fires. F2(e) must abort it —
      // the dismissed card must NOT reopen.
      act(() => flushOneFrame());

      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
      // No further retry frame gets scheduled once the suppressed retry aborts.
      expect(rafSpy).toHaveBeenCalledTimes(1);
      expect(queue.size).toBe(0);
    });

    it('(f2-f) REORDER PIN: a second hydrate call that bails out via the idempotent early-return still tears down a stale in-flight retry, so it cannot later overwrite the click-computed position (rework of code-review advisory)', () => {
      // failCount=1: the FIRST querySelector check (the initial synchronous
      // attempt inside the first hydrate call) misses and schedules a retry.
      // The retry's own querySelector check (its 2nd call) would succeed —
      // but only if that stale retry is ever allowed to run.
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      const mapContainerRef = makeFlakyMapContainerRef(1, markerRect);
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'area-1',
      });
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      // First hydrate call: marker absent on the initial check — schedules a
      // retry frame. This is the stale in-flight retry the reorder must kill.
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(rafSpy).toHaveBeenCalledTimes(1);
      expect(cafSpy).not.toHaveBeenCalled();

      // A click (e.g. the user clicked the marker directly while the retry
      // above was still pending) sets selectedMarkerListing to the SAME id
      // with a precise click-computed pixel position — the exact value the
      // idempotent guard exists to protect from being overwritten.
      act(() => {
        result.current.handleSelectMarkerListing(makeListing('area-1'));
        result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
      });
      expect(result.current.markerPixelPos).toEqual({ x: 5, y: 5 });

      // Second hydrate call for the same id: bails out via the idempotent
      // early-return (selectedMarkerListing?.id === listing.id). Under the
      // CURRENT (fixed) ordering, cancelHydrationRetry() runs at the top of
      // the function BEFORE this guard, so the stale retry scheduled above
      // is torn down here. Under the OLD (pre-rework) ordering — cancel
      // called only after the guards — this call would return immediately
      // without ever reaching cancelHydrationRetry(), leaving the stale
      // retry's rAF frame live in the queue.
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('area-1'));
      });

      // Pins the reorder directly: the stale retry's rAF id must have been
      // cancelled by THIS call, and no new retry gets scheduled (idempotent
      // bail never reaches the scheduling code either).
      expect(cafSpy).toHaveBeenCalledTimes(1);
      expect(rafSpy).toHaveBeenCalledTimes(1);
      expect(queue.size).toBe(0);

      // Flushing now must be inert — under the fixed ordering there is
      // nothing left in the queue. Under the OLD ordering, this flush would
      // resume the stale retry, whose 2nd querySelector check succeeds
      // (failCount=1) and calls setMarkerPixelPos with the DOM-rect-derived
      // position — overwriting the click's {x:5,y:5} with {x:60,y:60}. That
      // overwrite is the exact flicker bug the reorder fixes, and this
      // assertion fails if the reorder is ever reverted.
      act(() => flushOneFrame());

      expect(result.current.markerPixelPos).toEqual({ x: 5, y: 5 });
      expect(result.current.selectedMarkerListing?.id).toBe('area-1');
      expect(mapContainerRef.current.querySelector).toHaveBeenCalledTimes(1);
    });
  });

  describe('MapDiscovery reconciliation F3 (rework) — third URL-reconciliation branch', () => {
    // These tests exercise the hook-level clear-and-cancel method
    // (clearMarkerPopoverFromUrl) that MapDiscovery's F3 reconciliation
    // branch calls when: isMarkerPopoverEligible && mapReady &&
    // urlState.selectedListing != null && urlHydratedMarkerListing == null
    // && selectedMarkerListing?.id !== urlState.selectedListing (a
    // DIFFERENT, currently-unresolvable id has replaced the one whose
    // popover is still showing). The full three-branch effect itself lives
    // in MapDiscovery.tsx (~lines 1636+) and is covered by a later e2e
    // stage; these tests pin the hook-owned half of the contract: that
    // clearMarkerPopoverFromUrl cancels any in-flight retry BEFORE clearing
    // local state, and does not touch the URL.
    let queue: Map<number, FrameRequestCallback>;
    let nextId: number;
    let rafSpy: ReturnType<typeof vi.fn>;
    let cafSpy: ReturnType<typeof vi.fn>;

    function flushOneFrame() {
      const entries = Array.from(queue.entries());
      queue.clear();
      entries.forEach(([, cb]) => cb(0));
    }

    beforeEach(() => {
      queue = new Map();
      nextId = 1;
      rafSpy = vi.fn((cb: FrameRequestCallback) => {
        const id = nextId++;
        queue.set(id, cb);
        return id;
      });
      cafSpy = vi.fn((id: number) => {
        queue.delete(id);
      });
      vi.stubGlobal('requestAnimationFrame', rafSpy);
      vi.stubGlobal('cancelAnimationFrame', cafSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function makeNeverResolvingMapContainerRef() {
      const containerRect = { left: 100, top: 200, width: 0, height: 0 } as DOMRect;
      const container = {
        querySelector: vi.fn(() => null),
        getBoundingClientRect: () => containerRect,
      } as unknown as HTMLDivElement;
      return { current: container };
    }

    it('(f3-a) URL moves from open listing A to a DIFFERENT unresolvable id B: clearMarkerPopoverFromUrl closes A AND cancels A\'s in-flight retry, without any URL write', () => {
      const setSelectedListing = vi.fn();
      const clearSelectedListing = vi.fn();
      const urlActions = makeUrlActions({ setSelectedListing, clearSelectedListing });
      const mapContainerRef = makeNeverResolvingMapContainerRef();
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'listing-a',
      });
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions, urlState, mapContainerRef }),
      );

      // A hydration retry for A is kicked off first — the marker DOM node
      // is never present in this fixture, so the initial synchronous check
      // misses and schedules one rAF retry frame.
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(makeListing('listing-a'));
      });
      expect(rafSpy).toHaveBeenCalledTimes(1);
      expect(cafSpy).not.toHaveBeenCalled();
      expect(result.current.selectedMarkerListing).toBeNull();

      // A direct marker click for the SAME id then opens the popover for A
      // (bypassing hydrateSelectedMarkerFromUrl's idempotent guard, since
      // that guard only short-circuits a SECOND hydrate call — a click goes
      // through handleSelectMarkerListing/handleMarkerClickWithPosition
      // instead). The retry scheduled above is still in flight underneath.
      const listingA = makeListing('listing-a');
      act(() => {
        result.current.handleSelectMarkerListing(listingA);
        result.current.handleMarkerClickWithPosition({ x: 5, y: 5 });
      });
      expect(result.current.selectedMarkerListing).toBe(listingA);
      expect(result.current.markerPixelPos).toEqual({ x: 5, y: 5 });
      expect(cafSpy).not.toHaveBeenCalled();

      // The click itself already wrote the URL (the #1547 area-first sync,
      // unrelated to F3) — reset the URL-write spies so the assertions
      // below isolate what clearMarkerPopoverFromUrl itself does.
      setSelectedListing.mockClear();
      clearSelectedListing.mockClear();

      // Simulate MapDiscovery's F3 branch: URL genuinely moved to a
      // different, unresolvable id B while A's popover is still showing.
      act(() => {
        result.current.clearMarkerPopoverFromUrl();
      });

      expect(result.current.selectedMarkerListing).toBeNull();
      expect(result.current.markerPixelPos).toBeNull();
      // The in-flight retry for A was cancelled by the clear call.
      expect(cafSpy).toHaveBeenCalledTimes(1);
      expect(queue.size).toBe(0);
      // The URL `listing` param is left as-is — F3 never strips it.
      expect(clearSelectedListing).not.toHaveBeenCalled();
      expect(setSelectedListing).not.toHaveBeenCalled();

      // A stale flush (if the cancelled frame somehow fired) must not
      // resurrect A's popover.
      act(() => flushOneFrame());
      expect(result.current.selectedMarkerListing).toBeNull();
    });

    it('(f3-b) F2-not-regressed guard: a same-id (fresh deep-link) mid-retry case is untouched by clearMarkerPopoverFromUrl and keeps polling to a successful hydrate', () => {
      const urlState = makeUrlState({
        journey: 'area-first',
        areaKey: 'manipal',
        schoolId: null,
        selectedListing: 'listing-b',
      });
      const markerRect = { left: 150, top: 250, width: 20, height: 20 } as DOMRect;
      // Marker absent on the first check, present from the second check
      // onward — mirrors a fresh deep-link to B where B just hasn't
      // painted yet (F2's own retry territory, not F3's).
      const containerRect = { left: 100, top: 200, width: 0, height: 0 } as DOMRect;
      const markerEl = { getBoundingClientRect: () => markerRect } as unknown as HTMLElement;
      let calls = 0;
      const querySelector = vi.fn(() => {
        calls += 1;
        return calls > 1 ? markerEl : null;
      });
      const mapContainerRef = {
        current: {
          querySelector,
          getBoundingClientRect: () => containerRect,
        } as unknown as HTMLDivElement,
      };
      const { result } = renderHook(() =>
        useMarkerSelection({ urlActions: makeUrlActions(), urlState, mapContainerRef }),
      );

      // Fresh deep-link to B: no popover open yet (selectedMarkerListing is
      // still null), and hydration's first synchronous check misses,
      // scheduling a retry frame — this is the F2 "same id mid-retry" case
      // the F3 guard (`selectedMarkerListing != null && ... !== urlState.
      // selectedListing`) must never fire for, since selectedMarkerListing
      // is null here (nothing to clear) and the id has not changed.
      const listingB = makeListing('listing-b');
      act(() => {
        result.current.hydrateSelectedMarkerFromUrl(listingB);
      });
      expect(result.current.selectedMarkerListing).toBeNull();
      expect(rafSpy).toHaveBeenCalledTimes(1);

      // The F3 discriminator would only fire clearMarkerPopoverFromUrl when
      // selectedMarkerListing is non-null and mismatched with the URL id —
      // neither holds here, so no clear call happens (MapDiscovery-effect
      // behaviour). We assert the hook-level consequence directly: the
      // retry is NOT cancelled and still resolves the popover once the
      // pending frame is flushed.
      expect(cafSpy).not.toHaveBeenCalled();

      act(() => flushOneFrame());

      expect(result.current.selectedMarkerListing?.id).toBe('listing-b');
      expect(result.current.markerPixelPos).toEqual({ x: 60, y: 60 });
      expect(cafSpy).not.toHaveBeenCalled();
    });
  });
});
