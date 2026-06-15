import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Loader2,
  MapPin,
  TrendingUp,
  Bookmark,
  Shield,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Search,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTrendingAreas } from '@/hooks/useTrendingAreas';
import { formatPrice } from '@/lib/formatters';
import { DISTRICT_TO_CITY_SLUG } from '@/lib/localityUtils';
import { CITIES } from '@/constants/cities';

// ────────────────────────────────────────────────────────────────────────────
// Static marketing content. These mirror the ReTrends mock exactly. The
// Trending Localities section prefers live data from useTrendingAreas and only
// falls back to this static set when no live areas are available. The Trust
// Badges and Area Overview sections are static marketing content by design.
// ────────────────────────────────────────────────────────────────────────────

interface StaticLocality {
  name: string;
  city: string;
  price: string;
  properties: string;
}

const STATIC_TRENDING: StaticLocality[] = [
  { name: 'Koramangala', city: 'Bangalore', price: '₹1.15 Cr', properties: '342+' },
  { name: 'Indiranagar', city: 'Bangalore', price: '₹1.02 Cr', properties: '287+' },
  { name: 'HSR Layout', city: 'Bangalore', price: '₹1.28 Cr', properties: '398+' },
];

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
    icon: <Shield className="h-6 w-6 text-green-600" />,
    iconWrap: 'bg-green-50',
    title: 'Trust Signals',
    description:
      'Every listing shows verification status. Verified properties have checked documents, RERA registration, and broker credentials.',
  },
  {
    icon: <TrendingUp className="h-6 w-6 text-purple-600" />,
    iconWrap: 'bg-purple-50',
    title: 'Market Insights',
    description:
      'Understand price trends, demand patterns, and locality dynamics before you decide. Data you can trust.',
  },
];

interface TrustBadge {
  icon: React.ReactNode;
  iconWrap: string;
  title: string;
  description: string;
}

const TRUST_BADGES: TrustBadge[] = [
  {
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    iconWrap: 'bg-green-100',
    title: 'Verified',
    description: 'Documents verified, RERA registered, broker credentials confirmed',
  },
  {
    icon: <ShieldCheck className="h-5 w-5 text-blue-600" />,
    iconWrap: 'bg-blue-100',
    title: 'Trusted',
    description: 'From verified brokers with proven track record',
  },
  {
    icon: <MapPin className="h-5 w-5 text-slate-500" />,
    iconWrap: 'bg-slate-100',
    title: 'Listed',
    description: 'Standard listing, verification in progress',
  },
];

interface AreaOverviewCard {
  name: string;
  badge: string;
  badgeClass: string;
  description: string;
}

const AREA_OVERVIEWS: AreaOverviewCard[] = [
  {
    name: 'Koramangala',
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
    name: 'Tiny Village',
    badge: 'Fallback Data',
    badgeClass: 'bg-blue-100 text-blue-700',
    description: 'District-level price context for new areas',
  },
];

const AREA_OVERVIEW_META: Record<string, string> = {
  Koramangala: '42 listings',
  Katapadi: '9 listings',
  'Tiny Village': '<5 listings',
};

// ────────────────────────────────────────────────────────────────────────────
// Header
// ────────────────────────────────────────────────────────────────────────────

