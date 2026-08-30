import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockUseDiscoverInteractionState = vi.hoisted(() => vi.fn());
const mockUseAreaSearchState = vi.hoisted(() => vi.fn());

vi.mock('@/features/discover/state/useDiscoverInteractionState', () => ({
  useDiscoverInteractionState: mockUseDiscoverInteractionState,
}));
vi.mock('@/features/discover/state/useAreaSearchState', () => ({ useAreaSearchState: mockUseAreaSearchState }));

import { useDiscoverInteractionController } from './useDiscoverInteractionController';

const INTERACTION_RESULT = {
  view: { hoveredListingId: null, hoveredAreaKeyForMap: null, highlightedAreaKeys: [] },
  commands: { setHighlightedAreas: vi.fn() },
};
const AREA_SEARCH_RESULT = { areaSearchQuery: '', debouncedAreaSearchQuery: '', setAreaSearchQuery: vi.fn() };

describe('useDiscoverInteractionController', () => {
  beforeEach(() => {
    mockUseDiscoverInteractionState.mockReset().mockReturnValue({
      ...INTERACTION_RESULT,
      commands: { setHighlightedAreas: vi.fn() },
    });
    mockUseAreaSearchState.mockReset().mockReturnValue(AREA_SEARCH_RESULT);
  });

  it('returns the composed hover/emphasis + area-search output', () => {
    const { result } = renderHook(() => useDiscoverInteractionController());
    expect(result.current.hoveredListingId).toBeNull();
    expect(result.current.hoveredAreaKeyForMap).toBeNull();
    expect(result.current.debouncedAreaSearchQuery).toBe('');
    expect(result.current.setAreaSearchQuery).toBe(AREA_SEARCH_RESULT.setAreaSearchQuery);
  });

  it('handleAreaClusterClick highlights exactly the cluster member areaKeys (issue #1806 FIX-5d)', () => {
    const setHighlightedAreas = vi.fn();
    mockUseDiscoverInteractionState.mockReturnValue({ ...INTERACTION_RESULT, commands: { setHighlightedAreas } });
    const { result } = renderHook(() => useDiscoverInteractionController());
    act(() =>
      result.current.handleAreaClusterClick({
        areas: [{ areaKey: 'a:1' }, { areaKey: 'a:2' }],
      } as never),
    );
    expect(setHighlightedAreas).toHaveBeenCalledWith(['a:1', 'a:2']);
  });
});
