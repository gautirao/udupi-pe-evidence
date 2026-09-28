import { describe, it, expect } from 'vitest';
import { buildRegionGuideHelperText, type RegionGuideHelperTextInput } from './regionGuideHelperText';
import type { SummaryRegionRef } from '@/utils/macroRegionResolver';

const SUMMARY_REGIONS: SummaryRegionRef[] = [
  { regionKey: 'north', regionLabel: 'North Udupi' },
  { regionKey: 'south', regionLabel: 'South Udupi' },
];

/** R7 differential — byte-for-byte copy of the ORIGINAL inline expression
 * from DiscoverRightPanel.tsx :2136-2142. */
function originalInline(input: RegionGuideHelperTextInput): string {
  const regionGuideSelectedRegionLabel =
    input.summaryRegions.find((r) => r.regionKey === input.scope)?.regionLabel ?? input.scope ?? '';
  return input.markerKind === 'zones'
    ? `${regionGuideSelectedRegionLabel} selected. The map shows this region's zones — choose how you want to continue below.`
    : input.markerKind === 'areas'
      ? `${regionGuideSelectedRegionLabel} selected. The map shows this region's areas — choose how you want to continue below.`
      : `${regionGuideSelectedRegionLabel} selected. The map shows an overview of this region — choose how you want to continue below.`;
}

describe('buildRegionGuideHelperText (#2657 C1)', () => {
  it('zones variant uses the matched region label', () => {
    expect(
      buildRegionGuideHelperText({ summaryRegions: SUMMARY_REGIONS, scope: 'north', markerKind: 'zones' }),
    ).toBe("North Udupi selected. The map shows this region's zones — choose how you want to continue below.");
  });

  it('areas variant', () => {
    expect(
      buildRegionGuideHelperText({ summaryRegions: SUMMARY_REGIONS, scope: 'south', markerKind: 'areas' }),
    ).toBe("South Udupi selected. The map shows this region's areas — choose how you want to continue below.");
  });

  it('default/overview variant for null or unknown markerKind', () => {
    expect(
      buildRegionGuideHelperText({ summaryRegions: SUMMARY_REGIONS, scope: 'north', markerKind: null }),
    ).toBe('North Udupi selected. The map shows an overview of this region — choose how you want to continue below.');
  });

  it('falls back to the raw scope key when no summary region matches', () => {
    expect(
      buildRegionGuideHelperText({ summaryRegions: SUMMARY_REGIONS, scope: 'east-unlisted', markerKind: 'zones' }),
    ).toBe("east-unlisted selected. The map shows this region's zones — choose how you want to continue below.");
  });

  it('falls back to empty label when scope is null', () => {
    expect(buildRegionGuideHelperText({ summaryRegions: SUMMARY_REGIONS, scope: null, markerKind: 'zones' })).toBe(
      " selected. The map shows this region's zones — choose how you want to continue below.",
    );
  });

  it('R7 differential: matches the original inline expression across a table of inputs', () => {
    const table: RegionGuideHelperTextInput[] = [
      { summaryRegions: SUMMARY_REGIONS, scope: 'north', markerKind: 'zones' },
      { summaryRegions: SUMMARY_REGIONS, scope: 'south', markerKind: 'areas' },
      { summaryRegions: SUMMARY_REGIONS, scope: 'north', markerKind: null },
      { summaryRegions: SUMMARY_REGIONS, scope: 'north', markerKind: undefined },
      { summaryRegions: SUMMARY_REGIONS, scope: 'east-unlisted', markerKind: 'zones' },
      { summaryRegions: SUMMARY_REGIONS, scope: null, markerKind: 'areas' },
      { summaryRegions: [], scope: 'north', markerKind: 'zones' },
    ];
    for (const input of table) {
      expect(buildRegionGuideHelperText(input)).toBe(originalInline(input));
    }
  });
});
