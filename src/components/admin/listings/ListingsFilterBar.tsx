import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  INVENTORY_SORT_OPTIONS,
  LISTING_LIFECYCLE_STATUSES,
  QUALITY_BUCKET_LABELS,
  type QualityBucket,
} from '@/lib/listingInventory';
import { PROPERTY_TYPE_LABELS } from '@/lib/listingBadgeStyles';
import type { AdminListingsQueryParams } from '@/hooks/useAdminData';
import { X } from 'lucide-react';

interface ListingsFilterBarProps {
  q: string;
  lifecycleFilter: string;
  visibilityFilter: AdminListingsQueryParams['visibility'];
  propertyTypeFilter: string;
  localityFilter: string;
  sellerFilter: string;
  qualityFilter: QualityBucket | 'all';
  sort: string;
  propertyTypeOptions: string[];
  localityOptions: string[];
  sellerTypeOptions: string[];
  totalCount: number;
  hasActiveFilters: boolean;
  updateFilters: (patch: Record<string, string | null>) => void;
  updateParams: (patch: Record<string, string | null>) => void;
}

export function ListingsFilterBar({
  q,
  lifecycleFilter,
  visibilityFilter,
  propertyTypeFilter,
  localityFilter,
  sellerFilter,
  qualityFilter,
  sort,
  propertyTypeOptions,
  localityOptions,
  sellerTypeOptions,
  totalCount,
  hasActiveFilters,
  updateFilters,
  updateParams,
}: ListingsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-3 mb-4">
      <Input
        placeholder="Search title, ID, seller type, or locality…"
        value={q}
        onChange={(e) => updateFilters({ q: e.target.value || null })}
        className="h-9 max-w-xs"
        aria-label="Search listings"
      />

      <Select value={lifecycleFilter} onValueChange={(v) => updateFilters({ status: v === 'all' ? null : v })}>
        <SelectTrigger className="h-9 w-40 text-sm">
          <SelectValue placeholder="Lifecycle" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All lifecycles</SelectItem>
          {LISTING_LIFECYCLE_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={visibilityFilter} onValueChange={(v) => updateFilters({ vis: v === 'all' ? null : v })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <SelectValue placeholder="Visibility" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All visibility</SelectItem>
          <SelectItem value="public">Public</SelectItem>
          <SelectItem value="hidden">Hidden</SelectItem>
        </SelectContent>
      </Select>

      <Select value={propertyTypeFilter} onValueChange={(v) => updateFilters({ pt: v === 'all' ? null : v })}>
        <SelectTrigger className="h-9 w-40 text-sm">
          <SelectValue placeholder="Property type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {propertyTypeOptions.map((pt) => (
            <SelectItem key={pt} value={pt}>
              {PROPERTY_TYPE_LABELS[pt] ?? pt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={localityFilter} onValueChange={(v) => updateFilters({ loc: v === 'all' ? null : v })}>
        <SelectTrigger className="h-9 w-40 text-sm">
          <SelectValue placeholder="Locality" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All localities</SelectItem>
          {localityOptions.map((loc) => (
            <SelectItem key={loc} value={loc}>
              {loc}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sellerFilter} onValueChange={(v) => updateFilters({ seller: v === 'all' ? null : v })}>
        <SelectTrigger className="h-9 w-36 text-sm">
          <SelectValue placeholder="Seller type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sellers</SelectItem>
          {sellerTypeOptions.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={qualityFilter} onValueChange={(v) => updateFilters({ quality: v === 'all' ? null : v })}>
        <SelectTrigger className="h-9 w-40 text-sm">
          <SelectValue placeholder="Quality" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All quality</SelectItem>
          {(Object.keys(QUALITY_BUCKET_LABELS) as QualityBucket[]).map((bucket) => (
            <SelectItem key={bucket} value={bucket}>
              {QUALITY_BUCKET_LABELS[bucket]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() =>
            updateFilters({ q: null, status: null, pt: null, loc: null, seller: null, vis: null, quality: null })
          }
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Clear filters
        </Button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {totalCount} {totalCount === 1 ? 'result' : 'results'}
        </span>
        <Select value={sort} onValueChange={(v) => updateParams({ sort: v === 'updated-desc' ? null : v })}>
          <SelectTrigger className="h-9 w-48 text-sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {INVENTORY_SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
