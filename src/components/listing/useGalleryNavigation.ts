import { useState } from 'react';
import { PropertyImage } from '@/hooks/usePropertyListings';

export interface UseGalleryNavigationParams {
  images: PropertyImage[];
  effectiveImageCount: number;
  isAnonymous: boolean;
}

export interface UseGalleryNavigationResult {
  currentImageIndex: number;
  galleryLocked: boolean;
  imageError: Record<number, boolean>;
  nextImage: () => void;
  prevImage: () => void;
  handleImageError: (index: number) => void;
  /** Jump directly to a specific image index (used by thumbnail strip). */
  goToIndex: (index: number) => void;
}

export function useGalleryNavigation({
  images,
  effectiveImageCount,
  isAnonymous,
}: UseGalleryNavigationParams): UseGalleryNavigationResult {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryLocked, setGalleryLocked] = useState(false);
  const [imageError, setImageError] = useState<Record<number, boolean>>({});

  const hasMoreLocked = isAnonymous && effectiveImageCount > images.length;

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

  const goToIndex = (index: number) => {
    setCurrentImageIndex(index);
  };

  return {
    currentImageIndex,
    galleryLocked,
    imageError,
    nextImage,
    prevImage,
    handleImageError,
    goToIndex,
  };
}
