import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  MapPin,
  TrendingUp,
  Handshake,
  ClipboardCheck,
  FileText,
  Sparkles,
  ArrowRight,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTrendingAreas } from '@/hooks/useTrendingAreas';
import { useDiscoverSummary } from '@/hooks/useDiscoverSummary';
import { formatPrice } from '@/lib/formatters';
import { districtToCitySlug, DEFAULT_CITY, CITY_CONFIG } from '@/lib/localityUtils';
import { getDiscoverRoute } from '@/lib/navUtils';
import { CITIES } from '@/constants/cities';
import { RoleAwareHeader } from '@/components/layout/AppLayout';

// ────────────────────────────────────────────────────────────────────────────
// Honest curated early-access marketing content (Issue #1792).
//
// Guiding rule: nothing on this page may state a number or a verification claim
// the platform cannot substantiate at render time. Listing/area counts come
// live from GET /api/discover/summary; when that is loading, errored, or zero,
// the page falls back to non-numeric early-access copy — never a fabricated or
// placeholder number, and never a "verified" claim the data cannot back.
//
// The Trending Localities section prefers live data from useTrendingAreas and,
// when no live areas are available, shows a non-numeric early-access note — it
// never renders hardcoded (e.g. Bangalore) fallback localities.
// ────────────────────────────────────────────────────────────────────────────

interface FeatureItem {
  icon: React.ReactNode;
  iconWrap: string;
  title: string;
  description: string;
}

const FEATURES: FeatureItem[] = [
  {
    icon: <MapPin className="h-6 w-6 text-blue-600" />,
    iconWrap: 'bg-blue-50',
    title: 'Map-First Discovery',
    description:
      "Explore properties by locality on an interactive map. Select up to 3 areas and see what's available instantly.",
  },
  {
    icon: <Handshake className="h-6 w-6 text-green-600" />,
    iconWrap: 'bg-green-50',
    title: 'Honest Curation',
    description:
      'Our founding team personally onboards each broker and keeps a close eye on the listings we publish during early access.',
  },
  {
    icon: <TrendingUp className="h-6 w-6 text-purple-600" />,
    iconWrap: 'bg-purple-50',
    title: 'Market Insights',
    description:
      'Understand price trends, demand patterns, and locality dynamics before you decide, using the market data we do have.',
  },
];

interface PracticeCard {
  icon: React.ReactNode;
  iconWrap: string;
  title: string;
  description: string;
}

// Describes what we actually do today — no "verified"/badge claims the data
// cannot back (all current listings are trust tier D, so no badge renders).
const CURATION_PRACTICES: PracticeCard[] = [
  {
    icon: <Handshake className="h-5 w-5 text-green-600" />,
    iconWrap: 'bg-green-100',
    title: 'Personally onboarded brokers',
    description: 'We meet and onboard each founding broker ourselves during early access.',
  },
  {
    icon: <ClipboardCheck className="h-5 w-5 text-blue-600" />,
    iconWrap: 'bg-blue-100',
    title: 'Founder-managed listings',
    description:
      'Our small founding team personally manages and keeps an eye on the listings we publish during early access.',
  },
  {
    icon: <FileText className="h-5 w-5 text-slate-500" />,
    iconWrap: 'bg-slate-100',
    title: 'RERA number provided by seller',
    description:
      'Where a RERA number is available, we show the one the seller provided for you to check yourself.',
  },
];

interface AreaOverviewCard {
  name: string;
  badge: string;
  badgeClass: string;
  description: string;
}

