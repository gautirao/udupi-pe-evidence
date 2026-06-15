import React from 'react';
import { Building2, GraduationCap, Sprout } from 'lucide-react';
import type { DiscoverJourney } from '@/hooks/useDiscoverUrlState';

interface JourneySwitcherProps {
  onSelectJourney: (journey: DiscoverJourney) => void;
}

export function JourneySwitcher({ onSelectJourney }: JourneySwitcherProps) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Explore by area — neutral card with a dark slate icon tile (Figma). */}
      <button
        type="button"
        aria-label="Explore properties by area"
        onClick={() => onSelectJourney('area-first')}
        className="group w-full text-left rounded-2xl border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="journey-card-area-first"
      >
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-slate-800 dark:bg-slate-700 p-2.5 shrink-0 shadow-sm">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground">Explore properties by area</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Browse neighborhoods with detailed information
            </p>
          </div>
        </div>
      </button>

      {/* Search by school area — soft purple tint + purple icon tile (Figma). */}
      <button
        type="button"
        aria-label="Search by school area"
        onClick={() => onSelectJourney('school-first')}
        className="group w-full text-left rounded-2xl border border-purple-100 dark:border-purple-900/40 bg-purple-50/70 dark:bg-purple-950/20 p-5 transition-all hover:border-purple-200 dark:hover:border-purple-800/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="journey-card-school-first"
      >
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-purple-600 dark:bg-purple-500 p-2.5 shrink-0 shadow-sm">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground">Search by school area</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Find homes near your preferred schools
            </p>
          </div>
        </div>
      </button>

      {/* Search agricultural land — soft green tint + green icon tile, slightly stronger
          border to echo the highlighted card in the Figma mock. */}
      <button
        type="button"
        aria-label="Search agricultural land"
        onClick={() => onSelectJourney('agri-first')}
        className="group w-full text-left rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/20 p-5 transition-all hover:border-emerald-300 dark:hover:border-emerald-800/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="journey-card-agri-first"
      >
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-emerald-600 dark:bg-emerald-500 p-2.5 shrink-0 shadow-sm">
            <Sprout className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground">Search Agricultural Land</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Explore farmland and agricultural plots by area
            </p>
          </div>
        </div>
      </button>
    </div>
  );
}
