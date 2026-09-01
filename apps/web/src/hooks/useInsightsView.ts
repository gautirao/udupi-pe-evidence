import { useState, useEffect, useRef } from 'react';
import {
  useAvgPriceByArea,
  usePriceTrend,
  useAreaMarketTrend,
  useMultiAreaTrend,
} from '@/hooks/useInsights';

/**
 * Owns Insights filter/selection state and wires it to the existing query hooks.
 * Query enable conditions and default-selection rules are unchanged from prior
 * behaviour: default area = first avg-price row; default comparison = top 3
 * areas by listing count (set once).
 */
export function useInsightsView(hasAccess: boolean) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedPriceType, setSelectedPriceType] = useState<'land' | 'apartment' | 'house'>('land');
  const [avgPricePropertyType, setAvgPricePropertyType] = useState<string>('all');
  const [avgPriceBedrooms, setAvgPriceBedrooms] = useState<number>(0);
  const [selectedCompareAreas, setSelectedCompareAreas] = useState<string[]>([]);
  const compareInitialized = useRef(false);

  const { data: avgPriceData = [], isLoading: avgPriceLoading, error: avgPriceError } = useAvgPriceByArea(avgPricePropertyType, avgPriceBedrooms, { enabled: hasAccess });
  const trendPropertyType = selectedPriceType === 'land' ? 'land' : 'all';
  const { data: priceTrendData = [], isLoading: trendLoading, error: trendError } = usePriceTrend(selectedArea, trendPropertyType, 0, hasAccess && !!selectedArea && selectedPriceType === 'land');
  const { data: sqftTrendData = [], isLoading: sqftTrendLoading, error: sqftTrendError } = useAreaMarketTrend(
    selectedArea,
    selectedPriceType === 'apartment' ? 'apartment' : 'house',
    hasAccess && !!selectedArea && selectedPriceType !== 'land'
  );

  // Set initial selected area from avg price data (in effect to avoid setState-during-render)
  useEffect(() => {
    if (!selectedArea && avgPriceData.length > 0) {
      setSelectedArea(avgPriceData[0].areaKey);
    }
  }, [avgPriceData, selectedArea]);

  // Default comparison areas: top 3 by listing count (set once)
  useEffect(() => {
    if (!compareInitialized.current && avgPriceData.length > 0) {
      compareInitialized.current = true;
      const top3 = [...avgPriceData]
        .sort((a, b) => b.listingCount - a.listingCount)
        .slice(0, 3)
        .map((a) => a.areaKey);
      setSelectedCompareAreas(top3);
    }
  }, [avgPriceData]);

  const compareAreaResults = useMultiAreaTrend(selectedCompareAreas, hasAccess && selectedCompareAreas.length > 0);

  const toggleCompareArea = (areaKey: string) => {
    setSelectedCompareAreas((prev) =>
      prev.includes(areaKey)
        ? prev.filter((a) => a !== areaKey)
        : prev.length < 5
        ? [...prev, areaKey]
        : prev
    );
  };

  return {
    selectedArea,
    setSelectedArea,
    selectedPriceType,
    setSelectedPriceType,
    avgPricePropertyType,
    setAvgPricePropertyType,
    avgPriceBedrooms,
    setAvgPriceBedrooms,
    selectedCompareAreas,
    toggleCompareArea,
    avgPriceData,
    avgPriceLoading,
    avgPriceError,
    priceTrendData,
    trendLoading,
    trendError,
    sqftTrendData,
    sqftTrendLoading,
    sqftTrendError,
    compareAreaResults,
  };
}
