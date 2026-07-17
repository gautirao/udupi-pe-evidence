import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { cn } from '@/lib/utils';
import { Home, Building2, Sprout, ArrowRight, ChevronRight, HelpCircle, type LucideIcon } from 'lucide-react';
import { parseDemandPrefill, recommendJourney, buildPrefillSearch, type JourneyKey } from '@/lib/demandPrefill';

/**
 * Issue #1719 — first screen after "New listing". Replaces the old default
 * behaviour at /broker/listings/new (which used to land directly on the
 * residential single-page form, per #1626 Phase-7A FIX-A) with an explicit
 * journey picker that routes into the three dedicated create-listing pages
 * shipped by #1626/#1684/#1730 (residential), #1684/#1741 (commercial), and
 * #1627/#1743 (agricultural) — src/pages/broker/{Residential,Commercial,
 * Agricultural}NewListingPage.tsx.
 *
 * Mirrors the ReTrends design mock at
 * docs/design/retrends-design-system/ui_kits/buyer/choose-lisiting-journey.html
 * (structure/copy only — not its raw inline-style HTML, its "last used"
 * badge, or its 950ms setTimeout + window.location.href transition; this is
 * a real react-router SPA navigation).
 */
interface Journey {
  readonly key: 'residential' | 'commercial' | 'agricultural';
  readonly icon: LucideIcon;
  readonly tag: string;
  readonly title: string;
  readonly description: string;
  readonly includes: readonly string[];
  readonly cta: string;
  readonly path: string;
}

const JOURNEYS: readonly Journey[] = [
  {
    key: 'residential',
    icon: Home,
    tag: 'Homes & living space',
    title: 'Residential',
    description: 'For homes, flats, villas and residential plots.',
    includes: ['Apartment', 'House', 'Villa', 'Residential plot'],
    cta: 'Create residential listing',
    path: '/broker/listings/new/residential',
  },
  {
    key: 'commercial',
    icon: Building2,
    tag: 'Business & investment',
    title: 'Commercial',
    description: 'For shops, offices, buildings, warehouses and commercial land.',
    includes: ['Shop / Office', 'Building', 'Warehouse', 'Commercial land'],
    cta: 'Create commercial listing',
    path: '/broker/listings/new/commercial',
  },
  {
    key: 'agricultural',
    icon: Sprout,
    tag: 'Farmland & plantations',
    title: 'Agricultural land',
    description: 'For farmland and agricultural plots.',
    includes: ['Farmland', 'Plantation land', 'Agricultural plot'],
    cta: 'Create agricultural listing',
    path: '/broker/listings/new/agricultural',
  },
];

const LIFECYCLE_STEPS = ['Create listing', 'Save draft', 'Submit for review', 'Pending admin approval'] as const;

interface JourneyCardProps {
  journey: Journey;
  onSelect: (path: string) => void;
  /** #1748 — when this journey matches the demand-gap propertyType, highlight it. */
  recommended?: boolean;
}

function JourneyCard({ journey, onSelect, recommended = false }: JourneyCardProps) {
  const Icon = journey.icon;

  const activate = () => onSelect(journey.path);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={journey.cta}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      className={cn(
        'relative flex flex-col gap-4 rounded-xl border bg-card p-6 text-left cursor-pointer',
        'transition-all hover:border-primary/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        recommended ? 'border-primary ring-1 ring-primary/40 shadow-sm' : 'border-border',
      )}
    >
      {recommended && (
        <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          Recommended
        </span>
      )}

      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      </span>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {journey.tag}
        </div>
        <div className="mt-1 text-lg font-semibold text-foreground">{journey.title}</div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{journey.description}</p>

      <div className="mt-auto space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Includes</div>
        <div className="flex flex-wrap gap-1.5">
          {journey.includes.map((item) => (
            <span
              key={item}
              className="whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Visual CTA only — the whole card (role=button above) is the interactive
          element; a nested real <button> here would create an invalid
          interactive-in-interactive a11y pattern. */}
      <span
        aria-hidden="true"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary/10 text-sm font-semibold text-primary"
      >
        {journey.cta}
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  );
}

export default function NewListingJourneySelector() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // #1748 — TopGapCards forwards demand-gap context (areaKey / propertyType /
  // listingPurpose) here. The params stay in the URL while the selector is shown
  // (so browser Back preserves context); propertyType only RECOMMENDS a journey.
  const prefill = parseDemandPrefill(searchParams);
  const recommended: JourneyKey | null = recommendJourney(prefill.propertyType);
  const prefillSearch = buildPrefillSearch(prefill);

  const selectJourney = (path: string) => {
    void navigate(`${path}${prefillSearch}`);
  };

  return (
    <AppLayout>
      <div className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">New listing</div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Create a new listing</h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            What kind of property are you listing? Pick a journey to start — we'll only ask for the
            details that actually matter for that property.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {JOURNEYS.map((journey) => (
            <JourneyCard
              key={journey.key}
              journey={journey}
              onSelect={selectJourney}
              recommended={recommended === journey.key}
            />
          ))}
        </div>

        <div className="mt-10 space-y-4 border-t border-border pt-6">
          <div className="flex items-start gap-2.5">
            <HelpCircle className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden="true" />
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">Not sure which to pick?</strong> Go by
              who buys it — a family home is <span className="font-semibold text-foreground">Residential</span>,
              a shop or office is <span className="font-semibold text-foreground">Commercial</span>, open
              farmland is <span className="font-semibold text-foreground">Agricultural</span>. You can
              change it before submitting.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5" aria-label="Listing lifecycle">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">What happens next:</span>
            {LIFECYCLE_STEPS.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
                    i === 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                  )}
                >
                  {step}
                </span>
                {i < LIFECYCLE_STEPS.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
                )}
              </span>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Listings aren't published instantly — every listing goes through review before it's visible
            to buyers.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
