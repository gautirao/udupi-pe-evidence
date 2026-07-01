import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, MapPin, Activity, Shield, AlertCircle, Info, ArrowRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAreaOverview } from '@/hooks/useAreaOverview';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';
import { AreaGuide } from '@/components/area/AreaGuide';
import { DEFAULT_CITY } from '@/lib/localityUtils';
import { usePageMeta } from '@/hooks/usePageMeta';

// ─── Q1 = Option A (default): area-guide is THE default /trends experience ────
// The buyer area-guide (AC2–AC16) is what every user sees on /trends, including
// bare visits with no params.
//
// Render decision (evaluated top-to-bottom):
//   shouldRenderGuide = (full pipe areaKey present) OR (no areaKey yet)
//   • Full pipe areaKey  → guide with real area data (settled)
//   • No areaKey         → guide skeleton while useTrendsOptions resolves a default;
//                          self-populate effect then writes the key to URL (→ full pipe branch)
//   • noCityAreas        → guide clean city-level no-data state (NOT legacy dashboard)
//   • Edge case: non-pipe areaKey in URL (e.g. "?areaKey=foo") → legacy #771 fallback
//
// The legacy #771 market-trends view is intentionally NOT the default. It remains
// reachable only for the non-pipe-areaKey edge case and is dead code for normal flows.

function LoadingSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export default function Trends() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL is the single source of truth for area state
  const city = searchParams.get('city') ?? DEFAULT_CITY;
  const rawAreaKeys = searchParams.getAll('areaKey');
  const urlAreaKeys = rawAreaKeys.slice(0, 3); // cap at 3
  const selectedKey = urlAreaKeys[0] ?? '';

  // Q1=Option A: guide is DEFAULT for all normal /trends visits.
  // isAreaGuideMode: full pipe areaKey is present → guide has a real area to display.
  // shouldRenderGuide: either a full areaKey OR no areaKey yet (resolving default).
  //   • No areaKey → guide skeleton immediately; self-populate effect writes key → flips to guide.
  //   • Non-pipe areaKey (edge case, not a valid production URL) → legacy #771 fallback.
  const isAreaGuideMode = selectedKey.includes('|');
  const shouldRenderGuide = isAreaGuideMode || selectedKey === '';

  usePageMeta({
    title: 'Property Market Trends | Udupi Property Explorer',
    description: 'Browse property price trends across areas in Udupi and Mangalore.',
  });

  const [timeRange, setTimeRange] = useState('6m');
  const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981'];

  // Tracks the most recently removed invalid key so the defaults effect does not
  // immediately re-write it back from optionsData, which would create an infinite loop.
  const lastRemovedKeyRef = useRef<string>('');

  // Normalize URL on mount: trim >3 areaKeys to canonical 3
  useEffect(() => {
    if (rawAreaKeys.length > 3) {
      const params = new URLSearchParams();
      params.set('city', city);
      urlAreaKeys.forEach(k => params.append('areaKey', k));
      setSearchParams(params, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only: normalizes initial URL before interaction
  }, []);

  // Fetch backend defaults when URL has no areaKeys (for default area resolution) OR when in area
  // guide mode (so CompareNearbyAreas has safe area options — B4 fix).
  // shouldRenderGuide implies we always need defaults for the guide path.
  const { data: optionsData, isLoading: optionsLoading } = useTrendsOptions(city, urlAreaKeys.length === 0 || isAreaGuideMode);

  // When no URL areaKeys and defaults arrive: write canonical URL so selectedKey derives correctly.
  // Keys that were previously removed due to an API error are excluded to prevent a re-fetch loop:
  // if the only backend defaults are the same invalid key that was just removed, we leave the URL
  // empty so the error/empty state renders instead of cycling indefinitely.
  useEffect(() => {
    if (urlAreaKeys.length === 0 && optionsData?.defaultAreas && optionsData.defaultAreas.length > 0) {
      const keys = optionsData.defaultAreas
        .map(a => a.areaKey)
        .filter(k => k !== lastRemovedKeyRef.current)
        .slice(0, 3);
      if (keys.length === 0) return; // all defaults are the known-bad key — do not re-populate
      const params = new URLSearchParams();
      params.set('city', city);
      keys.forEach(k => params.append('areaKey', k));
      setSearchParams(params, { replace: true });
    }
  }, [optionsData, city]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Area Intelligence hook (AC1) ────────────────────────────────────────────
  // Always called with city + selectedKey. The hook's own enabled guard
  // (citySlug.length > 0 && areaKey.length > 0) suppresses the request when
  // no areaKey is present (bare /trends). This avoids conditional hook calls.
  const {
    data: areaIntelligenceData,
    isLoading: areaIntelligenceLoading,
    isError: areaIntelligenceError,
  } = useAreaIntelligence(city, selectedKey);

  // Derive nearby options from existing trends defaults (Q3=Option A: safe source)
  const nearbyAreaOptions = (optionsData?.defaultAreas ?? []).map(a => ({
    areaKey: a.areaKey,
    areaLabel: a.areaKey.split('|').pop() ?? a.areaKey,
  }));

  // ── #771 legacy hook (always called — Rules of Hooks; enabled=false for empty key) ─
  // Area data for the currently selected key. enabled: areaKey.length > 0 guards empty string.
  // Only used in the legacy flow (shouldRenderGuide=false edge case: non-pipe areaKey in URL).
  const { data, isLoading, isError } = useAreaOverview(selectedKey);

  // Invalid areaKey silent recovery for legacy flow:
  // When the selected (first) key returns an error, record it in lastRemovedKeyRef so
  // the defaults effect will not re-populate it, then remove it from the URL.
  // Guard: only fires in the non-guide edge case (selectedKey present but not a full pipe key).
  useEffect(() => {
    if (shouldRenderGuide) return; // guide path handles its own error state
    if (!isError || !selectedKey) return;
    lastRemovedKeyRef.current = selectedKey;
    const remaining = urlAreaKeys.filter(k => k !== selectedKey);
    const params = new URLSearchParams();
    params.set('city', city);
    remaining.forEach(k => params.append('areaKey', k));
    setSearchParams(params, { replace: true });
  // Intentional: only fire when the error state or selected key changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, selectedKey, shouldRenderGuide]);

  // ── Default: buyer area-guide for all normal /trends visits ─────────────────
  // noCityAreas: options request settled, city has zero configured areas.
  // In this case areaIntelligence request is suppressed (selectedKey='', enabled=false).
  const noCityAreas =
    !optionsLoading
    && selectedKey === ''
    && optionsData !== undefined
    && (optionsData.defaultAreas ?? []).length === 0;

  // Guide loading: options still resolving a default area (no areaKey yet) OR areaIntelligence in-flight.
  // noCityAreas bypasses this — show the clean city-level no-data state instead.
  const guideIsLoading = !noCityAreas && (areaIntelligenceLoading || (selectedKey === '' && optionsLoading));

  if (shouldRenderGuide) {
    const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <AreaGuide
          citySlug={city}
          cityLabel={cityLabel}
          areaKey={selectedKey}
          isLoading={guideIsLoading}
          isError={isAreaGuideMode ? areaIntelligenceError : false}
          data={isAreaGuideMode ? areaIntelligenceData : undefined}
          nearbyAreaOptions={nearbyAreaOptions}
          noCityAreas={noCityAreas}
        />
      </div>
    );
  }

  // ── Legacy #771 market-trends flow ────────────────────────────────────────────
  // Reached only for non-pipe areaKey in URL (edge case; not a normal production URL).
  // shouldRenderGuide=false means selectedKey is non-empty and not a full pipe key.

  // Dropdown change: selected area moves to position 0, others retained; URL updated
  const handleAreaChange = (newKey: string) => {
    const others = urlAreaKeys.filter(k => k !== newKey);
    const reordered = [newKey, ...others];
    const params = new URLSearchParams();
    params.set('city', city);
    reordered.forEach(k => params.append('areaKey', k));
    setSearchParams(params, { replace: true });
  };

  // Metric card derivations
  const priceChangePct = data?.snapshot?.trendPctChange ?? null;
  const trendDirection = data?.snapshot?.trendDirection ?? null;
  const avgPricePaise = data?.snapshot?.medianPricePaise ?? null;
  const avgPriceCr = avgPricePaise != null ? avgPricePaise / 100 / 10_000_000 : null;

  // popularTypes: percentages against full dict total (not top-5 subset)
  const popularTypes = data?.snapshot?.propertyTypeDist
    ? (() => {
        const entries = Object.entries(data.snapshot.propertyTypeDist);
        const total = entries.reduce((s, [, c]) => s + c, 0);
        return entries
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(({ type, count }) => ({
            type,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0,
          }));
      })()
    : [];

  // priceHistory: empty until #771 provides the endpoint
  const priceHistory: { month: string; avgPricePaise: number }[] = [];

  // Insights derived from available data
  const insights: string[] = data
    ? [
        trendDirection === 'rising'
          ? `Prices in ${data.areaLabel} are trending upward — a signal of growing demand.`
          : trendDirection === 'falling'
          ? `Prices in ${data.areaLabel} have been declining — potentially a buyer's opportunity.`
          : `Price levels in ${data.areaLabel} have been stable over the recent period.`,
        `${data.listingCount90d} properties were listed in the past 90 days, indicating ${
          data.listingCount90d > 50 ? 'high' : data.listingCount90d > 20 ? 'moderate' : 'limited'
        } market activity.`,
        data.activity
          ? `${data.activity.new30d} new listings appeared in the last 30 days.`
          : 'Market activity data is being compiled for this area.',
      ]
    : [];

  // In the legacy edge case: if selectedKey is set but data is loading/missing, show legacy skeleton.
  // (selectedKey='' cannot reach here — shouldRenderGuide catches it above.)
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium">Area not found</p>
          <p className="text-sm text-muted-foreground">
            We couldn't load data for this area. Try selecting a different one.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={`/discover?city=${city}`}>Back to map</Link>
          </Button>
        </div>
      </div>
    );
  }

  // data is undefined in non-error, non-loading states only if query hasn't run yet
  if (!data) {
    return <LoadingSkeleton />;
  }

  // Label for dropdown item — show resolved areaLabel for selected key, pipe-segment fallback for others
  const labelFor = (key: string) => {
    if (key === selectedKey) return data.areaLabel;
    return key.split('|').pop() ?? key;
  };

  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{cityLabel} · Market Trends</p>
          <h1 className="text-2xl font-bold text-foreground">{data.areaLabel}</h1>
        </div>
        <div className="flex items-center gap-3">
          {urlAreaKeys.length > 1 && (
            <Select value={selectedKey} onValueChange={handleAreaChange}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {urlAreaKeys.map(key => (
                  <SelectItem key={key} value={key}>
                    {labelFor(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">3 Months</SelectItem>
              <SelectItem value="6m">6 Months</SelectItem>
              <SelectItem value="1y">1 Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={`rounded-lg border p-5 space-y-1 ${
          trendDirection === 'rising' ? 'bg-green-50 border-green-200'
            : trendDirection === 'falling' ? 'bg-red-50 border-red-200'
            : 'bg-card'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Price Change</span>
            {trendDirection === 'rising' ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : trendDirection === 'falling' ? (
              <TrendingDown className="h-4 w-4 text-red-600" />
            ) : (
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <p className="text-2xl font-bold">
            {priceChangePct != null
              ? `${priceChangePct > 0 ? '+' : ''}${priceChangePct.toFixed(1)}%`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Last 6 months</p>
        </div>

        <div className="bg-card rounded-lg border p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Active Listings</span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-2xl font-bold">{data.activity?.activeCount ?? '—'}</p>
          <p className="text-xs text-muted-foreground">Currently listed</p>
        </div>

        <div className="bg-card rounded-lg border p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Avg. Price</span>
            <MapPin className="h-4 w-4 text-purple-600" />
          </div>
          <p className="text-2xl font-bold">
            {avgPriceCr != null ? `₹${avgPriceCr.toFixed(2)} Cr` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Median</p>
        </div>

        <div className="bg-card rounded-lg border p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Listings (90d)</span>
            <Shield className="h-4 w-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold">{data.listingCount90d}</p>
          <p className="text-xs text-muted-foreground">Last 90 days</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Overview</TabsTrigger>
          <TabsTrigger value="prices" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Price Trends</TabsTrigger>
          <TabsTrigger value="supply" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Supply &amp; Demand</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              Key Insights for {data.areaLabel}
            </h2>
            <div className="space-y-3">
              {insights.map((insight, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium">
                    {idx + 1}
                  </div>
                  <p className="text-sm text-foreground">{insight}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-lg border border-blue-200 p-6">
            <div className="flex items-start gap-4">
              <div>
                <h3 className="font-semibold text-base mb-1">
                  Explore properties in {data.areaLabel}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  View verified listings in this locality on the map
                </p>
                <Button
                  onClick={() => navigate(`/discover?city=${city}&areaKey=${encodeURIComponent(selectedKey)}`)}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <MapPin className="h-4 w-4" />
                  Explore on Map
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prices" className="space-y-4">
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-6">Price Movement</h2>
            {priceHistory.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `₹${(v / 100 / 10_000_000).toFixed(1)}Cr`}
                    />
                    <Tooltip
                      formatter={(v: number) => [`₹${(v / 100 / 10_000_000).toFixed(2)} Cr`, 'Avg Price']}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgPricePaise"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Price history chart coming soon</p>
              </div>
            )}
            {priceChangePct != null && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-900">
                    Prices in {data.areaLabel} have{' '}
                    {trendDirection === 'rising' ? 'increased' : trendDirection === 'falling' ? 'decreased' : 'stayed stable'}{' '}
                    by {Math.abs(priceChangePct).toFixed(1)}% over the last 6 months.
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="supply" className="space-y-4">
          <div className="bg-card rounded-lg border p-6">
            <h2 className="text-base font-semibold mb-6">Supply &amp; Demand</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium mb-4">Popular Property Types</h3>
                {popularTypes.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={popularTypes}
                          dataKey="percentage"
                          nameKey="type"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry) => `${entry.type}: ${entry.percentage}%`}
                        >
                          {popularTypes.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-56 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">No type distribution data</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium">Market Activity</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                    <span className="text-sm text-muted-foreground">Active listings</span>
                    <span className="text-sm font-medium">{data.activity?.activeCount ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                    <span className="text-sm text-muted-foreground">New (last 30d)</span>
                    <span className="text-sm font-medium">{data.activity?.new30d ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                    <span className="text-sm text-muted-foreground">Price trend</span>
                    <span className={`text-sm font-medium capitalize ${
                      trendDirection === 'rising' ? 'text-green-600'
                        : trendDirection === 'falling' ? 'text-red-600'
                        : 'text-muted-foreground'
                    }`}>
                      {trendDirection ?? 'Stable'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
