/**
 * AreaNextSteps — recommended CTA section (AC8).
 *
 * CTA routing rules (from [decisions.cta_targets] in approved-plan.toml):
 *   - "View public area page" → /trends?city=<citySlug>&areaKey=<areaKey>  (existing route)
 *   - "Add listing in this area" → /broker/listings/new  (existing route)
 *   - "Open listing quality for <area>" → /broker/listing-quality  (existing route)
 *   - "View demand gaps" (#1535) → DISABLED placeholder (route not yet on main)
 *   - "Compare areas" (#1523) → DISABLED placeholder (route not yet on main)
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, PlusCircle, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/components/broker/SectionCard';

interface AreaNextStepsProps {
  citySlug: string;
  areaKey: string;
  areaLabel: string;
}

export function AreaNextSteps({ citySlug, areaKey, areaLabel }: AreaNextStepsProps) {
  return (
    <SectionCard
      title="Recommended next steps"
      description="Actions you can take right now in this area"
    >
      <div className="flex flex-wrap gap-3">
        {/* Existing route: /trends?city=...&areaKey=... */}
        <Button asChild variant="outline" size="sm">
          <Link
            to={`/trends?city=${encodeURIComponent(citySlug)}&areaKey=${encodeURIComponent(areaKey)}`}
            data-testid="cta-view-public-area"
          >
            <ExternalLink className="h-4 w-4 mr-1.5" />
            View public area page
          </Link>
        </Button>

        {/* Existing route: /broker/listings/new */}
        <Button asChild size="sm">
          <Link to="/broker/listings/new" data-testid="cta-add-listing">
            <PlusCircle className="h-4 w-4 mr-1.5" />
            Add listing in this area
          </Link>
        </Button>

        {/* Existing route: /broker/listing-quality */}
        <Button asChild variant="outline" size="sm">
          <Link to="/broker/listing-quality" data-testid="cta-listing-quality">
            <BarChart2 className="h-4 w-4 mr-1.5" />
            Open listing quality for {areaLabel}
          </Link>
        </Button>

        {/* Disabled — #1535 not yet on main */}
        <Button
          variant="outline"
          size="sm"
          disabled
          aria-label="View demand gaps — coming soon"
          data-testid="cta-demand-gaps-disabled"
          title="Demand gaps workspace coming soon (#1535)"
        >
          View demand gaps
          <span className="ml-1.5 text-xs text-muted-foreground">(coming soon)</span>
        </Button>

        {/* Disabled — #1523 not yet on main */}
        <Button
          variant="outline"
          size="sm"
          disabled
          aria-label="Compare areas — coming soon"
          data-testid="cta-compare-areas-disabled"
          title="Area comparison coming soon (#1523)"
        >
          Compare areas
          <span className="ml-1.5 text-xs text-muted-foreground">(coming soon)</span>
        </Button>
      </div>
    </SectionCard>
  );
}
