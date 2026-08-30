import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseMarkerSelection = vi.hoisted(() => vi.fn());
vi.mock('@/features/discover/state/useMarkerSelection', () => ({ useMarkerSelection: mockUseMarkerSelection }));

import { useDiscoverMarkerController } from './useDiscoverMarkerController';

const MARKER_SELECTION_RESULT = {
  selectedMarkerListing: null,
  markerPixelPos: null,
  handleSelectMarkerListing: vi.fn(),
  handleMarkerClickWithPosition: vi.fn(),
  handlePopoverDismiss: vi.fn(),
  selectMarkerSibling: vi.fn(),
  showMarkerInList: vi.fn(),
  clearSelectedMarkerListing: vi.fn(),
  clearMarkerPopoverFromUrl: vi.fn(),
  isMarkerPopoverUrlBacked: false,
  hydrateSelectedMarkerFromUrl: vi.fn(),
};

describe('useDiscoverMarkerController (#2142 Commit 3 — thin wrapper over useMarkerSelection, unchanged)', () => {
  beforeEach(() => {
    mockUseMarkerSelection.mockReset().mockReturnValue(MARKER_SELECTION_RESULT);
  });

  it('forwards urlActions/urlState/mapContainerRef/isNodeAreaLeaf through unchanged', () => {
    const urlActions = {} as unknown as Parameters<typeof useDiscoverMarkerController>[0]['urlActions'];
    const urlState = {} as unknown as Parameters<typeof useDiscoverMarkerController>[0]['urlState'];
    const mapContainerRef = { current: null };

    renderHook(() =>
      useDiscoverMarkerController({
        urlActions,
        urlState,
        mapContainerRef,
        isNodeAreaLeaf: true,
      }),
    );

    expect(mockUseMarkerSelection).toHaveBeenCalledWith({
      urlActions,
      urlState,
      mapContainerRef,
      isNodeAreaLeaf: true,
    });
  });

  it('returns the SAME result object useMarkerSelection produces (no wrapping/reshaping)', () => {
    const { result } = renderHook(() =>
      useDiscoverMarkerController({
        urlActions: {} as unknown as Parameters<typeof useDiscoverMarkerController>[0]['urlActions'],
        urlState: {} as unknown as Parameters<typeof useDiscoverMarkerController>[0]['urlState'],
        mapContainerRef: { current: null },
        isNodeAreaLeaf: false,
      }),
    );
    expect(result.current).toBe(MARKER_SELECTION_RESULT);
  });
});
