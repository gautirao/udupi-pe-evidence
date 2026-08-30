import { ArrowRight, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface AreaCtaBlockProps {
  citySlug: string;
  areaLabel: string;
  /** Full pipe areaKey for the CTA navigation target (uses API listingsCta.areaKey) */
  areaKey: string;
}

/**
 * Navy CTA block (AC8, AC13 navy primary/CTA).
 * Primary: 'View homes in {area}' → listings discover view.
 * Secondary: 'Save area' outline.
 * All copy is dynamic from areaLabel (AC10).
 */
export function AreaCtaBlock({ citySlug, areaLabel, areaKey }: AreaCtaBlockProps) {
  const discoverHref = `/discover?city=${citySlug}&areaKey=${encodeURIComponent(areaKey)}`;

  return (
    <div className="rounded-2xl bg-slate-900 p-8 text-white space-y-4">
      <div>
        {/* B2: CTA-panel headline is not a document section — use <p> not <h2> */}
        <p className="text-2xl font-bold font-serif">Ready to explore {areaLabel}?</p>
        <p className="text-slate-300 text-sm mt-1">
          Browse live homes here, or save the area to come back to it later.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {/* Primary CTA — clay/orange accent as per mock (AC13) */}
        <Button
          asChild
          className="gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold rounded-lg"
        >
          <Link to={discoverHref}>
            View homes in {areaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {/* B1: disabled-honest — save-area wiring is out of scope for this issue */}
        <Button
          variant="outline"
          disabled
          aria-label="Save area (coming soon)"
          title="Coming soon"
          className="gap-2 border-slate-600 text-slate-400 rounded-lg cursor-not-allowed"
        >
          <Heart className="h-4 w-4" />
          Save area
        </Button>
      </div>
    </div>
  );
}
