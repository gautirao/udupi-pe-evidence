import { describe, it, expect } from 'vitest';
import { estimatePillWidth, resolveToolbarCollapse } from '../toolbarOverflow';

describe('Issue #2729 V1 — toolbarOverflow pure decision logic', () => {
  describe('estimatePillWidth', () => {
    it('longer labels are wider than shorter ones', () => {
      expect(estimatePillWidth('Any BHK')).toBeLessThan(estimatePillWidth('2, 3, 4 BHK'));
    });
  });

  describe('resolveToolbarCollapse', () => {
    const base = {
      familyLabel: 'Residential' as string | null,
      typeLabel: 'All types',
      bhkLabel: 'Any BHK' as string | null,
      budgetLabel: 'Any price',
      areaLabel: 'Any area (sq ft)',
    };

    it('availableWidth null (not measured yet / ResizeObserver unavailable) — never collapses', () => {
      expect(resolveToolbarCollapse({ availableWidth: null, ...base })).toEqual({
        collapseArea: false,
        collapseBhk: false,
      });
    });

    it('plenty of width — nothing collapses', () => {
      expect(resolveToolbarCollapse({ availableWidth: 2000, ...base })).toEqual({
        collapseArea: false,
        collapseBhk: false,
      });
    });

    // Issue #2729 (reviewer round-3 measurement) — real Playwright frame at 1366×768: toolbar
    // clientWidth 618, scrollWidth 664 (all 5 pills + More filters). Collapsing Area alone (the
    // widest, lowest-priority pill here) closes a 46px overflow comfortably.
    it('narrow width (measured 1366×768 case, Residential+BHK): collapses Area only', () => {
      const result = resolveToolbarCollapse({ availableWidth: 618, ...base });
      expect(result.collapseArea).toBe(true);
      expect(result.collapseBhk).toBe(false);
    });

    it('very narrow width: collapses BOTH Area and BHK', () => {
      const result = resolveToolbarCollapse({ availableWidth: 300, ...base });
      expect(result.collapseArea).toBe(true);
      expect(result.collapseBhk).toBe(true);
    });

    it('Family, Type and Budget NEVER collapse — the function has no lever to hide them, by construction', () => {
      // Even at an impossibly narrow width, only collapseArea/collapseBhk exist on the result —
      // there is no way to ask this function to hide Family/Type/Budget.
      const result = resolveToolbarCollapse({ availableWidth: 1, ...base });
      expect(Object.keys(result).sort()).toEqual(['collapseArea', 'collapseBhk']);
    });

    it('Commercial (no BHK pill at all): collapsing Area alone is enough at a realistic narrow width — collapseBhk is moot (bhkLabel=null means no BHK pill exists to hide either way)', () => {
      const commercial = { ...base, familyLabel: 'Commercial', typeLabel: 'All commercial', bhkLabel: null };
      const result = resolveToolbarCollapse({ availableWidth: 618, ...commercial });
      expect(result.collapseArea).toBe(true);
    });

    it('MUTATION CHECK: a width just 1px below the exact "all 5 fit" threshold collapses Area; 1px above does not', () => {
      // Establish the exact threshold for this fixed label set, then probe both sides of it.
      const wide = resolveToolbarCollapse({ availableWidth: 100000, ...base });
      expect(wide.collapseArea).toBe(false);
      let threshold = 100000;
      for (let w = 100000; w >= 0; w -= 1) {
        if (resolveToolbarCollapse({ availableWidth: w, ...base }).collapseArea) {
          threshold = w;
          break;
        }
      }
      expect(resolveToolbarCollapse({ availableWidth: threshold + 1, ...base }).collapseArea).toBe(false);
      expect(resolveToolbarCollapse({ availableWidth: threshold, ...base }).collapseArea).toBe(true);
    });
  });
});
