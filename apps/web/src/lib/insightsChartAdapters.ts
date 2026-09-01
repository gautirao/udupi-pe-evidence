import { format } from 'date-fns';
import type { AreaPriceData, PriceTrendData } from '@/hooks/useInsights';
import type { MarketContextDataPoint } from '@/hooks/useListingMarketContext';

export function paiseToRupees(paise: number | null): number {
  if (paise === null) return 0;
  return paise / 100;
}

function formatWeekLabel(weekStartDate: string): string {
  return new Date(weekStartDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export interface AvgPriceChartRow {
  area: string;
  medianPrice: number;
  cityMedian: number;
  listings: number;
}

export function toAvgPriceChartData(avgPriceData: AreaPriceData[]): AvgPriceChartRow[] {
  return avgPriceData.map((item) => ({
    area: item.areaKey,
    medianPrice: paiseToRupees(item.medianPricePerCentPaise),
    cityMedian: paiseToRupees(item.cityMedianPricePerCentPaise),
    listings: item.listingCount,
  }));
}

export interface LandTrendChartRow {
  period: string;
  median: number;
  p25: number;
  p75: number;
}

export function toLandTrendChartData(priceTrendData: PriceTrendData[]): LandTrendChartRow[] {
  return priceTrendData.map((item) => ({
    period: formatWeekLabel(item.weekStartDate),
    median: paiseToRupees(item.medianPricePerCentPaise),
    p25: paiseToRupees(item.p25PricePerCentPaise),
    p75: paiseToRupees(item.p75PricePerCentPaise),
  }));
}

export interface SqftTrendChartRow {
  period: string;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export function toSqftTrendChartData(sqftTrendData: MarketContextDataPoint[]): SqftTrendChartRow[] {
  return sqftTrendData.map((d) => ({
    period: format(new Date(d.month), 'MMM'),
    median: d.medianPricePerUnit ? Math.round(Number(d.medianPricePerUnit)) : null,
    p25: d.p25PricePerUnit ? Math.round(Number(d.p25PricePerUnit)) : null,
    p75: d.p75PricePerUnit ? Math.round(Number(d.p75PricePerUnit)) : null,
  }));
}

export interface MultiAreaTrendResult {
  data?: { weekStartDate: string; medianPricePerCentPaise: number | null }[];
  isLoading?: boolean;
}

export function getAllCompareWeeks(compareAreaResults: MultiAreaTrendResult[]): string[] {
  return Array.from(
    new Set(compareAreaResults.flatMap((r) => (r.data ?? []).map((d) => d.weekStartDate)))
  ).sort();
}

export type ComparisonChartRow = Record<string, string | number | null>;

export function toComparisonChartData(
  allCompareWeeks: string[],
  selectedCompareAreas: string[],
  compareAreaResults: MultiAreaTrendResult[]
): ComparisonChartRow[] {
  return allCompareWeeks.map((week) => {
    const row: ComparisonChartRow = { week: formatWeekLabel(week) };
    selectedCompareAreas.forEach((areaKey, i) => {
      const areaData = compareAreaResults[i]?.data ?? [];
      const weekData = areaData.find((d) => d.weekStartDate === week);
      row[areaKey] = weekData?.medianPricePerCentPaise != null
        ? weekData.medianPricePerCentPaise / 100
        : null;
    });
    return row;
  });
}
