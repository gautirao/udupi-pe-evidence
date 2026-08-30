import { PROPERTY_TYPES } from '@/lib/listing-constants';
import type { QualityBucket } from '@/lib/listingInventory';

export const PROPERTY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  PROPERTY_TYPES.map((pt) => [pt.value, pt.label]),
);

export const propertyTypeColors: Record<string, string> = {
  land: 'bg-green-500/10 text-green-600',
  agricultural_land: 'bg-lime-500/10 text-lime-700',
  house: 'bg-orange-500/10 text-orange-600',
  villa: 'bg-pink-500/10 text-pink-600',
  residential_plot: 'bg-emerald-500/10 text-emerald-700',
  apartment: 'bg-violet-500/10 text-violet-600',
  commercial: 'bg-blue-500/10 text-blue-600',
  commercial_building: 'bg-blue-600/10 text-blue-700',
  warehouse: 'bg-amber-500/10 text-amber-700',
  commercial_land: 'bg-teal-500/10 text-teal-700',
  other: 'bg-gray-500/10 text-gray-600',
};

export const statusBadgeStyles: Record<string, string> = {
  SCRAPED: 'bg-blue-500/10 text-blue-600',
  DRAFT: 'bg-gray-500/10 text-gray-600',
  PENDING_REVIEW: 'bg-yellow-500/10 text-yellow-700',
  LIVE: 'bg-green-500/10 text-green-600',
  REJECTED: 'bg-red-500/10 text-red-600',
  ARCHIVED: 'bg-slate-500/10 text-slate-600',
};

export const qualityDotColors: Record<QualityBucket, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
  unscored: 'bg-muted-foreground/40',
};
