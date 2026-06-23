import { useParams, Link } from 'react-router-dom';
import { MapPin, ArrowLeft, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AreaGuide } from '@/components/area/AreaGuide';
import { useResolveArea } from '@/hooks/useResolveArea';
import { useAreaIntelligence } from '@/hooks/useAreaIntelligence';
import { useTrendsOptions } from '@/hooks/useTrendsOptions';
import { CITY_CONFIG } from '@/lib/localityUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a human-readable city label from CITY_CONFIG, capitalise as fallback. */
function cityLabelFor(citySlug: string): string {
  return CITY_CONFIG[citySlug]?.label ?? (citySlug.charAt(0).toUpperCase() + citySlug.slice(1));
}

// ─── Slug-not-found state ─────────────────────────────────────────────────────
// Distinct from AreaGuide's "no-snapshot" state (available=false / HTTP 200).
// This fires when the backend returns matched=false — the slug itself is unknown.

interface SlugNotFoundProps {
  citySlug: string;
  cityLabel: string;
}

function SlugNotFound({ citySlug, cityLabel }: SlugNotFoundProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center max-w-md mx-auto">
      <MapPin className="h-12 w-12 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">Area not found</h1>
        <p className="text-sm text-muted-foreground">
          We couldn't find that area in {cityLabel}. It may have been renamed or the link may be
          incorrect.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild variant="default" className="gap-2">
          <Link to={`/discover?city=${citySlug}`}>
            <MapPin className="h-4 w-4" />
            Explore {cityLabel} on map
          </Link>
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/trends">
            <TrendingUp className="h-4 w-4" />
            View trends
          </Link>
        </Button>
      </div>
      <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
        <Link to="/trends">
          <ArrowLeft className="h-3 w-3" />
          Back to trends
        </Link>
      </Button>
    </div>
  );
}

// ─── Inner component — calls useAreaIntelligence only when slug resolved ──────
// Extracted to avoid conditional hook calls: hooks must always be called in the
// same order regardless of which branch renders.

interface ResolvedAreaGuideProps {
  citySlug: string;
  cityLabel: string;
  areaKey: string;
}

function ResolvedAreaGuide({ citySlug, cityLabel, areaKey }: ResolvedAreaGuideProps) {
  const {
    data: areaData,
    isLoading: areaLoading,
    isError: areaError,
  } = useAreaIntelligence(citySlug, areaKey);

  const { data: optionsData } = useTrendsOptions(citySlug, true);

  const nearbyAreaOptions = (optionsData?.defaultAreas ?? []).map(a => ({
    areaKey: a.areaKey,
    areaLabel: a.areaKey.split('|').pop() ?? a.areaKey,
  }));

  return (
    <AreaGuide
      citySlug={citySlug}
      cityLabel={cityLabel}
      areaKey={areaKey}
      isLoading={areaLoading}
      isError={areaError}
      data={areaData}
      nearbyAreaOptions={nearbyAreaOptions}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * /trends/:citySlug/areas/:areaSlug
 *
 * Public buyer-facing area page reached via a canonical slug URL.
 * Flow:
 *   1. Resolver in-flight  → AreaGuide loading skeleton.
 *   2. Resolver network/5xx error → AreaGuide error state.
 *   3. matched=false (HTTP 200) → SlugNotFound (distinct from no-snapshot).
 *   4. matched=true → ResolvedAreaGuide → useAreaIntelligence → AreaGuide.
 */
export default function TrendsAreaResolved() {
  const { citySlug = '', areaSlug = '' } = useParams<{
    citySlug: string;
    areaSlug: string;
  }>();

  const cityLabel = cityLabelFor(citySlug);

  const {
    data: resolveData,
    isLoading: resolveLoading,
    isError: resolveError,
  } = useResolveArea(citySlug, areaSlug);

  // useResolveArea is called unconditionally here (Rules of Hooks).
  // useAreaIntelligence is called inside the child ResolvedAreaGuide, which is
  // only rendered when matched=true — the correct pattern for conditional hook usage.

  // Resolver in-flight → loading skeleton via AreaGuide
  if (resolveLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <AreaGuide
          citySlug={citySlug}
          cityLabel={cityLabel}
          areaKey=""
          isLoading={true}
          isError={false}
          data={undefined}
          nearbyAreaOptions={[]}
        />
      </div>
    );
  }

  // Resolver network / 5xx error → error state via AreaGuide
  if (resolveError) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <AreaGuide
          citySlug={citySlug}
          cityLabel={cityLabel}
          areaKey=""
          isLoading={false}
          isError={true}
          data={undefined}
          nearbyAreaOptions={[]}
        />
      </div>
    );
  }

  // matched=false → slug-not-found (distinct from available=false / no-snapshot)
  if (resolveData && !resolveData.matched) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <SlugNotFound citySlug={citySlug} cityLabel={cityLabel} />
      </div>
    );
  }

  // matched=true → render full guide with resolved areaKey
  if (resolveData?.matched && resolveData.areaKey) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <ResolvedAreaGuide
          citySlug={citySlug}
          cityLabel={cityLabel}
          areaKey={resolveData.areaKey}
        />
      </div>
    );
  }

  // Resolver returned data but matched is unexpectedly undefined — treat as loading.
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <AreaGuide
        citySlug={citySlug}
        cityLabel={cityLabel}
        areaKey=""
        isLoading={true}
        isError={false}
        data={undefined}
        nearbyAreaOptions={[]}
      />
    </div>
  );
}
