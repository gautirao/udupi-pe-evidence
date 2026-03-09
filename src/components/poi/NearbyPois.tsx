import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { CATEGORY_LABELS, CATEGORY_ICONS, formatDistance } from '@/lib/poi-categories';

interface PoiResponse {
  id: string;
  name: string;
  category: string;
  distanceMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  pinned: boolean;
  approved: boolean;
}

interface NearbyPoisProps {
  listingId: string;
}

export function NearbyPois({ listingId }: NearbyPoisProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pois', listingId],
    queryFn: () => api.get<PoiResponse[]>(`/api/listings/${listingId}/pois`),
  });

  if (isLoading) return null;
  if (isError) return null;
  if (!data || data.length === 0) return null;

  // Group by category
  const grouped = new Map<string, PoiResponse[]>();
  for (const poi of data) {
    const list = grouped.get(poi.category) ?? [];
    list.push(poi);
    grouped.set(poi.category, list);
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-semibold mb-3">Nearby</h3>
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, pois]) => {
            const capped = pois.slice(0, 3);
            const icon = CATEGORY_ICONS[category] ?? '';
            const label = CATEGORY_LABELS[category] ?? category;
            return (
              <div key={category}>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {icon} {label}
                </p>
                <div className="space-y-1">
                  {capped.map((poi) => (
                    <div key={poi.id} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-2">{poi.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {formatDistance(poi.distanceMeters)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          &copy;{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap
          </a>{' '}
          contributors (ODbL)
        </p>
      </CardContent>
    </Card>
  );
}
