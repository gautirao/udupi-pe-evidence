import { Link } from 'react-router-dom';
import { Phone, MapPin, Copy, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  return (
    <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      {/* Interested? — primary CTAs */}
      {user ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Interested?</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            <Button
              className="w-full"
              onClick={onOpenBookingModal}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Request Viewing
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={onOpenBookingModal}
            >
              Contact Broker
            </Button>
          </CardContent>
        </Card>
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
          <div className="rounded-lg border border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" aria-hidden="true" />
              <h3 className="font-semibold text-gray-900">Locality Insights</h3>
            </div>
            <p className="mb-3 text-sm text-gray-700">
              View market trends and insights for {localityName}
            </p>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to={`/trends?city=${trendCity}&areaKey=${encodeURIComponent(listing.areaKey!)}`}>
                View Trends
              </Link>
            </Button>
          </div>
        );
      })()}

      {/* AreaMarketWidget still expects the snake_case PropertyListing shape;
          the cast is safe here because the widget degrades gracefully when
          snake_case fields are absent — it renders "Not enough data". */}
      <AreaMarketWidget listing={listing as unknown as PropertyListing} />

      {user && listing.contact_phone && (
        <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-600" />
              Contact
            </h3>
            <a
              href={`tel:${listing.contact_phone}`}
              className="text-xl font-bold text-green-600 hover:underline block mb-3"
            >
              {listing.contact_phone}
            </a>
            <Button asChild className="w-full bg-green-600 hover:bg-green-700">
              <a href={`tel:${listing.contact_phone}`}>
                <Phone className="h-4 w-4 mr-2" />
                Call Now
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {user && listing.contact_info && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-2">Additional Contact Info</h3>
            <p className="text-muted-foreground text-sm">{listing.contact_info}</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={onShare}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          {listing.latitude && listing.longitude && (
            <Button variant="outline" className="w-full justify-start" asChild>
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
        </CardContent>
      </Card>
    </div>
  );
}
