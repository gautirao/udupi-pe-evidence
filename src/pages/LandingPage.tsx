import { Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Map, ShieldCheck, BarChart2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

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
