import { PropertyFilters } from '@/hooks/usePropertyListings';
import { CITY_CONFIG } from '@/lib/localityUtils';

interface MapEmptyGuidanceProps {
  cityTotal: number;
  filters: PropertyFilters;
  city: string;
  isLoading: boolean;
}

/**
 * Floating guidance message shown at the bottom-center of the map when
 * the visible listing count is zero or very sparse, for authenticated users
 * after the initial load has completed.
 */
export function MapEmptyGuidance({
  cityTotal,
  filters,
  city,
  isLoading,
}: MapEmptyGuidanceProps) {
  if (isLoading) return null;

  const cityLabel = CITY_CONFIG[city]?.label ?? city;
  const hasLocalities = (filters.localities?.length ?? 0) > 0;

  let message: string | null = null;

  if (cityTotal === 0 && hasLocalities) {
    message =
      'No properties found in the selected areas. Try removing a filter or selecting different localities.';
  } else if (cityTotal === 0) {
    message = `No properties listed in ${cityLabel} yet. Try switching to a different city.`;
  }

  if (!message) return null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] max-w-sm">
      <div className="bg-card/95 backdrop-blur rounded-lg border shadow-lg px-4 py-3 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
