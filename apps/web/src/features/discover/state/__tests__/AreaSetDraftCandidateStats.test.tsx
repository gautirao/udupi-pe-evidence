import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { ReactNode } from 'react';
import {
  AreaSetDraftProvider,
  useAreaSetDraftContext,
} from '@/features/discover/state/AreaSetDraftContext';

// Mock dependencies required by AreaSetDraftProvider
vi.mock('@/features/discover/context/useDiscoverContext', () => ({
  useDiscoverNav: () => ({
    resultScope: { active: { kind: 'AREA_SET', areaKeys: ['committed-area-1'] } },
    filters: {},
    intent: 'buy',
    city: 'bangalore',
  }),
}));

vi.mock('@/hooks/useNearbyAreaCandidates', () => ({
  useNearbyAreaCandidates: () => ({
    data: {
      city: 'bangalore',
      selectedAreaKeys: ['committed-area-1'],
      candidates: [
        {
          areaKey: 'hebbal',
          name: 'Hebbal',
          geoCenterLat: 13.04,
          geoCenterLon: 77.59,
          eligibleListingCount: 18,
          schoolCount: 8,
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/discover/state/DiscoverDataSourceContext', () => ({
  useDiscoverSource: () => ({ mode: 'live' }),
  discoverKey: (...args: unknown[]) => args,
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AreaSetDraftProvider>{children}</AreaSetDraftProvider>;
}

describe('AreaSetDraftCandidateStats — Task 1: Candidate → Member Count Preservation', () => {
  it('1. Candidate → member count preservation: snapshots candidate eligibleListingCount and schoolCount on Add', () => {
    const { result } = renderHook(() => useAreaSetDraftContext(), { wrapper });

    act(() => {
      const outcome = result.current.commands.addCandidate({
        areaKey: 'hebbal',
        eligibleListingCount: 18,
        schoolCount: 8,
      });
      expect(outcome).toBe('added');
    });

    expect(result.current.view.draftAreaKeys).toContain('hebbal');
    expect(result.current.draftMemberStatsByAreaKey['hebbal']).toEqual({
      eligibleListingCount: 18,
      schoolCount: 8,
    });
  });

  it('2. Remove + re-add: clears stats on remove, and stores NEW candidate stats on re-add', () => {
    const { result } = renderHook(() => useAreaSetDraftContext(), { wrapper });

    // Initial add with 18 listings
    act(() => {
      result.current.commands.addCandidate({
        areaKey: 'hebbal',
        eligibleListingCount: 18,
        schoolCount: 8,
      });
    });
    expect(result.current.draftMemberStatsByAreaKey['hebbal']).toEqual({
      eligibleListingCount: 18,
      schoolCount: 8,
    });

    // Remove
    act(() => {
      result.current.commands.remove('hebbal');
    });
    expect(result.current.draftMemberStatsByAreaKey['hebbal']).toBeUndefined();

    // Re-add later when candidate returns with updated 11 listings
    act(() => {
      result.current.commands.addCandidate({
        areaKey: 'hebbal',
        eligibleListingCount: 11,
        schoolCount: 8,
      });
    });
    expect(result.current.draftMemberStatsByAreaKey['hebbal']).toEqual({
      eligibleListingCount: 11,
      schoolCount: 8,
    });
  });

  it('3. At-limit: attempting Add when at limit does NOT create a metadata snapshot', () => {
    const { result } = renderHook(() => useAreaSetDraftContext(), { wrapper });

    act(() => {
      result.current.commands.addCandidate({
        areaKey: 'area-2',
        eligibleListingCount: 10,
        schoolCount: 2,
      });
      result.current.commands.addCandidate({
        areaKey: 'area-3',
        eligibleListingCount: 15,
        schoolCount: 3,
      });
    });

    // Now draft is at max capacity (committed-area-1 + area-2 + area-3 = 3)
    expect(result.current.view.atLimit).toBe(true);

    let outcome: string | undefined;
    act(() => {
      outcome = result.current.commands.addCandidate({
        areaKey: 'area-4',
        eligibleListingCount: 99,
        schoolCount: 9,
      });
    });

    expect(outcome).toBe('at-limit');
    expect(result.current.draftMemberStatsByAreaKey['area-4']).toBeUndefined();
  });

  it('4. Cancel/reset: abandoning draft clears uncommitted candidate snapshots', () => {
    const { result } = renderHook(() => useAreaSetDraftContext(), { wrapper });

    act(() => {
      result.current.commands.addCandidate({
        areaKey: 'hebbal',
        eligibleListingCount: 18,
        schoolCount: 8,
      });
    });
    expect(result.current.draftMemberStatsByAreaKey['hebbal']).toEqual({
      eligibleListingCount: 18,
      schoolCount: 8,
    });

    // Reset to committed / cancel
    act(() => {
      result.current.commands.resetToCommitted();
    });

    expect(result.current.draftMemberStatsByAreaKey['hebbal']).toBeUndefined();
    expect(result.current.view.draftAreaKeys).toEqual(['committed-area-1']);
  });

  it('5. Existing committed member fallback: committed area seeded with no candidate snapshot returns undefined snapshot', () => {
    const { result } = renderHook(() => useAreaSetDraftContext(), { wrapper });

    // Seeded committed area has no candidate snapshot
    expect(result.current.view.draftAreaKeys).toContain('committed-area-1');
    expect(result.current.draftMemberStatsByAreaKey['committed-area-1']).toBeUndefined();
  });

  it('6. Map member card count precedence: snapshot (9 listings, 0 schools) overrides filter-blind area totals (126 listings, 5 schools)', () => {
    const { result } = renderHook(() => useAreaSetDraftContext(), { wrapper });

    act(() => {
      result.current.commands.addCandidate({
        areaKey: 'kadugodi',
        eligibleListingCount: 9,
        schoolCount: 0,
      });
    });

    const area = { areaKey: 'kadugodi', name: 'Kadugodi', listingCount: 126, schoolCount: 5 };
    const snapshot = result.current.draftMemberStatsByAreaKey['kadugodi'];

    const count = snapshot?.eligibleListingCount ?? area.listingCount;
    const schoolCount = snapshot?.schoolCount ?? area.schoolCount;

    expect(count).toBe(9);
    expect(count).not.toBe(126);
    expect(schoolCount).toBe(0);
    expect(schoolCount).not.toBe(5);
  });
});
