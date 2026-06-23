import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { listingKeys } from '@/lib/listingQueryKeys';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyImage, PropertyType } from '@/hooks/usePropertyListings';
import { ListingResponse } from '@/hooks/useBrokerListings';
import { PriceHistoryEntry } from '@/components/listing/ListingTransparencyCard';
import { AlertTriangle, ArrowLeft, Share2, Check, Heart, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { RequestViewingModal } from '@/components/listing/RequestViewingModal';
import { ListingGallery } from '@/components/listing/ListingGallery';
import { ListingDetailMainContent } from '@/components/listing/ListingDetailMainContent';
import { ListingDetailSidebar } from '@/components/listing/ListingDetailSidebar';
import { TakeOfflineButton, ReopenForEditingButton } from '@/components/listing/ListingPreviewActions';
import { AgriListingDetail } from '@/components/listing/agri/AgriListingDetail';

const propertyConfig: Record<string, { label: string; badgeClass: string }> = {
  land:                { label: 'Land',              badgeClass: 'bg-green-100 text-green-800 border-0' },
  house:               { label: 'House',             badgeClass: 'bg-blue-100 text-blue-800 border-0' },
  apartment:           { label: 'Apartment',         badgeClass: 'bg-violet-100 text-violet-800 border-0' },
  commercial:          { label: 'Commercial',        badgeClass: 'bg-orange-100 text-orange-800 border-0' },
  commercial_building: { label: 'Comm. Building',    badgeClass: 'bg-blue-100 text-blue-800 border-0' },
  warehouse:           { label: 'Warehouse',         badgeClass: 'bg-amber-100 text-amber-800 border-0' },
  commercial_land:     { label: 'Comm. Land',        badgeClass: 'bg-teal-100 text-teal-800 border-0' },
  agricultural_land:   { label: 'Agricultural Land', badgeClass: 'bg-lime-100 text-lime-800 border-0' },
  other:               { label: 'Other',             badgeClass: 'bg-gray-100 text-gray-600 border-0' },
};

/** Shape returned by GET /api/public/listings/:id. Extends camelCase backend DTO. */
export interface PublicListingDetail extends ListingResponse {
  images: PropertyImage[];
  primaryImageUrl?: string | null;  // teaser: URL of first image
  imageCount?: number;               // teaser: total image count (incl. locked)
  price_unit?: string | null;        // legacy Supabase-sourced listings
  bathrooms?: number | null;
  contact_phone?: string | null;
  contact_info?: string | null;
  confidence_score?: number | null;
  price_per_cent_paise?: number | null;
  daysOnMarket?: number;
  backOnMarket?: boolean;
  lastUpdatedAt?: string | null;
  firstPublishedAt?: string | null;
  isSuspectedDuplicate?: boolean;
  possessionStatus?: string | null;
  expectedPossessionDate?: string | null;
  approvalsDeclared?: string | null;
  reraValid?: boolean;
  areaKey?: string | null;           // e.g. "KA|UDUPI|MANIPAL"
  // Agricultural land fields (added by #1407 / PR #1413)
  boundary?: string | null;
  computedAreaAcres?: number | null;
  waterSource?: string | null;
  soilType?: string | null;
  roadAccess?: string | null;
  cultivationStatus?: string | null;
  ownershipType?: string | null;
  surveyNumber?: string | null;
  landArea?: number | null;
  landAreaUnit?: string | null;
  /**
   * Canonical price in paise (Long) — exposed by BE fix for #1452.
   * Supersedes the deprecated `price` (BigDecimal rupees) field for agri listings.
   * When non-null, convert to rupees: Math.round(pricePaise / 100).
   */
  pricePaise?: number | null;
}

function useListingById(id: string | undefined, isPreview: boolean) {
  const { session } = useAuth();
  const isAuthenticated = !!session;
  return useQuery({
    queryKey: isPreview
      ? listingKeys.preview(id)
      : listingKeys.public(id, isAuthenticated),
    queryFn: () =>
      isPreview
        ? api.get<PublicListingDetail>(`/api/listings/${id}`)
        : api.get<PublicListingDetail>(`/api/public/listings/${id}`),
    enabled: !!id,
    staleTime: isPreview ? undefined : 5 * 60 * 1000,
  });
}

function useListingPriceHistory(id: string | undefined) {
  return useQuery({
    queryKey: listingKeys.priceHistory(id),
    queryFn: () => api.get<PriceHistoryEntry[]>(`/api/public/listings/${id}/price-history`),
    enabled: !!id,
  });
}

interface TrustPublicResponse {
  badges: { dimensionType: string; grantedAt: string }[];
}

function useTrustBadges(id: string | undefined) {
  return useQuery({
    queryKey: listingKeys.trust(id),
    queryFn: () => api.get<TrustPublicResponse>(`/api/listings/${id}/trust`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

const PREVIEW_COPY: Record<string, string> = {
  DRAFT: 'Preview mode — this listing is a draft. Only you can see this page.',
  PENDING_REVIEW: 'Preview mode — this listing is under admin review. It will go live once approved.',
  REJECTED: 'Preview mode — this listing was rejected. See the rejection reason below.',
  ARCHIVED: 'This listing is archived and not visible to the public. You can reopen it for editing.',
};

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: listing, isLoading, error } = useListingById(id, isPreview);
  const { data: priceHistory = [] } = useListingPriceHistory(id);
  const { data: trustData } = useTrustBadges(id);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingInitialDate, setBookingInitialDate] = useState<string | undefined>(undefined);
  const [bookingInitialTime, setBookingInitialTime] = useState<string | undefined>(undefined);

  const openBooking = (date?: string, time?: string) => {
    setBookingInitialDate(date);
    setBookingInitialTime(time);
    setBookingModalOpen(true);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto p-6">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-64 w-full mb-4" />
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </AppLayout>
    );
  }

  if (error || !listing) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto p-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Map
          </Button>
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Listing Not Found</h2>
            <p className="text-muted-foreground">The property listing you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => navigate('/')} className="mt-4">Return to Map</Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const { label, badgeClass } = propertyConfig[listing.propertyType] ?? propertyConfig['other'];
  const isAgri = listing.propertyType === 'agricultural_land';

  // Anonymous teaser returns only primaryImageUrl + imageCount (no images[]).
  // Synthesize a 1-item gallery so the first photo renders.
  const rawImages = listing.images || [];
  const images: PropertyImage[] = rawImages.length > 0
    ? rawImages
    : listing.primaryImageUrl
      ? [{ url: listing.primaryImageUrl, alt: 'Property image' }]
      : [];
  const effectiveImageCount = typeof listing.imageCount === 'number' ? listing.imageCount : images.length;

  // Gallery overlay chips — rendered only when truthfully derivable.
  const hasTrustBadge = (trustData?.badges?.length ?? 0) > 0;
  const isUpdatedToday = (() => {
    const ts = listing.lastUpdatedAt;
    if (!ts) return false;
    return new Date(ts).toDateString() === new Date().toDateString();
  })();

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Listing URL copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  if (isAgri) {
    return (
      <AppLayout>
        {(isPreview || (isPreview && listing.status === 'REJECTED' && listing.rejectionReason)) && (
          <div className="mx-auto max-w-6xl px-4 pt-6 md:px-6">
            {isPreview && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{PREVIEW_COPY[listing.status ?? ''] ?? 'Preview mode — this listing is not yet live. Only you can see this page.'}</span>
              </div>
            )}
            {isPreview && listing.status === 'REJECTED' && listing.rejectionReason && (
              <Alert variant="destructive" className="mb-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Rejection reason: </span>{listing.rejectionReason}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        <AgriListingDetail
          listing={listing}
          user={user}
          copied={copied}
          onShare={handleShare}
          onOpenBookingModal={() => setBookingModalOpen(true)}
        />
        {user && (
          <RequestViewingModal listingId={listing.id} open={bookingModalOpen} onClose={() => setBookingModalOpen(false)} />
        )}
      </AppLayout>
    );
  }

  const displayTitle = listing.title || `${label} in ${listing.locality || 'Unknown Location'}`;

  // Breadcrumb city = district segment of areaKey (IN|KA|{district}|{locality}), when it
  // differs from the locality crumb. Honest: omitted when not derivable.
  const breadcrumbCity = (() => {
    const district = listing.areaKey?.split('|')[2]?.trim();
    if (!district) return null;
    if (listing.locality && district.toLowerCase() === listing.locality.toLowerCase()) return null;
    return district;
  })();

  const handleToggleSaved = () => {
    setSaved((s) => !s);
    toast({
      title: saved ? 'Removed from saved' : 'Saved',
      description: saved ? 'Removed from your saved items.' : 'Added to your saved items.',
    });
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {/* Preview banner */}
        {isPreview && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{PREVIEW_COPY[listing.status ?? ''] ?? 'Preview mode — this listing is not yet live. Only you can see this page.'}</span>
          </div>
        )}

        {/* Rejection reason */}
        {isPreview && listing.status === 'REJECTED' && listing.rejectionReason && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Rejection reason: </span>{listing.rejectionReason}
            </AlertDescription>
          </Alert>
        )}

        {/* Preview header keeps the back button + owner actions; public view uses
            a breadcrumb (Figma layout). */}
        {isPreview ? (
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={() => navigate('/broker/listings')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Listings
            </Button>
            <div className="flex items-center gap-2">
              {(listing.status === 'DRAFT' || listing.status === 'REJECTED') && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/broker/listings/${id}/edit`}>Edit Listing</Link>
                </Button>
              )}
              {listing.status === 'LIVE' && <TakeOfflineButton listingId={listing.id} />}
              {listing.status === 'ARCHIVED' && (
                <>
                  <ReopenForEditingButton listingId={listing.id} />
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/broker/listings/${id}/edit`}>Edit Listing</Link>
                  </Button>
                </>
              )}
              <Button variant="outline" onClick={handleShare} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Share'}
              </Button>
            </div>
          </div>
        ) : (
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-foreground">Home</Link></li>
              <li aria-hidden="true">/</li>
              <li><Link to="/discover" className="hover:text-foreground">Discover</Link></li>
              {breadcrumbCity && (
                <>
                  <li aria-hidden="true">/</li>
                  <li>{breadcrumbCity}</li>
                </>
              )}
              {listing.locality && (
                <>
                  <li aria-hidden="true">/</li>
                  <li>{listing.locality}</li>
                </>
              )}
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="max-w-[16rem] truncate font-medium text-foreground">
                {displayTitle}
              </li>
            </ol>
          </nav>
        )}

        {/* Two-column layout: main content (with hero gallery) + sticky actions */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Hero gallery with share + save overlay (mirrors agri detail) */}
            <div className="relative">
              {(hasTrustBadge || isUpdatedToday) && (
                <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-2">
                  {hasTrustBadge && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-medium text-evergreen shadow-sm backdrop-blur">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Trusted listing
                    </span>
                  )}
                  {isUpdatedToday && (
                    <span className="inline-flex items-center rounded-full bg-card/95 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
                      Updated today
                    </span>
                  )}
                </div>
              )}
              <div className="absolute right-3 top-3 z-20 flex gap-2">
                <button
                  type="button"
                  onClick={handleShare}
                  aria-label="Share listing"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleToggleSaved}
                  aria-label={saved ? 'Remove from saved' : 'Save listing'}
                  aria-pressed={saved}
                  data-testid="gallery-save-btn"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                  <Heart className={`h-4 w-4 ${saved ? 'fill-current text-rose-500' : ''}`} />
                </button>
              </div>
              <ListingGallery
                images={images}
                effectiveImageCount={effectiveImageCount}
                isAnonymous={!user}
                listingId={id ?? ''}
              />
            </div>

            <ListingDetailMainContent
              listing={listing}
              label={label}
              badgeClass={badgeClass}
              priceHistory={priceHistory}
              trustBadges={trustData?.badges}
            />
          </div>

          <ListingDetailSidebar
            listing={listing}
            user={user}
            onOpenBookingModal={openBooking}
            onShare={handleShare}
            saved={saved}
            onToggleSaved={handleToggleSaved}
          />
        </div>
      </div>

      {user && (
        <RequestViewingModal
          listingId={listing.id}
          open={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
          initialDate={bookingInitialDate}
          initialTime={bookingInitialTime}
        />
      )}
    </AppLayout>
  );
}
