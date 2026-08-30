import { Link } from 'react-router-dom';
import { AlertCircle, Heart, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSavedListings, useUnsaveListing } from '@/hooks/useSavedListings';
import { formatPrice, formatArea } from '@/lib/formatters';

function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function purposeLabel(p: string | null | undefined): string {
  if (p === 'sale') return 'For Sale';
  if (p === 'rent') return 'For Rent';
  return capitalize(p ?? '');
}

/**
 * "Saved homes" page (#1566) — lists the current user's saved listings with a
 * remove action. Mirrors the SavedAreas.tsx page shell (same design system,
 * list + remove + empty state). This is a page-specific list rather than a
 * reuse of PropertyCard — PropertyCard's own click-to-navigate + heart
 * affordance are wired for the Discover grid, not a remove-from-list page, and
 * the SavedListingCard response shape (savedAt/status/available) differs from
 * DiscoverCityListingItem. Deliberately kept free of PropertyCard's own hook
 * imports (useSavedListingIds/useAuthModal) to avoid pulling that dependency
 * chain into this page.
 */
export default function SavedHomes() {
  const { data: savedListings, isLoading, isError, refetch } = useSavedListings();
  const unsaveListing = useUnsaveListing();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-12 px-4">
          <h1 className="text-3xl font-bold mb-8">Saved homes</h1>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <div className="container max-w-2xl py-12 px-4">
          <h1 className="text-3xl font-bold mb-8">Saved homes</h1>
          <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load your saved homes. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-2xl py-12 px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Saved homes</h1>
          <Button variant="outline" asChild>
            <Link to="/discover">Browse Discover</Link>
          </Button>
        </div>

        {!savedListings || savedListings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border p-10 text-center">
            <Heart className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-muted-foreground">No saved homes yet.</p>
            <Link to="/discover" className="text-sm underline underline-offset-2">
              Browse Discover to find your next home
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {savedListings.map((card) => (
              <li
                key={card.id}
                data-testid="saved-listing-card"
                className="flex items-center justify-between gap-3 rounded-lg border p-4 bg-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/listing/${card.listingId}`}
                      className="font-medium truncate hover:underline"
                    >
                      {card.title || (card.propertyType ? capitalize(card.propertyType) : 'Property')}
                    </Link>
                    {!card.available && (
                      <span
                        data-testid="unavailable-badge"
                        className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        No longer available
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {card.locality || purposeLabel(card.listingPurpose)}
                    {card.builtArea != null && ` · ${formatArea(card.builtArea, card.builtAreaUnit)}`}
                  </p>
                  {card.pricePaise != null && (
                    <p className="mt-1 text-sm font-semibold">
                      {formatPrice(Math.round(card.pricePaise / 100), 'INR')}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={unsaveListing.isPending}
                  onClick={() => unsaveListing.mutate(card.listingId)}
                  aria-label="Remove saved property"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
