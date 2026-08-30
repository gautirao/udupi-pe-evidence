import { MapPin, Heart, ArrowRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface WhatItsLikeData {
  dominantType: string | null;
}

interface AreaGuideHeroProps {
  citySlug: string;
  cityLabel: string;
  areaLabel: string;
  /** Top-level API confidenceLabel */
  confidenceLabel: string;
  /** Full pipe areaKey for the CTA link */
  areaKey: string;
  /** Optional: derived from dominantPropertyType when available */
  whatItsLike?: WhatItsLikeData;
}

function ConfidenceChip({ label }: { label: string }) {
  // Map API label -> visual style (AC13 soft-green for positive, muted otherwise)
  const isEnough = label === 'Enough data';
  const isLimited = label === 'Limited data';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        isEnough
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : isLimited
          ? 'bg-amber-50 text-amber-800 border border-amber-200'
          : 'bg-slate-100 text-slate-600 border border-slate-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isEnough ? 'bg-emerald-500' : isLimited ? 'bg-amber-500' : 'bg-slate-400'
        }`}
      />
      {label}
    </span>
  );
}

/**
 * Maps ISO 3166-2 state abbreviations (pipe-segment index 1 of areaKey) to display names.
 * Extend as new states are added. Falls back to the raw abbreviation if unmapped.
 * Keyed on the abbreviation as it appears in the areaKey (e.g. "IN|KA|..." → "KA").
 */
const STATE_ABBREV_TO_NAME: Record<string, string> = {
  KA: 'Karnataka',
  MH: 'Maharashtra',
  TN: 'Tamil Nadu',
  KL: 'Kerala',
  AP: 'Andhra Pradesh',
  TS: 'Telangana',
  GJ: 'Gujarat',
  DL: 'Delhi',
  WB: 'West Bengal',
  RJ: 'Rajasthan',
};

/**
 * Derive the state display name from the full pipe areaKey.
 * areaKey format: "IN|{STATE}|{District}|{Area}" — index 1 = state abbrev.
 * Returns the mapped name, or the raw abbreviation if not in the map.
 */
function stateFromAreaKey(areaKey: string): string {
  const parts = areaKey.split('|');
  const abbrev = parts[1] ?? '';
  return STATE_ABBREV_TO_NAME[abbrev] ?? abbrev;
}

/**
 * Area guide hero (AC2): breadcrumb, eyebrow, area name, confidence chip, CTAs.
 * 'What it's like' mini-card renders only when dominantPropertyType is present (AC2 guard).
 * All copy is dynamic from city/area props — no hardcoded Udupi/Malpe/Karnataka (AC10).
 */
export function AreaGuideHero({
  citySlug,
  cityLabel,
  areaLabel,
  confidenceLabel,
  areaKey,
  whatItsLike,
}: AreaGuideHeroProps) {
  const discoverHref = `/discover?city=${citySlug}&areaKey=${encodeURIComponent(areaKey)}`;
  // State name derived from areaKey pipe-segment — never hardcoded (AC10)
  const stateName = stateFromAreaKey(areaKey);

  return (
    <div className="flex flex-col lg:flex-row lg:items-start lg:gap-8">
      {/* Left content */}
      <div className="flex-1 space-y-4">
        {/* Breadcrumb (AC2) */}
        <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
          <Link to="/" className="hover:text-slate-700 transition-colors">
            <Home className="h-3.5 w-3.5" />
          </Link>
          <span>/</span>
          <Link
            to={`/discover?city=${citySlug}`}
            className="hover:text-slate-700 transition-colors capitalize"
          >
            {cityLabel}
          </Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">{areaLabel}</span>
        </nav>

        {/* Eyebrow: AREA · {CITY} • AREA GUIDE (AC2, AC10) */}
        <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase">
          Area · {cityLabel.toUpperCase()} &bull; Area Guide
        </p>

        {/* Area name — serif heading (AC13) */}
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight font-serif">
          {areaLabel}
        </h1>

        {/* Chips row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Location chip */}
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <MapPin className="h-3 w-3" />
            {areaLabel}, {cityLabel} district, {stateName}
          </span>
          {/* Confidence chip driven by API top-level confidenceLabel (AC2) */}
          <ConfidenceChip label={confidenceLabel} />
        </div>

        {/* CTAs (AC2, AC8) */}
        <div className="flex flex-wrap gap-3 pt-1">
          <Button
            asChild
            className="gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg"
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
            className="gap-2 border-slate-300 text-slate-400 rounded-lg cursor-not-allowed"
          >
            <Heart className="h-4 w-4" />
            Save area
          </Button>
        </div>
      </div>

      {/* Right: "What it's like" mini-card — ONLY when backed by dominantPropertyType (AC2 guard) */}
      {whatItsLike?.dominantType && (
        <div className="mt-6 lg:mt-0 lg:w-56 flex-shrink-0">
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
            <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
              What it&apos;s like
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center text-amber-700">
                  <Home className="h-3.5 w-3.5" />
                </span>
                {whatItsLike.dominantType}
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
