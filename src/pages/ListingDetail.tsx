import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyImage, PropertyType } from '@/hooks/usePropertyListings';
import { ListingResponse, useArchiveListing, useReopenAsDraftListing } from '@/hooks/useBrokerListings';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import { formatListingId } from '@/lib/listing-id';
import {
  AlertTriangle, ArrowLeft, MapPin, Ruler, Home, Phone, Calendar, ChevronLeft, ChevronRight,
  ExternalLink, Bath, Building, ImageOff, Share2, Copy, Check, ShieldCheck,
  Layers, ParkingCircle, Armchair, Store, IndianRupee, Archive, RotateCcw, Lock,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RequestViewingModal } from '@/components/listing/RequestViewingModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AreaMarketWidget } from '@/components/listing/AreaMarketWidget';
import { SimilarListings } from '@/components/listing/SimilarListings';
import { ListingTransparencyCard, PriceHistoryEntry } from '@/components/listing/ListingTransparencyCard';
import { RERACard } from '@/components/listing/RERACard';
import { NearbyPois } from '@/components/poi/NearbyPois';
import { PoiMiniMap } from '@/components/poi/PoiMiniMap';
import { NearbySchoolsCard } from '@/components/listing/NearbySchoolsCard';
import { DISTRICT_TO_CITY_SLUG, DEFAULT_CITY } from '@/lib/localityUtils';

const DIMENSION_LABELS: Record<string, string> = {
  IDENTITY: 'Identity Verified',
  LOCATION: 'Location Verified',
  PHOTOS: 'Photos Verified',
  AUTHORITY: 'Authority Verified',
  FIELD: 'Field Verified',
  DOCUMENTS: 'Documents Reviewed',
};

const propertyConfig: Record<PropertyType, { label: string; badgeClass: string }> = {
  land: { label: 'Land', badgeClass: 'bg-green-100 text-green-800 border-0' },
  house: { label: 'House', badgeClass: 'bg-blue-100 text-blue-800 border-0' },
  apartment: { label: 'Apartment', badgeClass: 'bg-violet-100 text-violet-800 border-0' },
  commercial: { label: 'Commercial', badgeClass: 'bg-orange-100 text-orange-800 border-0' },
  commercial_building: { label: 'Comm. Building', badgeClass: 'bg-blue-100 text-blue-800 border-0' },
  warehouse: { label: 'Warehouse', badgeClass: 'bg-amber-100 text-amber-800 border-0' },
  commercial_land: { label: 'Comm. Land', badgeClass: 'bg-teal-100 text-teal-800 border-0' },
  other: { label: 'Other', badgeClass: 'bg-gray-100 text-gray-600 border-0' },
};

/**
 * Shape returned by GET /api/public/listings/:id.
 * Extends ListingResponse (camelCase backend DTO) with the images array
 * injected by the backend and optional fields not present in all responses.
 */
interface PublicListingDetail extends ListingResponse {
  images: PropertyImage[];
  /** Present in teaser response (anonymous): URL of the first image. */
  primaryImageUrl?: string | null;
  /** Present in teaser response (anonymous): total image count including locked images. Always serialised by backend (int primitive, never null). */
  imageCount?: number;
  /** Not in ListingController.ListingResponse — may be present on legacy Supabase-sourced listings */
  price_unit?: string | null;
  bathrooms?: number | null;
  contact_phone?: string | null;
  contact_info?: string | null;
  confidence_score?: number | null;
  /** price_per_cent_paise is not in ListingController.ListingResponse — undefined on public endpoint */
  price_per_cent_paise?: number | null;
  /** Transparency fields — present in ListingController.ListingResponse but absent from the
   *  ListingResponse TS interface in useBrokerListings.ts (which mirrors the broker endpoint only). */
  daysOnMarket?: number;
  backOnMarket?: boolean;
  lastUpdatedAt?: string | null;
  firstPublishedAt?: string | null;
  isSuspectedDuplicate?: boolean;
  possessionStatus?: string | null;
  expectedPossessionDate?: string | null;
  approvalsDeclared?: string | null;
  reraValid?: boolean;
  /** Area key used for locality insights — e.g. "KA|UDUPI|MANIPAL" */
  areaKey?: string | null;
}

