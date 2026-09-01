import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AreaPriceData, PriceTrendData } from '@/hooks/useInsights';
import type { MarketContextDataPoint } from '@/hooks/useListingMarketContext';
import { toLandTrendChartData, toSqftTrendChartData } from '@/lib/insightsChartAdapters';

type PriceType = 'land' | 'apartment' | 'house';

interface PriceTrendSectionProps {
  avgPriceData: AreaPriceData[];
  selectedArea: string | null;
  setSelectedArea: (areaKey: string) => void;
  selectedPriceType: PriceType;
  setSelectedPriceType: (priceType: PriceType) => void;
  priceTrendData: PriceTrendData[];
  trendLoading: boolean;
  trendError: unknown;
  sqftTrendData: MarketContextDataPoint[];
  sqftTrendLoading: boolean;
  sqftTrendError: unknown;
}

export function PriceTrendSection({
  avgPriceData,
  selectedArea,
  setSelectedArea,
  selectedPriceType,
  setSelectedPriceType,
  priceTrendData,
  trendLoading,
  trendError,
  sqftTrendData,
  sqftTrendLoading,
  sqftTrendError,
}: PriceTrendSectionProps) {
  const isLoading = selectedPriceType === 'land' ? trendLoading : sqftTrendLoading;
  const hasError = selectedPriceType === 'land' ? trendError : sqftTrendError;
  const unit = selectedPriceType === 'land' ? '/ cent' : '/ sqft';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Price Trend
        </CardTitle>
        <CardDescription>
          {selectedPriceType === 'land' ? 'Weekly median price per cent' : 'Monthly median price per sqft'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4">
          <Select value={selectedArea || undefined} onValueChange={setSelectedArea}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Select an area" />
            </SelectTrigger>
            <SelectContent>
              {avgPriceData.map((area) => (
                <SelectItem key={area.areaKey} value={area.areaKey}>
                  {area.areaKey}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedPriceType} onValueChange={(v) => setSelectedPriceType(v as PriceType)}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="land">Land (₹ / cent)</SelectItem>
              <SelectItem value="apartment">Apartment (₹ / sqft)</SelectItem>
              <SelectItem value="house">House (₹ / sqft)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasError ? (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Failed to load trend data</p>
          </div>
        ) : selectedPriceType === 'land' ? (
          priceTrendData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No land price data available for this area yet.</p>
              <p className="text-xs mt-1">Data will appear here as weekly prices are recorded.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={toLandTrendChartData(priceTrendData)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                <Tooltip formatter={(v: number) => [`₹${(v / 100000).toFixed(2)}L ${unit}`, '']} />
                <Legend />
                <Line type="monotone" dataKey="median" stroke="hsl(var(--primary))" name="Median" strokeWidth={2} />
                <Line type="monotone" dataKey="p25" stroke="hsl(var(--muted-foreground))" name="25th pct" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="p75" stroke="hsl(var(--muted-foreground))" name="75th pct" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )
        ) : (
          (() => {
            const totalCount = sqftTrendData[0]?.totalSimilarCount ?? 0;
            if (sqftTrendData.length === 0 || totalCount < 5) {
              return (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">
                    Not enough {selectedPriceType} data in {selectedArea || 'this area'} yet.
                  </p>
                  <p className="text-xs mt-1">
                    More listings will appear here as the market grows.
                  </p>
                </div>
              );
            }
            return (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={toSqftTrendChartData(sqftTrendData)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
                  <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')} ${unit}`, '']} />
                  <Legend />
                  <Line type="monotone" dataKey="median" stroke="hsl(var(--primary))" name="Median" strokeWidth={2} />
                  <Line type="monotone" dataKey="p25" stroke="hsl(var(--muted-foreground))" name="25th pct" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="p75" stroke="hsl(var(--muted-foreground))" name="75th pct" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
