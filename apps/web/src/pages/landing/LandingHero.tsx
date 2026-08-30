import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Handshake, MapPin, Search, Sparkles } from 'lucide-react';
import { useDiscoverSummary } from '@/hooks/useDiscoverSummary';
import { CITIES } from '@/constants/cities';

// ────────────────────────────────────────────────────────────────────────────
// Hero surface (Issue #2399). Receives typed state/actions from the landing
// page's home-state owner — no local navigation/city-selection state.
// ────────────────────────────────────────────────────────────────────────────

interface LandingHeroProps {
  selectedCity: string;
  onSelectCity: (city: string) => void;
  locality: string;
  onLocalityChange: (locality: string) => void;
  onExplore: () => void;
}

export function LandingHero({
  selectedCity,
  onSelectCity,
  locality,
  onLocalityChange,
  onExplore,
}: LandingHeroProps) {
  return (
    <section className="bg-gradient-to-b from-blue-50/70 via-blue-50/30 to-background">
      <div
        className="container mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24"
        data-testid="hero"
      >
        {/* Left column */}
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            Curated early access · Coastal Karnataka
          </span>

          <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Homes in Karnataka , <span className="text-blue-600">honestly curated</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Explore Bangalore and Udupi on an interactive map, see the market trends we have, and
            talk to founding brokers we&apos;ve personally onboarded. We&apos;re early — and our
            founding team manages the listings we publish by hand.
          </p>

          {/* Search card */}
          <Card className="mt-8 max-w-xl border-border/80 shadow-sm">
            <CardContent className="p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hero-city">
                    City
                  </label>
                  <Select value={selectedCity} onValueChange={onSelectCity}>
                    <SelectTrigger id="hero-city" className="w-full">
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
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium text-foreground"
                    htmlFor="hero-locality"
                  >
                    Locality (Optional)
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="hero-locality"
                      value={locality}
                      onChange={(e) => onLocalityChange(e.target.value)}
                      placeholder="Search localities..."
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={onExplore}
                size="lg"
                className="mt-4 w-full bg-slate-900 text-white hover:bg-slate-800"
              >
                <Search className="mr-2 h-4 w-4" />
                Explore on Map
              </Button>
            </CardContent>
          </Card>

          {/* Trust stats — live counts with non-numeric early-access fallback */}
          <HeroStats city={selectedCity} />
        </div>

        {/* Right column — hero image with overlay card */}
        <div className="relative">
          <div className="overflow-hidden rounded-2xl shadow-xl">
            <img
              src="/hero-coastal-karnataka.svg"
              alt="Coastal Karnataka homes at sunset over the Arabian Sea"
              className="h-[280px] w-full object-cover sm:h-[360px] lg:h-[400px]"
              loading="eager"
            />
          </div>
          <div className="absolute inset-x-4 bottom-4 rounded-xl bg-slate-900/55 p-4 text-white backdrop-blur-sm sm:inset-x-6 sm:bottom-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-300" />
              <span className="font-semibold">Curated early access</span>
            </div>
            <p className="mt-1 text-sm text-white/85">
              Founding brokers, personally onboarded and managed by our founding team.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Hero stats — live counts from the Discover summary API, with a non-numeric
// early-access fallback. Never renders a fabricated or placeholder number.
// Kept colocated with LandingHero: it is a single, already-cohesive
// query-owning component with no shared consumers (Issue #2399 AC).
// ────────────────────────────────────────────────────────────────────────────

function HeroStats({ city }: { city: string }) {
  const { data, isLoading, isError } = useDiscoverSummary({ city });

  // Only the backend-owned total is a real, substantiated count. `hotspots` is a
  // capped, limit-driven sample — not the true locality total — so we never derive
  // an implied "across N localities" figure from it (Issue #1792 review).
  const listingCount = data?.totalActiveListings ?? 0;
  const hasRealCounts = !isLoading && !isError && listingCount > 0;

  if (!hasRealCounts) {
    // Loading, errored, or zero data → honest, non-numeric early-access copy.
    return (
      <div
        data-testid="hero-stats"
        className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Curated early access
        </span>
        <span className="flex items-center gap-1.5">
          <Handshake className="h-4 w-4 text-green-600" />
          Personally onboarded brokers
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="hero-stats"
      className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <MapPin className="h-4 w-4 text-blue-600" />
        {listingCount.toLocaleString('en-IN')} curated{' '}
        {listingCount === 1 ? 'listing' : 'listings'}
      </span>
      <span className="flex items-center gap-1.5">
        <Handshake className="h-4 w-4 text-green-600" />
        Personally onboarded brokers
      </span>
    </div>
  );
}
