import { describe, it, expect } from 'vitest';
import {
  paiseToRupees,
  toAvgPriceChartData,
  toLandTrendChartData,
  toSqftTrendChartData,
  getAllCompareWeeks,
  toComparisonChartData,
} from '../insightsChartAdapters';
import type { AreaPriceData, PriceTrendData } from '@/hooks/useInsights';
import type { MarketContextDataPoint } from '@/hooks/useListingMarketContext';

describe('paiseToRupees', () => {
  it('converts paise to rupees', () => {
    expect(paiseToRupees(10000)).toBe(100);
  });

  it('returns 0 for null (preserves existing zero-coercion behavior)', () => {
    expect(paiseToRupees(null)).toBe(0);
  });
});

describe('toAvgPriceChartData', () => {
  it('maps areaKey/medianPricePerCentPaise/cityMedianPricePerCentPaise/listingCount to chart rows', () => {
    const input: AreaPriceData[] = [
      { areaKey: 'Manipal', listingCount: 5, medianPricePerCentPaise: 20000, cityMedianPricePerCentPaise: 15000, priceIndex: 1.2 },
    ];
    expect(toAvgPriceChartData(input)).toEqual([
      { area: 'Manipal', medianPrice: 200, cityMedian: 150, listings: 5 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(toAvgPriceChartData([])).toEqual([]);
  });

  it('coerces null prices to 0 (existing behavior)', () => {
    const input: AreaPriceData[] = [
      { areaKey: 'Udupi', listingCount: 0, medianPricePerCentPaise: null, cityMedianPricePerCentPaise: null, priceIndex: null },
    ];
    expect(toAvgPriceChartData(input)).toEqual([
      { area: 'Udupi', medianPrice: 0, cityMedian: 0, listings: 0 },
    ]);
  });
});

describe('toLandTrendChartData', () => {
  it('maps weekStartDate to a formatted period label', () => {
    const input: PriceTrendData[] = [
      { weekStartDate: '2026-01-05', medianPricePerCentPaise: 10000, listingCount: 3, p25PricePerCentPaise: 8000, p75PricePerCentPaise: 12000 },
    ];
    const result = toLandTrendChartData(input);
    const expectedLabel = new Date('2026-01-05').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    expect(result).toEqual([
      { period: expectedLabel, median: 100, p25: 80, p75: 120 },
    ]);
  });
});

describe('toSqftTrendChartData', () => {
  it('rounds numeric price fields and preserves null as null (no zero-coercion)', () => {
    const input: MarketContextDataPoint[] = [
      { month: '2026-02-01', listingCount: 6, medianPricePerUnit: 4999.6, p25PricePerUnit: null, p75PricePerUnit: 5500, priceBasis: 'per_sqft', totalSimilarCount: 6 },
    ];
    const result = toSqftTrendChartData(input);
    expect(result).toEqual([
      { period: 'Feb', median: 5000, p25: null, p75: 5500 },
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(toSqftTrendChartData([])).toEqual([]);
  });
});

describe('getAllCompareWeeks', () => {
  it('unions and sorts week keys across multiple area results', () => {
    const results = [
      { data: [{ weekStartDate: '2026-01-12', medianPricePerCentPaise: 100 }] },
      { data: [{ weekStartDate: '2026-01-05', medianPricePerCentPaise: 200 }, { weekStartDate: '2026-01-12', medianPricePerCentPaise: 210 }] },
    ];
    expect(getAllCompareWeeks(results)).toEqual(['2026-01-05', '2026-01-12']);
  });

  it('returns empty array when no results have data', () => {
    expect(getAllCompareWeeks([{ data: [] }, {}])).toEqual([]);
  });
});

describe('toComparisonChartData', () => {
  it('aligns per-area series by week, using null for missing weeks (no zero-coercion)', () => {
    const weeks = ['2026-01-05', '2026-01-12'];
    const areas = ['Manipal', 'Udupi'];
    const results = [
      { data: [{ weekStartDate: '2026-01-05', medianPricePerCentPaise: 10000 }] }, // Manipal missing week 2
      { data: [{ weekStartDate: '2026-01-05', medianPricePerCentPaise: 20000 }, { weekStartDate: '2026-01-12', medianPricePerCentPaise: 22000 }] },
    ];
    const rows = toComparisonChartData(weeks, areas, results);
    const week1Label = new Date('2026-01-05').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const week2Label = new Date('2026-01-12').toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    expect(rows).toEqual([
      { week: week1Label, Manipal: 100, Udupi: 200 },
      { week: week2Label, Manipal: null, Udupi: 220 },
    ]);
  });

  it('returns empty array when there are no weeks', () => {
    expect(toComparisonChartData([], ['Manipal'], [{ data: [] }])).toEqual([]);
  });
});
