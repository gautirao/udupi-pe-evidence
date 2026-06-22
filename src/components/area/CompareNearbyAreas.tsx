import { MapPin, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface NearbyAreaOption {
  areaKey: string;
  areaLabel: string;
}

interface CompareNearbyAreasProps {
  citySlug: string;
  /** Areas sourced from existing safe area options (AC7, Q3=Option A). Never fabricated. */
  nearbyAreas: NearbyAreaOption[];
  /** Currently selected areaKey — excluded from the list */
  currentAreaKey: string;
}

/**
 * 'Compare nearby areas' section (AC7, Q3=Option A).
 * Chips come from existing safe area options already on /trends — navigation-only, no per-area metrics.
 * If nearbyAreas is empty (no safe source for city), section omits cleanly (AC7 clean degrade).
 * Never fabricates per-area numbers.
 */
export function CompareNearbyAreas({
  citySlug,
  nearbyAreas,
  currentAreaKey,
}: CompareNearbyAreasProps) {
  // Filter out the currently selected area
  const options = nearbyAreas.filter(a => a.areaKey !== currentAreaKey);

  // Clean omission when no safe source (AC7)
  if (options.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="compare-nearby-heading" className="space-y-4">
      <div>
        <h2
          id="compare-nearby-heading"
          className="text-xl font-bold text-slate-900 font-serif"
        >
          Compare nearby areas
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Open another area to see the same plain-English guide.
        </p>
      </div>

      {/* Tappable area chips — navigation only, no per-area metrics (AC7) */}
      <div className="flex flex-wrap gap-2" role="list">
        {options.map(area => (
          <Link
            key={area.areaKey}
            to={`/trends?city=${citySlug}&areaKey=${encodeURIComponent(area.areaKey)}`}
            role="listitem"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          >
            <MapPin className="h-3.5 w-3.5 text-slate-500" />
            {area.areaLabel}
            <ArrowRight className="h-3 w-3 text-slate-400" />
          </Link>
        ))}
      </div>
    </section>
  );
}
