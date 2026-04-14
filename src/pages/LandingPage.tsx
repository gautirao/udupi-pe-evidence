import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Map, ShieldCheck, BarChart2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrendingAreas } from '@/hooks/useTrendingAreas';
import { formatPrice } from '@/lib/formatters';

function TrendingLocalitiesSection() {
  const { areas, isLoading, isError } = useTrendingAreas();
  const [expanded, setExpanded] = useState(false);

  if (isError || (!isLoading && areas.length === 0)) {
    return null;
  }

  const visibleAreas = expanded ? areas : areas.slice(0, 3);

  return (
    <section className="container mx-auto px-4 py-16 max-w-7xl">
      <h2 className="text-2xl font-semibold text-foreground text-center mb-10">
        Trending Localities
      </h2>

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
                    <Link
                      to={`/area-overview?areaKey=${encodeURIComponent(area.areaKey)}`}
                      className="mt-2 text-sm font-medium text-primary hover:underline"
                    >
                      Explore Area →
                    </Link>
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
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user !== null) {
    return <Navigate to="/discover" replace />;
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
      {/* Hero */}
      {/* ------------------------------------------------------------------ */}
      <section className="container mx-auto px-4 py-20 max-w-7xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Find Your Perfect Home with Trust &amp; Clarity
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Explore properties through interactive maps, discover localities with real market trends,
          and buy with confidence from verified listings.
        </p>
        <p className="mt-4 text-sm font-medium text-muted-foreground">
          500+ Verified Listings · Trusted Brokers
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/discover">Explore on Map</Link>
          </Button>
        </div>
      </section>

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
      <TrendingLocalitiesSection />

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
              <Link to="/discover">Start Map Search</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
