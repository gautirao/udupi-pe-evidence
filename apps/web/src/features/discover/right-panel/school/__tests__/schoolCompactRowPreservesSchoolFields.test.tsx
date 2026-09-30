/**
 * Issue #2762 PR-B — BLOCKING verification (architect-flagged risk). School's new compact
 * FilterBar row is built from `usePropertyFilterGroups` — the SAME hook By-area uses — rather
 * than School's own `clearSchoolPropertyFilters`. Every write path in `usePropertyFilterGroups`
 * (handleSelectBudget/handleToggleBedroom/handleTogglePropertyType/etc.) is a pure
 * `{...filters, <patched field>}` spread, so it can only ever touch the field(s) it names —
 * confirmed by reading the actual source (handleSelectBudget: `onFiltersChange({ ...filters,
 * priceMin: undefined, priceMax: max })`). This test proves that empirically rather than by
 * inspection alone: setting then clearing a price band through the compact row's own handler must
 * never disturb `schoolLat`/`schoolLon`/`schoolRadiusKm` or `polygon` — losing any of those would
 * silently exit School/proximity mode, which is the exact risk this test exists to rule out.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePropertyFilterGroups } from '@/features/discover/buyer-filters/controllers/usePropertyFilterGroups';
import type { PropertyFilters } from '@/hooks/usePropertyListings';

describe('#2762 PR-B — School compact row (usePropertyFilterGroups) preserves school-proximity fields', () => {
  it('setting then clearing a price band through the compact row leaves schoolLat/schoolLon/schoolRadiusKm and polygon untouched', () => {
    let filters: PropertyFilters = {
      schoolLat: 12.93,
      schoolLon: 77.58,
      schoolRadiusKm: 5,
      polygon: [
        [12.9, 77.5],
        [12.91, 77.51],
        [12.92, 77.52],
      ],
    };
    const onFiltersChange = vi.fn((next: PropertyFilters) => {
      filters = next;
    });

    const { result, rerender } = renderHook(
      (props: { filters: PropertyFilters }) =>
        usePropertyFilterGroups({
          filters: props.filters,
          onFiltersChange,
          intent: 'buy',
          isReadyToMoveSupported: true,
          isCommercialSubtypeSupported: false,
        }),
      { initialProps: { filters } },
    );

    // Set a price band via the SAME handler the compact row's Budget pill calls.
    act(() => {
      result.current.handleSelectBudget(5000000);
    });
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ priceMax: 5000000, schoolLat: 12.93, schoolLon: 77.58, schoolRadiusKm: 5 }),
    );
    expect(filters.priceMax).toBe(5000000);

    rerender({ filters });

    // Clear it back to "Any price" (undefined) — the compact row's own clear affordance.
    act(() => {
      result.current.handleSelectBudget(undefined);
    });

    expect(filters.priceMax).toBeUndefined();
    // THE BLOCKING ASSERTION — school-proximity fields and polygon survive the clear.
    expect(filters.schoolLat).toBe(12.93);
    expect(filters.schoolLon).toBe(77.58);
    expect(filters.schoolRadiusKm).toBe(5);
    expect(filters.polygon).toEqual([
      [12.9, 77.5],
      [12.91, 77.51],
      [12.92, 77.52],
    ]);
  });

  it('handleTogglePropertyType and handleToggleBedroom (the other compact-row handlers) also preserve school-proximity fields', () => {
    let filters: PropertyFilters = { schoolLat: 12.93, schoolLon: 77.58, schoolRadiusKm: 5 };
    const onFiltersChange = vi.fn((next: PropertyFilters) => {
      filters = next;
    });

    const { result, rerender } = renderHook(
      (props: { filters: PropertyFilters }) =>
        usePropertyFilterGroups({
          filters: props.filters,
          onFiltersChange,
          intent: 'buy',
          isReadyToMoveSupported: true,
          isCommercialSubtypeSupported: false,
        }),
      { initialProps: { filters } },
    );

    act(() => {
      result.current.handleTogglePropertyType('apartment');
    });
    expect(filters.schoolLat).toBe(12.93);
    rerender({ filters });

    act(() => {
      result.current.handleToggleBedroom(2);
    });
    expect(filters.schoolLat).toBe(12.93);
    expect(filters.schoolLon).toBe(77.58);
    expect(filters.schoolRadiusKm).toBe(5);
  });
});
