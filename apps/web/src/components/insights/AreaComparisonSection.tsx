import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp } from 'lucide-react';
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
import type { AreaPriceData } from '@/hooks/useInsights';
import {
  getAllCompareWeeks,
  toComparisonChartData,
  type MultiAreaTrendResult,
} from '@/lib/insightsChartAdapters';

const COMPARE_COLORS = ['hsl(var(--primary))', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

interface AreaComparisonSectionProps {
  avgPriceData: AreaPriceData[];
  avgPriceLoading: boolean;
  selectedCompareAreas: string[];
  toggleCompareArea: (areaKey: string) => void;
  compareAreaResults: MultiAreaTrendResult[];
}

export function AreaComparisonSection({
  avgPriceData,
  avgPriceLoading,
  selectedCompareAreas,
  toggleCompareArea,
  compareAreaResults,
}: AreaComparisonSectionProps) {
  const allCompareWeeks = getAllCompareWeeks(compareAreaResults);
  const comparisonChartData = toComparisonChartData(allCompareWeeks, selectedCompareAreas, compareAreaResults);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Area Comparison
        </CardTitle>
        <CardDescription>Compare median land prices across areas (select up to 5)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {avgPriceData.map((area) => {
            const isSelected = selectedCompareAreas.includes(area.areaKey);
            const selIdx = selectedCompareAreas.indexOf(area.areaKey);
            return (
              <button
                key={area.areaKey}
                onClick={() => toggleCompareArea(area.areaKey)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                }`}
                style={isSelected ? { borderColor: COMPARE_COLORS[selIdx] ?? 'hsl(var(--primary))' } : {}}
              >
                {area.areaKey}
              </button>
            );
          })}
          {avgPriceData.length === 0 && !avgPriceLoading && (
            <p className="text-xs text-muted-foreground">Load area data first</p>
          )}
        </div>
        {compareAreaResults.some((r) => r.isLoading) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedCompareAreas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Select areas above to compare price trends.</p>
          </div>
        ) : allCompareWeeks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No trend data yet for selected areas.</p>
            <p className="text-xs mt-1">Data will appear here as weekly prices are recorded.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={comparisonChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <Tooltip formatter={(v: number) => [`₹${(v / 100000).toFixed(2)}L / cent`, '']} />
              <Legend />
              {selectedCompareAreas.map((areaKey, i) => (
                <Line
                  key={areaKey}
                  type="monotone"
                  dataKey={areaKey}
                  stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]}
                  name={areaKey}
                  strokeWidth={2}
                  connectNulls
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
