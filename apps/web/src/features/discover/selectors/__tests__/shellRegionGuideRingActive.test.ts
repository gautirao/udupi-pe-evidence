/** Direct unit coverage for the mutual-exclusion rule between the panel's JourneySwitcher ring/helper and the header's copy of the same signal. */
import { describe, it, expect } from 'vitest';
import { deriveShellRegionGuideRingActive } from '../shellRegionGuideRingActive';

describe('deriveShellRegionGuideRingActive', () => {
  it('suppresses the header ring at guided-entry when the panel still owns its own switcher (header too narrow to host controls)', () => {
    expect(deriveShellRegionGuideRingActive(true, 'guided-entry', false)).toBe(false);
  });

  it('stays false for guided-entry + not hosting even when the raw signal is already false', () => {
    expect(deriveShellRegionGuideRingActive(false, 'guided-entry', false)).toBe(false);
  });

  it('passes the raw signal through for guided-entry once the header hosts controls (it is now the sole selector there)', () => {
    expect(deriveShellRegionGuideRingActive(true, 'guided-entry', true)).toBe(true);
    expect(deriveShellRegionGuideRingActive(false, 'guided-entry', true)).toBe(false);
  });

  it('passes the raw signal through unchanged for every non-guided-entry panel state, regardless of hosting', () => {
    expect(deriveShellRegionGuideRingActive(true, 'area-selected', false)).toBe(true);
    expect(deriveShellRegionGuideRingActive(false, 'area-selected', false)).toBe(false);
    expect(deriveShellRegionGuideRingActive(true, 'schools-in-area', true)).toBe(true);
    expect(deriveShellRegionGuideRingActive(true, 'agri-landing', true)).toBe(true);
  });
});
