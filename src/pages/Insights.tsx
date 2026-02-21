import { useState, useEffect } from 'react';
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
} from '@/hooks/useInsights';
import { formatPrice, formatRelativeDate } from '@/lib/formatters';
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
  const { data: avgPriceData = [], isLoading: avgPriceLoading, error: avgPriceError } = useAvgPriceByArea({ enabled: hasAccess });
  const { data: priceTrendData = [], isLoading: trendLoading, error: trendError } = usePriceTrend(selectedArea, hasAccess && !!selectedArea);
  const { data: newListings = [], isLoading: newListingsLoading, error: newListingsError } = useNewListings(newListingsDays, { enabled: hasAccess });
  const { data: recommendations = [], isLoading: recommendationsLoading, error: recommendationsError } = useRecommendations({ enabled: hasAccess });

  // Set initial selected area from avg price data (in effect to avoid setState-during-render)
  useEffect(() => {
    if (!selectedArea && avgPriceData.length > 0) {
      setSelectedArea(avgPriceData[0].areaKey);
    }
  }, [avgPriceData, selectedArea]);

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
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Average Price by Area
                </CardTitle>
                <CardDescription>Median price per cent compared to city average</CardDescription>
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
                <CardDescription>Weekly median price over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Select value={selectedArea || undefined} onValueChange={setSelectedArea}>
                    <SelectTrigger className="w-full sm:w-64">
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
                </div>
                {trendLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : trendError ? (
                  <div className="flex items-center gap-2 text-destructive py-4">
                    <AlertCircle className="h-5 w-5" />
                    <p className="text-sm">Failed to load trend data</p>
                  </div>
                ) : priceTrendData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No trend data available for this area</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={priceTrendChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" />
                      <YAxis
                        tickFormatter={(value) => `₹${(value / 100000).toFixed(0)}L`}
                      />
                      <Tooltip
                        formatter={(value: number) => [`₹${(value / 100000).toFixed(2)}L`, 'Price per cent']}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="medianPrice" stroke="hsl(var(--primary))" name="Median" strokeWidth={2} />
                      <Line type="monotone" dataKey="p25" stroke="hsl(var(--muted-foreground))" name="25th percentile" strokeDasharray="5 5" />
                      <Line type="monotone" dataKey="p75" stroke="hsl(var(--muted-foreground))" name="75th percentile" strokeDasharray="5 5" />
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
                        className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
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
                        className="flex items-start justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
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
