import { Link } from 'react-router-dom';
import { Phone, MapPin, Copy, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AreaMarketWidget } from '@/components/listing/AreaMarketWidget';
import { SignInGateCard } from '@/components/auth/SignInGateCard';
import { DISTRICT_TO_CITY_SLUG, DEFAULT_CITY } from '@/lib/localityUtils';
import { PropertyListing } from '@/hooks/usePropertyListings';
import type { PublicListingDetail } from '@/pages/ListingDetail';
import type { User } from '@supabase/supabase-js';

export interface ListingDetailSidebarProps {
  listing: PublicListingDetail;
  user: User | null;
  onOpenBookingModal: () => void;
  onShare: () => void;
}

export function ListingDetailSidebar({
  listing,
  user,
  onOpenBookingModal,
  onShare,
}: ListingDetailSidebarProps) {
  const hasCoords = listing.latitude != null && listing.longitude != null;

  return (
    <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* Interested? — primary CTAs */}
      {user ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 text-base font-semibold">Interested?</h2>
          <div className="space-y-2">
            <Button className="w-full" onClick={onOpenBookingModal}>
              <Calendar className="h-4 w-4 mr-2" />
              Request Viewing
            </Button>
            <Button variant="outline" className="w-full" onClick={onOpenBookingModal}>
              Contact Broker
            </Button>
          </div>
        </section>
      ) : (
        <SignInGateCard
          variant="card"
          description="Sign in to view full details"
          ctaLabel="Sign in to view full details"
          returnTo={`/listing/${listing.id}`}
        />
      )}

      {/* Locality Insights */}
      {listing.areaKey && (() => {
        const parts = listing.areaKey.split('|');
        const localityName = parts.at(-1) ?? listing.areaKey;
        // areaKey format: IN|KA|{district}|{locality} — parts[2] is the district
        const trendCity = (parts[2] && DISTRICT_TO_CITY_SLUG[parts[2]]) ?? DEFAULT_CITY;
        return (
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="text-base font-semibold">Locality Insights</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              View market trends and insights for {localityName}
            </p>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to={`/trends?city=${trendCity}&areaKey=${encodeURIComponent(listing.areaKey!)}`}>
                View Trends
              </Link>
            </Button>
          </section>
        );
      })()}

      {/* AreaMarketWidget still expects the snake_case PropertyListing shape;
          the cast is safe here because the widget degrades gracefully when
          snake_case fields are absent — it renders "Not enough data". */}
      <AreaMarketWidget listing={listing as unknown as PropertyListing} />

      {user && listing.contact_phone && (
        <section className="rounded-2xl border border-green-200 bg-green-50/50 p-5 dark:bg-green-950/20">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <Phone className="h-4 w-4 text-green-600" />
            Contact
          </h2>
          <a
            href={`tel:${listing.contact_phone}`}
            className="mb-3 block text-xl font-bold text-green-600 hover:underline"
          >
            {listing.contact_phone}
          </a>
          <Button asChild className="w-full bg-green-600 hover:bg-green-700">
            <a href={`tel:${listing.contact_phone}`}>
              <Phone className="h-4 w-4 mr-2" />
              Call Now
            </a>
          </Button>
        </section>
      )}

      {user && listing.contact_info && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-2 text-base font-semibold">Additional Contact Info</h2>
          <p className="text-sm text-muted-foreground">{listing.contact_info}</p>
        </section>
      )}

      {/* Quick Actions — Copy Link + Open in Maps */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onShare}>
          <Copy className="h-4 w-4 mr-2" />
          Copy Link
        </Button>
        {hasCoords && (
          <Button variant="outline" className="flex-1" asChild>
            <a
              href={`https://www.google.com/maps/search/${listing.latitude},${listing.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Open in Maps
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
