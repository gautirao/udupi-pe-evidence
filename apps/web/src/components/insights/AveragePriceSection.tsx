import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AreaPriceData } from '@/hooks/useInsights';
import { toAvgPriceChartData } from '@/lib/insightsChartAdapters';

const BEDROOM_OPTIONS = [
  { label: 'All BHK', value: 0 },
  { label: '1 BHK', value: 1 },
  { label: '2 BHK', value: 2 },
  { label: '3 BHK', value: 3 },
  { label: '4 BHK+', value: 4 },
];

interface AveragePriceSectionProps {
  avgPriceData: AreaPriceData[];
  avgPriceLoading: boolean;
  avgPriceError: unknown;
  avgPricePropertyType: string;
  setAvgPricePropertyType: (value: string) => void;
  avgPriceBedrooms: number;
  setAvgPriceBedrooms: (value: number) => void;
}

export function AveragePriceSection({
  avgPriceData,
  avgPriceLoading,
  avgPriceError,
  avgPricePropertyType,
  setAvgPricePropertyType,
  avgPriceBedrooms,
  setAvgPriceBedrooms,
}: AveragePriceSectionProps) {
  const avgPriceChartData = toAvgPriceChartData(avgPriceData);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Average Price by Area
            </CardTitle>
            <CardDescription>Median price per cent compared to city average</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={avgPricePropertyType} onValueChange={(v) => { setAvgPricePropertyType(v); setAvgPriceBedrooms(0); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="apartment">Apartment</SelectItem>
                <SelectItem value="house">House</SelectItem>
              </SelectContent>
            </Select>
            {avgPricePropertyType !== 'land' && (
              <div className="flex gap-1">
                {BEDROOM_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setAvgPriceBedrooms(value)}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                      avgPriceBedrooms === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {avgPriceLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : avgPriceError ? (
          <div className="flex items-center gap-2 text-destructive py-4">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Failed to load price data</p>
          </div>
        ) : avgPriceData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No price data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={avgPriceChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="area" angle={-45} textAnchor="end" height={80} />
              <YAxis
                tickFormatter={(value) => `₹${(value / 100000).toFixed(0)}L`}
              />
              <Tooltip
                formatter={(value: number) => [`₹${(value / 100000).toFixed(2)}L`, 'Price per cent']}
                labelFormatter={(label) => `Area: ${label}`}
              />
              <Legend />
              <Bar dataKey="medianPrice" fill="hsl(var(--primary))" name="Median Price" />
              <Bar dataKey="cityMedian" fill="hsl(var(--muted))" name="City Average" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
