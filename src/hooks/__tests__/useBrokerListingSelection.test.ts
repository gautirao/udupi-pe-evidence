/**
 * useBrokerListingSelection — extracted from BrokerListings.tsx (#2385).
 *
 * Protects the selection/eligibility semantics that the broker "My Listings"
 * page relies on: only DRAFT/REJECTED listings are bulk-deletable, toggling
 * is per-id, and select-all only selects the deletable subset.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBrokerListingSelection, isDeletableListingStatus } from '../useBrokerListingSelection';
import type { ListingResponse } from '../useBrokerListings';

function makeListing(id: string, status: string): ListingResponse {
  return { id, status } as ListingResponse;
}

describe('isDeletableListingStatus', () => {
  it('is true only for DRAFT and REJECTED', () => {
    expect(isDeletableListingStatus('DRAFT')).toBe(true);
    expect(isDeletableListingStatus('REJECTED')).toBe(true);
    expect(isDeletableListingStatus('PENDING_REVIEW')).toBe(false);
    expect(isDeletableListingStatus('LIVE')).toBe(false);
    expect(isDeletableListingStatus('ARCHIVED')).toBe(false);
  });
});

describe('useBrokerListingSelection', () => {
  const listings = [
    makeListing('1', 'DRAFT'),
    makeListing('2', 'PENDING_REVIEW'),
    makeListing('3', 'LIVE'),
    makeListing('4', 'REJECTED'),
    makeListing('5', 'ARCHIVED'),
  ];

  it('computes deletableListings as only DRAFT/REJECTED', () => {
    const { result } = renderHook(() => useBrokerListingSelection(listings));
    expect(result.current.deletableListings.map((l) => l.id)).toEqual(['1', '4']);
  });

  it('starts with no selection', () => {
    const { result } = renderHook(() => useBrokerListingSelection(listings));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('toggleSelect adds then removes an id', () => {
    const { result } = renderHook(() => useBrokerListingSelection(listings));

    act(() => result.current.toggleSelect('1'));
    expect(result.current.selectedIds.has('1')).toBe(true);

    act(() => result.current.toggleSelect('1'));
    expect(result.current.selectedIds.has('1')).toBe(false);
  });

  it('selectAll selects only the deletable listings, ignoring ineligible ones', () => {
    const { result } = renderHook(() => useBrokerListingSelection(listings));

    act(() => result.current.selectAll());

    expect(Array.from(result.current.selectedIds).sort()).toEqual(['1', '4']);
    expect(result.current.selectedIds.has('2')).toBe(false);
    expect(result.current.selectedIds.has('3')).toBe(false);
    expect(result.current.selectedIds.has('5')).toBe(false);
  });

  it('deselectAll clears the selection', () => {
    const { result } = renderHook(() => useBrokerListingSelection(listings));

    act(() => result.current.selectAll());
    expect(result.current.selectedIds.size).toBeGreaterThan(0);

    act(() => result.current.deselectAll());
    expect(result.current.selectedIds.size).toBe(0);
  });
});
