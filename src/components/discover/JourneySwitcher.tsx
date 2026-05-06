import React from 'react';
import { Building2, GraduationCap } from 'lucide-react';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

interface JourneySwitcherProps {
  onSelectJourney: (journey: DiscoverJourney) => void;
}

export function JourneySwitcher({ onSelectJourney }: JourneySwitcherProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <button
        type="button"
        aria-label="Explore properties by area"
        onClick={() => onSelectJourney('area-first')}
        className="w-full text-left rounded-xl border border-border bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/30 hover:from-blue-100 hover:to-blue-200 dark:hover:from-blue-900/50 dark:hover:to-blue-800/40 p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="journey-card-area-first"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 dark:bg-blue-400/10 p-2 mt-0.5 shrink-0">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Explore properties by area</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Browse neighborhoods with detailed information
            </p>
          </div>
        </div>
      </button>

      <button
        type="button"
        aria-label="Search by school area"
        onClick={() => onSelectJourney('school-first')}
        className="w-full text-left rounded-xl border border-border bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/30 hover:from-purple-100 hover:to-purple-200 dark:hover:from-purple-900/50 dark:hover:to-purple-800/40 p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="journey-card-school-first"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-500/10 dark:bg-purple-400/10 p-2 mt-0.5 shrink-0">
            <GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Search by school area</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Find homes near your preferred schools
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
