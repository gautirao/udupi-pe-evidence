import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageOff } from 'lucide-react';
import { useSimilarListings } from '@/hooks/useSimilarListings';
import { formatPrice } from '@/lib/formatters';

interface SimilarListingsProps {
  listingId: string;
  locality: string | null;
  propertyType: string | null;
}

export function SimilarListings({ listingId, locality, propertyType }: SimilarListingsProps) {
  const navigate = useNavigate();
  const { data, isLoading } = useSimilarListings(listingId, locality, propertyType);

  if (!locality) return null;

  if (isLoading) {
    return (
      <div>
        <h3 className="font-semibold mb-3">More in {locality}</h3>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-24 w-full rounded-t-lg" />
              <CardContent className="p-3 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div>
      <h3 className="font-semibold mb-3">More in {locality}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.map((listing) => {
          const firstImage = listing.images?.[0]?.url;
          return (
            <Card
              key={listing.id}
              className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
              onClick={() => navigate(`/listing/${listing.id}`)}
            >
              <div className="h-24 bg-muted">
                {firstImage ? (
                  <img
                    src={firstImage}
                    alt="Property"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <Badge variant="secondary" className="capitalize text-xs mb-1">
                  {listing.property_type}
                </Badge>
                {listing.price && (
                  <p className="font-semibold text-sm text-primary">
                    {formatPrice(listing.price, listing.price_unit)}
                  </p>
                )}
                {listing.bedrooms && (
                  <p className="text-xs text-muted-foreground">{listing.bedrooms} BHK</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