// Explains the trends data-availability tiers (a real product concept). Uses
// coastal-Karnataka localities and carries no fabricated listing counts.
const AREA_OVERVIEWS: AreaOverviewCard[] = [
  {
    name: 'Manipal',
    badge: 'Full Data',
    badgeClass: 'bg-green-100 text-green-700',
    description: 'Comprehensive market data with trends and activity metrics',
  },
  {
    name: 'Katapadi',
    badge: 'Limited Data',
    badgeClass: 'bg-amber-100 text-amber-700',
    description: 'Useful insights with cautious interpretation',
  },
  {
    name: 'New localities',
    badge: 'Fallback Data',
    badgeClass: 'bg-blue-100 text-blue-700',
    description: 'District-level price context while an area builds up its own history',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────────────

function SiteHeader({ selectedCity }: { selectedCity?: string }) {
  return <RoleAwareHeader selectedCity={selectedCity} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Hero stats — live counts from the Discover summary API, with a non-numeric
// early-access fallback. Never renders a fabricated or placeholder number.
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

// ────────────────────────────────────────────────────────────────────────────
// Trending Localities (live data only — no hardcoded fallback localities)
// ────────────────────────────────────────────────────────────────────────────

function TrendingLocalitiesSection({ selectedCity }: { selectedCity: string }) {
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

// ────────────────────────────────────────────────────────────────────────────
// Landing page
// ────────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { isLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [locality, setLocality] = useState('');

  // Delayed-show: only render the auth spinner if it takes > 200 ms to resolve.
  // Supabase restores sessions from localStorage synchronously on most warm loads,
  // so without this gate the spinner would flicker briefly before the page renders.
  const [showAuthLoader, setShowAuthLoader] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowAuthLoader(false);
      return;
    }
    const t = setTimeout(() => setShowAuthLoader(true), 200);
    return () => clearTimeout(t);
  }, [isLoading]);

  const handleExplore = () => {
    navigate(getDiscoverRoute(selectedCity));
  };

  if (showAuthLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader selectedCity={selectedCity} />

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* Hero */}
      {/* ──────────────────────────────────────────────────────────────── */}
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
                    <Select value={selectedCity} onValueChange={setSelectedCity}>
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
                        onChange={(e) => setLocality(e.target.value)}
                        placeholder="Search localities..."
                        className="pl-9"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleExplore}
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

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* Why Choose PropertySignal? */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="container mx-auto max-w-7xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Why Choose PropertySignal?
          </h2>
          <p className="mt-3 text-muted-foreground">
            We&apos;re not another listings portal. We help you make informed decisions with a
            curated, current set of listings and the market insights we have.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center">
              <span className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', f.iconWrap)}>
                {f.icon}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* Trending Localities */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <TrendingLocalitiesSection selectedCity={selectedCity} />

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* How we keep listings honest */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="container mx-auto max-w-7xl px-4 py-20">
        <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-br from-blue-50 to-green-50 p-8 sm:p-10">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
              <Handshake className="h-5 w-5 text-blue-600" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                How we keep listings honest
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Curated early access — here&apos;s exactly what that means today
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CURATION_PRACTICES.map((b) => (
              <div key={b.title} className="rounded-xl bg-white p-5 shadow-sm">
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', b.iconWrap)}>
                  {b.icon}
                </span>
                <h3 className="mt-4 font-semibold text-foreground">{b.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* Area Overview Pages */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="bg-slate-50/80 py-20">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Area Overview Pages
            </h2>
            <p className="mt-3 text-muted-foreground">
              Explore detailed insights for different localities based on the data we have
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {AREA_OVERVIEWS.map((a) => (
              <Card key={a.name} className="border-border/80 transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col p-6">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{a.name}</h3>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', a.badgeClass)}>
                      {a.badge}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{a.description}</p>
                  <Link
                    to={`/trends?city=${encodeURIComponent(selectedCity)}`}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                  >
                    View Overview
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* Bottom CTA */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="bg-blue-600">
        <div className="container mx-auto max-w-7xl px-4 py-20 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Ready to Find Your Perfect Home?
          </h2>
          <p className="mt-3 text-blue-100">
            Start exploring our curated listings in your preferred localities
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-blue-700 hover:bg-blue-50">
              <Link to={`/discover?city=${encodeURIComponent(selectedCity)}`}>
                <MapPin className="mr-2 h-4 w-4" />
                Start Map Search
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/70 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link to="/trends">
                <TrendingUp className="mr-2 h-4 w-4" />
                Explore Trends
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
