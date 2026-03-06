import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { SavedAreas } from '@/components/insights/SavedAreas';
import { PaywallCard } from '@/components/insights/PaywallCard';
import { TrialBanner } from '@/components/insights/TrialBanner';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, Home, MapPin, AlertCircle, Eye, Star } from 'lucide-react';
import {
  useAvgPriceByArea,
  usePriceTrend,
  useNewListings,
  useRecommendations,
  useAreaMarketTrend,
  useMultiAreaTrend,
} from '@/hooks/useInsights';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export default function Insights() {
  const navigate = useNavigate();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [newListingsDays, setNewListingsDays] = useState<number>(7);
  const [selectedPriceType, setSelectedPriceType] = useState<'land' | 'apartment' | 'house'>('land');
  const [avgPricePropertyType, setAvgPricePropertyType] = useState<string>('all');
  const [selectedCompareAreas, setSelectedCompareAreas] = useState<string[]>([]);
  const compareInitialized = useRef(false);

  // Access gating
  const { insightsAccessUntil, isLoading: authLoading } = useAuth();
  const now = new Date();
  const accessUntil = insightsAccessUntil ? new Date(insightsAccessUntil) : null;
  const hasAccess = accessUntil !== null && accessUntil > now;
  const daysRemaining = accessUntil && hasAccess
    ? Math.ceil((accessUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const showPaywall = !authLoading && !hasAccess;
  const showTrialBanner = hasAccess && daysRemaining <= 3;

  // Fetch data
  const { data: avgPriceData = [], isLoading: avgPriceLoading, error: avgPriceError } = useAvgPriceByArea(avgPricePropertyType, { enabled: hasAccess });
  const trendPropertyType = selectedPriceType === 'land' ? 'land' : 'all';
  const { data: priceTrendData = [], isLoading: trendLoading, error: trendError } = usePriceTrend(selectedArea, trendPropertyType, hasAccess && !!selectedArea && selectedPriceType === 'land');
  const { data: sqftTrendData = [], isLoading: sqftTrendLoading, error: sqftTrendError } = useAreaMarketTrend(
    selectedArea,
    selectedPriceType === 'apartment' ? 'apartment' : 'house',
    hasAccess && !!selectedArea && selectedPriceType !== 'land'
  );
  const { data: newListings = [], isLoading: newListingsLoading, error: newListingsError } = useNewListings(newListingsDays, { enabled: hasAccess });
  const { data: recommendations = [], isLoading: recommendationsLoading, error: recommendationsError } = useRecommendations({ enabled: hasAccess });

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

  const COMPARE_COLORS = ['hsl(var(--primary))', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

  const allCompareWeeks = Array.from(
    new Set(compareAreaResults.flatMap((r) => (r.data ?? []).map((d) => d.weekStartDate)))
  ).sort();

  const comparisonChartData = allCompareWeeks.map((week) => {
    const row: Record<string, string | number | null> = {
      week: new Date(week).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    };
    selectedCompareAreas.forEach((areaKey, i) => {
      const areaData = compareAreaResults[i]?.data ?? [];
      const weekData = areaData.find((d) => d.weekStartDate === week);
      row[areaKey] = weekData?.medianPricePerCentPaise != null
        ? weekData.medianPricePerCentPaise / 100
        : null;
    });
    return row;
  });

  // Helper function to convert paise to rupees
  const paiseToRupees = (paise: number | null): number => {
    if (paise === null) return 0;
    return paise / 100;
  };

  // Format chart data
  const avgPriceChartData = avgPriceData.map((item) => ({
    area: item.areaKey,
    medianPrice: paiseToRupees(item.medianPricePerCentPaise),
    cityMedian: paiseToRupees(item.cityMedianPricePerCentPaise),
    listings: item.listingCount,
  }));

  const priceTrendChartData = priceTrendData.map((item) => ({
    week: new Date(item.weekStartDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    medianPrice: paiseToRupees(item.medianPricePerCentPaise),
    p25: paiseToRupees(item.p25PricePerCentPaise),
    p75: paiseToRupees(item.p75PricePerCentPaise),
    listings: item.listingCount,
  }));

  const handleViewListing = (id: string) => {
    navigate(`/listing/${id}`);
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Market Insights</h1>
          <p className="text-muted-foreground mt-1">
            Price trends, new listings, and personalized recommendations
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column - Saved Areas */}
          <div className="lg:col-span-1">
            <SavedAreas />
          </div>

          {/* Right column - Insights */}
          <div className="lg:col-span-2 space-y-6">
            {showTrialBanner && <TrialBanner daysRemaining={daysRemaining} />}
            {showPaywall ? (
              <PaywallCard />
            ) : (
            <>
            {/* Average Price by Area */}
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
                  <Select value={avgPricePropertyType} onValueChange={setAvgPricePropertyType}>
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

            {/* Price Trend */}
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
                  <Select value={selectedPriceType} onValueChange={(v) => setSelectedPriceType(v as 'land' | 'apartment' | 'house')}>
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
                {(() => {
                  const isLoading = selectedPriceType === 'land' ? trendLoading : sqftTrendLoading;
                  const hasError = selectedPriceType === 'land' ? trendError : sqftTrendError;
                  const unit = selectedPriceType === 'land' ? '/ cent' : '/ sqft';

                  if (isLoading) {
                    return (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    );
                  }
                  if (hasError) {
                    return (
                      <div className="flex items-center gap-2 text-destructive py-4">
                        <AlertCircle className="h-5 w-5" />
                        <p className="text-sm">Failed to load trend data</p>
                      </div>
                    );
                  }

                  if (selectedPriceType === 'land') {
                    if (priceTrendData.length === 0) {
                      return (
                        <div className="text-center py-8 text-muted-foreground">
                          <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm font-medium">No land price data available for this area yet.</p>
                          <p className="text-xs mt-1">Data will appear here as weekly prices are recorded.</p>
                        </div>
                      );
                    }
                    const chartData = priceTrendData.map((item) => ({
                      period: new Date(item.weekStartDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
                      median: paiseToRupees(item.medianPricePerCentPaise),
                      p25: paiseToRupees(item.p25PricePerCentPaise),
                      p75: paiseToRupees(item.p75PricePerCentPaise),
                    }));
                    return (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
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
                    );
                  }

                  // Apartment / House — from RPC
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
                  const sqftChartData = sqftTrendData.map((d) => ({
                    period: format(new Date(d.month), 'MMM'),
                    median: d.medianPricePerUnit ? Math.round(Number(d.medianPricePerUnit)) : null,
                    p25: d.p25PricePerUnit ? Math.round(Number(d.p25PricePerUnit)) : null,
                    p75: d.p75PricePerUnit ? Math.round(Number(d.p75PricePerUnit)) : null,
                  }));
                  return (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={sqftChartData}>
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
                })()}
              </CardContent>
            </Card>

            {/* Area Comparison */}
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

            {/* New Listings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-primary" />
                  New Listings
                </CardTitle>
                <CardDescription>Recent listings in your saved areas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Tabs value={String(newListingsDays)} onValueChange={(v) => setNewListingsDays(Number(v))}>
                    <TabsList>
                      <TabsTrigger value="7">Last 7 days</TabsTrigger>
                      <TabsTrigger value="14">Last 14 days</TabsTrigger>
                      <TabsTrigger value="30">Last 30 days</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {newListingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : newListingsError ? (
                  <div className="flex items-center gap-2 text-destructive py-4">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm">Failed to load new listings</p>
                  </div>
                ) : newListings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No new listings in the selected time period</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {newListings.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="capitalize">
                              {listing.propertyType}
                            </Badge>
                            {listing.createdAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeDate(listing.createdAt)}
                              </span>
                            )}
                          </div>
                          {listing.locality && (
                            <p className="text-sm flex items-center gap-1.5 text-muted-foreground mb-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {listing.locality}
                            </p>
                          )}
                          {listing.pricePerCentPaise && (
                            <p className="font-semibold text-primary">
                              {formatPrice(paiseToRupees(listing.pricePerCentPaise), 'INR')} per cent
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewListing(listing.id)}
                          className="gap-1.5 flex-shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Recommended Listings
                </CardTitle>
                <CardDescription>Top opportunities based on price analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {recommendationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recommendationsError ? (
                  <div className="flex items-center gap-2 text-destructive py-4">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm">Failed to load recommendations</p>
                  </div>
                ) : recommendations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No recommendations available. Try saving some areas!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {recommendations.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary" className="capitalize">
                              {listing.propertyType}
                            </Badge>
                            {listing.undervaluationScore && listing.undervaluationScore > 0 && (
                              <Badge variant="default" className="bg-green-500">
                                {(listing.undervaluationScore * 100).toFixed(0)}% below market
                              </Badge>
                            )}
                            {listing.createdAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeDate(listing.createdAt)}
                              </span>
                            )}
                          </div>
                          {listing.locality && (
                            <p className="text-sm flex items-center gap-1.5 text-muted-foreground mb-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {listing.locality}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-sm">
                            {listing.pricePerCentPaise && (
                              <p className="font-semibold text-primary">
                                {formatPrice(paiseToRupees(listing.pricePerCentPaise), 'INR')} per cent
                              </p>
                            )}
                            {listing.medianPricePerCentPaise && (
                              <p className="text-muted-foreground">
                                Market: {formatPrice(paiseToRupees(listing.medianPricePerCentPaise), 'INR')}
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewListing(listing.id)}
                          className="gap-1.5 flex-shrink-0"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