function SiteHeader() {
  const { user, signOut, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <MapPin className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold text-foreground">ReTrends</span>
            <span className="text-[11px] text-muted-foreground">Real Estate Trends</span>
          </span>
        </Link>

        {/* Center nav */}
        <nav className="hidden items-center gap-8 md:flex">
          <Link
            to="/discover"
            className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Discover
          </Link>
          <Link
            to="/trends"
            className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            <TrendingUp className="h-4 w-4" />
            Trends
          </Link>
          <Link
            to="/saved-areas"
            className="flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
          >
            <Bookmark className="h-4 w-4" />
            Saved
          </Link>
        </nav>

        {/* Auth control */}
        {isLoading ? null : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {(user.email?.split('@')[0].slice(0, 2).toUpperCase()) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign In</Link>
          </Button>
        )}
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Trending Localities (live data with static fallback)
// ────────────────────────────────────────────────────────────────────────────

function TrendingLocalitiesSection({ selectedCity }: { selectedCity: string }) {
  const { areas, isLoading } = useTrendingAreas();

  const liveCards =
    !isLoading && areas.length > 0
      ? areas.slice(0, 3).map((area) => {
          const districtSegment = area.areaKey.split('|')[2] ?? '';
          const cardCity =
            DISTRICT_TO_CITY_SLUG[districtSegment] ?? (districtSegment.toLowerCase() || 'udupi');
          return {
            name: area.areaLabel,
            city: area.districtLabel ?? cardCity,
            price: area.medianPricePaise != null ? formatPrice(area.medianPricePaise / 100) : '—',
            properties: `${area.listingCount90d}+`,
            href: `/discover?city=${encodeURIComponent(cardCity)}&areaKey=${encodeURIComponent(area.areaKey)}`,
          };
        })
      : STATIC_TRENDING.map((l) => ({
          ...l,
          href: `/discover?city=${encodeURIComponent(l.city.toLowerCase())}`,
        }));

  return (
    <section className="bg-slate-50/80 py-20">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Trending Localities in Bangalore
            </h2>
            <p className="mt-2 text-muted-foreground">High demand areas with verified listings</p>
          </div>
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link to={`/trends?city=${encodeURIComponent(selectedCity)}`}>
              View All Trends
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>

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
                    <span className="text-muted-foreground">Avg. Price</span>
                    <span className="font-semibold text-foreground">{card.price}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Properties</span>
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
  const [selectedCity, setSelectedCity] = useState('bangalore');
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
    navigate(`/discover?city=${encodeURIComponent(selectedCity)}`);
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
      <SiteHeader />

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
              <TrendingUp className="h-3.5 w-3.5" />
              Discover smarter with verified insights
            </span>

            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Find Your Perfect Home with <span className="text-blue-600">Trust &amp; Clarity</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Explore properties through interactive maps, discover localities with real market
              trends, and buy with confidence from verified listings.
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

            {/* Trust stats */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                500+ Verified Listings
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Trusted Brokers
              </span>
            </div>
          </div>

          {/* Right column — hero image with overlay card */}
          <div className="relative">
            <div className="overflow-hidden rounded-2xl shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&h=600&fit=crop"
                alt="Verified property with house keys"
                className="h-[280px] w-full object-cover sm:h-[360px] lg:h-[400px]"
                loading="eager"
              />
            </div>
            <div className="absolute inset-x-4 bottom-4 rounded-xl bg-slate-900/55 p-4 text-white backdrop-blur-sm sm:inset-x-6 sm:bottom-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-400" />
                <span className="font-semibold">Verified Property</span>
              </div>
              <p className="mt-1 text-sm text-white/85">
                All documents checked, RERA registered, ready to view
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* Why Choose ReTrends? */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="container mx-auto max-w-7xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Why Choose ReTrends?
          </h2>
          <p className="mt-3 text-muted-foreground">
            We're not another listings portal. We help you make informed decisions with verified
            data and market insights.
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
      {/* Understanding Trust Badges */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="container mx-auto max-w-7xl px-4 py-20">
        <div className="mx-auto max-w-4xl rounded-2xl bg-gradient-to-br from-blue-50 to-green-50 p-8 sm:p-10">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
              <Shield className="h-5 w-5 text-blue-600" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                Understanding Trust Badges
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We verify every listing to help you buy with confidence
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {TRUST_BADGES.map((b) => (
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
              Explore detailed insights for different localities based on available data
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
                  <p className="mt-3 text-sm text-muted-foreground">
                    {AREA_OVERVIEW_META[a.name]} · {a.description}
                  </p>
                  <Link
                    to={`/area-overview?city=${encodeURIComponent(selectedCity)}`}
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
            Start exploring verified properties in your preferred localities
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
