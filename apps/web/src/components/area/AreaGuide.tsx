import { AlertCircle, MapPin, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AreaIntelligenceResponse } from '@/hooks/useAreaIntelligence';
import { AreaGuideHero } from './AreaGuideHero';
import { AtAGlanceMetrics } from './AtAGlanceMetrics';
import { TrustNote } from './TrustNote';
import { WhatThisMeans } from './WhatThisMeans';
import { CompareNearbyAreas } from './CompareNearbyAreas';
import { AreaCtaBlock } from './AreaCtaBlock';
import { TransparencyFooter } from './TransparencyFooter';

interface NearbyAreaOption {
  areaKey: string;
  areaLabel: string;
}

interface AreaGuideProps {
  citySlug: string;
  cityLabel: string;
  /** Full pipe areaKey from URL state — may be '' while default area resolves */
  areaKey: string;
  isLoading: boolean;
  isError: boolean;
  data: AreaIntelligenceResponse | undefined;
  /** Safe area options for Compare section — sourced from existing /trends options (Q3=A) */
  nearbyAreaOptions: NearbyAreaOption[];
  /**
   * True when city has no configured areas at all (defaultAreas settled as empty).
   * Renders a clean city-level "no data" state — never the legacy #771 dashboard.
   */
  noCityAreas?: boolean;
}

// ─── Loading skeleton (AC9) ───────────────────────────────────────────────────

function AreaGuideSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading area guide">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-6 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

// ─── API error state (AC9: isError — calm, no fake values) ───────────────────

function AreaGuideError({ citySlug }: { citySlug: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <AlertCircle className="h-10 w-10 text-slate-400" />
      <p className="text-lg font-semibold text-slate-800">
        We couldn&apos;t load area details right now
      </p>
      <p className="text-sm text-slate-500 max-w-sm">
        This may be a temporary issue. Try a different area or come back shortly.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to={`/discover?city=${citySlug}`}>
          <MapPin className="h-4 w-4 mr-1.5" />
          Back to map
        </Link>
      </Button>
    </div>
  );
}

// ─── No-snapshot state (AC9: available=false — HTTP 200, NOT an error) ───────
// MUST still show a working 'View homes' CTA (API contract).

