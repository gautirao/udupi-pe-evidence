import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ---- Types ----------------------------------------------------------------

interface PoiItem {
  id: string;
  name: string;
  category: string;
  distanceMeters: number;
  pinned: boolean;
}

// ---- Config ----------------------------------------------------------------

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  WORSHIP:   { label: 'Places of Worship', icon: '🛕' },
  HOSPITAL:  { label: 'Hospitals & Clinics', icon: '🏥' },
  SCHOOL:    { label: 'Schools & Universities', icon: '🏫' },
  HOTEL:     { label: 'Hotels & Guest Houses', icon: '🏨' },
  TRANSPORT: { label: 'Bus & Train Stations', icon: '🚌' },
  AIRPORT:   { label: 'Airports', icon: '✈️' },
  GROCERY:   { label: 'Supermarkets & Markets', icon: '🛒' },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_CONFIG);

// ---- Helpers ---------------------------------------------------------------

function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${meters} m`;
}

// ---- Component -------------------------------------------------------------

interface NearbyPoisProps {
  listingId: string;
}

/**
 * Displays approved nearby POIs grouped by category.
 * Hidden entirely when the list is empty.
 * Silently hides on API error — listing detail still renders.
 * Includes OSM attribution (required by ODbL license).
 */
export function NearbyPois({ listingId }: NearbyPoisProps) {
  const { data: pois = [] } = useQuery({
    queryKey: ['nearby-pois', listingId],
    queryFn: () => api.get<PoiItem[]>(`/api/listings/${listingId}/pois`, { skipAuth: true }),
    staleTime: 10 * 60 * 1000,
    // Silently return empty on error — never surface a broken POI section
    throwOnError: false,
  });

  if (pois.length === 0) return null;

  // Group by category, preserving display order
  const grouped: Record<string, PoiItem[]> = {};
  for (const poi of pois) {
    if (!grouped[poi.category]) grouped[poi.category] = [];
    grouped[poi.category].push(poi);
  }

  const orderedCategories = CATEGORY_ORDER.filter((c) => grouped[c]?.length > 0);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Nearby Places</h3>
      <div className="space-y-3">
        {orderedCategories.map((category) => {
          const config = CATEGORY_CONFIG[category];
          const items = grouped[category];
          return (
            <div key={category}>
              <p className="text-sm font-medium text-muted-foreground mb-1.5">
                {config.icon} {config.label}
              </p>
              <ul className="space-y-1">
                {items.map((poi) => (
                  <li
                    key={poi.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className={poi.pinned ? 'font-medium' : ''}>
                      {poi.name}
                    </span>
                    <span className="text-muted-foreground text-xs ml-2 shrink-0">
                      {formatDistance(poi.distanceMeters)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </div>
  );
}
