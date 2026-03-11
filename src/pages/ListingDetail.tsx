import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyImage, PropertyListing, PropertyType } from '@/hooks/usePropertyListings';
import { formatPrice, formatArea, formatRelativeDate } from '@/lib/formatters';
import {
  AlertTriangle, ArrowLeft, MapPin, Ruler, Home, Phone, Calendar, ChevronLeft, ChevronRight,
  ExternalLink, Bath, Building, ImageOff, Share2, Copy, Check
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { RequestViewingModal } from '@/components/listing/RequestViewingModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AreaMarketWidget } from '@/components/listing/AreaMarketWidget';
import { SimilarListings } from '@/components/listing/SimilarListings';
import { NearbyPois } from '@/components/poi/NearbyPois';
import { PoiMiniMap } from '@/components/poi/PoiMiniMap';

const propertyConfig: Record<PropertyType, { label: string; badgeClass: string }> = {
  land: { label: 'Land', badgeClass: 'bg-green-100 text-green-800 border-0' },
  house: { label: 'House', badgeClass: 'bg-blue-100 text-blue-800 border-0' },
  apartment: { label: 'Apartment', badgeClass: 'bg-violet-100 text-violet-800 border-0' },
  commercial: { label: 'Commercial', badgeClass: 'bg-orange-100 text-orange-800 border-0' },
  other: { label: 'Other', badgeClass: 'bg-gray-100 text-gray-600 border-0' },
};

function useListingById(id: string | undefined) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('property_listings')
        .select('*, raw_posts(images)')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      // Transform to include images
      const rawImages = (data.raw_posts as { images?: PropertyImage[] } | null)?.images;
      const images: PropertyImage[] = Array.isArray(rawImages) ? rawImages : [];
      
      return {
        ...data,
        images,
      } as PropertyListing & { images: PropertyImage[] };
    },
    enabled: !!id,
  });
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const { toast } = useToast();
  const { data: listing, isLoading, error } = useListingById(id);
  
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
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

  const { label, badgeClass } = propertyConfig[listing.property_type];
  const images = listing.images || [];
  const hasImages = images.length > 0;

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
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
          };
          const copy = previewCopy[listing.status ?? ''] ?? 'Preview mode — this listing is not yet live. Only you can see this page.';
          return (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{copy}</span>
            </div>
          );
        })()}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate(isPreview ? '/dealer/listings' : '/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {isPreview ? 'Back to My Listings' : 'Back to Map'}
          </Button>
          <div className="flex items-center gap-2">
            {isPreview && (listing.status === 'DRAFT' || listing.status === 'REJECTED') && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/dealer/listings/${id}/edit`}>Edit Listing</Link>
              </Button>
            )}
            <Button variant="outline" onClick={handleShare} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Share'}
            </Button>
          </div>
        </div>

        {/* For land listings: location panel appears before photos */}
        {listing.property_type === 'land' && (
          <div className="space-y-4 mb-6">
            <NearbyPois listingId={listing.id} propertyType={listing.property_type} />
            {listing.latitude != null && listing.longitude != null && (
              <PoiMiniMap
                listingId={listing.id}
                latitude={listing.latitude}
                longitude={listing.longitude}
                propertyType={listing.property_type}
              />
            )}
          </div>
        )}

        {/* Image Gallery */}
        <Card className="overflow-hidden mb-6">
          <div className="relative bg-muted aspect-video">
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
                
                {images.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
                      onClick={nextImage}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    
                    {/* Image counter */}
                    <div className="absolute top-3 right-3 bg-black/60 text-white px-2 py-1 rounded text-sm">
                      {currentImageIndex + 1} / {images.length}
                    </div>
                  </>
                )}
              </>
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
          {images.length > 1 && (
            <div className="flex gap-2 p-3 overflow-x-auto bg-muted/30">
              {images.map((img, idx) => (
                <button
                  key={idx}
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
        <div className="grid gap-6 md:grid-cols-3">
          {/* Main Content */}
          <div className="md:col-span-2 space-y-6">
            {/* Title & Badges */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Badge className={badgeClass}>{label}</Badge>
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
              {listing.price && (
                <p className="text-2xl font-bold text-primary">
                  {formatPrice(listing.price, listing.price_unit)}
                </p>
              )}
              {listing.property_type === 'land' && listing.price_per_cent_paise ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  ₹{(listing.price_per_cent_paise / 100).toLocaleString('en-IN')} / cent
                </p>
              ) : (['apartment', 'house'].includes(listing.property_type) &&
                  listing.built_area && listing.built_area > 0 &&
                  listing.built_area_unit === 'sqft' && listing.price) ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  ₹{Math.round(listing.price / listing.built_area!).toLocaleString('en-IN')} / sqft
                </p>
              ) : null}
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
                  {listing.land_area && (
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Land Area</p>
                        <p className="font-medium">{formatArea(listing.land_area, listing.land_area_unit)}</p>
                      </div>
                    </div>
                  )}
                  
                  {listing.built_area && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Built Area</p>
                        <p className="font-medium">{formatArea(listing.built_area, listing.built_area_unit)}</p>
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
                </div>
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

            {/* Land listings show location panel above photos — skip here */}
            {listing.property_type !== 'land' && (
              <>
                <NearbyPois listingId={listing.id} propertyType={listing.property_type} />
                {listing.latitude != null && listing.longitude != null && (
                  <PoiMiniMap
                    listingId={listing.id}
                    latitude={listing.latitude}
                    longitude={listing.longitude}
                    propertyType={listing.property_type}
                  />
                )}
              </>
            )}

            {/* Posted Date */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Posted {format(new Date(listing.created_at), 'MMMM d, yyyy')}</span>
              <span className="text-muted-foreground/50">•</span>
              <span>{formatRelativeDate(listing.created_at)}</span>
            </div>

            {/* Similar listings */}
            <SimilarListings
              listingId={listing.id}
              locality={listing.locality}
              propertyType={listing.property_type}
            />
          </div>

          {/* Sidebar - Contact */}
          <div className="space-y-4">
            {/* Request Viewing — primary CTA, always first */}
            <Card>
              <CardContent className="p-4">
                <Button
                  className="w-full"
                  onClick={() => setBookingModalOpen(true)}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Request Viewing
                </Button>
              </CardContent>
            </Card>

            <AreaMarketWidget listing={listing} />

            {listing.contact_phone && (
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

            {listing.contact_info && (
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

      <RequestViewingModal
        listingId={listing.id}
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
      />
    </AppLayout>
  );
}
