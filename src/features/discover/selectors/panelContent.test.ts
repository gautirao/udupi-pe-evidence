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
});
