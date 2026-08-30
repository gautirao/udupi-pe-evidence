import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, MapPin } from 'lucide-react';
import { useTrendingAreas } from '@/hooks/useTrendingAreas';
import { formatPrice } from '@/lib/formatters';
import { districtToCitySlug, CITY_CONFIG } from '@/lib/localityUtils';

// ────────────────────────────────────────────────────────────────────────────
// Trending Localities surface (Issue #2399). Owns its own query + presentation
// and the single areaKey/city-route mapping — live data only, no hardcoded
// fallback localities.
// ────────────────────────────────────────────────────────────────────────────

export function TrendingLocalitiesSection({ selectedCity }: { selectedCity: string }) {
  const { areas, isLoading } = useTrendingAreas();
  const cityLabel = CITY_CONFIG[selectedCity]?.label ?? 'coastal Karnataka';

  // The trending endpoint is global, but this section's heading is presented as
  // city-specific — so filter derived cards to the selected city before rendering.
  // When nothing remains, fall through to the honest empty state below (Issue #1792
  // review). We never render the wrong city's localities under a city-specific title.
  const liveCards =
    !isLoading && areas.length > 0
      ? areas
          .map((area) => {
            const districtSegment = area.areaKey.split('|')[2] ?? '';
            const cardCity =
              districtToCitySlug(districtSegment) ?? (districtSegment.toLowerCase() || 'udupi');
            return {
              name: area.areaLabel,
              city: area.districtLabel ?? cardCity,
              cardCity,
              price: area.medianPricePaise != null ? formatPrice(area.medianPricePaise / 100) : '—',
              properties: `${area.listingCount90d}`,
              href: `/discover?city=${encodeURIComponent(cardCity)}&areaKey=${encodeURIComponent(area.areaKey)}`,
            };
          })
          .filter((card) => card.cardCity === selectedCity)
          .slice(0, 3)
      : [];

  return (
    <section className="bg-slate-50/80 py-20">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Localities in {cityLabel}
            </h2>
            <p className="mt-2 text-muted-foreground">
              Areas where we&apos;re onboarding brokers and adding listings
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link to={`/trends?city=${encodeURIComponent(selectedCity)}`}>
              View All Trends
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

        {liveCards.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {liveCards.map((card) => (
              <Card key={card.name} className="border-border/80 transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{card.name}</h3>
                      <p className="text-sm text-muted-foreground">{card.city}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                      Trending
                    </span>
                  </div>

                  <div className="mt-5 space-y-2 border-t border-border/70 pt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Median price</span>
                      <span className="font-semibold text-foreground">{card.price}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Listings (90d)</span>
                      <span className="font-semibold text-foreground">{card.properties}</span>
                    </div>
                  </div>

                  <Link
                    to={card.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                  >
                    Explore Area
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border/80">
            <CardContent className="flex flex-col items-start gap-3 p-8">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <MapPin className="h-5 w-5 text-blue-600" />
              </span>
              <h3 className="text-lg font-semibold text-foreground">
                New localities are being added
              </h3>
              <p className="max-w-2xl text-sm text-muted-foreground">
                We&apos;re onboarding founding brokers across {cityLabel} during early access. Open
                the map to explore what&apos;s live today.
              </p>
              <Button asChild size="sm" className="mt-1 bg-slate-900 text-white hover:bg-slate-800">
                <Link to={`/discover?city=${encodeURIComponent(selectedCity)}`}>
                  Explore on Map
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}