function AreaGuideNoSnapshot({
  citySlug,
  cityLabel,
  areaKey,
}: {
  citySlug: string;
  cityLabel: string;
  areaKey: string;
}) {
  // Derive a display label from the areaKey pipe-segment (last segment)
  const areaLabel = areaKey.split('|').pop() ?? areaKey;
  const discoverHref = `/discover?city=${citySlug}&areaKey=${encodeURIComponent(areaKey)}`;

  return (
    <div className="space-y-6">
      {/* Breadcrumb still shown — dynamic city/area (AC10, AC11) */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-700">Home</Link>
        <span>/</span>
        <Link to={`/discover?city=${citySlug}`} className="hover:text-slate-700 capitalize">
          {cityLabel}
        </Link>
        <span>/</span>
        <span className="text-slate-700">{areaLabel}</span>
      </nav>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center space-y-4">
        <MapPin className="h-10 w-10 text-slate-400 mx-auto" />
        <div>
          <p className="text-lg font-semibold text-slate-800">
            Area guide not yet available for {areaLabel}
          </p>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            We don&apos;t have enough recent listing activity to show reliable figures here yet.
            You can still browse available homes.
          </p>
        </div>
        {/* CTA MUST be present even when available=false (AC9, API contract) */}
        <Button asChild className="gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg">
          <Link to={discoverHref}>
            View homes in {areaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Transparency footer still present */}
      <TransparencyFooter />
    </div>
  );
}

// ─── No-city-areas state: city has no configured areas (not an API error) ─────
// Shown when the city is genuine but defaultAreas settled as empty — no data at all.
// Must NOT show the legacy #771 dashboard or any cross-city data (AC10, AC11).

function AreaGuideNoCityAreas({
  citySlug,
  cityLabel,
}: {
  citySlug: string;
  cityLabel: string;
}) {
  const discoverHref = `/discover?city=${citySlug}`;
  return (
    <div className="space-y-6">
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-700">Home</Link>
        <span>/</span>
        <Link to={discoverHref} className="hover:text-slate-700 capitalize">
          {cityLabel}
        </Link>
        <span>/</span>
        <span className="text-slate-700">Area Guide</span>
      </nav>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center space-y-4">
        <MapPin className="h-10 w-10 text-slate-400 mx-auto" />
        <div>
          <p className="text-lg font-semibold text-slate-800">
            Area guides not yet available for {cityLabel}
          </p>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            We don&apos;t have enough verified listing activity to show area guides here yet.
            Explore available homes on the map instead.
          </p>
        </div>
        <Button asChild className="gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg">
          <Link to={discoverHref}>
            Explore {cityLabel} on Map
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <TransparencyFooter />
    </div>
  );
}

// ─── Full / partial / low-confidence state (AC9) ─────────────────────────────

function AreaGuideContent({
  citySlug,
  cityLabel,
  areaKey,
  data,
  nearbyAreaOptions,
}: {
  citySlug: string;
  cityLabel: string;
  areaKey: string;
  data: AreaIntelligenceResponse;
  nearbyAreaOptions: NearbyAreaOption[];
}) {
  // areaLabel: from API when available=true; fallback to pipe-segment (should not occur in this path)
  const areaLabel = data.areaLabel ?? areaKey.split('|').pop() ?? areaKey;

  // 'What it's like' mini-card — only when dominantPropertyType.value is non-null (AC2 guard)
  const whatItsLike =
    data.metrics.dominantPropertyType.value !== null
      ? { dominantType: data.metrics.dominantPropertyType.value }
      : undefined;

  return (
    <div className="space-y-10">
      {/* Hero (AC2) */}
      <AreaGuideHero
        citySlug={citySlug}
        cityLabel={cityLabel}
        areaLabel={areaLabel}
        confidenceLabel={data.confidenceLabel}
        areaKey={data.listingsCta.areaKey}
        whatItsLike={whatItsLike}
      />

      {/* At-a-glance metrics (AC3, AC4, AC5, AC15, AC16) */}
      <AtAGlanceMetrics
        metrics={data.metrics}
        topLevelConfidenceLabel={data.confidenceLabel}
      />

      {/* Trust note (AC6) */}
      <TrustNote />

      {/* What this means (AC6) */}
      <WhatThisMeans
        metrics={data.metrics}
        areaLabel={areaLabel}
        priceComparisonWording={data.priceComparison.supported ? data.priceComparison.wording : null}
      />

      {/* Compare nearby (AC7, Q3=A) */}
      <CompareNearbyAreas
        citySlug={citySlug}
        nearbyAreas={nearbyAreaOptions}
        currentAreaKey={areaKey}
      />

      {/* Navy CTA block (AC8) */}
      <AreaCtaBlock
        citySlug={citySlug}
        areaLabel={areaLabel}
        areaKey={data.listingsCta.areaKey}
      />

      {/* Transparency footer (AC8) */}
      <TransparencyFooter />
    </div>
  );
}

// ─── Main exported component — routes between the six states (AC9) ─────────

/**
 * Buyer area guide — six render states (AC9).
 * Branch available vs isError SEPARATELY (R2 risk mitigation).
 * All copy derives from selected city/area state (AC10).
 */
export function AreaGuide({
  citySlug,
  cityLabel,
  areaKey,
  isLoading,
  isError,
  data,
  nearbyAreaOptions,
  noCityAreas = false,
}: AreaGuideProps) {
  // City has no configured areas — clean city-level no-data state (NOT legacy dashboard, NOT cross-city leak)
  if (noCityAreas) {
    return <AreaGuideNoCityAreas citySlug={citySlug} cityLabel={cityLabel} />;
  }

  // AC9: loading state — covers both "areaIntelligence in-flight" and "default area resolving"
  if (isLoading) {
    return <AreaGuideSkeleton />;
  }

  // AC9: true API error (network failure, 5xx, 400 blank-param) — distinct from no-snapshot
  if (isError) {
    return <AreaGuideError citySlug={citySlug} />;
  }

  // AC9: no-snapshot state (available=false, HTTP 200) — NOT the error screen
  // Branch on available SEPARATELY from isError (R2 mitigation)
  if (data && !data.available) {
    return (
      <AreaGuideNoSnapshot
        citySlug={citySlug}
        cityLabel={cityLabel}
        areaKey={areaKey}
      />
    );
  }

  // AC9: full / partial / low-confidence (available=true; some metrics may be null)
  if (data?.available) {
    return (
      <AreaGuideContent
        citySlug={citySlug}
        cityLabel={cityLabel}
        areaKey={areaKey}
        data={data}
        nearbyAreaOptions={nearbyAreaOptions}
      />
    );
  }

  // Fallback: data undefined, not loading/error/noCityAreas — areaKey resolving; show skeleton.
  // Covers the window between "options loaded, URL not yet written" and "areaKey in URL".
  return <AreaGuideSkeleton />;
}