function useListingById(id: string | undefined, isPreview: boolean, userId?: string) {
  return useQuery({
    queryKey: isPreview ? ['listing-detail', id] : ['listing-public', id, userId ?? null],
    queryFn: () =>
      isPreview
        ? api.get<PublicListingDetail>(`/api/listings/${id}`)
        : api.get<PublicListingDetail>(`/api/public/listings/${id}`),
    enabled: !!id,
  });
}

function useListingPriceHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['listing-price-history', id],
    queryFn: () =>
      api.get<PriceHistoryEntry[]>(`/api/public/listings/${id}/price-history`),
    enabled: !!id,
  });
}

interface TrustPublicResponse {
  badges: { dimensionType: string; grantedAt: string }[];
}

function useTrustBadges(id: string | undefined) {
  return useQuery({
    queryKey: ['listing-trust', id],
    queryFn: () => api.get<TrustPublicResponse>(`/api/listings/${id}/trust`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

function TakeOfflineButton({ listingId }: { listingId: string }) {
  const archiveMutation = useArchiveListing(listingId);
  const { toast } = useToast();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={archiveMutation.isPending}>
          <Archive className="h-4 w-4 mr-1" />
          {archiveMutation.isPending ? 'Archiving…' : 'Take Offline'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take Listing Offline</AlertDialogTitle>
          <AlertDialogDescription>
            This will archive your listing and remove it from public search results.
            You can reopen it for editing later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              archiveMutation.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: 'Listing archived', description: 'Your listing has been taken offline.' });
                },
              });
            }}
          >
            Take Offline
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReopenForEditingButton({ listingId }: { listingId: string }) {
  const reopenMutation = useReopenAsDraftListing(listingId);
  const { toast } = useToast();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reopenMutation.isPending}
      onClick={() => {
        reopenMutation.mutate(undefined, {
          onSuccess: () => {
            toast({ title: 'Listing reopened', description: 'Your listing is now a draft. You can edit and resubmit it.' });
          },
        });
      }}
    >
      <RotateCcw className="h-4 w-4 mr-1" />
      {reopenMutation.isPending ? 'Reopening…' : 'Reopen for Editing'}
    </Button>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: listing, isLoading, error } = useListingById(id, isPreview, user?.id);
  const { data: priceHistory = [] } = useListingPriceHistory(id);
  const { data: trustData } = useTrustBadges(id);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryLocked, setGalleryLocked] = useState(false);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

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
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Map
          </Button>
          <Card className="p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">Listing Not Found</h2>
            <p className="text-muted-foreground">
              The property listing you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Return to Map
            </Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const propertyTypeKey = listing.propertyType as PropertyType;
  const { label, badgeClass } = propertyConfig[propertyTypeKey] ?? propertyConfig['other'];
  // Anonymous teaser returns only primaryImageUrl + imageCount (no images[]).
  // Synthesize a 1-item gallery so the first photo renders; effectiveImageCount
  // tells us how many are locked behind auth.
  const rawImages = listing.images || [];
  const images: PropertyImage[] = rawImages.length > 0
    ? rawImages
    : listing.primaryImageUrl
      ? [{ url: listing.primaryImageUrl, alt: 'Property image' }]
      : [];
  const hasImages = images.length > 0;
  const effectiveImageCount = typeof listing.imageCount === 'number' ? listing.imageCount : images.length;
  const hasMoreLocked = !user && effectiveImageCount > images.length;

  const nextImage = () => {
    if (hasMoreLocked && currentImageIndex === images.length - 1) {
      setGalleryLocked(true);
      return;
    }
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    if (galleryLocked) {
      setCurrentImageIndex(0);
      setGalleryLocked(false);
      return;
    }
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleImageError = (index: number) => {
    setImageError((prev) => ({ ...prev, [index]: true }));
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: 'Link copied!', description: 'Listing URL copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const title = listing.title || `${label} in ${listing.locality || 'Unknown Location'}`;

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {/* Preview banner */}
        {isPreview && (() => {
          const previewCopy: Record<string, string> = {
            DRAFT: 'Preview mode — this listing is a draft. Only you can see this page.',
            PENDING_REVIEW: 'Preview mode — this listing is under admin review. It will go live once approved.',
            REJECTED: 'Preview mode — this listing was rejected. See the rejection reason below.',
            ARCHIVED: 'This listing is archived and not visible to the public. You can reopen it for editing.',
          };
          const copy = previewCopy[listing.status ?? ''] ?? 'Preview mode — this listing is not yet live. Only you can see this page.';
          return (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{copy}</span>
            </div>
          );
        })()}

        {/* Rejection reason — shown in preview mode for REJECTED listings */}
        {isPreview && listing.status === 'REJECTED' && listing.rejectionReason && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Rejection reason: </span>
              {listing.rejectionReason}
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(isPreview ? '/broker/listings' : '/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {isPreview ? 'Back to My Listings' : 'Back to Map'}
          </Button>
          <div className="flex items-center gap-2">
            {isPreview && (listing.status === 'DRAFT' || listing.status === 'REJECTED') && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/broker/listings/${id}/edit`}>Edit Listing</Link>
              </Button>
            )}
            {isPreview && listing.status === 'LIVE' && (
              <TakeOfflineButton listingId={listing.id} />
            )}
            {isPreview && listing.status === 'ARCHIVED' && (
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

        {/* For land listings: location panel appears before photos */}
        {listing.propertyType === 'land' && (
          <div className="space-y-4 mb-6">
            <NearbyPois listingId={listing.id} propertyType={listing.propertyType} />
            {listing.latitude != null && listing.longitude != null && (
              <PoiMiniMap
                listingId={listing.id}
                latitude={listing.latitude}
                longitude={listing.longitude}
                propertyType={listing.propertyType}
              />
            )}
          </div>
        )}

        {/* Image Gallery */}
        <Card className="overflow-hidden mb-6">
          <div className="relative bg-muted aspect-[4/3]">
            {hasImages ? (
              <>
                {!imageError[currentImageIndex] ? (
                  <img
                    src={images[currentImageIndex].url}
                    alt={images[currentImageIndex].alt || `Property image ${currentImageIndex + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(currentImageIndex)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <ImageOff className="h-12 w-12 mx-auto mb-2" />
                      <p className="text-sm">Image unavailable</p>
                    </div>
                  </div>
                )}
                
                {(images.length > 1 || hasMoreLocked) && (
                  <>
                    {/* z-10 keeps nav buttons above the absolute-inset-0 lock overlay */}
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background"
                      onClick={prevImage}
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {/* z-10 keeps nav buttons above the absolute-inset-0 lock overlay */}
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80 hover:bg-background"
                      onClick={nextImage}
                      aria-label="Next image"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>

                    {/* Image counter — use effectiveImageCount so anon sees total */}
                    <div
                      data-testid="gallery-counter"
                      className="absolute top-3 right-3 bg-black/60 text-white px-2 py-1 rounded text-sm"
                    >
                      {currentImageIndex + 1} / {effectiveImageCount}
                    </div>
                  </>
                )}

                {/* Anonymous image lock overlay */}
                {!user && (currentImageIndex >= 1 || galleryLocked) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="max-w-sm px-6 text-center text-white">
                      <Lock className="mx-auto mb-4 h-12 w-12" aria-hidden="true" />
                      <h3 className="mb-2 text-xl font-semibold">Sign in to view all photos</h3>
                      <p className="mb-4 text-sm text-gray-200">
                        Get full access to property photos, broker details, and more
                      </p>
                      <Button variant="secondary" size="lg" asChild>
                        <Link to={`/auth?returnTo=/listing/${id}`}>Sign in to view all photos</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : !hasImages && effectiveImageCount > 0 && !user ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Lock className="mx-auto mb-4 h-12 w-12" aria-hidden="true" />
                  <p className="mb-4 text-sm">Sign in to view photos</p>
                  <Button variant="secondary" size="lg" asChild>
                    <Link to={`/auth?returnTo=/listing/${id}`}>Sign in to view photos</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <ImageOff className="h-16 w-16 mx-auto mb-3 opacity-50" />
                  <p>No images available</p>
                </div>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {user && images.length > 1 && (
            <div
              className="flex gap-2 p-3 overflow-x-auto bg-muted/30"
              role="tablist"
              aria-label="Image thumbnails"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  setCurrentImageIndex((prev) => (prev + 1) % images.length);
                } else if (e.key === 'ArrowLeft') {
                  setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
                }
              }}
            >
              {images.map((img, idx) => (
                <button
                  key={idx}
                  role="tab"
                  aria-selected={idx === currentImageIndex}
                  aria-label={`Image ${idx + 1}`}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                    idx === currentImageIndex
                      ? 'border-primary'
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                >
                  {!imageError[idx] ? (
                    <img
                      src={img.url}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(idx)}
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Property Details */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title & Badges */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={badgeClass}>{label}</Badge>
                {listing.sellerType === 'owner' && (
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">Owner</Badge>
                )}
                {listing.sellerType === 'broker' && (
                  <Badge variant="outline" className="border-sky-300 text-sky-700 bg-sky-50">Broker</Badge>
                )}
                {listing.confidence_score && listing.confidence_score < 70 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-yellow-600 border-yellow-400 cursor-help">
                          Low confidence
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>This listing was extracted automatically from a social media post. Some details may need verification with the seller.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{title}</h1>
              {listing.listingNumber != null && (
                <p className="font-mono text-sm text-muted-foreground mb-2">
                  {formatListingId(listing.listingNumber)}
                </p>
              )}
              {listing.listingPurpose === 'rent' ? (
                listing.monthlyRent != null && (
                  <p className="text-2xl font-bold text-primary">
                    ₹{listing.monthlyRent.toLocaleString('en-IN')}<span className="text-base font-normal text-muted-foreground"> / month</span>
                  </p>
                )
              ) : listing.price ? (
                <p className="text-2xl font-bold text-primary">
                  {formatPrice(listing.price, listing.price_unit ?? null)}
                </p>
              ) : null}
              {listing.listingPurpose === 'rent' && (
                <Badge variant="outline" className="mt-1 text-xs">For Rent</Badge>
              )}
              {listing.propertyType === 'land' && listing.price_per_cent_paise ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  ₹{(listing.price_per_cent_paise / 100).toLocaleString('en-IN')} / cent
                </p>
              ) : (['apartment', 'house'].includes(listing.propertyType) &&
                  listing.builtArea && listing.builtArea > 0 &&
                  listing.builtAreaUnit === 'sqft' && listing.price) ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  ₹{Math.round(listing.price / listing.builtArea!).toLocaleString('en-IN')} / sqft
                </p>
              ) : null}
              {listing.reraNumber && (
                <div className="mt-2">
                  <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50 gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    RERA number provided: {listing.reraNumber}
                  </Badge>
                </div>
              )}
            </div>

            {/* Location */}
            {listing.locality && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">{listing.locality}</p>
                  {listing.latitude && listing.longitude && (
                    <a
                      href={`https://www.google.com/maps/search/${listing.latitude},${listing.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View on Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Property specs grid */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-4">Property Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {listing.landArea && (
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Land Area</p>
                        <p className="font-medium">{formatArea(listing.landArea, listing.landAreaUnit)}</p>
                      </div>
                    </div>
                  )}

                  {listing.builtArea && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Built Area</p>
                        <p className="font-medium">{formatArea(listing.builtArea, listing.builtAreaUnit)}</p>
                      </div>
                    </div>
                  )}
                  
                  {listing.bedrooms && (
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Bedrooms</p>
                        <p className="font-medium">{listing.bedrooms} BHK</p>
                      </div>
                    </div>
                  )}
                  
                  {listing.bathrooms && (
                    <div className="flex items-center gap-2">
                      <Bath className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Bathrooms</p>
                        <p className="font-medium">{listing.bathrooms}</p>
                      </div>
                    </div>
                  )}

                  {listing.carpetArea != null && (
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Carpet Area</p>
                        <p className="font-medium">{formatArea(listing.carpetArea, listing.carpetAreaUnit)}</p>
                      </div>
                    </div>
                  )}

                  {listing.washrooms != null && (
                    <div className="flex items-center gap-2">
                      <Bath className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Washrooms</p>
                        <p className="font-medium">{listing.washrooms}</p>
                      </div>
                    </div>
                  )}

                  {listing.floorNumber != null && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Floor</p>
                        <p className="font-medium">
                          {listing.floorNumber}{listing.totalFloors != null ? ` / ${listing.totalFloors}` : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {listing.furnishingStatus && (
                    <div className="flex items-center gap-2">
                      <Armchair className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Furnishing</p>
                        <p className="font-medium capitalize">{listing.furnishingStatus.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  )}

                  {listing.parkingCount != null && (
                    <div className="flex items-center gap-2">
                      <ParkingCircle className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Parking</p>
                        <p className="font-medium">{listing.parkingCount}</p>
                      </div>
                    </div>
                  )}

                  {listing.roadFrontageFt != null && (
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Road Frontage</p>
                        <p className="font-medium">{listing.roadFrontageFt} ft</p>
                      </div>
                    </div>
                  )}

                  {listing.commercialUsage && (
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Usage</p>
                        <p className="font-medium capitalize">{listing.commercialUsage}</p>
                      </div>
                    </div>
                  )}

                  {listing.numberOfUnits != null && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Units</p>
                        <p className="font-medium">{listing.numberOfUnits}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rent details */}
                {listing.listingPurpose === 'rent' && (listing.securityDepositMonths != null || listing.lockInMonths != null) && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-3">Rental Terms</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {listing.securityDepositMonths != null && (
                        <div className="flex items-center gap-2">
                          <IndianRupee className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Security Deposit</p>
                            <p className="font-medium">{listing.securityDepositMonths} month{listing.securityDepositMonths !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      )}
                      {listing.lockInMonths != null && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Lock-in Period</p>
                            <p className="font-medium">{listing.lockInMonths} month{listing.lockInMonths !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description */}
            {listing.description && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Description</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Key Highlights — top-3 trust badges as a bullet list */}
            {trustData?.badges && trustData.badges.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Key Highlights</h3>
                  <ul className="space-y-1.5 text-sm text-muted-foreground list-disc list-inside">
                    {trustData.badges.slice(0, 3).map((badge) => (
                      <li key={badge.dimensionType}>
                        {DIMENSION_LABELS[badge.dimensionType] ?? badge.dimensionType}
                      </li>
                    ))}
                  </ul>
                  {trustData.badges.length > 3 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      + {trustData.badges.length - 3} more
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Listing Transparency Card (RE-94) */}
            <ListingTransparencyCard
              daysOnMarket={listing.daysOnMarket}
              backOnMarket={listing.backOnMarket}
              lastUpdatedAt={listing.lastUpdatedAt}
              isSuspectedDuplicate={listing.isSuspectedDuplicate}
              priceHistory={priceHistory}
            />

            {/* RERA & Legal Readiness Card (RE-99) */}
            <RERACard
              reraNumber={listing.reraNumber}
              reraValid={listing.reraValid}
              possessionStatus={listing.possessionStatus}
              expectedPossessionDate={listing.expectedPossessionDate}
              approvalsDeclared={listing.approvalsDeclared}
            />

            {/* Trust badges (RE-156) */}
            {trustData && trustData.badges.length > 0 && (() => {
              const DIMENSION_TOOLTIPS: Record<string, string> = {
                IDENTITY: 'The person marketing this property has verified their phone number with us.',
                LOCATION: 'The listing agent visited this property and confirmed its location within 200m.',
                PHOTOS: 'Photos of this property were captured on-site and checked for duplicates.',
                AUTHORITY: 'The agent has confirmed their authorisation to market this property.',
                FIELD: 'A field agent physically visited this property.',
                DOCUMENTS: 'Supporting documents for this property have been reviewed.',
              };
              const REALNESS_TYPES = new Set(['LOCATION', 'PHOTOS', 'FIELD']);
              const AUTHORISATION_TYPES = new Set(['IDENTITY', 'AUTHORITY', 'DOCUMENTS']);
              const realnessBadges = trustData.badges.filter((b) => REALNESS_TYPES.has(b.dimensionType));
              const authorisationBadges = trustData.badges.filter((b) => AUTHORISATION_TYPES.has(b.dimensionType));

              const BadgeChip = ({ badge }: { badge: typeof trustData.badges[0] }) => (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 cursor-default"
                      >
                        {DIMENSION_LABELS[badge.dimensionType] ?? badge.dimensionType}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        {DIMENSION_TOOLTIPS[badge.dimensionType] ?? 'This aspect of the listing has been verified.'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );

              return (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-600" aria-hidden="true" />
                      Verified by Udupi Properties
                    </h3>
                    {realnessBadges.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Has this listing been verified to exist?</p>
                        <div className="flex flex-wrap gap-2">
                          {realnessBadges.map((badge) => (
                            <BadgeChip key={badge.dimensionType} badge={badge} />
                          ))}
                        </div>
                      </div>
                    )}
                    {authorisationBadges.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Has this person been verified as authorised to market it?</p>
                        <div className="flex flex-wrap gap-2">
                          {authorisationBadges.map((badge) => (
                            <BadgeChip key={badge.dimensionType} badge={badge} />
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Land listings show location panel above photos — skip here */}
            {listing.propertyType !== 'land' && (
              <>
                <NearbyPois listingId={listing.id} propertyType={listing.propertyType} />
                {listing.latitude != null && listing.longitude != null && (
                  <PoiMiniMap
                    listingId={listing.id}
                    latitude={listing.latitude}
                    longitude={listing.longitude}
                    propertyType={listing.propertyType}
                  />
                )}
              </>
            )}

            {/* Nearby Schools */}
            <NearbySchoolsCard listingId={listing.id} />

            {/* Posted Date — absent in anonymous teaser response */}
            {listing.createdAt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Posted {format(new Date(listing.createdAt), 'MMMM d, yyyy')}</span>
                <span className="text-muted-foreground/50">•</span>
                <span>{formatRelativeDate(listing.createdAt)}</span>
              </div>
            )}

            {/* Similar listings */}
            <SimilarListings
              listingId={listing.id}
              locality={listing.locality}
              propertyType={listing.propertyType}
            />
          </div>

          {/* Sidebar */}
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
                    onClick={() => setBookingModalOpen(true)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Request Viewing
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setBookingModalOpen(true)}
                  >
                    Contact Broker
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4 text-center">
                  <Lock className="h-6 w-6 mx-auto mb-2 text-primary/60" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground mb-3">Sign in to view full details</p>
                  <Button className="w-full" asChild>
                    <Link to={`/auth?returnTo=/listing/${id}`}>Sign in to view full details</Link>
                  </Button>
                </CardContent>
              </Card>
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
            <AreaMarketWidget listing={listing as unknown as import('@/hooks/usePropertyListings').PropertyListing} />

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
                <Button variant="outline" className="w-full justify-start" onClick={handleShare}>
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
        </div>
      </div>

      {user && (
        <RequestViewingModal
          listingId={listing.id}
          open={bookingModalOpen}
          onClose={() => setBookingModalOpen(false)}
        />
      )}
    </AppLayout>
  );
}
