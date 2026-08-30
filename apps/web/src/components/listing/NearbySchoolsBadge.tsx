import { useNearbySchools } from '@/hooks/useSchoolSearch';
import { Badge } from '@/components/ui/badge';
import { GraduationCap } from 'lucide-react';

interface NearbySchoolsBadgeProps {
  listingId: string;
  radiusKm?: number;
}

/**
 * Small badge showing "N schools within Xkm".
 * Fetches data only when rendered (e.g., in a listing card or preview).
 */
export function NearbySchoolsBadge({ listingId, radiusKm = 2 }: NearbySchoolsBadgeProps) {
  const { data } = useNearbySchools(listingId, radiusKm);

  if (!data || data.count === 0) return null;

  return (
    <Badge variant="secondary" className="text-xs gap-1">
      <GraduationCap className="h-3 w-3" />
      {data.count} {data.count === 1 ? 'school' : 'schools'} within {radiusKm} km
    </Badge>
  );
}
