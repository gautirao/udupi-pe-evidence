import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// "Area Overview Pages" market-data explainer section (Issue #2399). Static
// content, colocated with its owning section.
//
// Explains the trends data-availability tiers (a real product concept). Uses
// coastal-Karnataka localities and carries no fabricated listing counts.
// ────────────────────────────────────────────────────────────────────────────

interface AreaOverviewCard {
  name: string;
  badge: string;
  badgeClass: string;
  description: string;
}

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

export function LandingAreaOverviewSection({ selectedCity }: { selectedCity: string }) {
  return (
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
  );
}
