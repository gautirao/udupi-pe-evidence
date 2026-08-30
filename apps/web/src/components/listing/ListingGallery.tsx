import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PropertyImage } from '@/hooks/usePropertyListings';
import { SignInGateCard } from '@/components/auth/SignInGateCard';
import { useGalleryNavigation } from './useGalleryNavigation';

export interface ListingGalleryProps {
  images: PropertyImage[];
  effectiveImageCount: number;
  isAnonymous: boolean;
  listingId: string;
}

export function ListingGallery({
  images,
  effectiveImageCount,
  isAnonymous,
  listingId,
}: ListingGalleryProps) {
  const {
    currentImageIndex,
    galleryLocked,
    imageError,
    nextImage,
    prevImage,
    handleImageError,
    goToIndex,
  } = useGalleryNavigation({ images, effectiveImageCount, isAnonymous });

  const hasImages = images.length > 0;
  const hasMoreLocked = isAnonymous && effectiveImageCount > images.length;
  const returnTo = `/listing/${listingId}`;

  return (
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

                {/* Image counter — bottom-right keeps the top-right clear for
                    overlay actions (share/save). Uses effectiveImageCount so
                    anon users see the total count incl. locked photos. */}
                <div
                  data-testid="gallery-counter"
                  className="absolute bottom-3 right-3 bg-black/60 text-white px-2 py-1 rounded text-sm"
                >
                  {currentImageIndex + 1} / {effectiveImageCount}
                </div>
              </>
            )}

            {/* Anonymous image lock overlay */}
            {isAnonymous && (currentImageIndex >= 1 || galleryLocked) && (
              <SignInGateCard
                variant="overlay"
                heading="Sign in to view all photos"
                description="Get full access to property photos, broker details, and more"
                ctaLabel="Sign in to view all photos"
                returnTo={returnTo}
              />
            )}
          </>
        ) : !hasImages && effectiveImageCount > 0 && isAnonymous ? (
          <SignInGateCard
            variant="overlay"
            heading="Sign in to view all photos"
            description="Get full access to property photos, broker details, and more"
            ctaLabel="Sign in to view all photos"
            returnTo={returnTo}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <ImageOff className="h-16 w-16 mx-auto mb-3 opacity-50" />
              <p>No images available</p>
            </div>
          </div>
        )}
      </div>

      {/* Thumbnail strip — only shown when authenticated */}
      {!isAnonymous && images.length > 1 && (
        <div
          className="flex gap-2 p-3 overflow-x-auto bg-muted/30"
          role="tablist"
          aria-label="Image thumbnails"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              goToIndex((currentImageIndex + 1) % images.length);
            } else if (e.key === 'ArrowLeft') {
              goToIndex((currentImageIndex - 1 + images.length) % images.length);
            }
          }}
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              role="tab"
              aria-selected={idx === currentImageIndex}
              aria-label={`Image ${idx + 1}`}
              onClick={() => goToIndex(idx)}
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
  );
}
