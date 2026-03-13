import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PropertyListing, PropertyType } from '@/hooks/usePropertyListings';
import { formatPrice, formatArea } from '@/lib/formatters';
import { 
  MapPin, Ruler, Home, Phone, Calendar, ChevronLeft, ChevronRight, 
  ExternalLink, Bath, Building, ImageOff 
} from 'lucide-react';
import { format } from 'date-fns';

interface PropertyImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

interface PropertyDetailModalProps {
  listing: PropertyListing | null;
  images: PropertyImage[];
  onClose: () => void;
}

const propertyConfig: Record<PropertyType, { label: string; bgClass: string }> = {
  land: { label: 'Land', bgClass: 'bg-green-500' },
  house: { label: 'House', bgClass: 'bg-orange-500' },
  apartment: { label: 'Apartment', bgClass: 'bg-violet-500' },
  commercial: { label: 'Commercial', bgClass: 'bg-blue-500' },
  commercial_building: { label: 'Comm. Building', bgClass: 'bg-blue-600' },
  warehouse: { label: 'Warehouse', bgClass: 'bg-amber-600' },
  commercial_land: { label: 'Comm. Land', bgClass: 'bg-teal-600' },
  other: { label: 'Other', bgClass: 'bg-gray-500' },
};

export function PropertyDetailModal({ listing, images, onClose }: PropertyDetailModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  if (!listing) return null;

  const { label, bgClass } = propertyConfig[listing.property_type];
  const hasImages = images.length > 0;
  const validImages = images.filter((_, idx) => !imageError[idx]);

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleImageError = (index: number) => {
    setImageError((prev) => ({ ...prev, [index]: true }));
  };

  return (
    <Dialog open={!!listing} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Image Gallery */}
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
                  
                  {/* Image indicators */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, idx) => (
                      <button
                        key={idx}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          idx === currentImageIndex 
                            ? 'bg-white' 
                            : 'bg-white/50 hover:bg-white/75'
                        }`}
                        onClick={() => setCurrentImageIndex(idx)}
                      />
                    ))}
                  </div>
                  
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

        {/* Property Details */}
        <div className="p-6">
          <DialogHeader className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`${bgClass} text-white`}>{label}</Badge>
              {listing.seller_type === 'owner' && (
                <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">Owner</Badge>
              )}
              {listing.seller_type === 'dealer' && (
                <Badge variant="outline" className="border-sky-300 text-sky-700 bg-sky-50">Dealer</Badge>
              )}
              {listing.confidence_score && listing.confidence_score < 70 && (
                <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                  Low confidence
                </Badge>
              )}
            </div>
            <DialogTitle className="text-2xl">
              {listing.price ? formatPrice(listing.price, listing.price_unit) : 'Price on request'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
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

            {/* Contact */}
            {listing.contact_phone && (
              <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <Phone className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Contact</p>
                  <a 
                    href={`tel:${listing.contact_phone}`}
                    className="font-medium text-green-600 hover:underline text-lg"
                  >
                    {listing.contact_phone}
                  </a>
                </div>
                <Button asChild variant="default" className="bg-green-600 hover:bg-green-700">
                  <a href={`tel:${listing.contact_phone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    Call Now
                  </a>
                </Button>
              </div>
            )}

            {/* Description */}
            {listing.description && (
              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-4 border-t">
              <Calendar className="h-4 w-4" />
              <span>Posted {format(new Date(listing.created_at), 'MMMM d, yyyy')}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
