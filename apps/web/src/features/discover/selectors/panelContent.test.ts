import { describe, it, expect } from 'vitest';
import { derivePanelContent } from './panelContent';
import * as canonical from '@/features/discover/utils/discoverPanelState';
import type { DiscoverUrlState } from '@/hooks/useDiscoverUrlState';

describe('selectors/panelContent (#2142 Commit 2 — thin re-export, not a physical move)', () => {
  it('re-exports the SAME function reference as the canonical module (no divergent copy)', () => {
    expect(derivePanelContent).toBe(canonical.derivePanelContent);
  });

  it('forwards a real call through correctly (guided-entry baseline case)', () => {
    const urlState = {
      journey: null,
      areaKey: null,
      schoolId: null,
      groupId: null,
      schoolPicking: null,
      groupResults: null,
      nodeListings: null,
      selectedGroup: null,
      selectedRegion: null,
      selectedMaxKm: null,
    } as unknown as DiscoverUrlState;
    expect(derivePanelContent(urlState)).toBe('guided-entry');
  });

  it("legacy ?areaKey= in a city with no active navigation hierarchy (journey null) resolves panel content 'area-selected' (#2858/#2795)", () => {
    // A city with no active hierarchy yields journey null (defaultJourney.test.ts
    // covers that half). journey is null, NOT 'area-first', so the area-first
    // branch is not the path taken; only the no-journey areaKey fall-through is.
    const urlState = {
      journey: null,
      areaKey: 'kadri',
      schoolId: null,
      groupId: null,
      schoolPicking: null,
      groupResults: null,
      nodeListings: null,
      selectedGroup: null,
      selectedRegion: null,
      selectedMaxKm: null,
    } as unknown as DiscoverUrlState;
    expect(derivePanelContent(urlState)).toBe('area-selected');
  });
});
