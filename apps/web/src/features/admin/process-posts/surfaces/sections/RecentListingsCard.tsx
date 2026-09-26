import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Home, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ProcessPostsListingsView } from '../processPostsSurfaceContract';

export interface RecentListingsCardProps {
  view: ProcessPostsListingsView;
}

/** Issue #2662 — moved verbatim from ProcessPosts.tsx's "Recent Listings" card. */
export function RecentListingsCard({ view }: RecentListingsCardProps) {
  const { recentListings, isLoadingListings } = view;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Recent Listings
        </CardTitle>
        <CardDescription>Latest property listings extracted by AI</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoadingListings ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : recentListings.length === 0 ? (
          <div className="text-center py-8">
            <Home className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No listings yet</p>
            <p className="text-sm text-muted-foreground">Process some posts to create listings</p>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-3">
              {recentListings.map((listing) => (
                <div
                  key={listing.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {listing.property_type}
                      </Badge>
                      {listing.is_valid ? (
                        <Badge className="bg-green-500/10 text-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Valid
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-500/10 text-yellow-600">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Review
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{listing.confidence_score}%</span>
                  </div>
                  <div className="space-y-1">
                    {listing.locality && <p className="text-sm font-medium">{listing.locality}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {listing.price && <span>₹{(listing.price / 100000).toFixed(1)}L</span>}
                      {listing.bedrooms && <span>{listing.bedrooms} BHK</span>}
                      {listing.land_area && (
                        <span>
                          {listing.land_area} {listing.land_area_unit || 'sqft'}
                        </span>
                      )}
                    </div>
                    {listing.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{listing.description}</p>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {formatDistanceToNow(new Date(listing.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
