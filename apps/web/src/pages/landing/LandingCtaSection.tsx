import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MapPin, TrendingUp } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Bottom CTA section (Issue #2399).
// ────────────────────────────────────────────────────────────────────────────

export function LandingCtaSection({ selectedCity }: { selectedCity: string }) {
  return (
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
  );
}
