import { Handshake, MapPin, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────────────
// "Why Choose ReTrends?" value-proposition section (Issue #2399). Static
// content, colocated with its owning section — no shared consumers.
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

export function LandingFeaturesSection() {
  return (
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
  );
}
