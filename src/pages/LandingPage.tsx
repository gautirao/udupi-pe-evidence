import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Map, ShieldCheck, BarChart2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTrendingAreas } from '@/hooks/useTrendingAreas';
import { formatPrice } from '@/lib/formatters';
import { AREA_DEFAULTS } from '@/constants/areaDefaults';
import { DISTRICT_TO_CITY_SLUG } from '@/lib/localityUtils';
import { HomepageFilterPanel } from '@/components/HomepageFilterPanel';
import { CITIES, ANY_AREA_SENTINEL } from '@/constants/cities';

function TrendingLocalitiesSection({ selectedCity }: { selectedCity: string }) {
  const { areas, isLoading, isError } = useTrendingAreas();
  const [expanded, setExpanded] = useState(false);

  if (isError || (!isLoading && areas.length === 0)) {
    return null;
  }

  const visibleAreas = expanded ? areas : areas.slice(0, 3);

  return (
    <section className="container mx-auto px-4 py-16 max-w-7xl">
      <div className="flex items-center justify-between mb-10">
        <h2 className="text-2xl font-semibold text-foreground">
          Trending Localities
        </h2>
        <Link
          to={`/trends?city=${encodeURIComponent(selectedCity)}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          View All Trends →
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6 flex flex-col gap-3">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {visibleAreas.map((area) => {
              const price =
                area.medianPricePaise != null
                  ? formatPrice(area.medianPricePaise / 100)
                  : null;
              const districtSegment = area.areaKey.split('|')[2] ?? '';
              const cardCity = DISTRICT_TO_CITY_SLUG[districtSegment] ?? (districtSegment.toLowerCase() || 'udupi');
              return (
                <Card key={area.areaKey}>
                  <CardContent className="p-6 flex flex-col gap-2">
                    <div>
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0">
                        Trending
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-foreground text-lg leading-snug">
                      {area.areaLabel}
                    </h3>
                    {area.districtLabel != null && (
                      <p className="text-sm text-muted-foreground">{area.districtLabel}</p>
                    )}
                    {price != null && (
                      <p className="text-sm font-medium text-foreground">{price}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {area.listingCount90d} properties
                    </p>
                    <div className="mt-2 flex items-center gap-4">
                      <Link
                        to={`/trends?city=${encodeURIComponent(cardCity)}&areaKey=${encodeURIComponent(area.areaKey)}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Explore Area →
                      </Link>
                      <Link
                        to={`/discover?city=${encodeURIComponent(cardCity)}&areaKey=${encodeURIComponent(area.areaKey)}`}
                        className="text-sm text-muted-foreground hover:underline"
                      >
                        Explore on Map
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {areas.length > 3 && !expanded && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" onClick={() => setExpanded(true)}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    icon: <Map className="h-6 w-6 text-primary" />,
    title: 'Map-First Discovery',
    description:
      'Explore properties by locality on an interactive map. Select up to 3 areas and see what\'s available instantly.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6 text-primary" />,
    title: 'Trust Signals',
    description:
      'Every listing shows verification status. Verified properties have checked documents, RERA registration, and broker credentials.',
  },
  {
    icon: <BarChart2 className="h-6 w-6 text-primary" />,
    title: 'Area Insights',
    description:
      'Understand price trends, demand patterns, and locality dynamics before you decide.',
  },
];

export default function LandingPage() {
  const { isLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState('bangalore');
  const [selectedAreaKey, setSelectedAreaKey] = useState(ANY_AREA_SENTINEL);
  const [panelOpen, setPanelOpen] = useState(true);
  const { areas: areaOptions, isLoading: areasLoading } = useTrendingAreas();

  const cityAreas = areaOptions.filter((a) => {
    const district = a.areaKey.split('|')[2] ?? '';
    return (DISTRICT_TO_CITY_SLUG[district] ?? district.toLowerCase()) === selectedCity;
  });

  const areasToShow = cityAreas.length > 0 ? cityAreas : (AREA_DEFAULTS[selectedCity] ?? []);

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedAreaKey(ANY_AREA_SENTINEL);
  };

  const handleExplore = () => {
    const params = new URLSearchParams({ city: selectedCity });
    const resolvedArea = selectedAreaKey === ANY_AREA_SENTINEL ? '' : selectedAreaKey;
    if (resolvedArea) params.set('areaKey', resolvedArea);
    navigate(`/discover?${params.toString()}`);
  };

  // Wait for auth to resolve before rendering to avoid a Sign-in link flash
  // for users who are already logged in (Supabase restores session from localStorage).
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-14">
          <span className="font-semibold text-foreground">ReTrends</span>
          <Link to="/auth" className="text-sm font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Hero + Filter Panel — two-column at lg, stacked on mobile */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col lg:flex-row relative" data-testid="two-column-wrapper">
        {/* Left column: hero copy + city/area selectors */}
        <div className={cn('flex flex-col justify-center px-8 py-16 transition-all duration-300', panelOpen ? 'lg:w-1/2' : 'lg:w-full')}>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Find Your Perfect Home with Trust &amp; Clarity
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Explore properties through interactive maps, discover localities with real market trends,
            and buy with confidence from verified listings.
          </p>
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            500+ Verified Listings · Trusted Brokers
          </p>

          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Select value={selectedCity} onValueChange={handleCityChange}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedAreaKey}
              onValueChange={setSelectedAreaKey}
              disabled={areasLoading && areasToShow.length === 0}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Any area (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_AREA_SENTINEL}>Any area</SelectItem>
                {areasToShow.map((a) => (
                  <SelectItem key={a.areaKey} value={a.areaKey}>
                    {a.areaLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="lg" onClick={handleExplore} className="bg-blue-600 hover:bg-blue-700 text-white">
              Explore on Map
            </Button>
          </div>
        </div>

        {/* Toggle button — absolutely positioned at the left edge of the right panel, lg+ only */}
        <Button
          variant="ghost"
          size="icon"
          data-testid="panel-toggle"
          aria-label={panelOpen ? 'Collapse filter panel' : 'Expand filter panel'}
          className={cn(
            'hidden lg:flex absolute top-1/2 -translate-y-1/2 z-10 h-8 w-6 rounded-l-none bg-card border border-l-0 border-border shadow-sm transition-all duration-300',
            panelOpen ? 'left-1/2' : 'left-0',
          )}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {/* Right column: scoped filter panel — CSS width collapse, always in DOM (AC3).
            min-w-0 allows lg:w-0 to override the Card's intrinsic min-content width. */}
        <div
          data-testid="filter-panel-col"
          className={cn(
            'lg:flex-shrink-0 min-w-0 bg-muted/40 flex items-center justify-center overflow-hidden transition-all duration-300',
            panelOpen ? 'lg:w-1/2 px-8 py-16' : 'lg:w-0 px-0 py-0',
          )}
        >
          <HomepageFilterPanel />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Why Choose ReTrends? */}
      {/* ------------------------------------------------------------------ */}
      <section className="container mx-auto px-4 py-16 max-w-7xl">
        <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
          Why Choose ReTrends?
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {FEATURE_CARDS.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-6 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {card.icon}
                  <h3 className="font-semibold text-foreground">{card.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Trending Localities */}
      {/* ------------------------------------------------------------------ */}
      <TrendingLocalitiesSection selectedCity={selectedCity} />

      {/* ------------------------------------------------------------------ */}
      {/* Footer CTA */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-muted">
        <div className="container mx-auto px-4 py-20 max-w-7xl text-center">
          <h2 className="text-2xl font-semibold text-foreground">
            Ready to Find Your Perfect Home?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start exploring verified properties in your preferred localities.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <Button asChild size="lg">
              <Link
                to={`/discover?${new URLSearchParams(
                  selectedAreaKey !== ANY_AREA_SENTINEL
                    ? { city: selectedCity, areaKey: selectedAreaKey }
                    : { city: selectedCity },
                ).toString()}`}
              >
                Start Map Search
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
