import { describe, it, expect } from 'vitest';
import { resolveAreaRegionName, type AreaRegionNameInput } from './areaRegionName';
import type { AreaGroup } from '@/hooks/useAreaGroups';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';

const SUMMARY_REGIONS: SummaryRegionRef[] = [{ regionKey: 'north', regionLabel: 'North Udupi' }];

const GROUP: AreaGroup = {
  id: 'g1',
  name: 'Manipal Belt',
  subtitle: null,
  region_label: 'University Belt Region',
  school_count: 0,
  area_keys: ['IN|KA|Udupi|Manipal'],
};

const prettify = (slug: string | null | undefined) => (slug ? `Pretty(${slug})` : null);

/** R7 differential — byte-for-byte copy of the ORIGINAL inline expression
 * from DiscoverRightPanel.tsx :1758-1762. */
function originalInline(
  input: AreaRegionNameInput,
  prettifyZoneSlug: (slug: string | null | undefined) => string | null,
): string | null {
  return input.scope
    ? input.summaryRegions?.find((r) => r.regionKey.toLowerCase() === input.scope!.toLowerCase())?.regionLabel ??
        prettifyZoneSlug(input.scope)
    : input.activeGroup?.region_label ?? null;
}

describe('resolveAreaRegionName (#2657 C1)', () => {
  it('uses the matched summary-region label (case-insensitive) when scope is set', () => {
    expect(
      resolveAreaRegionName({ scope: 'NORTH', summaryRegions: SUMMARY_REGIONS, activeGroup: null }, prettify),
    ).toBe('North Udupi');
  });

  it('falls back to prettifyZoneSlug when scope has no summary-region match', () => {
    expect(
      resolveAreaRegionName({ scope: 'east', summaryRegions: SUMMARY_REGIONS, activeGroup: null }, prettify),
    ).toBe('Pretty(east)');
  });

  it('falls back to the active group region_label when scope is absent', () => {
    expect(
      resolveAreaRegionName({ scope: null, summaryRegions: SUMMARY_REGIONS, activeGroup: GROUP }, prettify),
    ).toBe('University Belt Region');
  });

  it('is null when scope is absent and there is no active group', () => {
    expect(
      resolveAreaRegionName({ scope: undefined, summaryRegions: SUMMARY_REGIONS, activeGroup: undefined }, prettify),
    ).toBeNull();
  });

  it('R7 differential: matches the original inline expression across a table of inputs', () => {
    const table: AreaRegionNameInput[] = [
      { scope: 'NORTH', summaryRegions: SUMMARY_REGIONS, activeGroup: null },
      { scope: 'east', summaryRegions: SUMMARY_REGIONS, activeGroup: null },
      { scope: null, summaryRegions: SUMMARY_REGIONS, activeGroup: GROUP },
      { scope: undefined, summaryRegions: SUMMARY_REGIONS, activeGroup: undefined },
      { scope: '', summaryRegions: SUMMARY_REGIONS, activeGroup: GROUP },
      { scope: 'north', summaryRegions: undefined, activeGroup: GROUP },
    ];
    for (const input of table) {
      expect(resolveAreaRegionName(input, prettify)).toBe(originalInline(input, prettify));
    }
  });
});
